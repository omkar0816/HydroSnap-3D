import type {
  Asset,
  ExifSummary,
  FieldObservation,
  GeoLocation,
  TrustAssessment,
  TrustReason,
  Watershed,
} from "@/types/domain"
import { calendarDateDistanceDays } from "@/utils/dates"
import {
  evaluateTrustRules,
  TRUST_THRESHOLDS,
} from "../../shared/trustRules"

/**
 * Deterministic client-side evidence checks.
 *
 * These checks are a preview only: "Flagged" routes evidence to a human
 * reviewer. They do not inspect image content or replace server validation.
 */
export const trustConfig = {
  maxGpsAccuracyMeters: TRUST_THRESHOLDS.maxGpsAccuracyMeters,
  maxPhotoAgeDays: TRUST_THRESHOLDS.maxPhotoAgeDays,
  maxStreamSnapMeters: TRUST_THRESHOLDS.maxStreamDistanceMeters,
  maxManualShiftMeters: TRUST_THRESHOLDS.maxManualShiftMeters,
}

export const streamBasedTypes: Asset["type"][] = [
  "Check dam",
  "Percolation tank",
]

export function isStreamBased(type: Asset["type"]): boolean {
  return streamBasedTypes.includes(type)
}

export interface TrustInput {
  location: GeoLocation
  exifLocation?: GeoLocation
  exif?: ExifSummary
  inspectionDate: string
  assetType: Asset["type"]
  imageSha256?: string
  /** Observations already known (synced or queued) for duplicate detection. */
  existing: Pick<FieldObservation, "id" | "imageSha256">[]
  containingWatershed?: Watershed
  declaredWatershedId: string
  snapDistanceMeters?: number
  manualShiftMeters?: number
  assetMatchAmbiguous?: boolean
  assetTypeConflict?: boolean
  assetSelection?:
    | { kind: "new" }
    | {
        kind: "existing"
        id: string
        type: Asset["type"]
        distanceMeters: number
      }
  now?: Date
}

export function assessTrust(input: TrustInput): TrustAssessment {
  const containing = input.containingWatershed
  const flags = evaluateTrustRules({
    exifGpsPresent: input.exif?.hasGps ?? false,
    exifTakenAt: input.exif?.takenAt,
    exifTimestampMissing: !input.exif?.takenAt,
    exifDistanceMeters: input.manualShiftMeters,
    reportedAccuracyMeters: input.location.accuracyMeters,
    inspectionDate: input.inspectionDate,
    manualPin: input.location.source === "manual",
    locationInsideWatershed: Boolean(containing && containing.id === input.declaredWatershedId),
    watershedMismatch: Boolean(containing && containing.id !== input.declaredWatershedId),
    assetType: input.assetType,
    nearestStreamDistanceMeters: input.snapDistanceMeters,
    ambiguousAssetMatch: input.assetMatchAmbiguous,
    assetTypeHistoryConflict: input.assetTypeConflict,
    duplicateImage: Boolean(input.imageSha256 && input.existing.some((item) => item.imageSha256 === input.imageSha256)),
    assetSelection: input.assetSelection,
    now: input.now,
  })
  const legacyCodes: Record<string, string> = {
    exif_gps_missing: "exif-gps-missing",
    exif_gps_present: "exif-gps-present",
    exif_gps_far: "manual-shift-large",
    manual_pin_shift: "manual-shift-large",
    exif_gps_match: "photo-location-match",
    photo_date_mismatch: "timestamp-gap",
    exif_timestamp_missing: "timestamp-missing",
    gps_accuracy_poor: "gps-accuracy-low",
    duplicate_image: "duplicate-image",
    outside_watershed: "outside-watersheds",
    watershed_mismatch: "watershed-mismatch",
    ambiguous_asset_match: "asset-match-ambiguous",
    asset_type_history_conflict: "asset-type-conflict",
    new_asset_selected: "new-asset-selected",
    existing_asset_selected: "existing-asset-selected",
    far_from_stream: "far-from-stream",
    stream_data_missing: "no-stream-layer",
  }
  const reasons: TrustReason[] = flags.map((flag) => ({
    code: legacyCodes[flag.code] ?? flag.code,
    severity: flag.severity === "warn" || flag.code === "photo_date_mismatch" ||
        flag.code === "asset_type_history_conflict"
      ? "warning"
      : flag.severity,
    message: flag.message,
  }))
  if (input.exif?.takenAt && !flags.some((flag) => flag.code === "photo_date_mismatch")) {
    reasons.push({
      code: "timestamp-match",
      severity: "info",
      message: `Photo capture date is within ${trustConfig.maxPhotoAgeDays} days of the inspection date.`,
    })
  }
  if (input.location.accuracyMeters !== undefined && !flags.some((flag) => flag.code === "gps_accuracy_poor")) {
    reasons.push({
      code: "gps-accuracy-good",
      severity: "info",
      message: `GPS accuracy ±${Math.round(input.location.accuracyMeters)} m is within ${trustConfig.maxGpsAccuracyMeters} m.`,
    })
  }
  if (input.imageSha256 && !flags.some((flag) => flag.code === "duplicate_image")) {
    reasons.push({ code: "image-unique", severity: "info", message: "No matching image SHA-256 was found in available observations." })
  }
  if (input.containingWatershed?.id === input.declaredWatershedId) {
    reasons.push({ code: "watershed-match", severity: "info", message: `Location is inside the selected watershed: ${input.containingWatershed.name}.` })
  }
  if (isStreamBased(input.assetType) && input.snapDistanceMeters !== undefined && input.snapDistanceMeters <= trustConfig.maxStreamSnapMeters) {
    reasons.push({ code: "near-stream", severity: "info", message: `${input.assetType} is within ${trustConfig.maxStreamSnapMeters} m of the nearest mapped stream.` })
  }
  return withReasonStatus({
    status: "Consistent",
    reasons,
    checkedAt: (input.now ?? new Date()).toISOString(),
    engine: "client-preview",
  })
}

function withReasonStatus(assessment: TrustAssessment): TrustAssessment {
  const hasCritical = assessment.reasons.some(
    (reason) => reason.severity === "critical",
  )
  const hasWarning = assessment.reasons.some(
    (reason) => reason.severity === "warning",
  )
  return {
    ...assessment,
    status: hasCritical
      ? "Flagged"
      : hasWarning
        ? "Needs review"
        : "Consistent",
  }
}

export async function sha256Hex(file: Blob): Promise<string | undefined> {
  if (typeof crypto === "undefined" || !crypto.subtle) return undefined
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
