import { describe, expect, it } from "vitest"
import {
  renderTemplateReport,
  validateClaims,
} from "../../server/reportValidator"
import type { ReportClaims, ReportFacts } from "../../shared/reportFacts"

describe("Report Validator", () => {
  const mockFacts: ReportFacts = {
    subject: "Pune Watershed",
    generatedAt: "2023-10-18T10:00:00Z",
    facts: [
      {
        id: "F1",
        label: "Precipitation",
        value: 120.4234,
        unit: "mm",
        source: "Sentinel-2",
        observedAt: "2023-08-15",
        status: "measured",
        recordIds: ["rain-1"],
        kind: "measurement",
      },
      {
        id: "F2",
        label: "Vegetation Index",
        value: 0.425,
        unit: "",
        source: "Sentinel-2",
        observedAt: "2023-08-15",
        status: "demo",
        recordIds: ["sat-demo"],
        kind: "measurement",
      },
      {
        id: "F3",
        label: "Water Level",
        value: null,
        unit: "m",
        source: "Manual",
        observedAt: "2023-08-15",
        status: "no-data",
        recordIds: [],
        kind: "measurement",
      },
      {
        id: "F4",
        label: "Cloud Cover",
        value: 5,
        unit: "%",
        source: "Landsat 8",
        observedAt: "2023-08-15",
        status: "measured",
        recordIds: ["cloud-1"],
        kind: "measurement",
      },
    ],
  }

  it("passes a valid claim with correct rounding", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Precipitation was measured at 120.4 mm [F1]",
          factIds: ["F1"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("passes a valid claim with fraction-to-percent conversion", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Vegetation index (demo) is 43% [F2]",
          factIds: ["F2"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("passes a valid claim with percent-to-fraction conversion", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Cloud cover fraction is 0.05 [F4]",
          factIds: ["F4"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("fails when a number does not match any cited fact", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Precipitation was 125 mm [F1]",
          factIds: ["F1"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("contains number 125 which does not match")
  })

  it("fails when citing a no-data fact and containing a number", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Water level was 0 m [F3]",
          factIds: ["F3"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("cites a no-data fact and contains numeric values")
  })

  it("passes when citing a no-data fact without numbers", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Water level data was unavailable [F3]",
          factIds: ["F3"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("fails when citing a demo fact without mentioning 'demo'", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Vegetation index is 0.43 [F2]",
          factIds: ["F2"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("does not label it demo or illustrative")
  })

  it("accepts illustrative wording for a demo fact", () => {
    const result = validateClaims({
      claims: [{ text: "Illustrative vegetation index is 0.43 [F2]", factIds: ["F2"] }],
    }, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("rejects causal or impact language", () => {
    const result = validateClaims({
      claims: [{ text: "The intervention caused 120.4 mm of rainfall [F1]", factIds: ["F1"] }],
    }, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("causal or impact wording")
  })

  it("ignores [F#] markers and sensor names", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Sentinel-2 imagery shows 120.4 mm in Landsat 8/9 area [F1]",
          factIds: ["F1"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("allows years/dates present in cited fact metadata", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "On 2023-08-15, rainfall was 120.4 mm [F1]",
          factIds: ["F1"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("fails for years/dates NOT present in cited fact metadata", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "In 2025, rainfall was 120.4 mm [F1]",
          factIds: ["F1"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("number 2025")
  })

  it("handles Devanagari digits", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "पाऊस १२०.४ मिमी [F1]",
          factIds: ["F1"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(true)
  })

  it("renderTemplateReport generates deterministic fallback with demo data markers", () => {
    const output = renderTemplateReport(mockFacts)
    expect(output).toContain("Report for Pune Watershed")
    expect(output).toContain("- [F1] Precipitation: 120.4234 mm")
    expect(output).toContain("- [F2] Vegetation Index: 0.425 (observed 2023-08-15) (demo data, source: Sentinel-2)")
    expect(output).toContain("- [F3] Water Level: No data recorded")
  })

  it("fails for unknown factId", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "Unknown fact test [F99]",
          factIds: ["F99"],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("unknown factId \"F99\"")
  })

  it("fails for empty factIds", () => {
    const claims: ReportClaims = {
      claims: [
        {
          text: "No facts cited",
          factIds: [],
        },
      ],
    }
    const result = validateClaims(claims, mockFacts)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("cites no facts")
  })
})
