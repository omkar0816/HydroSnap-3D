import { describe, expect, it } from "vitest"
import type { SatelliteMeasurementRow } from "@/types/evidence"
import {
  baselineFor,
  calculateIndexChange,
  defaultDateRange,
} from "@/utils/satelliteStyles"

function row(partial: Partial<SatelliteMeasurementRow>): SatelliteMeasurementRow {
  return {
    id: crypto.randomUUID(),
    watershedId: "ws",
    assetId: null,
    aoiScope: "watershed",
    bufferM: null,
    indexType: "NDVI",
    windowRole: "current",
    windowStart: "2026-07-01",
    windowEnd: "2026-09-28",
    seasonLabel: null,
    mean: 0.5,
    median: 0.5,
    p10: 0.2,
    p90: 0.8,
    std: 0.1,
    validPixelPct: 90,
    sceneCount: 4,
    sceneIds: [],
    cloudLimitPct: 30,
    method: "test",
    resolutionM: 10,
    status: "measured",
    jobId: "job",
    computedAt: "2026-10-01T00:00:00Z",
    source: "test",
    sourceLicence: null,
    attribution: null,
    demo: false,
    ...partial,
  }
}

describe("calculateIndexChange", () => {
  it("calculates change and percentage from baseline and current windows", () => {
    const result = calculateIndexChange(
      [row({ windowRole: "baseline", mean: 0.4 }), row({ windowRole: "current", mean: 0.5 })],
      "NDVI",
    )
    expect(result.change).toBeCloseTo(0.1)
    expect(result.changePct).toBeCloseTo(25)
  })

  it("refuses to calculate when a window lacks enough valid pixels", () => {
    const result = calculateIndexChange(
      [row({ windowRole: "baseline", mean: 0.4, validPixelPct: 40 }), row({ windowRole: "current" })],
      "NDVI",
    )
    expect(result.change).toBeNull()
    expect(result.current?.mean).toBe(0.5)
  })

  it("uses the most recent measurement per window and ignores the other index", () => {
    const result = calculateIndexChange(
      [
        row({ windowRole: "current", mean: 0.1, computedAt: "2026-01-01T00:00:00Z" }),
        row({ windowRole: "current", mean: 0.6, computedAt: "2026-09-01T00:00:00Z" }),
        row({ windowRole: "baseline", mean: 0.5 }),
        row({ windowRole: "current", indexType: "NDWI", mean: -0.9 }),
      ],
      "NDVI",
    )
    expect(result.current?.mean).toBe(0.6)
    expect(result.change).toBeCloseTo(0.1)
  })
})

describe("analysis date ranges", () => {
  it("defaults to the 90 days ending yesterday", () => {
    expect(defaultDateRange(new Date("2026-10-20T12:00:00Z"))).toEqual({
      start: "2026-07-22",
      end: "2026-10-19",
    })
  })

  it("shifts the baseline back a whole number of years so it ends before the current window", () => {
    expect(baselineFor("2026-07-22", "2026-10-19")).toEqual({ start: "2025-07-22", end: "2025-10-19" })
    const long = baselineFor("2025-06-01", "2026-05-31")
    expect(long.end < "2025-06-01").toBe(true)
  })
})
