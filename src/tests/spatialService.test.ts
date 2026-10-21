import { beforeEach, describe, expect, it, vi } from "vitest"
import { env } from "@/config/env"
import { watersheds } from "@/services/mock/mockData"

const apiRequest = vi.hoisted(() => vi.fn())
const mockedApiError = vi.hoisted(() =>
  class MockApiError extends Error {
    constructor(message: string, public status: number) {
      super(message)
    }
  },
)

vi.mock("@/services/apiClient", () => ({
  apiRequest,
  ApiError: mockedApiError,
}))

import { resolveWatershed } from "@/services/spatialService"

describe("resolveWatershed", () => {
  beforeEach(() => {
    env.useMockApi = false
    apiRequest.mockReset()
  })

  it("falls back to local containment when the API returns a server error", async () => {
    apiRequest.mockRejectedValue(new mockedApiError("API unavailable", 503))
    const result = await resolveWatershed([73.815741, 18.517225], watersheds)
    expect(result).toMatchObject({ status: "inside", watershed: { id: "ws-pune-waterways" } })
  })

  it("preserves authentication errors instead of treating them as outside", async () => {
    apiRequest.mockRejectedValue(new mockedApiError("Sign in again.", 401))
    await expect(resolveWatershed([73.815741, 18.517225], watersheds)).resolves.toEqual({
      status: "error",
      error: "Sign in again.",
    })
  })

  it("returns outside only when the API successfully reports no containing watershed", async () => {
    apiRequest.mockResolvedValue({ watershedId: null, resolution: "outside" })
    await expect(resolveWatershed([0, 0], watersheds)).resolves.toEqual({
      status: "outside",
    })
  })
})