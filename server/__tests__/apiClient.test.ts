import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getSession, refreshSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}))
vi.mock("../../src/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession, refreshSession } },
}))

import { apiRequest, ApiError } from "../../src/services/apiClient"

function sessionWith(token: string | null) {
  return { data: { session: token ? { access_token: token } : null }, error: null }
}

describe("apiClient auth handling", () => {
  beforeEach(() => {
    getSession.mockReset()
    refreshSession.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends the Supabase session token as a Bearer header", async () => {
    getSession.mockResolvedValue(sessionWith("live-token"))
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal("fetch", fetchMock)
    await apiRequest("/api/v1/users/me")
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer live-token")
  })

  it("refreshes the session once after a 401 and retries", async () => {
    getSession
      .mockResolvedValueOnce(sessionWith("expired"))
      .mockResolvedValueOnce(sessionWith("fresh"))
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false, text: async () => "unauthorized" })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal("fetch", fetchMock)
    await expect(apiRequest("/api/v1/users/me")).resolves.toEqual({ ok: true })
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh")
  })

  it("throws a 401 ApiError without redirecting or looping when refresh fails", async () => {
    getSession.mockResolvedValue(sessionWith("stale"))
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("bad") })
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, ok: false, text: async () => "unauthorized" })
    vi.stubGlobal("fetch", fetchMock)
    await expect(apiRequest("/api/v1/users/me")).rejects.toMatchObject({ status: 401 })
    await expect(apiRequest("/api/v1/users/me")).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not call refresh when no session exists", async () => {
    getSession.mockResolvedValue(sessionWith(null))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, text: async () => "x" }))
    await expect(apiRequest("/api/v1/users/me")).rejects.toMatchObject({ status: 401 })
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it("preserves structured duplicate-image error codes", async () => {
    getSession.mockResolvedValue(sessionWith("t"))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 409,
      ok: false,
      text: async () => JSON.stringify({
        code: "duplicate_image",
        detail: "An observation with these image bytes already exists.",
      }),
    }))
    await expect(apiRequest("/api/v1/uploads", { method: "POST" })).rejects.toMatchObject({
      status: 409,
      code: "duplicate_image",
      message: "An observation with these image bytes already exists.",
    })
  })
})