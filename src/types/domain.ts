import type {
  Feature,
  MultiPolygonGeometry,
  PolygonGeometry,
} from "@/types/geojson"
import type { Geometry, FeatureCollection } from "@/types/geojson"

export type UUID = string
export type WGS84Position = [longitude: number, latitude: number]

export interface GeoLocation {
  type: "Point"
  coordinates: WGS84Position
  accuracyMeters?: number
  source: "exif" | "device" | "manual" | "demo"
  capturedAt?: string
}

export interface User {
  id: UUID
  name: string
  email: string
  role: "Field Officer" | "GIS Analyst" | "Administrator"
  initials: string
}

export interface TeamMember extends User {
  area: string
  status: "Active" | "Inactive"
}

export interface Watershed {
  id: UUID
  name: string
  code: string
  district: string
  state: string
  areaSqKm: number
  villages: number
  status: "Active" | "Monitoring" | "Completed"
  boundary: Feature<PolygonGeometry | MultiPolygonGeometry>
  /** Hierarchy level. Real data (SLUSI / CWC / HydroBASINS) maps onto these. */
  level: WatershedLevel
  parentId?: UUID
  /** Dataset the boundary came from, e.g. "demo", "HydroBASINS", "SLUSI". */
  source: string
  /** True when the boundary is illustrative and not an official record. */
  demo: boolean
}

export type WatershedLevel = "basin" | "watershed" | "micro-watershed"

export interface ThematicLayer {
  id: string
  name: string
  group: "Reference" | "Hydrology" | "Satellite index"
  detail: string
  dateLabel: string
  description: string
  visibleByDefault: boolean
  demo: boolean
  geometry?: Feature<Geometry> | FeatureCollection<Geometry>
}

export interface Asset {
  id: UUID
  name: string
  type: "Check dam" | "Farm pond" | "Plantation" | "Percolation tank"
  watershedId: UUID
  location: GeoLocation
  status: "Verified" | "Pending review" | "Flagged"
  lastInspected: string
  village: string
  description: string
  imageUrl?: string
}

export interface FieldObservation {
  id: UUID
  assetId?: UUID
  watershedId: UUID
  assetType: Asset["type"]
  imageName: string
  imageDataUrl?: string
  location: GeoLocation
  village: string
  description: string
  inspectionDate: string
  officerId: UUID
  officerName: string
  verificationStatus: "Verified" | "Pending review" | "Flagged"
  createdAt: string
  auditHistory: {
    action: string
    actor: string
    timestamp: string
  }[]
  /** Client-generated key so a retried sync never creates duplicates. */
  idempotencyKey?: string
  /** SHA-256 of the original image bytes (hex). */
  imageSha256?: string
  exif?: ExifSummary
  /** How the watershed was assigned: point-in-polygon or officer choice. */
  watershedResolution?: "inside" | "outside" | "manual"
  /** Nearest point on a mapped stream (stream-based assets only). */
  snappedLocation?: GeoLocation
  snapDistanceMeters?: number
  trust?: TrustAssessment
}

export interface ExifSummary {
  hasGps: boolean
  takenAt?: string
  make?: string
  model?: string
}

export type TrustStatus = "Consistent" | "Needs review" | "Flagged"

export interface TrustReason {
  code: string
  severity: "info" | "warning" | "critical"
  message: string
}

export interface TrustAssessment {
  status: TrustStatus
  reasons: TrustReason[]
  checkedAt: string
  /** "client-preview" = rule checks in the browser; server checks are planned. */
  engine: "client-preview" | "server"
}

export type SyncStatus = "pending" | "syncing" | "synced" | "failed"

/** Local IndexedDB record wrapping an observation with its sync state. */
export interface QueuedObservation {
  id: UUID
  observation: FieldObservation
  syncStatus: SyncStatus
  attempts: number
  lastError?: string
  nextAttemptAt?: string
  syncedAt?: string
  /** True when the "sync" only went to the in-browser demo API. */
  demoSync?: boolean
}

export interface AnalysisJob {
  id: UUID
  watershedId: UUID
  type: "NDVI" | "NDWI" | "Change detection" | "Land cover"
  status: "Queued" | "Processing" | "Completed" | "Failed"
  createdAt: string
  progress: number
  demo: boolean
}

export interface AnalysisResult {
  id: UUID
  jobId: UUID
  metric: "NDVI" | "NDWI"
  date: string
  value: number
  watershedId: UUID
  demo: boolean
}

export interface Intervention {
  id: UUID
  name: string
  type: string
  watershedId: UUID
  village: string
  status: "Planned" | "In progress" | "Completed"
  progress: number
  budget: number
  dueDate: string
}

export interface Report {
  id: UUID
  name: string
  type: "Watershed summary" | "Field inspection" | "Asset registry" | "Analytics"
  watershedId: UUID
  createdAt: string
  status: "Ready" | "Generating"
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number
  page: number
  pageSize: number
}
