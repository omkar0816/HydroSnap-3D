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

/**
 * Deterministic client-side evidence checks.
 *
 * These checks are a preview only: "Flagged" routes evidence to a human
 * reviewer. They do not inspect image content or replace server validation.
 */
export const trustConfig = {
  /** Max acceptable device-GPS accuracy radius before asking for review. */
  maxGpsAccuracyMeters: 30,
  /** Photos older than this (relative to inspection date) need review. */
  maxPhotoAgeDays: 30,
  /** Stream-based assets further than this from a mapped stream need review. */
  maxStreamSnapMeters: 150,
  /** Manual pin further than this from the EXIF position is flagged. */
  maxManualShiftMeters: 250,
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
  const reasons: TrustReason[] = []
  const now = input.now ?? new Date()

  // 1. EXIF presence
  if (!input.exif?.hasGps) {
    reasons.push({
      code: "exif-gps-missing",
      severity: "warning",
      message:
        "No GPS in image metadata; location came from device or a manual pin.",
    })
  } else {
    reasons.push({
      code: "exif-gps-present",
      severity: "info",
      message: "GPS coordinates present in image metadata.",
    })
  }

  // 2. Manual correction distance
  if (
    input.manualShiftMeters !== undefined &&
    input.manualShiftMeters > trustConfig.maxManualShiftMeters
  ) {
    reasons.push({
      code: "manual-shift-large",
      severity: "critical",
      message: `Confirmed location is ${Math.round(input.manualShiftMeters)} m from the EXIF position.`,
    })
  } else if (input.manualShiftMeters !== undefined) {
    reasons.push({
      code: "photo-location-match",
      severity: "info",
      message: `Confirmed point is ${Math.round(input.manualShiftMeters)} m from the photo's EXIF GPS.`,
    })
  } else if (input.location.source === "exif") {
    reasons.push({
      code: "photo-location-match",
      severity: "info",
      message: "Confirmed point uses GPS coordinates embedded in the photo.",
    })
  }

  // 3. Compare calendar dates; EXIF capture times usually carry no timezone.
  if (input.exif?.takenAt) {
    const gapDays = calendarDateDistanceDays(
      input.exif.takenAt,
      input.inspectionDate,
    )
    if (gapDays !== undefined && gapDays > trustConfig.maxPhotoAgeDays) {
      reasons.push({
        code: "timestamp-gap",
        severity: "warning",
        message: `Photo was taken ${gapDays} days from the inspection date.`,
      })
    } else if (gapDays !== undefined) {
      reasons.push({
        code: "timestamp-match",
        severity: "info",
        message: `Photo capture date is within ${trustConfig.maxPhotoAgeDays} days of the inspection date.`,
      })
    }
  } else {
    reasons.push({
      code: "timestamp-missing",
      severity: "warning",
      message: "Capture time not available in image metadata.",
    })
  }

  // 4. GPS accuracy
  if (
    input.location.accuracyMeters !== undefined &&
    input.location.accuracyMeters > trustConfig.maxGpsAccuracyMeters
  ) {
    reasons.push({
      code: "gps-accuracy-low",
      severity: "warning",
      message: `GPS accuracy ±${Math.round(input.location.accuracyMeters)} m exceeds ${trustConfig.maxGpsAccuracyMeters} m.`,
    })
  } else if (input.location.accuracyMeters !== undefined) {
    reasons.push({
    code: "gps-accuracy-good",
    severity: "info",
    message: `GPS accuracy ±${Math.round(input.location.accuracyMeters)} m is within ${trustConfig.maxGpsAccuracyMeters} m.`,
    })
  }

  // 5. Duplicate image
  if (
    input.imageSha256 &&
    input.existing.some((item) => item.imageSha256 === input.imageSha256)
  ) {
    reasons.push({
      code: "duplicate-image",
      severity: "critical",
      message: "The same image (SHA-256 match) was already submitted.",
    })
  } else if (input.imageSha256) {
    reasons.push({
      code: "image-unique",
      severity: "info",
      message: "No matching image SHA-256 was found in currently available observations.",
    })
  }

  // 6. Watershed containment
  if (!input.containingWatershed) {
    reasons.push({
      code: "outside-watersheds",
      severity: "critical",
      message: "Location is outside every known watershed boundary.",
    })
  } else if (input.containingWatershed.id !== input.declaredWatershedId) {
    reasons.push({
      code: "watershed-mismatch",
      severity: "warning",
      message: `Location falls in ${input.containingWatershed.name}, not the selected watershed.`,
    })
  } else {
    reasons.push({
      code: "watershed-match",
      severity: "info",
      message: `Location is inside the selected watershed: ${input.containingWatershed.name}.`,
    })
  }

  // 7. Stream proximity (stream-based assets only)
  if (isStreamBased(input.assetType)) {
    if (input.snapDistanceMeters === undefined) {
      reasons.push({
        code: "no-stream-layer",
        severity: "warning",
        message: "No mapped stream nearby to check placement against.",
      })
    } else if (input.snapDistanceMeters > trustConfig.maxStreamSnapMeters) {
      reasons.push({
        code: "far-from-stream",
        severity: "warning",
        message: `${input.assetType} is ${Math.round(input.snapDistanceMeters)} m from the nearest mapped stream.`,
      })
    } else {
      reasons.push({
        code: "near-stream",
        severity: "info",
        message: `${input.assetType} is within ${trustConfig.maxStreamSnapMeters} m of the nearest mapped stream.`,
      })
    }
  }

  if (input.assetMatchAmbiguous) {
    reasons.push({
      code: "asset-match-ambiguous",
      severity: "warning",
      message:
        "Multiple nearby assets of this type match the location; confirm the correct asset.",
    })
  }
  if (input.assetSelection?.kind === "new") {
    reasons.push({
      code: "new-asset-selected",
      severity: "info",
      message: "Officer selected a new asset after reviewing nearby matches.",
    })
  } else if (input.assetSelection?.kind === "existing") {
    reasons.push({
      code: "existing-asset-selected",
      severity: "info",
      message: `Officer linked this observation to ${input.assetSelection.id} (${input.assetSelection.type}), ${Math.round(input.assetSelection.distanceMeters)} m away.`,
    })
  }
  if (input.assetTypeConflict) {
    reasons.push({
      code: "asset-type-conflict",
      severity: "warning",
      message:
        "Nearby assets have a different type; confirm whether this is an existing or new asset.",
    })
  }

  const assessment = {
    status: "Consistent" as const,
    reasons,
    checkedAt: now.toISOString(),
    engine: "client-preview" as const,
  }
  const baseAssessment = withReasonStatus(assessment)
  return baseAssessment
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
