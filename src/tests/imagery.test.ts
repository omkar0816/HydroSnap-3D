import { describe, expect, it } from "vitest"
import {
  CLOUDLESS_FIRST_YEAR,
  CLOUDLESS_LATEST_YEAR,
  cloudlessTileUrl,
  cloudlessYearFor,
} from "@/utils/imagery"
import { buildTimelineSteps } from "@/utils/timeline"

describe("cloudless imagery year", () => {
  it("only uses a mosaic once its calendar year is complete", () => {
    expect(cloudlessYearFor("2024-12-31")).toBe(2024)
    expect(cloudlessYearFor("2024-06-30")).toBe(2023)
  })

  it("clamps to the range EOX publishes", () => {
    expect(cloudlessYearFor("2019-06-30")).toBe(CLOUDLESS_FIRST_YEAR)
    expect(cloudlessYearFor("2031-12-31")).toBe(CLOUDLESS_LATEST_YEAR)
    expect(cloudlessYearFor("2026-06-30")).toBe(CLOUDLESS_LATEST_YEAR)
  })

  it("resolves every timeline step to a valid year", () => {
    const steps = buildTimelineSteps(new Date(2026, 9, 19))
    for (const step of steps) {
      const year = cloudlessYearFor(step.date)
      expect(year).toBeGreaterThanOrEqual(CLOUDLESS_FIRST_YEAR)
      expect(year).toBeLessThanOrEqual(CLOUDLESS_LATEST_YEAR)
    }
  })

  it("builds an XYZ template for the EOX 3857 matrix", () => {
    expect(cloudlessTileUrl(2024)).toBe(
      "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
    )
    expect(cloudlessTileUrl(1999)).toContain(`s2cloudless-${CLOUDLESS_FIRST_YEAR}_3857`)
  })
})
