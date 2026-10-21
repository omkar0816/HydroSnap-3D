import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequestMock, mockedEnv } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  mockedEnv: { useMockApi: false, useDemoFallback: true },
}))

vi.mock("@/config/env", () => ({ env: mockedEnv }))
vi.mock("@/services/apiClient", () => ({
  apiRequest: apiRequestMock,
  apiBlobUrl: vi.fn(() => ""),
}))

import { hydrosnapService } from "@/services/hydrosnapService"

describe("HydroSnap API empty-collection demo fallback", () => {
  beforeEach(() => {
    apiRequestMock.mockReset()
    mockedEnv.useDemoFallback = true
  })

  it("shows demo watersheds, assets, layers, analytics and interventions for empty API collections", async () => {
    apiRequestMock.mockResolvedValue([])

    const [watersheds, assets, layers, results, interventions] =
      await Promise.all([
        hydrosnapService.getWatersheds(),
        hydrosnapService.getAssets(),
        hydrosnapService.getLayers(),
        hydrosnapService.getResults(),
        hydrosnapService.getInterventions(),
      ])

    expect(watersheds.some((watershed) => watershed.demo)).toBe(true)
    expect(watersheds.every((watershed) => watershed.demoFallback)).toBe(true)
    expect(assets.some((asset) => asset.type === "Check dam" && asset.demo)).toBe(true)
    expect(assets.some((asset) => asset.type === "Farm pond" && asset.demo)).toBe(true)
    expect(assets.some((asset) => asset.type === "Plantation" && asset.demo)).toBe(true)
    expect(layers.some((layer) => layer.demo)).toBe(true)
    expect(results.some((result) => result.metric === "NDVI")).toBe(true)
    expect(interventions.some((intervention) => intervention.demo)).toBe(true)
  })

  it("shows bundled evidence for an empty known demo watershed", async () => {
    apiRequestMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/evidence")
          ? { assets: [], observations: [], interventions: [] }
          : [],
      ),
    )

    const evidence = await hydrosnapService.getWatershedEvidence("ws-bhima")

    expect(evidence.watershed.demo).toBe(true)
    expect(evidence.assets.some((asset) => asset.type === "Check dam")).toBe(true)
    expect(evidence.assets.some((asset) => asset.type === "Farm pond")).toBe(true)
    expect(evidence.assets.every((asset) => asset.demo)).toBe(true)
  })

  it("does not substitute fixtures when an API request fails", async () => {
    apiRequestMock.mockRejectedValue(new Error("API unavailable"))

    await expect(hydrosnapService.getResults()).rejects.toThrow(
      "API unavailable",
    )
  })

  it("does not use fixtures when empty-collection fallback is disabled", async () => {
    mockedEnv.useDemoFallback = false
    apiRequestMock.mockResolvedValue([])

    await expect(hydrosnapService.getResults()).resolves.toEqual([])
  })
})
