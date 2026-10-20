import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/apiClient", () => ({
  apiRequest: vi.fn(),
}))

import { apiRequest } from "@/services/apiClient"
import { dicraService } from "@/services/dicraService"

const apiRequestMock = vi.mocked(apiRequest)

describe("DiCRA frontend service", () => {
  beforeEach(() => apiRequestMock.mockReset())

  it("returns typed collection data from the HydroSnap API", async () => {
    apiRequestMock.mockResolvedValue({
      collections: [
        { type: "Collection", id: "lulc", title: "Land Use Land Cover" },
      ],
    })

    const result = await dicraService.getCollections()

    expect(result.collections[0]?.title).toBe("Land Use Land Cover")
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/api/v1/dicra/collections",
      undefined,
    )
  })

  it("rejects malformed backend responses", async () => {
    apiRequestMock.mockResolvedValue({ collections: [{ id: 4 }] })

    await expect(dicraService.getCollections()).rejects.toThrow(
      "The DiCRA service returned an unexpected response.",
    )
  })

  it("validates search input before issuing the API request", async () => {
    await expect(
      dicraService.searchItems({
        bbox: [74, 19, 73, 18],
        collections: ["lulc"],
        limit: 10,
      }),
    ).rejects.toThrow()
    expect(apiRequestMock).not.toHaveBeenCalled()
  })

  it("posts valid item search parameters to the authenticated backend", async () => {
    apiRequestMock.mockResolvedValue({
      type: "FeatureCollection",
      features: [],
      numberMatched: 0,
      numberReturned: 0,
    })

    const result = await dicraService.searchItems({
      bbox: [73, 18, 74, 19],
      collections: ["lulc"],
      limit: 10,
    })

    expect(result.features).toEqual([])
    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/dicra/search", {
      method: "POST",
      body: JSON.stringify({
        bbox: [73, 18, 74, 19],
        collections: ["lulc"],
        limit: 10,
      }),
    })
  })
})
