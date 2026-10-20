import type { Evidence } from "../evidence.ts"
import type { ReportFact, ReportFacts } from "../../shared/reportFacts.ts"

type SourceRow = { id: string; source: string; demo: boolean; recordedAt?: string }

function sourceName(rows: SourceRow[], fallback: string): string {
  const sources = [...new Set(rows.map((row) => row.source).filter(Boolean))].sort()
  return sources.length ? sources.join("; ") : fallback
}

function makeFact(
  evidence: Evidence,
  input: {
    id: string
    label: string
    value: string | number | null
    unit?: string
    kind: ReportFact["kind"]
    rows?: SourceRow[]
    source?: string
    observedAt?: string
  },
): ReportFact {
  const rows = input.rows ?? []
  const status = input.value === null
    ? "no-data"
    : rows.some((row) => row.demo) || (!rows.length && evidence.watershed.demo)
      ? "demo"
      : "measured"
  return {
    id: input.id,
    label: input.label,
    value: input.value,
    ...(input.unit ? { unit: input.unit } : {}),
    source: input.source ?? sourceName(rows, "HydroSnap PostGIS evidence"),
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    status,
    recordIds: rows.map((row) => row.id).sort(),
    kind: input.kind,
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

const assetTypeFacts = [
  ["check_dam", "Check dams", "Check dam"],
  ["farm_pond", "Farm ponds", "Farm pond"],
  ["plantation", "Plantations", "Plantation"],
  ["percolation_tank", "Percolation tanks", "Percolation tank"],
] as const

export function buildFacts(evidence: Evidence): ReportFacts {
  const facts: ReportFact[] = []
  const observations = evidence.observations
  const obsRows: SourceRow[] = observations.map((row) => ({
    id: row.id, source: row.source, demo: row.demo, recordedAt: row.recordedAt,
  }))
  const verified = observations.filter((row) => row.verificationStatus === "Verified")
  const flagged = observations.filter((row) =>
    row.verificationStatus === "Flagged" || row.trustFlags.length > 0,
  )
  const addCount = (
    id: string,
    label: string,
    rows: SourceRow[],
    count: number,
  ) => facts.push(makeFact(evidence, {
    id, label, value: count, unit: "records", kind: "count", rows: rows.length ? rows : obsRows,
  }))

  addCount("obs.count.total", "Field observations", obsRows, observations.length)
  addCount("obs.count.verified", "Verified observations", verified, verified.length)
  addCount("obs.count.flagged", "Flagged or trust-flagged observations", flagged, flagged.length)

  for (const [typeId, label, assetType] of assetTypeFacts) {
    const rows = evidence.assets.filter((asset) => asset.type.toLowerCase() === assetType.toLowerCase())
    facts.push(makeFact(evidence, {
      id: `asset.count.byType.${typeId}`,
      label: `${label} in watershed`,
      value: rows.length,
      unit: "assets",
      kind: "count",
      rows,
    }))
  }

  const completed = evidence.interventions.filter((item) => item.status === "Completed")
  facts.push(makeFact(evidence, {
    id: "intv.count.completed",
    label: "Completed interventions",
    value: completed.length,
    unit: "interventions",
    kind: "count",
    rows: completed,
  }))

  for (const indexType of ["NDVI", "NDWI"] as const) {
    for (const windowRole of ["current", "baseline"] as const) {
      const id = `sat.${indexType.toLowerCase()}.${windowRole}.mean`
      const rows = evidence.satellite
        .filter((row) => row.indexType === indexType && row.windowRole === windowRole)
        .sort((a, b) => b.windowStart.localeCompare(a.windowStart))
      const selected = rows[0]
      const valid = selected?.status === "measured" ? selected : undefined
      facts.push(makeFact(evidence, {
        id,
        label: `${indexType} ${windowRole} mean${selected ? ` (${selected.windowStart} to ${selected.windowEnd})` : ""}`,
        value: valid?.mean ?? null,
        unit: indexType,
        kind: "measurement",
        rows: selected ? [selected] : [],
        source: selected && !valid ? selected.source : undefined,
        observedAt: valid?.windowEnd,
      }))
    }
  }

  for (const className of ["cropland", "forest", "built-up"]) {
    const rows = evidence.landUse.filter((item) =>
      slug(item.class).replace(/_/g, "") === slug(className).replace(/_/g, ""),
    )
    const latest = [...rows].sort((a, b) => b.referenceYear - a.referenceYear)[0]
    facts.push(makeFact(evidence, {
      id: `land.${slug(className)}.pct`,
      label: `${className} land-use share${latest ? ` in ${latest.referenceYear}` : ""}`,
      value: latest?.pct ?? null,
      unit: "%",
      kind: "coverage",
      rows: latest ? [{ id: latest.id, source: latest.source, demo: latest.demo }] : [],
      source: latest?.source,
      observedAt: latest ? String(latest.referenceYear) : undefined,
    }))
  }

  facts.push(makeFact(evidence, {
    id: "drain.density",
    label: "Drainage density",
    value: evidence.drainage?.densityKmPerKm2 ?? null,
    unit: "km/km²",
    kind: "measurement",
    rows: evidence.drainage
      ? [{ id: evidence.watershed.id, source: evidence.drainage.source, demo: evidence.drainage.demo }]
      : [],
    source: evidence.drainage?.source,
  }))

  facts.push(makeFact(evidence, {
    id: "watershed.area_km2",
    label: "Watershed area",
    value: evidence.watershed.areaKm2,
    unit: "km²",
    kind: "measurement",
    rows: [{ id: evidence.watershed.id, source: evidence.watershed.source ?? "unknown", demo: evidence.watershed.demo }],
  }))

  return {
    subject: evidence.watershed.name,
    generatedAt: new Date().toISOString(),
    facts,
  }
}
