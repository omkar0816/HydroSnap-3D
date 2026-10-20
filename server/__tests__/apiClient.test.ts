import { afterEach, describe, expect, it, vi } from "vitest"
import { apiRequest, ApiError } from "../../src/services/apiClient"

const localStorageStore = new Map<string, string>()

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem(key: string) {
      return localStorageStore.get(key) ?? null
    },
    setItem(key: string, value: string) {
      localStorageStore.set(key, value)
    },
    removeItem(key: string) {
      localStorageStore.delete(key)
    },
    clear() {
      localStorageStore.clear()
    },
  },
  configurable: true,
})

Object.defineProperty(globalThis, "window", {
  value: {
    location: { href: "" },
  },
  configurable: true,
})

describe("apiClient refresh logic", () => {
  afterEach(() => {
    localStorageStore.clear()
    vi.restoreAllMocks()
    ;(globalThis as any).window.location.href = ""
  })

  it("retries once after a refresh and does not loop", async () => {
    localStorageStore.set("sb-access-token", "expired-token")
    localStorageStore.set("sb-refresh-token", "refresh-token")

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        text: async () => "unauthorized",
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ access_token: "fresh-token" }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ ok: true }),
      })

    vi.stubGlobal("fetch", fetchMock)

    const result = await apiRequest<{ ok: boolean }>("/api/v1/users/me")
    expect(result).toEqual({ ok: true })
    expect(localStorageStore.get("sb-access-token")).toBe("fresh-token")
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((globalThis as any).window.location.href).toBe("")
  })

  it("redirects once after a second 401 and does not recurse endlessly", async () => {
    localStorageStore.set("sb-access-token", "stale-token")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        text: async () => "unauthorized",
      }),
    )

    await expect(apiRequest("/api/v1/users/me")).rejects.toBeInstanceOf(ApiError)
    expect((globalThis as any).window.location.href).toBe("/login")
  })

  it("preserves structured duplicate-image error codes", async () => {
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
