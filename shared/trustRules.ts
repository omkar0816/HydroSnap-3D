export type TrustSeverity = "info" | "warn" | "critical"

export type TrustFlag = {
  code: string
  severity: TrustSeverity
  message: string
  evidence?: Record<string, unknown>
}

export const TRUST_RULES_VERSION = "1"

export const TRUST_THRESHOLDS = {
  maxGpsAccuracyMeters: 30,
  maxPhotoAgeDays: 30,
  criticalPhotoDateGapDays: 90,
  maxStreamDistanceMeters: 150,
  maxManualShiftMeters: 250,
  assetMatchRadiusMeters: 50,
  impossibleTravelSpeedKmh: 120,
} as const

export type TrustRuleInput = {
  imageMissing?: boolean
  hashMismatch?: boolean
  duplicateImage?: boolean
  exifGpsPresent?: boolean
  exifDistanceMeters?: number | null
  reportedAccuracyMeters?: number
  exifTakenAt?: string
  exifTimestampMissing?: boolean
  inspectionDate?: string
  inspectionDateFuture?: boolean
  manualPin?: boolean
  locationInsideWatershed?: boolean
  watershedMismatch?: boolean
  assetType?: string
  nearestStreamDistanceMeters?: number | null
  ambiguousAssetMatch?: boolean
  assetTypeHistoryConflict?: boolean
  impossibleTravel?: { distanceMeters: number; durationMinutes: number }
  assetSelection?: { kind: "new" } | { kind: "existing"; id: string; type: string; distanceMeters: number }
  now?: Date
}

const streamBasedTypes = new Set(["Check dam", "Percolation tank"])

function calendarDay(value: string): number | undefined {
  const date = value.match(/^(\d{4})[-:](\d{2})[-:](\d{2})/)
  if (!date) return undefined
  const parsed = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]))
  const checked = new Date(parsed)
  if (checked.getUTCFullYear() !== Number(date[1]) ||
      checked.getUTCMonth() !== Number(date[2]) - 1 ||
      checked.getUTCDate() !== Number(date[3])) return undefined
  return parsed
}

function add(
  flags: TrustFlag[],
  code: string,
  severity: TrustSeverity,
  message: string,
  evidence?: Record<string, unknown>,
) {
  flags.push({ code, severity, message, ...(evidence ? { evidence } : {}) })
}

export function evaluateTrustRules(input: TrustRuleInput): TrustFlag[] {
  const flags: TrustFlag[] = []
  const thresholds = TRUST_THRESHOLDS

  if (input.imageMissing) add(flags, "image_missing", "critical", "No image bytes were provided.")
  if (input.hashMismatch) add(flags, "hash_mismatch", "critical", "Client image hash does not match the uploaded bytes.")
  if (input.duplicateImage) add(flags, "duplicate_image", "critical", "The image SHA-256 is already present in another observation.")

  if (input.exifGpsPresent === false) {
    add(flags, "exif_gps_missing", "warn", "No GPS coordinates were found in the image EXIF metadata.")
  } else if (input.exifGpsPresent === true) {
    add(flags, "exif_gps_present", "info", "GPS coordinates were found in the image EXIF metadata.")
  }
  if (input.exifDistanceMeters !== undefined && input.exifDistanceMeters !== null) {
    const distance = Math.round(input.exifDistanceMeters)
    if (input.exifDistanceMeters > thresholds.maxManualShiftMeters) {
      add(flags, "exif_gps_far", "critical", `Confirmed location is ${distance} m from EXIF GPS.`, { distanceMeters: input.exifDistanceMeters })
    } else if (input.manualPin) {
      add(flags, "manual_pin_shift", "warn", `Manual pin is ${distance} m from EXIF GPS.`, { distanceMeters: input.exifDistanceMeters })
    } else {
      add(flags, "exif_gps_match", "info", `Confirmed point is ${distance} m from the photo's EXIF GPS.`, { distanceMeters: input.exifDistanceMeters })
    }
  }

  if (input.reportedAccuracyMeters !== undefined &&
      input.reportedAccuracyMeters > thresholds.maxGpsAccuracyMeters) {
    add(flags, "gps_accuracy_poor", "warn", `Reported GPS accuracy ±${Math.round(input.reportedAccuracyMeters)} m exceeds ${thresholds.maxGpsAccuracyMeters} m.`)
  }

  if (input.exifTakenAt && input.inspectionDate) {
    const captureDay = calendarDay(input.exifTakenAt)
    const inspectionDay = calendarDay(input.inspectionDate)
    if (captureDay !== undefined && inspectionDay !== undefined) {
      const gapDays = Math.abs(inspectionDay - captureDay) / 86_400_000
      if (gapDays > thresholds.criticalPhotoDateGapDays) {
        add(flags, "photo_date_mismatch", "critical", `Photo date differs from the inspection date by ${gapDays} days.`, { gapDays })
      } else if (gapDays > thresholds.maxPhotoAgeDays) {
        add(flags, "photo_date_mismatch", "warn", `Photo date differs from the inspection date by ${gapDays} days.`, { gapDays })
      }
    }
  }
  if (input.exifTimestampMissing) {
    add(flags, "exif_timestamp_missing", "warn", "Capture time was not found in the image EXIF metadata.")
  }
  if (input.inspectionDateFuture) {
    add(flags, "future_date", "critical", "Inspection date is in the future.")
  }

  if (input.locationInsideWatershed === false) {
    add(flags, "outside_watershed", "critical", "Confirmed location is outside the selected watershed boundary.")
  }
  if (input.watershedMismatch) {
    add(flags, "watershed_mismatch", "warn", "Confirmed location belongs to a different watershed than the selected watershed.")
  }

  if (input.assetType && streamBasedTypes.has(input.assetType)) {
    if (input.nearestStreamDistanceMeters === null || input.nearestStreamDistanceMeters === undefined) {
      add(flags, "stream_data_missing", "warn", "No mapped stream is available near this stream-based asset.")
    } else if (input.nearestStreamDistanceMeters > thresholds.maxStreamDistanceMeters) {
      add(flags, "far_from_stream", "warn", `Asset is ${Math.round(input.nearestStreamDistanceMeters)} m from the nearest mapped stream.`)
    }
  }
  if (input.ambiguousAssetMatch) {
    add(flags, "ambiguous_asset_match", "warn", "Multiple nearby assets match this observation location and type.")
  }
  if (input.assetTypeHistoryConflict) {
    add(flags, "asset_type_history_conflict", "critical", "This asset has previously been reported with a different type.")
  }
  if (input.impossibleTravel && input.impossibleTravel.durationMinutes > 0) {
    const speedKmh = input.impossibleTravel.distanceMeters / 1000 /
      (input.impossibleTravel.durationMinutes / 60)
    if (speedKmh > thresholds.impossibleTravelSpeedKmh) {
      add(flags, "impossible_travel", "critical", `Submission implies travel at ${Math.round(speedKmh)} km/h.`, {
        distanceMeters: input.impossibleTravel.distanceMeters,
        durationMinutes: input.impossibleTravel.durationMinutes,
        speedKmh,
      })
    }
  }

  if (input.assetSelection?.kind === "new") {
    add(flags, "new_asset_selected", "info", "Officer selected a new asset after reviewing nearby matches.")
  } else if (input.assetSelection?.kind === "existing") {
    add(flags, "existing_asset_selected", "info", `Officer linked this observation to ${input.assetSelection.id} (${input.assetSelection.type}), ${Math.round(input.assetSelection.distanceMeters)} m away.`)
  }
  return flags
}

export function serverVerificationStatus(flags: TrustFlag[]): "Flagged" | "Pending review" {
  return flags.some((flag) => flag.severity === "critical") ? "Flagged" : "Pending review"
}
