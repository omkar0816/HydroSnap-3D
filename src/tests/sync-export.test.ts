import { describe, expect, it } from "vitest"
import { assets } from "@/services/mock/mockData"
import {
  backoffDelay,
  isDue,
  mergeUploadedObservation,
} from "@/services/syncService"
import { assetsToCsv, assetsToGeoJson, csvEscape } from "@/utils/exporters"
import type { FieldObservation, QueuedObservation } from "@/types/domain"

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

  it("preserves verification made while an upload is in flight", () => {
    const original: FieldObservation = {
      id: "obs-race",
      watershedId: "ws-test",
      assetType: "Farm pond",
      imageName: "field.jpg",
      location: {
        type: "Point",
        coordinates: [73.8, 18.5],
        source: "manual",
      },
      village: "Test village",
      description: "A test field observation.",
      inspectionDate: "2026-10-01",
      officerId: "officer-test",
      officerName: "Test Officer",
      verificationStatus: "Pending review",
      createdAt: "2026-10-01T00:00:00.000Z",
      auditHistory: [],
    }
    const current: FieldObservation = {
      ...original,
      verificationStatus: "Verified",
      auditHistory: [
        {
          action: "Verified",
          actor: "Reviewer",
          timestamp: "2026-10-02T00:00:00.000Z",
        },
      ],
    }
    const saved = { ...original, imageDataUrl: undefined }

    const merged = mergeUploadedObservation(original, current, saved)

    expect(merged.verificationStatus).toBe("Verified")
    expect(merged.auditHistory).toEqual(current.auditHistory)
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
