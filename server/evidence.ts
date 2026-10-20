import type pg from "pg"
import { pool } from "./database.ts"

export type EvidenceFlag = {
  code: string
  severity: "info" | "warn" | "critical"
  message: string
  evidence?: Record<string, unknown>
}

type Queryable = Pick<pg.Pool, "query">

type SatelliteMeasurement = {
  id: string
  watershedId: string
  assetId: string | null
  aoiScope: "watershed" | "asset_buffer"
  bufferM: number | null
  indexType: "NDVI" | "NDWI"
  windowRole: "baseline" | "current" | "custom"
  windowStart: string
  windowEnd: string
  seasonLabel: string | null
  mean: number | null
  median: number | null
  p10: number | null
  p90: number | null
  std: number | null
  validPixelPct: number | null
  sceneCount: number | null
  sceneIds: string[]
  cloudLimitPct: number | null
  method: string
  resolutionM: number | null
  status: "measured" | "insufficient_data" | "failed"
  jobId: string | null
  computedAt: string
  source: string
  sourceLicence: string | null
  attribution: string | null
  demo: boolean
}

export type Evidence = {
  watershed: {
    id: string
    name: string
    areaKm2: number
    boundaryGeojson: unknown
    source: string | null
    sourceLicence: string | null
    demo: boolean
  }
  assets: Array<{
    id: string
    type: string
    name: string
    lat: number
    lng: number
    installedAt: string | null
    status: string
    source: string
    sourceLicence: string | null
    demo: boolean
  }>
  observations: Array<{
    id: string
    assetId: string | null
    assetType: string | null
    inspectionDate: string | null
    verificationStatus: string
    trustFlags: EvidenceFlag[]
    recordedAt: string
    officerId: string | null
    source: string
    sourceLicence: string | null
    demo: boolean
    lng: number
    lat: number
    village: string
    description: string
    imageSha256: string | null
    hasImage: boolean
    snapDistanceMeters: number | null
    trust: unknown
    photoContentReview: unknown
  }>
  interventions: Array<{
    id: string
    assetId: string | null
    type: string
    status: string
    installedAt: string | null
    progress: number | null
    recordedAt: string
    source: string
    sourceLicence: string | null
    demo: boolean
  }>
  satellite: SatelliteMeasurement[]
  landUse: Array<{
    id: string
    class: string
    areaHa: number
    pct: number
    referenceYear: number
    source: string
    sourceLicence: string | null
    demo: boolean
  }>
  drainage: {
    streamLengthKm: number
    densityKmPerKm2: number
    maxOrder: number | null
    source: string
    sourceLicence: string | null
    demo: boolean
  } | null
  generatedAt: string
}

function normalizeTrustFlags(value: unknown): EvidenceFlag[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): EvidenceFlag[] => {
    if (!candidate || typeof candidate !== "object") return []
    const flag = candidate as Record<string, unknown>
    if (typeof flag.code !== "string" || typeof flag.message !== "string") return []
    const severity = flag.severity === "warning" ? "warn" : flag.severity
    if (severity !== "info" && severity !== "warn" && severity !== "critical") return []
    return [{
      code: flag.code,
      severity,
      message: flag.message,
      ...(flag.evidence && typeof flag.evidence === "object"
        ? { evidence: flag.evidence as Record<string, unknown> }
        : {}),
    }]
  })
}

export async function loadSatelliteMeasurements(
  watershedId: string,
  db: Queryable = pool,
): Promise<SatelliteMeasurement[]> {
  const { rows } = await db.query<SatelliteMeasurement>(
    `SELECT id, watershed_id AS "watershedId", asset_id AS "assetId",
            aoi_scope AS "aoiScope", buffer_m AS "bufferM",
            index_type AS "indexType", window_role AS "windowRole",
            window_start::text AS "windowStart", window_end::text AS "windowEnd",
            season_label AS "seasonLabel", mean, median, p10, p90, std,
            valid_pixel_pct AS "validPixelPct", scene_count AS "sceneCount",
            scene_ids AS "sceneIds", cloud_limit_pct AS "cloudLimitPct",
            method, resolution_m AS "resolutionM", status,
            job_id AS "jobId", computed_at::text AS "computedAt", source,
            source_licence AS "sourceLicence", attribution, demo
     FROM satellite_measurements
     WHERE watershed_id = $1
     ORDER BY window_start, index_type, id`,
    [watershedId],
  )
  return rows
}

export async function loadEvidence(
  watershedId: string,
  db: Queryable = pool,
): Promise<Evidence | null> {
  const [watershedResult, assetResult, observationResult, interventionResult,
    satellite, landUseResult, drainageResult] = await Promise.all([
    db.query<{
      id: string
      name: string
      areaKm2: number
      boundaryGeojson: unknown
      source: string | null
      sourceLicence: string | null
      demo: boolean
    }>(
      `SELECT id, payload->>'name' AS name,
              ST_Area(boundary::geography) / 1000000.0 AS "areaKm2",
              ST_AsGeoJSON(boundary)::json AS "boundaryGeojson",
              source, source_licence AS "sourceLicence", demo
       FROM watersheds WHERE id = $1`,
      [watershedId],
    ),
    db.query<Evidence["assets"][number]>(
      `SELECT id, COALESCE(payload->>'type', payload->>'assetType', '') AS type,
              COALESCE(payload->>'name', '') AS name,
              ST_Y(location)::double precision AS lat,
              ST_X(location)::double precision AS lng,
              installed_at::text AS "installedAt",
              COALESCE(payload->>'status', 'Pending review') AS status,
              source, source_licence AS "sourceLicence", demo
       FROM assets WHERE watershed_id = $1 ORDER BY id`,
      [watershedId],
    ),
    db.query<{
      id: string
      assetId: string | null
      assetType: string | null
      inspectionDate: string | null
      verificationStatus: string
      trustFlags: unknown
      recordedAt: string
      officerId: string | null
      source: string
      sourceLicence: string | null
      demo: boolean
      lng: number
      lat: number
      village: string
      description: string
      imageSha256: string | null
      hasImage: boolean
      snapDistanceMeters: number | null
      trust: unknown
      photoContentReview: unknown
    }>(
      `SELECT id, asset_id AS "assetId", asset_type AS "assetType",
              inspection_date::text AS "inspectionDate",
              verification_status AS "verificationStatus",
              COALESCE(payload->'trust'->'flags', payload->'trust'->'reasons', '[]'::jsonb)
                AS "trustFlags",
              created_at::text AS "recordedAt", officer_id AS "officerId",
              source, source_licence AS "sourceLicence", demo,
              ST_X(location)::double precision AS lng,
              ST_Y(location)::double precision AS lat,
              COALESCE(payload->>'village', '') AS village,
              COALESCE(payload->>'description', '') AS description,
              image_sha256 AS "imageSha256", image_path IS NOT NULL AS "hasImage",
              NULLIF(payload->>'snapDistanceMeters', '')::double precision
                AS "snapDistanceMeters",
              payload->'trust' AS trust,
              payload->'photoContentReview' AS "photoContentReview"
       FROM field_observations WHERE watershed_id = $1 ORDER BY created_at, id`,
      [watershedId],
    ),
    db.query<{
      id: string
      assetId: string | null
      type: string
      status: string
      installedAt: string | null
      progress: number | null
      recordedAt: string
      source: string
      sourceLicence: string | null
      demo: boolean
    }>(
      `SELECT id, asset_id AS "assetId",
              COALESCE(payload->>'type', payload->>'name', '') AS type,
              status, installed_at::text AS "installedAt",
              NULLIF(payload->>'progress', '')::double precision AS progress,
              recorded_at::text AS "recordedAt", source,
              source_licence AS "sourceLicence", demo
       FROM interventions WHERE watershed_id = $1 ORDER BY recorded_at, id`,
      [watershedId],
    ),
    loadSatelliteMeasurements(watershedId, db),
    db.query<Evidence["landUse"][number]>(
      `SELECT id, class_name AS class, area_ha AS "areaHa", pct,
              reference_year AS "referenceYear", source,
              source_licence AS "sourceLicence", demo
       FROM land_use WHERE watershed_id = $1 ORDER BY class_name, reference_year`,
      [watershedId],
    ),
    db.query<NonNullable<Evidence["drainage"]>>(
      `SELECT stream_length_km AS "streamLengthKm",
              drainage_density_km_per_km2 AS "densityKmPerKm2",
              max_stream_order AS "maxOrder", source,
              source_licence AS "sourceLicence", demo
       FROM drainage WHERE watershed_id = $1`,
      [watershedId],
    ),
  ])

  const watershed = watershedResult.rows[0]
  if (!watershed) return null
  return {
    watershed,
    assets: assetResult.rows,
    observations: observationResult.rows.map((row) => ({
      ...row,
      trustFlags: normalizeTrustFlags(row.trustFlags),
    })),
    interventions: interventionResult.rows,
    satellite,
    landUse: landUseResult.rows,
    drainage: drainageResult.rows[0] ?? null,
    generatedAt: new Date().toISOString(),
  }
}
