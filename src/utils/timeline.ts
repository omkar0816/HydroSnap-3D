import type { Asset } from "@/types/domain"

export const TIMELINE_START_YEAR = 2023

export type TimelineInterval = 6 | 12

export interface TimelineStep {
  id: string
  label: string
  shortLabel: string
  range: string
  date: string
  from: string
  isNow: boolean
}

export interface TimelineSummary {
  step: TimelineStep
  cumulative: Asset[]
  added: Asset[]
  verified: number
  byType: Record<string, number>
}

/** Demo install dates for seeded assets; real assets should set installedAt. */
export const demoInstallDates: Record<string, string> = {
  "ast-001": "2023-03-14",
  "ast-005": "2023-10-20",
  "ast-002": "2024-02-09",
  "ast-004": "2024-09-18",
  "ast-006": "2025-03-05",
  "ast-003": "2025-08-22",
  "ast-007": "2025-12-11",
  "ast-008": "2026-03-27",
  "ast-009": "2026-08-14",
}

export function installDate(asset: Asset): string {
  return (
    asset.installedAt ??
    demoInstallDates[asset.id] ??
    asset.lastInspected
  ).slice(0, 10)
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function buildTimelineSteps(
  now: Date = new Date(),
  startYear: number = TIMELINE_START_YEAR,
  intervalMonths: TimelineInterval = 6,
): TimelineStep[] {
  const today = isoDate(now)
  const periodSteps: TimelineStep[] = []

  for (let year = startYear; year <= now.getFullYear(); year++) {
    const periodCount = 12 / intervalMonths
    for (let period = 1; period <= periodCount; period++) {
      const endMonth = period * intervalMonths
      const endDate = new Date(year, endMonth, 0)
      const date = isoDate(endDate)
      if (date >= today) break
      const label =
        intervalMonths === 6 ? `H${period} ${year}` : String(year)
      const shortLabel =
        intervalMonths === 6 ? `H${period} ’${String(year).slice(2)}` : label
      const range =
        intervalMonths === 6
          ? period === 1
            ? `Jan – Jun ${year}`
            : `Jul – Dec ${year}`
          : `Jan – Dec ${year}`
      periodSteps.push({
        id: `${year}-${intervalMonths === 6 ? `H${period}` : "Y"}`,
        label,
        shortLabel,
        range,
        date,
        from: "",
        isNow: false,
      })
    }
  }

  let from = `${startYear - 1}-12-31`
  const steps = periodSteps.map((step) => {
    const withFrom = { ...step, from }
    from = step.date
    return withFrom
  })
  const fromMonth = Number(from.slice(5, 7))
  const sinceMonthIndex = (fromMonth % 12)
  const sinceYear =
    Number(from.slice(0, 4)) + (fromMonth === 12 ? 1 : 0)
  steps.push({
    id: "now",
    label: "Now",
    shortLabel: "Now",
    range: `${MONTHS[sinceMonthIndex]} ${sinceYear} – today`,
    date: today,
    from,
    isNow: true,
  })
  return steps
}

export function assetsAsOf(assets: Asset[], date: string): Asset[] {
  return assets.filter((asset) => installDate(asset) <= date)
}

export function assetsAddedBetween(
  assets: Asset[],
  from: string,
  to: string,
): Asset[] {
  return assets.filter((asset) => {
    const installed = installDate(asset)
    return installed > from && installed <= to
  })
}

export function summarizeStep(
  assets: Asset[],
  step: TimelineStep,
): TimelineSummary {
  const cumulative = assetsAsOf(assets, step.date)
  const added = assetsAddedBetween(assets, step.from, step.date)
  const byType: Record<string, number> = {}
  for (const asset of cumulative) {
    byType[asset.type] = (byType[asset.type] ?? 0) + 1
  }
  return {
    step,
    cumulative,
    added,
    verified: cumulative.filter((asset) => asset.status === "Verified").length,
    byType,
  }
}
