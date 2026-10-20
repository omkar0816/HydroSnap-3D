import type { Evidence } from "../evidence.ts"
import type { ReportFact, ReportFacts } from "../../shared/reportFacts.ts"
import type { SatelliteMeasurementRow } from "../../src/types/evidence.ts"

const caveat = "difference between windows, not an impact estimate"

function sameSeason(left: SatelliteMeasurementRow, right: SatelliteMeasurementRow): boolean {
  return left.windowStart.slice(5, 10) === right.windowStart.slice(5, 10) &&
    left.windowEnd.slice(5, 10) === right.windowEnd.slice(5, 10)
}

function qualityPasses(row?: SatelliteMeasurementRow): row is SatelliteMeasurementRow {
  return Boolean(
    row && row.status === "measured" && row.validPixelPct !== null &&
    row.validPixelPct >= 60 && row.mean !== null,
  )
}

function quarter(dateValue: string): string | null {
  const date = new Date(dateValue)
  if (Number.isNaN(date.valueOf())) return null
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
}

function noDataTrend(id: string, label: string, source = "No eligible measurements") : ReportFact {
  return {
    id,
    label: `${label} (${caveat})`,
    value: null,
    unit: caveat,
    source,
    status: "no-data",
    recordIds: [],
    kind: "trend",
  }
}

export function computeTrends(evidence: Evidence, facts: ReportFacts): ReportFact[] {
  const trends: ReportFact[] = []
  const ndvi = evidence.satellite
    .filter((row) => row.indexType === "NDVI")
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
  const baselineRows = ndvi.filter((row) => row.windowRole === "baseline")
  const currentRows = ndvi.filter((row) => row.windowRole === "current")
  const current = currentRows.at(-1)
  const baseline = current
    ? baselineRows.filter((row) => row.windowStart < current.windowStart && sameSeason(row, current)).at(-1)
    : baselineRows.at(-1)
  if (!qualityPasses(baseline) || !qualityPasses(current) ||
      !sameSeason(baseline, current) || baseline.windowStart >= current.windowStart) {
    trends.push(noDataTrend(
      "sat.ndvi.delta.yoy",
      "NDVI year-over-year change; baseline and current season windows required",
      baseline?.source ?? current?.source ?? "No eligible NDVI windows",
    ))
  } else {
    trends.push({
      id: "sat.ndvi.delta.yoy",
      label: `NDVI ${baseline.windowStart} to ${baseline.windowEnd} vs ${current.windowStart} to ${current.windowEnd}; ${caveat}`,
      value: current.mean! - baseline.mean!,
      unit: `NDVI ${caveat}`,
      source: [...new Set([baseline.source, current.source])].sort().join("; "),
      observedAt: `${baseline.windowEnd}/${current.windowEnd}`,
      status: baseline.demo || current.demo ? "demo" : "measured",
      recordIds: [baseline.id, current.id].sort(),
      kind: "trend",
    })
  }

  for (const intervention of evidence.interventions) {
    const id = `sat.ndvi.delta.intv.${intervention.id}`
    if (!intervention.installedAt) {
      trends.push(noDataTrend(id, `NDVI windows around intervention ${intervention.id} unavailable`))
      continue
    }
    const installTime = new Date(`${intervention.installedAt}T00:00:00Z`).valueOf()
    const before = ndvi.filter((row) =>
      row.windowEnd < intervention.installedAt! &&
      new Date(`${row.windowEnd}T00:00:00Z`).valueOf() < installTime,
    ).at(-1)
    const after = ndvi.find((row) =>
      row.windowStart >= intervention.installedAt! &&
      new Date(`${row.windowStart}T00:00:00Z`).valueOf() >= installTime + 365 * 24 * 60 * 60 * 1000 &&
      (!before || sameSeason(before, row)),
    )
    if (!qualityPasses(before) || !qualityPasses(after)) {
      trends.push(noDataTrend(
        id,
        `NDVI before/after windows for intervention ${intervention.id} unavailable`,
        before?.source ?? after?.source ?? "No eligible NDVI windows",
      ))
      continue
    }
    trends.push({
      id,
      label: `Intervention ${intervention.id}: ${before.windowStart} to ${before.windowEnd} vs ${after.windowStart} to ${after.windowEnd}; ${caveat}`,
      value: after.mean! - before.mean!,
      unit: `NDVI ${caveat}`,
      source: [...new Set([before.source, after.source])].sort().join("; "),
      observedAt: `${before.windowEnd}/${after.windowEnd}`,
      status: before.demo || after.demo ? "demo" : "measured",
      recordIds: [before.id, after.id].sort(),
      kind: "trend",
    })
  }

  const verifiedByQuarter = new Map<string, typeof evidence.observations>()
  for (const observation of evidence.observations) {
    if (observation.verificationStatus !== "Verified") continue
    const key = quarter(observation.inspectionDate ?? observation.recordedAt)
    if (!key) continue
    verifiedByQuarter.set(key, [...(verifiedByQuarter.get(key) ?? []), observation])
  }
  const periods = Array.from({ length: 4 }, (_, offset) => {
    const date = new Date()
    date.setUTCMonth(date.getUTCMonth() - offset * 3)
    return quarter(date.toISOString())!
  })
  for (const period of [...new Set(periods)].sort()) {
    const observations = verifiedByQuarter.get(period) ?? []
    const sourceRows = observations.map((row) => ({
      id: row.id,
      source: row.source,
      demo: row.demo,
    }))
    trends.push({
      id: `obs.verified.count.${period}`,
      label: `Verified observations in ${period}`,
      value: observations.length ? observations.length : null,
      unit: "observations",
      source: sourceRows.length
        ? [...new Set(sourceRows.map((row) => row.source))].sort().join("; ")
        : "No verified observations in this quarter",
      status: observations.length
        ? observations.some((row) => row.demo) ? "demo" : "measured"
        : "no-data",
      recordIds: observations.map((row) => row.id).sort(),
      kind: "trend",
    })
  }

  const noDataIdExists = facts.facts.some((fact) => fact.id === "sat.ndvi.current.mean")
  if (!noDataIdExists) {
    trends.push(noDataTrend("sat.ndvi.delta.yoy", "NDVI year-over-year change"))
  }
  return trends
}
