import exifr from "exifr"
import type pg from "pg"
import { HttpError } from "./validation.ts"
import type { ExifSummary, TrustAssessment } from "../src/types/domain.ts"
import {
  evaluateTrustRules,
  TRUST_THRESHOLDS,
  TRUST_RULES_VERSION,
  type TrustFlag,
  type TrustRuleInput,
} from "../shared/trustRules.ts"

export type ParsedImageExif = {
  summary: ExifSummary
  gps?: [longitude: number, latitude: number]
}

function formatExifDate(value: unknown): string | undefined {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?$/)
    if (!match) return undefined
    return `${match[1]}-${match[2]}-${match[3]}${match[4] ? `T${match[4]}` : ""}`
  }
  if (value instanceof Date && Number.isFinite(value.valueOf())) {
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-")
  }
  return undefined
}

export async function parseImageExif(bytes?: Buffer): Promise<ParsedImageExif> {
  if (!bytes) return { summary: { hasGps: false } }
  try {
    const metadata = await exifr.parse(bytes)
    const longitude = metadata?.longitude
    const latitude = metadata?.latitude
    const gps = typeof longitude === "number" && typeof latitude === "number" &&
      Number.isFinite(longitude) && Number.isFinite(latitude) &&
      longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
      ? [longitude, latitude] as [number, number]
      : undefined
    const takenAt = formatExifDate(metadata?.DateTimeOriginal ?? metadata?.CreateDate)
    return {
      summary: {
        hasGps: Boolean(gps),
        ...(takenAt ? { takenAt } : {}),
        ...(typeof metadata?.Make === "string" ? { make: metadata.Make } : {}),
        ...(typeof metadata?.Model === "string" ? { model: metadata.Model } : {}),
      },
      ...(gps ? { gps } : {}),
    }
  } catch {
    return { summary: { hasGps: false } }
  }
}

export function evaluateServerTrust(input: TrustRuleInput): {
  flags: TrustFlag[]
  status: "Flagged" | "Pending review"
  preview: TrustAssessment
  rulesVersion: string
} {
  const flags = evaluateTrustRules(input)
  const hasCritical = flags.some((flag) => flag.severity === "critical")
  const hasWarning = flags.some((flag) => flag.severity === "warn")
  return {
    flags,
    status: hasCritical ? "Flagged" : "Pending review",
    preview: {
      status: hasCritical ? "Flagged" : hasWarning ? "Needs review" : "Consistent",
      reasons: flags.map((flag) => ({
        code: flag.code,
        severity: flag.severity === "warn" ? "warning" : flag.severity,
        message: flag.message,
      })),
      checkedAt: new Date().toISOString(),
      engine: "server",
    },
    rulesVersion: TRUST_RULES_VERSION,
  }
}

export async function verifyUpload(input: {
  client: pg.PoolClient
  watershedId: string
  longitude: number
  latitude: number
  officerId: string
  assetType: string
  assetId?: string
  inspectionDate: string
  locationSource?: string
  reportedAccuracyMeters?: number
  imageMissing: boolean
  hashMismatch: boolean
  duplicateImage: boolean
  exif: ParsedImageExif
}) {
  const {
    client,
    watershedId,
    longitude,
    latitude,
    officerId,
  } = input
  const point = "ST_SetSRID(ST_MakePoint($2, $3), 4326)"
  const watershed = await client.query<{ id: string; covers: boolean }>(
    `SELECT id, ST_Covers(boundary, ${point}) AS covers
     FROM watersheds WHERE id = $1`,
    [watershedId, longitude, latitude],
  )
  if (!watershed.rows[0]) {
    throw new HttpError("Selected watershed was not found.", 422)
  }
  const containing = await client.query<{ id: string }>(
    `SELECT id FROM watersheds
     WHERE ST_Covers(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
     ORDER BY ST_Area(boundary::geography), id LIMIT 1`,
    [longitude, latitude],
  )
  const exifDistance = input.exif.gps
    ? await client.query<{ distance_meters: number }>(
        `SELECT ST_Distance(
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
         ) AS distance_meters`,
        [longitude, latitude, input.exif.gps[0], input.exif.gps[1]],
      )
    : undefined
  const stream = await client.query<{ distance_meters: number }>(
    `SELECT ST_Distance(geometry::geography, ${point}::geography) AS distance_meters
     FROM streams WHERE watershed_id = $1 OR watershed_id IS NULL
     ORDER BY geometry::geography <-> ${point}::geography, id LIMIT 1`,
    [watershedId, longitude, latitude],
  )
  const candidateResult = await client.query<{
    id: string
    asset_type: string | null
    distance_meters: number
  }>(
    `SELECT id, COALESCE(payload->>'type', payload->>'assetType') AS asset_type,
            ST_Distance(location::geography, ${point}::geography) AS distance_meters
     FROM assets
     WHERE watershed_id = $1
       AND ST_DWithin(location::geography, ${point}::geography, $4)
     ORDER BY distance_meters, id LIMIT 3`,
    [watershedId, longitude, latitude, TRUST_THRESHOLDS.assetMatchRadiusMeters],
  )
  const candidates = candidateResult.rows
  const relevantAssetId = input.assetId ?? (candidates.length === 1 ? candidates[0].id : undefined)
  let typeConflict = false
  if (relevantAssetId) {
    const conflict = await client.query(
      `SELECT 1 FROM field_observations
       WHERE asset_id = $1 AND asset_type IS NOT NULL AND asset_type <> $2
       LIMIT 1`,
      [relevantAssetId, input.assetType],
    )
    typeConflict = Boolean(conflict.rows[0])
  }
  const previous = await client.query<{
    distance_meters: number
    elapsed_minutes: number
  }>(
    `SELECT ST_Distance(location::geography, ${point}::geography) AS distance_meters,
            EXTRACT(EPOCH FROM (now() - created_at)) / 60 AS elapsed_minutes
     FROM field_observations WHERE officer_id = $1
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [officerId, longitude, latitude],
  )
  const previousSubmission = previous.rows[0]
  return evaluateServerTrust({
    imageMissing: input.imageMissing,
    hashMismatch: input.hashMismatch,
    duplicateImage: input.duplicateImage,
    exifGpsPresent: input.exif.summary.hasGps,
    exifDistanceMeters: exifDistance?.rows[0]?.distance_meters ?? null,
    reportedAccuracyMeters: input.reportedAccuracyMeters,
    exifTakenAt: input.exif.summary.takenAt,
    exifTimestampMissing: !input.exif.summary.takenAt,
    inspectionDate: input.inspectionDate,
    inspectionDateFuture: input.inspectionDate > new Date().toISOString().slice(0, 10),
    manualPin: input.locationSource === "manual",
    locationInsideWatershed: watershed.rows[0].covers,
    watershedMismatch: Boolean(containing.rows[0] && containing.rows[0].id !== watershedId),
    assetType: input.assetType,
    nearestStreamDistanceMeters: stream.rows[0]?.distance_meters ?? null,
    ambiguousAssetMatch: candidates.length >= 2,
    assetTypeHistoryConflict: typeConflict,
    impossibleTravel: previousSubmission
      ? {
          distanceMeters: previousSubmission.distance_meters,
          durationMinutes: previousSubmission.elapsed_minutes,
        }
      : undefined,
    assetSelection: input.assetId
      ? { kind: "existing", id: input.assetId, type: input.assetType,
          distanceMeters: candidates.find((candidate) => candidate.id === input.assetId)?.distance_meters ?? 0 }
      : candidates.length === 0
        ? { kind: "new" }
        : undefined,
  })
}
