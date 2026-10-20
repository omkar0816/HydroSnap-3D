import { env } from "@/config/env"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"

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

async function resolveAuthToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

async function refreshAuthToken(): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const { data, error } = await supabase.auth.refreshSession()
    return !error && Boolean(data.session?.access_token)
  } catch {
    return false
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  attemptedRefresh = false,
): Promise<T> {
  const authToken = await resolveAuthToken()
  const response = await fetch(`${env.apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 401) {
    // Refresh the Supabase session once and retry. Never hard-redirect to
    // /login: a full page reload with a still-valid persisted session sends
    // the user straight back, which caused an endless reload loop.
    if (authToken && !attemptedRefresh && (await refreshAuthToken())) {
      return apiRequest<T>(path, options, true)
    }
    throw new ApiError(
      authToken
        ? "Session expired or the API rejected your token. Sign in again."
        : "Authentication required.",
      401,
    )
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
