import type { NextFunction, Request, Response } from "express"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { serverEnv } from "./env.ts"

export type AuthUser = {
  id: string
  officerCode?: string | null
  name?: string | null
  role: "officer" | "government"
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const jwks = createRemoteJWKSet(
  new URL(`${serverEnv.supabaseUrl}/auth/v1/.well-known/jwks.json`),
)

const authCache = new Map<
  string,
  { expiresAt: number; row: { id: string; officer_code?: string | null; name?: string | null; status: string } | null }
>()
const governmentCache = new Map<
  string,
  { expiresAt: number; row: { id: string; name?: string | null; status: string } | null }
>()

class AuthFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function clearAuthCache() {
  authCache.clear()
  governmentCache.clear()
}

function bearerToken(request: Request): string {
  const authorization = request.headers.authorization ?? ""
  return authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : ""
}

async function verifyToken(token: string) {
  let payload
  try {
    ;({ payload } = await jwtVerify(token, jwks, {
      issuer: `${serverEnv.supabaseUrl}/auth/v1`,
      audience: "authenticated",
    }))
  } catch (jwksError) {
    console.warn("Supabase JWKS token verification failed:", jwksError)
    if (serverEnv.supabaseJwtSecret) {
      try {
        ;({ payload } = await jwtVerify(
          token,
          new TextEncoder().encode(serverEnv.supabaseJwtSecret),
          {
            issuer: `${serverEnv.supabaseUrl}/auth/v1`,
            audience: "authenticated",
          },
        ))
      } catch (secretError) {
        console.warn("Supabase JWT secret verification failed:", secretError)
      }
    }

    if (!payload) {
      try {
        const response = await fetch(`${serverEnv.supabaseUrl}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: serverEnv.supabaseAnonKey,
          },
        })
        if (!response.ok) {
          console.warn(
            `Supabase user token validation failed with status ${response.status}.`,
          )
          throw new AuthFailure("Invalid or expired token.", 401)
        }
        const user = (await response.json()) as { id?: unknown }
        if (typeof user.id !== "string" || !user.id) {
          throw new AuthFailure("Token is missing a valid subject.", 401)
        }
        return { id: user.id, officerCode: null, name: null }
      } catch (error) {
        if (error instanceof AuthFailure) throw error
        console.warn("Supabase user token validation request failed:", error)
        throw new AuthFailure("Invalid or expired token.", 401)
      }
    }
  }
  const userId = typeof payload.sub === "string" ? payload.sub : null
  if (!userId) {
    throw new AuthFailure("Token is missing a valid subject.", 401)
  }
  return {
    id: userId,
    officerCode:
      typeof payload.officer_code === "string" ? payload.officer_code : null,
    name: typeof payload.name === "string" ? payload.name : null,
  }
}

async function fetchOfficerRow(sub: string, token: string) {
  const cached = authCache.get(sub)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.row

  const response = await fetch(
    `${serverEnv.supabaseUrl}/rest/v1/officers?id=eq.${encodeURIComponent(sub)}&select=id,officer_code,name,status`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serverEnv.supabaseAnonKey,
      },
    },
  )
  if (!response.ok) {
    throw new AuthFailure(`Officer lookup failed: ${response.status}`, 503)
  }
  const rows = (await response.json()) as Array<{
    id: string
    officer_code?: string | null
    name?: string | null
    status?: string | null
  }>
  const row = rows[0]
    ? {
        ...rows[0],
        status: rows[0].status ?? "inactive",
      }
    : null
  authCache.set(sub, { expiresAt: now + 60_000, row })
  return row
}

async function fetchGovernmentRow(sub: string, token: string) {
  const cached = governmentCache.get(sub)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.row

  const response = await fetch(
    `${serverEnv.supabaseUrl}/rest/v1/government_admins?id=eq.${encodeURIComponent(sub)}&select=id,name,status`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serverEnv.supabaseAnonKey,
      },
    },
  )
  if (!response.ok) {
    throw new AuthFailure(
      `Government administrator lookup failed: ${response.status}`,
      503,
    )
  }
  const rows = (await response.json()) as Array<{
    id: string
    name?: string | null
    status?: string | null
  }>
  const row = rows[0]
    ? { ...rows[0], status: rows[0].status ?? "inactive" }
    : null
  governmentCache.set(sub, { expiresAt: now + 60_000, row })
  return row
}

async function resolveUser(
  request: Request,
  role?: AuthUser["role"],
): Promise<AuthUser> {
  const token = bearerToken(request)
  if (!token) throw new AuthFailure("Authentication required.", 401)

  const decoded = await verifyToken(token)
  if (role !== "government") {
    const officer = await fetchOfficerRow(decoded.id, token)
    if (officer) {
      if (officer.status !== "active") {
        throw new AuthFailure("Officer is not active.", 403)
      }
      return {
        id: decoded.id,
        officerCode: officer.officer_code ?? decoded.officerCode ?? null,
        name: officer.name ?? decoded.name ?? null,
        role: "officer",
      }
    }
    if (role === "officer") {
      throw new AuthFailure("Officer is not active.", 403)
    }
  }

  const government = await fetchGovernmentRow(decoded.id, token)
  if (government?.status === "active") {
    return {
      id: decoded.id,
      officerCode: decoded.officerCode,
      name: government.name ?? decoded.name ?? null,
      role: "government",
    }
  }
  throw new AuthFailure(
    role === "government"
      ? "Government administrator is not active."
      : "User is not an active officer or government administrator.",
    403,
  )
}

async function requireRole(
  request: Request,
  response: Response,
  next: NextFunction,
  role?: AuthUser["role"],
): Promise<void> {
  try {
    request.user = await resolveUser(request, role)
    next()
  } catch (error) {
    const status = error instanceof AuthFailure ? error.status : 503
    response.status(status).json({
      detail:
        error instanceof Error ? error.message : "Authentication service unavailable.",
    })
  }
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await requireRole(request, response, next)
}

export async function requireOfficer(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await requireRole(request, response, next, "officer")
}

export async function requireGovernment(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await requireRole(request, response, next, "government")
}
