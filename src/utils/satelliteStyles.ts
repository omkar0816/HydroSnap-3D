import type { SatelliteMeasurementRow } from "@/types/evidence"

export type IndexType = "NDVI" | "NDWI"

/** Mirrors RASTER_STYLES in scripts/satellite/analyze_watershed.py (legend only). */
export const INDEX_STYLES: Record<IndexType, { min: number; max: number; palette: string[]; label: string; hint: string }> = {
  NDVI: {
    min: -0.1,
    max: 0.9,
    palette: ["#a6611a", "#dfc27d", "#f5f5b8", "#a6d96a", "#1a9641", "#00441b"],
    label: "NDVI (vegetation)",
    hint: "Higher = denser, greener vegetation",
  },
  NDWI: {
    min: -0.6,
    max: 0.6,
    palette: ["#8c510a", "#d8b365", "#f6e8c3", "#c7eae5", "#5ab4ac", "#01665e"],
    label: "NDWI (surface water / moisture)",
    hint: "Higher = more open water or wet surface",
  },
}

export const MIN_VALID_PIXEL_PCT = 60

export function isUsableMeasurement(row: SatelliteMeasurementRow | undefined): row is SatelliteMeasurementRow & { mean: number } {
  return Boolean(
    row && row.status === "measured" && row.mean !== null &&
    row.validPixelPct !== null && row.validPixelPct >= MIN_VALID_PIXEL_PCT,
  )
}

export type IndexChange = {
  baseline: (SatelliteMeasurementRow & { mean: number }) | null
  current: (SatelliteMeasurementRow & { mean: number }) | null
  /** current.mean - baseline.mean, only when both windows are usable. */
  change: number | null
  /** change relative to |baseline|, as a percentage, when baseline is not ~0. */
  changePct: number | null
}

/** Calculate baseline/current/change for one index from measurement rows. */
export function calculateIndexChange(rows: SatelliteMeasurementRow[], index: IndexType): IndexChange {
  const pick = (role: "baseline" | "current") => {
    const candidate = rows
      .filter((row) => row.indexType === index && row.windowRole === role)
      .sort((a, b) => a.computedAt.localeCompare(b.computedAt))
      .at(-1)
    return isUsableMeasurement(candidate) ? candidate : null
  }
  const baseline = pick("baseline")
  const current = pick("current")
  if (!baseline || !current) return { baseline, current, change: null, changePct: null }
  const change = current.mean - baseline.mean
  const changePct = Math.abs(baseline.mean) > 0.02 ? (change / Math.abs(baseline.mean)) * 100 : null
  return { baseline, current, change, changePct }
}

export function formatIndex(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits)
}

export function gradientCss(index: IndexType): string {
  return `linear-gradient(90deg, ${INDEX_STYLES[index].palette.join(", ")})`
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Default analysis range: the most recent 90 days, ending yesterday (UTC). */
export function defaultDateRange(now = new Date()): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 89)
  return { start: isoDay(start), end: isoDay(end) }
}

/**
 * Season-matched baseline: the same calendar dates shifted back by the
 * smallest whole number of years that makes it end before `start`.
 */
export function baselineFor(start: string, end: string): { start: string; end: string } {
  const spanDays = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
  const years = Math.max(1, Math.ceil(spanDays / 365))
  const shift = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`)
    date.setUTCFullYear(date.getUTCFullYear() - years)
    return isoDay(date)
  }
  return { start: shift(start), end: shift(end) }
}
