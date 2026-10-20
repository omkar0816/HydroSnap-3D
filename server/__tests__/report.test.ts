import { describe, expect, it, vi } from "vitest"
import type { Evidence } from "../evidence.ts"
import { buildFacts } from "../report/facts.ts"
import { generateWatershedReport, ReportGenerationError } from "../report/generate.ts"
import { computeGaps } from "../report/gaps.ts"
import { computeTrends } from "../report/trends.ts"
import type { SatelliteMeasurementRow } from "../../src/types/evidence.ts"

const evidence: Evidence = {
  watershed: {
    id: "report-ws",
    name: "Report watershed",
    areaKm2: 12.5,
    boundaryGeojson: {},
    source: "demo-boundary",
    sourceLicence: "demo licence",
    demo: true,
  },
  assets: [],
  observations: [],
  interventions: [],
  satellite: [],
  landUse: [],
  drainage: null,
  generatedAt: "2026-10-20T00:00:00.000Z",
}

const mockLlm = (result: unknown) => vi.fn(async () => ({ result, modelUsed: "test-model" }))

function measurement(
  id: string,
  role: SatelliteMeasurementRow["windowRole"],
  start: string,
  end: string,
  validPixelPct = 90,
): SatelliteMeasurementRow {
  return {
    id,
    watershedId: evidence.watershed.id,
    assetId: null,
    aoiScope: "watershed",
    bufferM: null,
    indexType: "NDVI",
    windowRole: role,
    windowStart: start,
    windowEnd: end,
    seasonLabel: "Nov-Dec",
    mean: role === "current" ? 0.6 : 0.4,
    median: null,
    p10: null,
    p90: null,
    std: null,
    validPixelPct,
    sceneCount: 2,
    sceneIds: [],
    cloudLimitPct: 30,
    method: "fixture",
    resolutionM: 10,
    status: "measured",
    jobId: null,
    computedAt: evidence.generatedAt,
    source: "Sentinel-2 fixture",
    sourceLicence: "Copernicus terms",
    attribution: "Contains modified Copernicus Sentinel data",
    demo: false,
  }
}

describe("server watershed report", () => {
  it("builds stable namespaced fact IDs and deterministic content hashes", async () => {
    const first = await generateWatershedReport(
      evidence,
      "en",
      mockLlm({ claims: [] }),
    )
    const second = await generateWatershedReport(
      evidence,
      "en",
      mockLlm({ claims: [] }),
    )
    expect(first.factSet.facts.map(({ id }) => id)).toEqual(
      second.factSet.facts.map(({ id }) => id),
    )
    expect(first.factSetSha256).toBe(second.factSetSha256)
    expect(first.factSet.facts.find(({ id }) => id === "sat.ndvi.current.mean"))
      .toMatchObject({ value: null, status: "no-data", recordIds: [] })
  })

  it("always reports the rainfall-normalisation gap and missing satellite data", () => {
    const facts = buildFacts(evidence)
    const gaps = computeGaps(evidence, facts.facts, new Date("2026-10-20T00:00:00Z"))
    expect(gaps.map(({ code }) => code)).toContain("rainfall_normalisation_missing")
    expect(gaps.map(({ text }) => text)).toContain("No satellite measurement in the last 12 months.")
  })

  it("computes NDVI change only for matching windows that pass the 60% gate", () => {
    const matching = {
      ...evidence,
      satellite: [
        measurement("baseline", "baseline", "2024-11-01", "2024-12-31"),
        measurement("current", "current", "2025-11-01", "2025-12-31"),
      ],
    }
    const facts = buildFacts(matching)
    const trend = computeTrends(matching, facts).find(({ id }) => id === "sat.ndvi.delta.yoy")
    expect(trend?.value).toBeCloseTo(0.2)
    expect(trend).toMatchObject({ kind: "trend", recordIds: ["baseline", "current"] })
    expect(trend?.label).toContain("not an impact estimate")

    const mismatched = {
      ...matching,
      satellite: [
        measurement("baseline", "baseline", "2024-10-01", "2024-11-30"),
        measurement("current", "current", "2025-11-01", "2025-12-31"),
      ],
    }
    const mismatchTrend = computeTrends(mismatched, buildFacts(mismatched))
      .find(({ id }) => id === "sat.ndvi.delta.yoy")
    expect(mismatchTrend).toMatchObject({ value: null, status: "no-data" })

    const lowQuality = {
      ...matching,
      satellite: [
        measurement("baseline", "baseline", "2024-11-01", "2024-12-31", 59),
        measurement("current", "current", "2025-11-01", "2025-12-31"),
      ],
    }
    const lowQualityTrend = computeTrends(lowQuality, buildFacts(lowQuality))
      .find(({ id }) => id === "sat.ndvi.delta.yoy")
    expect(lowQualityTrend).toMatchObject({ value: null, status: "no-data" })
  })

  it("retries once and rejects an invented number", async () => {
    const llm = mockLlm({
      claims: [{
        text: "Illustrative watershed area is 999.1 km².",
        factIds: ["watershed.area_km2"],
      }],
    })
    await expect(generateWatershedReport(evidence, "en", llm))
      .rejects.toBeInstanceOf(ReportGenerationError)
    expect(llm).toHaveBeenCalledTimes(2)
  })
})
