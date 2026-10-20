import { describe, expect, it } from "vitest"
import {
  evaluateTrustRules,
  serverVerificationStatus,
  TRUST_THRESHOLDS,
} from "../../shared/trustRules.ts"

describe("shared server trust rules", () => {
  it("centralizes thresholds and keeps a clean observation pending human review", () => {
    expect(TRUST_THRESHOLDS.impossibleTravelSpeedKmh).toBe(120)
    expect(serverVerificationStatus([])).toBe("Pending review")
    expect(serverVerificationStatus([
      { code: "gps_accuracy_poor", severity: "warn", message: "review" },
    ])).toBe("Pending review")
  })

  it("flags missing images, mismatched hashes, future dates, and outside points as critical", () => {
    const flags = evaluateTrustRules({
      imageMissing: true,
      hashMismatch: true,
      inspectionDateFuture: true,
      locationInsideWatershed: false,
    })
    expect(flags.map(({ code, severity }) => [code, severity])).toEqual([
      ["image_missing", "critical"],
      ["hash_mismatch", "critical"],
      ["future_date", "critical"],
      ["outside_watershed", "critical"],
    ])
    expect(serverVerificationStatus(flags)).toBe("Flagged")
  })

  it("detects impossible travel over 120 km/h", () => {
    const flags = evaluateTrustRules({
      impossibleTravel: { distanceMeters: 300_000, durationMinutes: 10 },
    })
    expect(flags).toContainEqual(expect.objectContaining({
      code: "impossible_travel",
      severity: "critical",
    }))
  })

  it("applies stream, ambiguous-match, and asset-history rules", () => {
    const flags = evaluateTrustRules({
      assetType: "Check dam",
      nearestStreamDistanceMeters: 200,
      ambiguousAssetMatch: true,
      assetTypeHistoryConflict: true,
    })
    expect(flags.map(({ code }) => code)).toEqual([
      "far_from_stream",
      "ambiguous_asset_match",
      "asset_type_history_conflict",
    ])
    expect(serverVerificationStatus(flags)).toBe("Flagged")
  })
})
