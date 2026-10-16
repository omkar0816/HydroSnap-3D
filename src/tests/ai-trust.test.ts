import { describe, expect, it } from "vitest"
import { watersheds } from "@/services/mock/mockData"
import type {
  AiAssessment,
  AiPredictedClass,
  GeoLocation,
} from "@/types/domain"
import { assessTrust, trustConfig } from "@/utils/trust"

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

function mockAssessment(
  predictedClass: AiPredictedClass,
  confidence: number,
): AiAssessment {
  return {
    status: "ok",
    predictedClass,
    confidence,
    attributes: {
      visibleWater: true,
      visibleStructure: true,
      vegetation: "sparse",
      evidence: "Visible pond edge and water.",
    },
    modelName: "mock-gemini",
    checkedAt: "2026-10-01T00:00:00.000Z",
  }
}

describe("AI-assisted trust fusion", () => {
  it("does not add an AI flag for a high-confidence matching suggestion", () => {
    const result = assessTrust({
      ...base,
      aiAssessment: mockAssessment("Farm pond", trustConfig.aiHighConfidence),
    })
    expect(result.status).toBe("Consistent")
    expect(result.engine).toBe("ai-assisted")
    expect(result.reasons.some(({ code }) => code === "low-confidence")).toBe(
      false,
    )
  })

  it("marks a medium-confidence matching suggestion for review", () => {
    const result = assessTrust({
      ...base,
      aiAssessment: mockAssessment("Farm pond", 0.7),
    })
    expect(result.status).toBe("Needs review")
    expect(result.reasons.map(({ code }) => code)).toContain("low-confidence")
    expect(
      result.reasons
        .filter(({ code }) => code === "low-confidence")
        .every(({ severity }) => severity === "warning"),
    ).toBe(true)
  })

  it("uses the configured lower confidence threshold for low signals", () => {
    const result = assessTrust({
      ...base,
      aiAssessment: mockAssessment(
        "Farm pond",
        trustConfig.aiMediumConfidence - 0.01,
      ),
    })
    expect(result.status).toBe("Needs review")
    expect(result.reasons.map(({ message }) => message)).toContain(
      "AI confidence is low (59%); officer review is recommended.",
    )
  })

  it("adds warning-only reasons for a type mismatch or unrelated photo", () => {
    for (const assessment of [
      mockAssessment("Check dam", 0.98),
      mockAssessment("not-a-watershed-asset", 0.98),
    ]) {
      const result = assessTrust({ ...base, aiAssessment: assessment })
      expect(result.status).toBe("Needs review")
      expect(
        result.reasons.every((reason) => reason.severity !== "critical"),
      ).toBe(true)
    }
    expect(
      assessTrust({
        ...base,
        aiAssessment: mockAssessment("Check dam", 0.98),
      }).reasons.map(({ code }) => code),
    ).toContain("type-mismatch")
    expect(
      assessTrust({
        ...base,
        aiAssessment: mockAssessment("not-a-watershed-asset", 0.98),
      }).reasons.map(({ code }) => code),
    ).toContain("not-a-watershed-asset")
  })

  it("keeps the AI unavailable path on the client rules engine", () => {
    const result = assessTrust({
      ...base,
      aiAssessment: {
        status: "unavailable",
        modelName: "Gemini",
        checkedAt: "2026-10-01T00:00:00.000Z",
      },
    })
    expect(result.status).toBe("Consistent")
    expect(result.engine).toBe("client-preview")
  })
})
