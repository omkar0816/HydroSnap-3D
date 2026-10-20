import { describe, expect, it, vi, beforeEach } from "vitest"
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto"
import { SignJWT, exportJWK } from "jose"
import {
  clearAuthCache,
  requireAuth,
  requireGovernment,
  requireOfficer,
} from "../auth.ts"

const keyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})

let jwk: Awaited<ReturnType<typeof exportJWK>>

async function makeJwt(
  payload: Record<string, unknown>,
  options: { audience?: string; issuer?: string; expiresIn?: string | number } = {},
) {
  const subject = typeof payload.sub === "string" ? payload.sub : "user-123"
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(options.issuer ?? "https://example.supabase.co/auth/v1")
    .setAudience(options.audience ?? "authenticated")
    .setSubject(subject)
  if (options.expiresIn !== undefined) {
    jwt.setExpirationTime(options.expiresIn)
  }
  return jwt.sign(createPrivateKey(keyPair.privateKey))
}

function makeResponse() {
  const res: {
    statusCode: number
    body: unknown
    status: (code: number) => any
    json: (payload: unknown) => any
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as any
}

describe("auth middleware", () => {
  beforeEach(async () => {
    clearAuthCache()
    jwk = await exportJWK(createPublicKey(keyPair.publicKey))
    jwk.kid = "test-key"
    vi.resetAllMocks()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(".well-known/jwks.json")) {
          return new Response(JSON.stringify({ keys: [jwk] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (url.includes("/rest/v1/officers")) {
          if (url.includes("gov-9")) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          }
          return new Response(
            JSON.stringify([{ id: "user-123", officer_code: "OFF-1", name: "Asha", status: "active" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }
        if (url.includes("/rest/v1/government_admins")) {
          return new Response(
            JSON.stringify([{ id: "gov-9", name: "Admin", status: "active" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }
        return new Response(JSON.stringify({}), { status: 200 })
      }),
    )
  })

  it("rejects requests without a bearer token", async () => {
    const req = { headers: {} } as any
    const res = makeResponse()
    const next = vi.fn()

    await requireAuth(req, res, next)

    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it("rejects expired or wrong-audience tokens", async () => {
    const expiredToken = await makeJwt(
      { sub: "user-123", role: "authenticated" },
      { expiresIn: "-1h" },
    )
    const wrongAudienceToken = await makeJwt(
      { sub: "user-123", role: "authenticated" },
      { audience: "not-authenticated" },
    )

    const expiredReq = { headers: { authorization: `Bearer ${expiredToken}` } } as any
    const expiredRes = makeResponse()
    await requireAuth(expiredReq, expiredRes, vi.fn())
    expect(expiredRes.statusCode).toBe(401)

    const wrongReq = { headers: { authorization: `Bearer ${wrongAudienceToken}` } } as any
    const wrongRes = makeResponse()
    await requireAuth(wrongReq, wrongRes, vi.fn())
    expect(wrongRes.statusCode).toBe(401)
  })

  it("rejects suspended officers", async () => {
    const token = await makeJwt({ sub: "user-123", role: "authenticated" })
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    const res = makeResponse()
    const next = vi.fn()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes(".well-known/jwks.json")) {
          return new Response(JSON.stringify({ keys: [jwk] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (url.includes("/rest/v1/officers")) {
          return new Response(
            JSON.stringify([{ id: "user-123", officer_code: "OFF-1", name: "Asha", status: "suspended" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }
        if (url.includes("/rest/v1/government_admins")) {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      }),
    )

    await requireOfficer(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it("accepts a valid active officer", async () => {
    const token = await makeJwt({ sub: "user-123", role: "authenticated" })
    const req = { headers: { authorization: `Bearer ${token}` } } as any
    const res = makeResponse()
    const next = vi.fn()

    await requireOfficer(req, res, next)

    expect(res.statusCode).toBe(200)
    expect(req.user).toMatchObject({ id: "user-123", officerCode: "OFF-1" })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("accepts a valid token for either an officer or government GET route", async () => {
    const officerToken = await makeJwt({ sub: "user-123", role: "authenticated" })
    const officerReq = { headers: { authorization: `Bearer ${officerToken}` } } as any
    const officerRes = makeResponse()
    const officerNext = vi.fn()
    await requireAuth(officerReq, officerRes, officerNext)
    expect(officerRes.statusCode).toBe(200)
    expect(officerReq.user).toMatchObject({ id: "user-123", role: "officer" })

    const governmentToken = await makeJwt({ sub: "gov-9", role: "authenticated" })
    const governmentReq = { headers: { authorization: `Bearer ${governmentToken}` } } as any
    const governmentRes = makeResponse()
    const governmentNext = vi.fn()
    await requireGovernment(governmentReq, governmentRes, governmentNext)
    expect(governmentRes.statusCode).toBe(200)
    expect(governmentReq.user).toMatchObject({ id: "gov-9", role: "government" })
  })
})
