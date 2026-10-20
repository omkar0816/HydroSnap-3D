export type EvidenceFlag = {
  code: string
  severity: "info" | "warn" | "critical"
  message: string
  evidence?: Record<string, unknown>
}

export type SatelliteMeasurementRow = {
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

export type AnalysisJobStatusRow = {
  id: string
  watershedId: string
  assetId: string | null
  status: "queued" | "running" | "done" | "failed"
  attempts: number
  error: string | null
  createdAt: string
  finishedAt: string | null
  params: Record<string, unknown>
}

export type WatershedEvidence = {
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
    village?: string
    description?: string
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
    name: string
    type: string
    village: string
    status: string
    installedAt: string | null
    progress: number | null
    recordedAt: string
    source: string
    sourceLicence: string | null
    demo: boolean
  }>
  satellite: SatelliteMeasurementRow[]
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
