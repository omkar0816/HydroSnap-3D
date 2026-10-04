import { describe, expect, it } from "vitest"
import { assets } from "@/services/mock/mockData"
import {
  assetsAddedBetween,
  assetsAsOf,
  buildTimelineSteps,
  installDate,
  summarizeStep,
} from "@/utils/timeline"

const now = new Date(2026, 9, 4)

describe("timeline steps", () => {
  it("builds regular half-year steps from 2023 through today", () => {
    const steps = buildTimelineSteps(now)
    expect(steps.map((step) => step.label)).toEqual([
      "H1 2023",
      "H2 2023",
      "H1 2024",
      "H2 2024",
      "H1 2025",
      "H2 2025",
      "H1 2026",
      "Now",
    ])
    expect(steps.at(-1)?.date).toBe("2026-10-04")
    expect(steps.at(-1)?.isNow).toBe(true)
    expect(steps.at(-1)?.range).toBe("Jul 2026 – today")
  })

  it("chains each step after the previous snapshot date", () => {
    const steps = buildTimelineSteps(now)
    for (let index = 1; index < steps.length; index++) {
      expect(steps[index].from).toBe(steps[index - 1].date)
    }
  })

  it("builds annual snapshots when the interval is set to one year", () => {
    const steps = buildTimelineSteps(now, undefined, 12)
    expect(steps.map((step) => step.label)).toEqual([
      "2023",
      "2024",
      "2025",
      "Now",
    ])
    expect(steps.map((step) => step.date)).toEqual([
      "2023-12-31",
      "2024-12-31",
      "2025-12-31",
      "2026-10-04",
    ])
    expect(steps[0].range).toBe("Jan – Dec 2023")
    expect(steps.at(-1)?.range).toBe("Jan 2026 – today")
  })
})

describe("asset filtering", () => {
  it("shows only assets installed by the snapshot date", () => {
    expect(assetsAsOf(assets, "2023-06-30").map((asset) => asset.id)).toEqual([
      "ast-001",
    ])
    expect(assetsAsOf(assets, "2026-10-04")).toHaveLength(assets.length)
  })

  it("shows the correct six-month and annual asset snapshots", () => {
    expect(assetsAsOf(assets, "2026-06-30")).toHaveLength(8)
    expect(assetsAsOf(assets, "2025-12-31")).toHaveLength(7)
  })

  it("lists assets added during the selected period", () => {
    const added = assetsAddedBetween(assets, "2023-06-30", "2023-12-31")
    expect(added.map((asset) => asset.id)).toEqual(["ast-005"])
  })

  it("uses last inspection as a fallback and prefers the install date", () => {
    const upload = { ...assets[0], id: "obs-1", lastInspected: "2026-09-30" }
    expect(installDate(upload)).toBe("2026-09-30")
    expect(installDate({ ...upload, installedAt: "2025-01-02" })).toBe(
      "2025-01-02",
    )
  })

  it("summarises cumulative assets and new assets for a period", () => {
    const summary = summarizeStep(assets, buildTimelineSteps(now)[1])
    expect(summary.cumulative).toHaveLength(2)
    expect(summary.added).toHaveLength(1)
  })
})
