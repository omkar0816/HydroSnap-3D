export type Season = {
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  label: string
}

export type AnalysisWindow = {
  start: string
  end: string
}

export type SeasonalWindows = {
  baseline: AnalysisWindow | null
  current: AnalysisWindow | null
}

export const DEFAULT_SEASON: Season = {
  startMonth: 11,
  startDay: 1,
  endMonth: 12,
  endDay: 31,
  label: "Nov-Dec",
}

function validSeason(season: Season) {
  return Number.isInteger(season.startMonth) && season.startMonth >= 1 && season.startMonth <= 12 &&
    Number.isInteger(season.endMonth) && season.endMonth >= 1 && season.endMonth <= 12 &&
    Number.isInteger(season.startDay) && season.startDay >= 1 && season.startDay <= 31 &&
    Number.isInteger(season.endDay) && season.endDay >= 1 && season.endDay <= 31 &&
    typeof season.label === "string" && season.label.trim().length > 0
}

function windowForStartYear(startYear: number, season: Season): AnalysisWindow {
  const endYear = season.endMonth < season.startMonth ||
    (season.endMonth === season.startMonth && season.endDay < season.startDay)
    ? startYear + 1
    : startYear
  return {
    start: `${startYear}-${String(season.startMonth).padStart(2, "0")}-${String(season.startDay).padStart(2, "0")}`,
    end: `${endYear}-${String(season.endMonth).padStart(2, "0")}-${String(season.endDay).padStart(2, "0")}`,
  }
}

export function latestCompleteSeason(
  asOf = new Date(),
  season: Season = DEFAULT_SEASON,
): AnalysisWindow | null {
  if (!validSeason(season)) throw new Error("Season definition is invalid.")
  const today = asOf.toISOString().slice(0, 10)
  const currentYear = asOf.getUTCFullYear()
  const candidates = Array.from({ length: 5 }, (_, offset) =>
    windowForStartYear(currentYear - 4 + offset, season),
  ).filter((window) => window.end < today)
  return candidates.sort((a, b) => b.start.localeCompare(a.start))[0] ?? null
}

export function seasonMatchedWindows(
  asOf = new Date(),
  season: Season = DEFAULT_SEASON,
): SeasonalWindows {
  const current = latestCompleteSeason(asOf, season)
  if (!current) return { baseline: null, current: null }
  const startYear = Number(current.start.slice(0, 4))
  return {
    baseline: startYear > 1900 ? windowForStartYear(startYear - 1, season) : null,
    current,
  }
}

export function interventionWindows(
  installedAt: string,
  asOf = new Date(),
  season: Season = DEFAULT_SEASON,
): SeasonalWindows {
  if (!validSeason(season)) throw new Error("Season definition is invalid.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installedAt) || Number.isNaN(Date.parse(installedAt))) {
    throw new Error("Installation date must be an ISO calendar date.")
  }
  const installedTime = Date.parse(`${installedAt}T00:00:00Z`)
  const earliestCurrentTime = installedTime + 365 * 24 * 60 * 60 * 1000
  const asOfDate = asOf.toISOString().slice(0, 10)
  const firstYear = Math.max(1900, Number(installedAt.slice(0, 4)) - 2)
  const lastYear = asOf.getUTCFullYear()
  const candidates = Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, index) =>
    windowForStartYear(firstYear + index, season),
  ).sort((a, b) => a.start.localeCompare(b.start))
  const baseline = candidates.filter((window) => window.end < installedAt).at(-1) ?? null
  const current = candidates.find((window) =>
    window.start >= new Date(earliestCurrentTime).toISOString().slice(0, 10) &&
    window.end < asOfDate,
  ) ?? null
  return { baseline, current }
}
