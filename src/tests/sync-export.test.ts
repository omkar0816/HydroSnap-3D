import { describe, expect, it } from "vitest"
import { assets } from "@/services/mock/mockData"
import { backoffDelay, isDue } from "@/services/syncService"
import { assetsToCsv, assetsToGeoJson, csvEscape } from "@/utils/exporters"
import type { QueuedObservation } from "@/types/domain"

describe("sync backoff", () => {
  it("grows exponentially and caps at 5 minutes", () => {
    expect(backoffDelay(1)).toBe(5_000)
    expect(backoffDelay(2)).toBe(10_000)
    expect(backoffDelay(20)).toBe(300_000)
  })

  it("respects the retry window", () => {
    const record = {
      id: "a",
      syncStatus: "failed",
      attempts: 1,
      nextAttemptAt: new Date(10_000).toISOString(),
    } as QueuedObservation
    expect(isDue(record, 5_000)).toBe(false)
    expect(isDue(record, 20_000)).toBe(true)
    expect(isDue({ ...record, syncStatus: "synced" }, 20_000)).toBe(false)
  })
})

describe("exporters", () => {
  it("escapes CSV values", () => {
    expect(csvEscape('a "b", c')).toBe('"a ""b"", c"')
  })
  it("exports every asset", () => {
    expect(assetsToCsv(assets).split("\n")).toHaveLength(assets.length + 1)
    expect(assetsToGeoJson(assets).features).toHaveLength(assets.length)
  })
})
