import { describe, expect, it } from "vitest"
import {
  interventionWindows,
  latestCompleteSeason,
  seasonMatchedWindows,
  type Season,
} from "../satellite/windows.ts"

describe("satellite season windows", () => {
  it("selects the latest complete Nov-Dec season and its prior-year baseline", () => {
    expect(seasonMatchedWindows(new Date("2026-10-20T00:00:00Z"))).toEqual({
      baseline: { start: "2024-11-01", end: "2024-12-31" },
      current: { start: "2025-11-01", end: "2025-12-31" },
    })
  })

  it("handles a season that crosses the calendar year boundary", () => {
    const wetSeason: Season = {
      startMonth: 11,
      startDay: 1,
      endMonth: 2,
      endDay: 28,
      label: "Nov-Feb",
    }
    expect(latestCompleteSeason(new Date("2026-04-01T00:00:00Z"), wetSeason)).toEqual({
      start: "2025-11-01",
      end: "2026-02-28",
    })
    expect(seasonMatchedWindows(new Date("2026-04-01T00:00:00Z"), wetSeason).baseline)
      .toEqual({ start: "2024-11-01", end: "2025-02-28" })
  })

  it("uses the previous complete season when installation occurs inside a season", () => {
    expect(interventionWindows("2024-11-15", new Date("2027-01-01T00:00:00Z"))).toEqual({
      baseline: { start: "2023-11-01", end: "2023-12-31" },
      current: { start: "2026-11-01", end: "2026-12-31" },
    })
  })

  it("returns null when a valid prior-year baseline is unavailable", () => {
    expect(interventionWindows("1900-01-01", new Date("2020-01-01T00:00:00Z")).baseline)
      .toBeNull()
    expect(seasonMatchedWindows(new Date("2026-11-15T00:00:00Z")).current)
      .toEqual({ start: "2025-11-01", end: "2025-12-31" })
  })
})