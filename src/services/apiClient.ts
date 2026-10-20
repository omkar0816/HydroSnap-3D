import { env } from "@/config/env"

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function resolveAuthToken(): string | null {
  const candidates = [
    "sb-access-token",
    "access_token",
    "supabaseAccessToken",
    "token",
  ]
  for (const key of candidates) {
    const value = localStorage.getItem(key)
    if (value) return value.replace(/^Bearer\s+/i, "")
  }
  return null
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  attemptedRefresh = false,
): Promise<T> {
  const authToken = resolveAuthToken()
  const response = await fetch(`${env.apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 401 && authToken && !attemptedRefresh) {
    try {
      const refreshToken = localStorage.getItem("sb-refresh-token")
      if (refreshToken) {
        const refresh = await fetch(
          `${env.apiBaseUrl.replace(/\/$/, "")}/auth/v1/token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            }),
          },
        )
        if (refresh.ok) {
          const data = await refresh.json()
          if (typeof data?.access_token === "string") {
            localStorage.setItem("sb-access-token", data.access_token)
            return apiRequest<T>(path, options, true)
          }
        }
      }
    } catch {
      // Fall through to redirect below.
    }
    window.location.href = "/login"
    return Promise.reject(new ApiError("Session expired; please sign in again.", 401))
  }
  if (response.status === 401 && !attemptedRefresh) {
    window.location.href = "/login"
    return Promise.reject(new ApiError("Authentication required.", 401))
  }
  if (!response.ok) {
    const detail = await response.text()
    let message = detail
    let code: string | undefined
    try {
      const payload = JSON.parse(detail) as { detail?: unknown; code?: unknown }
      if (typeof payload.detail === "string") message = payload.detail
      if (typeof payload.code === "string") code = payload.code
    } catch {
      // Keep non-JSON error bodies intact for callers.
    }
    throw new ApiError(
      message || `Request failed with status ${response.status}`,
      response.status,
      code,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
