import type { Evidence } from "../evidence.ts"
import type { DataGap, ReportFact } from "../../shared/reportFacts.ts"

function gap(code: string, severity: DataGap["severity"], text: string): DataGap {
  return { code, severity, text }
}

export function computeGaps(
  evidence: Evidence,
  facts: ReportFact[],
  now = new Date(),
): DataGap[] {
  const gaps: DataGap[] = []
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1)
  const recentSatellite = evidence.satellite.some((row) =>
    row.status === "measured" &&
    row.windowEnd >= twelveMonthsAgo.toISOString().slice(0, 10),
  )
  if (!recentSatellite) {
    gaps.push(gap("satellite_stale", "warning", "No satellite measurement in the last 12 months."))
  }
  if (!evidence.satellite.some((row) => row.windowRole === "baseline" && row.status === "measured")) {
    gaps.push(gap("satellite_baseline_missing", "warning", "No baseline window (cannot compute change)."))
  }
  const undatedInterventions = evidence.interventions.filter((item) => !item.installedAt).length
  if (undatedInterventions) {
    gaps.push(gap(
      "intervention_install_date_missing",
      "warning",
      `${undatedInterventions} intervention(s) have no installation date.`,
    ))
  }
  if (evidence.watershed.demo) {
    gaps.push(gap("boundary_demo", "warning", "Watershed boundary is demo data."))
  }
  if (evidence.drainage?.demo) {
    gaps.push(gap("streams_demo", "warning", "Stream network and drainage summary are demo data."))
  } else if (!evidence.drainage) {
    gaps.push(gap("drainage_missing", "warning", "No drainage or stream summary is available."))
  }
  if (evidence.landUse.some((item) => item.demo)) {
    gaps.push(gap("land_use_demo", "warning", "Land-use data are demo data."))
  } else if (!evidence.landUse.length) {
    gaps.push(gap("land_use_missing", "info", "No land-use records are available."))
  }
  const unverifiedOrFlagged = evidence.observations.filter((item) =>
    item.verificationStatus !== "Verified" || item.trustFlags.length > 0,
  ).length
  if (unverifiedOrFlagged) {
    gaps.push(gap(
      "observations_unverified_or_flagged",
      "warning",
      `${unverifiedOrFlagged} observation(s) are unverified or flagged.`,
    ))
  }
  gaps.push(gap(
    "rainfall_normalisation_missing",
    "warning",
    "No rainfall normalisation: NDVI differences can reflect rainfall, not interventions.",
  ))
  const lowCoverage = evidence.satellite.filter((row) =>
    row.validPixelPct !== null && row.validPixelPct < 60,
  )
  if (lowCoverage.length) {
    gaps.push(gap(
      "satellite_low_valid_coverage",
      "warning",
      `${lowCoverage.length} satellite window(s) have low valid-pixel coverage (<60%).`,
    ))
  }
  const missingTrend = facts.some((fact) =>
    fact.id === "sat.ndvi.delta.yoy" && fact.status === "no-data",
  )
  if (missingTrend && evidence.satellite.length) {
    gaps.push(gap("satellite_change_unavailable", "info", "Season-matched satellite windows do not meet the change-comparison requirements."))
  }
  return gaps
}
