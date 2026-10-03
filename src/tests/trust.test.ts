import { describe, expect, it } from "vitest"
import { watersheds } from "@/services/mock/mockData"
import { assessTrust } from "@/utils/trust"
import {
  calendarDateDistanceDays,
  indiaDate,
  normalizeExifDateTime,
} from "@/utils/dates"
import type { GeoLocation } from "@/types/domain"

const location: GeoLocation = {
  type: "Point",
  coordinates: [74.48, 18.226],
  source: "exif",
}
const base = {
  location,
  exif: { hasGps: true, takenAt: "2026-09-28T09:00:00Z" },
  inspectionDate: "2026-09-28",
  assetType: "Farm pond" as const,
  existing: [],
  containingWatershed: watersheds[0],
  declaredWatershedId: watersheds[0].id,
  now: new Date("2026-10-01T00:00:00Z"),
}

describe("assessTrust", () => {
  it("is Consistent for clean evidence", () => {
    expect(assessTrust(base).status).toBe("Consistent")
  })

  it("flags duplicates and points outside watersheds", () => {
    expect(
      assessTrust({
        ...base,
        imageSha256: "abc",
        existing: [{ id: "x", imageSha256: "abc" }],
      }).status,
    ).toBe("Flagged")
    expect(
      assessTrust({ ...base, containingWatershed: undefined }).status,
    ).toBe("Flagged")
  })

  it("asks for review on weak signals, never rejects", () => {
    const result = assessTrust({
      ...base,
      exif: { hasGps: false },
      location: { ...location, source: "device", accuracyMeters: 80 },
    })
    expect(result.status).toBe("Needs review")
    expect(result.reasons.map((r) => r.code)).toContain("gps-accuracy-low")
  })

  it("checks stream distance only for stream-based assets", () => {
    const far = { ...base, snapDistanceMeters: 500 }
    expect(assessTrust({ ...far, assetType: "Check dam" }).status).toBe(
      "Needs review",
    )
    expect(assessTrust({ ...far, assetType: "Plantation" }).status).toBe(
      "Consistent",
    )
  })

  it("compares camera and inspection calendar dates without timezone shifts", () => {
    const result = assessTrust({
      ...base,
      exif: { hasGps: true, takenAt: "2027-01-01T00:00:00Z" },
    })
    expect(result.status).toBe("Needs review")
    expect(result.reasons.map(({ code }) => code)).toContain("timestamp-gap")
  })
})

describe("date handling", () => {
  it("uses the India calendar date before the UTC date changes", () => {
    expect(indiaDate(new Date("2026-09-30T20:00:00.000Z"))).toBe("2026-10-01")
  })

  it("normalizes EXIF wall times without converting them to UTC", () => {
    expect(normalizeExifDateTime("2026:09:28 09:00:00")).toBe(
      "2026-09-28T09:00:00",
    )
    expect(calendarDateDistanceDays("2026-09-28T23:45:00Z", "2026-09-28")).toBe(
      0,
    )
    expect(calendarDateDistanceDays("2026-09-28", "2026-10-01")).toBe(3)
  })
})
