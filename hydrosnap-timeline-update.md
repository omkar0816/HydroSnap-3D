# HydroSnap 3D — Map Timeline Update

Adds a 6-monthly interventions timeline to the Map analysis page.

## How to apply

1. Create the **NEW** files at the paths shown.
2. **Replace** the three existing files with the full contents below.
3. Run `pnpm check` (typecheck + tests + build), then commit and push; Vercel redeploys.

No changes needed to `main.tsx`, `App.tsx`, services or `package.json`.

Files:

- `src/utils/timeline.ts` — NEW
- `src/components/maps/MapTimeline.tsx` — NEW
- `src/styles/map-timeline.css` — NEW
- `src/tests/timeline.test.ts` — NEW
- `src/types/domain.ts` — REPLACE (full file; only change: `installedAt?: string` added to `Asset`)
- `src/components/maps/WatershedMap.tsx` — REPLACE (full file; adds `highlightAssetIds` prop + `asset-new-halo` layer)
- `src/pages/MapAnalysisPage.tsx` — REPLACE (full file; adds timeline state, filtering and `<MapTimeline />`)


---

## `src/utils/timeline.ts`

**NEW**

```ts
import type { Asset } from "@/types/domain"

/**
 * Half-yearly (6-month) timeline for the map.
 *
 * A step is a snapshot: "what had been built / put in place on the ground by
 * the end of this half-year". Dates are plain ISO strings (YYYY-MM-DD) and are
 * compared as strings, so no timezone maths is involved.
 */

export const TIMELINE_START_YEAR = 2023

export interface TimelineStep {
  id: string
  /** e.g. "H1 2024" or "Now" */
  label: string
  /** e.g. "H1 ’24" - used under the slider */
  shortLabel: string
  /** e.g. "Jan – Jun 2024" */
  range: string
  /** Snapshot date: assets installed on or before this date are visible. */
  date: string
  /** Exclusive lower bound of this period (end of the previous step). */
  from: string
  isNow: boolean
}

export interface TimelineSummary {
  step: TimelineStep
  /** Everything in place at the snapshot date. */
  cumulative: Asset[]
  /** Only what was added during this 6-month period. */
  added: Asset[]
  verified: number
  byType: Record<string, number>
}

/**
 * DEMO install dates for the seeded demo assets. Real records should carry
 * `Asset.installedAt` (from the backend); this table is only the demo fallback.
 */
export const demoInstallDates: Record<string, string> = {
  "ast-001": "2023-03-14",
  "ast-005": "2023-10-20",
  "ast-002": "2024-02-09",
  "ast-004": "2024-09-18",
  "ast-006": "2025-03-05",
  "ast-003": "2025-08-22",
  "ast-007": "2025-12-11",
  "ast-008": "2026-03-27",
  "ast-009": "2026-08-14",
}

/** Date an asset appeared on the ground. Never returns an empty string. */
export function installDate(asset: Asset): string {
  return (
    asset.installedAt ??
    demoInstallDates[asset.id] ??
    // Field uploads: the first evidence is the inspection itself.
    asset.lastInspected
  ).slice(0, 10)
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** Builds 6-monthly steps from `startYear` up to today, ending with "Now". */
export function buildTimelineSteps(
  now: Date = new Date(),
  startYear: number = TIMELINE_START_YEAR,
): TimelineStep[] {
  const today = isoDate(now)
  const steps: TimelineStep[] = []
  let from = `${startYear - 1}-12-31`
  outer: for (let year = startYear; year <= now.getFullYear(); year++) {
    for (const half of [1, 2] as const) {
      const date = half === 1 ? `${year}-06-30` : `${year}-12-31`
      if (date >= today) break outer
      steps.push({
        id: `${year}-H${half}`,
        label: `H${half} ${year}`,
        shortLabel: `H${half} ’${String(year).slice(2)}`,
        range: half === 1 ? `Jan – Jun ${year}` : `Jul – Dec ${year}`,
        date,
        from,
        isNow: false,
      })
      from = date
    }
  }
  const fromMonth = Number(from.slice(5, 7)) // 6 or 12 (1-based)
  const sinceMonthIndex = fromMonth % 12 // 0-based month after `from`
  const sinceYear = Number(from.slice(0, 4)) + (fromMonth === 12 ? 1 : 0)
  steps.push({
    id: "now",
    label: "Now",
    shortLabel: "Now",
    range: `${MONTHS[sinceMonthIndex]} ${sinceYear} – today`,
    date: today,
    from,
    isNow: true,
  })
  return steps
}

/** Assets that were already in place on `date` (inclusive). */
export function assetsAsOf(assets: Asset[], date: string): Asset[] {
  return assets.filter((asset) => installDate(asset) <= date)
}

/** Assets added after `from` (exclusive) up to `to` (inclusive). */
export function assetsAddedBetween(
  assets: Asset[],
  from: string,
  to: string,
): Asset[] {
  return assets.filter((asset) => {
    const installed = installDate(asset)
    return installed > from && installed <= to
  })
}

export function summarizeStep(
  assets: Asset[],
  step: TimelineStep,
): TimelineSummary {
  const cumulative = assetsAsOf(assets, step.date)
  const added = assetsAddedBetween(assets, step.from, step.date)
  const byType: Record<string, number> = {}
  for (const asset of cumulative) {
    byType[asset.type] = (byType[asset.type] ?? 0) + 1
  }
  return {
    step,
    cumulative,
    added,
    verified: cumulative.filter((asset) => asset.status === "Verified").length,
    byType,
  }
}
```


---

## `src/components/maps/MapTimeline.tsx`

**NEW**

```tsx
import { useEffect, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  History,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react"
import type { Asset } from "@/types/domain"
import type { TimelineStep, TimelineSummary } from "@/utils/timeline"
import "@/styles/map-timeline.css"

interface MapTimelineProps {
  steps: TimelineStep[]
  index: number
  onIndexChange: (index: number) => void
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  newOnly: boolean
  onNewOnlyChange: (value: boolean) => void
  summary: TimelineSummary
  onFocusAsset: (asset: Asset) => void
}

const PLAY_INTERVAL_MS = 1600

export function MapTimeline({
  steps,
  index,
  onIndexChange,
  enabled,
  onEnabledChange,
  newOnly,
  onNewOnlyChange,
  summary,
  onFocusAsset,
}: MapTimelineProps) {
  const [open, setOpen] = useState(true)
  const [playing, setPlaying] = useState(false)
  const last = steps.length - 1

  // Auto-advance while playing; stop at the final step.
  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(
      () => onIndexChange(index + 1),
      PLAY_INTERVAL_MS,
    )
    return () => window.clearTimeout(timer)
  }, [playing, index, last, onIndexChange])

  // Turning the timeline off also stops playback.
  useEffect(() => {
    if (!enabled) setPlaying(false)
  }, [enabled])

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (index >= last) onIndexChange(0)
    setPlaying(true)
  }

  function go(next: number) {
    setPlaying(false)
    onIndexChange(Math.min(last, Math.max(0, next)))
  }

  if (!open) {
    return (
      <div className="hs-timeline hs-timeline-collapsed">
        <button type="button" onClick={() => setOpen(true)}>
          <History size={15} />
          Timeline
          {enabled && <strong>{summary.step.label}</strong>}
          <ChevronUp size={14} />
        </button>
      </div>
    )
  }

  const { step } = summary
  return (
    <div className="hs-timeline" role="group" aria-label="Map timeline">
      <div className="hs-timeline-head">
        <span className="hs-timeline-title">
          <History size={15} /> Interventions timeline
          <small>every 6 months</small>
        </span>
        <label className="hs-timeline-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span>Time filter</span>
        </label>
        <button
          type="button"
          className="hs-timeline-icon"
          onClick={() => setOpen(false)}
          aria-label="Collapse timeline"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className={`hs-timeline-body ${enabled ? "" : "is-off"}`}>
        <div className="hs-timeline-controls">
          <button
            type="button"
            className="hs-timeline-icon"
            onClick={() => go(index - 1)}
            disabled={!enabled || index === 0}
            aria-label="Previous period"
          >
            <SkipBack size={15} />
          </button>
          <button
            type="button"
            className="hs-timeline-play"
            onClick={togglePlay}
            disabled={!enabled}
            aria-label={playing ? "Pause playback" : "Play timeline"}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            className="hs-timeline-icon"
            onClick={() => go(index + 1)}
            disabled={!enabled || index === last}
            aria-label="Next period"
          >
            <SkipForward size={15} />
          </button>
          <div className="hs-timeline-track">
            <input
              type="range"
              min={0}
              max={last}
              step={1}
              value={index}
              disabled={!enabled}
              onChange={(event) => go(Number(event.target.value))}
              aria-label="Timeline period"
              aria-valuetext={`${step.label}, ${step.range}`}
            />
            <div className="hs-timeline-ticks">
              {steps.map((item, itemIndex) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={!enabled}
                  className={itemIndex === index ? "active" : ""}
                  onClick={() => go(itemIndex)}
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hs-timeline-summary">
          <div className="hs-timeline-period">
            <strong>{step.label}</strong>
            <small>{step.range}</small>
          </div>
          <div className="hs-timeline-stat">
            <b>{summary.cumulative.length}</b>
            <span>in place</span>
          </div>
          <div className="hs-timeline-stat added">
            <b>+{summary.added.length}</b>
            <span>this period</span>
          </div>
          <div className="hs-timeline-stat">
            <b>{summary.verified}</b>
            <span>verified now</span>
          </div>
          <label className="hs-timeline-switch compact">
            <input
              type="checkbox"
              checked={newOnly}
              disabled={!enabled}
              onChange={(event) => onNewOnlyChange(event.target.checked)}
            />
            <span>Only new</span>
          </label>
        </div>

        {summary.added.length > 0 ? (
          <div className="hs-timeline-added" aria-label="Added this period">
            {summary.added.map((asset) => (
              <button
                type="button"
                key={asset.id}
                onClick={() => onFocusAsset(asset)}
                disabled={!enabled}
              >
                {asset.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="hs-timeline-empty">
            Nothing new was added in this period.
          </div>
        )}
        <div className="hs-timeline-note">
          Install dates are demo data. Verification status shown is the current
          status, not historical.
        </div>
      </div>
    </div>
  )
}
```


---

## `src/styles/map-timeline.css`

**NEW**

```css
/* Half-yearly interventions timeline (overlay on the map). */
.hs-timeline {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  z-index: 5;
  width: min(780px, calc(100% - 24px));
  background: #fff;
  border: 1px solid #e4eaf0;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 10px 30px rgba(18, 59, 99, 0.16);
  font-size: 12px;
  color: #173653;
}
.hs-timeline-collapsed {
  width: auto;
  padding: 0;
  border-radius: 999px;
}
.hs-timeline-collapsed button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 0;
  background: transparent;
  color: #155a41;
  font-weight: 600;
  cursor: pointer;
}
.hs-timeline-collapsed strong {
  padding: 1px 8px;
  border-radius: 999px;
  background: #e7f3ec;
}
.hs-timeline-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.hs-timeline-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-weight: 700;
  color: #155a41;
}
.hs-timeline-title small {
  font-weight: 500;
  color: #6b7c8f;
}
.hs-timeline-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
}
.hs-timeline-switch.compact {
  margin-left: auto;
  font-weight: 500;
  color: #4a5d70;
}
.hs-timeline-icon,
.hs-timeline-play {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #dde5ec;
  background: #fff;
  color: #173653;
  cursor: pointer;
}
.hs-timeline-play {
  background: #2d8b65;
  border-color: #2d8b65;
  color: #fff;
}
.hs-timeline button:disabled,
.hs-timeline input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.hs-timeline-body.is-off .hs-timeline-summary,
.hs-timeline-body.is-off .hs-timeline-added,
.hs-timeline-body.is-off .hs-timeline-empty {
  opacity: 0.5;
}
.hs-timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hs-timeline-track {
  flex: 1;
  min-width: 0;
}
.hs-timeline-track input[type="range"] {
  width: 100%;
  accent-color: #2d8b65;
  margin: 0;
}
.hs-timeline-ticks {
  display: flex;
  justify-content: space-between;
  gap: 2px;
}
.hs-timeline-ticks button {
  flex: 1;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #6b7c8f;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
}
.hs-timeline-ticks button.active {
  color: #155a41;
  font-weight: 700;
}
.hs-timeline-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.hs-timeline-period {
  display: grid;
}
.hs-timeline-period strong {
  font-size: 14px;
}
.hs-timeline-period small {
  color: #6b7c8f;
}
.hs-timeline-stat {
  display: grid;
  line-height: 1.2;
}
.hs-timeline-stat b {
  font-size: 15px;
}
.hs-timeline-stat span {
  color: #6b7c8f;
  font-size: 10px;
}
.hs-timeline-stat.added b {
  color: #d9822b;
}
.hs-timeline-added {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.hs-timeline-added button {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid #f0c48a;
  background: #fff7e8;
  color: #94600c;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.hs-timeline-empty {
  margin-top: 8px;
  color: #6b7c8f;
}
.hs-timeline-note {
  margin-top: 6px;
  font-size: 10px;
  color: #8896a6;
}

/* Lift existing bottom overlays so the timeline never covers them. */
.map-map-holder.has-timeline .hs-legend,
.map-map-holder.has-timeline .hs-watershed-panel {
  bottom: 190px;
}

@media (max-width: 640px) {
  .hs-timeline-summary {
    gap: 10px;
  }
  .hs-timeline-ticks button {
    font-size: 9px;
  }
}
```


---

## `src/tests/timeline.test.ts`

**NEW**

```ts
import { describe, expect, it } from "vitest"
import { assets } from "@/services/mock/mockData"
import {
  assetsAddedBetween,
  assetsAsOf,
  buildTimelineSteps,
  installDate,
  summarizeStep,
} from "@/utils/timeline"

const now = new Date(2026, 9, 4) // 4 Oct 2026

describe("timeline steps", () => {
  it("builds 6-monthly steps from 2023 and ends with Now", () => {
    const steps = buildTimelineSteps(now)
    expect(steps.map((step) => step.label)).toEqual([
      "H1 2023",
      "H2 2023",
      "H1 2024",
      "H2 2024",
      "H1 2025",
      "H2 2025",
      "H1 2026",
      "Now",
    ])
    expect(steps.at(-1)?.date).toBe("2026-10-04")
    expect(steps.at(-1)?.isNow).toBe(true)
    expect(steps.at(-1)?.range).toBe("Jul 2026 – today")
  })

  it("chains each step from the end of the previous one", () => {
    const steps = buildTimelineSteps(now)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].from).toBe(steps[i - 1].date)
    }
  })
})

describe("asset filtering", () => {
  it("shows only assets installed by the snapshot date", () => {
    expect(assetsAsOf(assets, "2023-06-30").map((a) => a.id)).toEqual([
      "ast-001",
    ])
    expect(assetsAsOf(assets, "2026-10-04")).toHaveLength(assets.length)
  })

  it("lists assets added within one period", () => {
    const added = assetsAddedBetween(assets, "2023-06-30", "2023-12-31")
    expect(added.map((a) => a.id)).toEqual(["ast-005"])
  })

  it("falls back to lastInspected for assets without an install date", () => {
    const upload = { ...assets[0], id: "obs-1", lastInspected: "2026-09-30" }
    expect(installDate(upload)).toBe("2026-09-30")
    expect(installDate({ ...upload, installedAt: "2025-01-02" })).toBe(
      "2025-01-02",
    )
  })

  it("summarises cumulative and added counts", () => {
    const steps = buildTimelineSteps(now)
    const summary = summarizeStep(assets, steps[1]) // H2 2023
    expect(summary.cumulative).toHaveLength(2)
    expect(summary.added).toHaveLength(1)
  })
})
```


---

## `src/types/domain.ts`

**REPLACE (full file; only change: `installedAt?: string` added to `Asset`)**

```ts
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
  source: "exif" | "device" | "manual" | "demo" | "snapped"
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
  /** ISO date the structure was put in place; drives the map timeline. */
  installedAt?: string
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
  /** EXIF camera wall time; no timezone is assumed when one is not present. */
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



================================================
```


---

## `src/components/maps/WatershedMap.tsx`

**REPLACE (full file; adds `highlightAssetIds` prop + `asset-new-halo` layer)**

```tsx
import { useEffect, useMemo, useRef, useState } from "react"
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl"
import { Protocol } from "pmtiles"
import { useNavigate } from "react-router-dom"
import { env } from "@/config/env"
import {
  boundsCenter,
  distanceMeters,
  geometryBounds,
  type Bounds,
} from "@/utils/geo"
import type { Asset, Watershed, WGS84Position } from "@/types/domain"
import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
  MultiPolygonGeometry,
  PointGeometry,
  PolygonGeometry,
} from "@/types/geojson"

export type Basemap = "standard" | "satellite" | "terrain"

export interface ChoroplethConfig {
  /** Metric value per watershed id. */
  values: Record<string, number>
  max: number
  label: string
}

interface WatershedMapProps {
  assets: Asset[]
  /** Active watershed (the map fits to it). */
  watershed?: Watershed
  /** All watersheds to draw; defaults to the active one. */
  watersheds?: Watershed[]
  basemap: Basemap
  visibleLayers: {
    boundary: boolean
    streams: boolean
    assets: boolean
    ndvi: boolean
    ndwi: boolean
  }
  measure: boolean
  selectedAssetId?: string
  focusPosition?: WGS84Position
  focusBounds?: Bounds
  streams?: FeatureCollection<LineStringGeometry>
  ndviOverlay?: Feature<PolygonGeometry | MultiPolygonGeometry>
  ndwiOverlay?: Feature<PolygonGeometry | MultiPolygonGeometry>
  choropleth?: ChoroplethConfig
  /** Assets to ring with a halo (e.g. added in the current timeline period). */
  highlightAssetIds?: string[]
  onSelectAsset: (asset: Asset) => void
  onSelectWatershed?: (id: string, properties: Record<string, unknown>) => void
  onMapClick?: (position: WGS84Position) => void
  onCenterChange?: (position: WGS84Position) => void
  className?: string
}

// Register the pmtiles:// protocol once for the whole app.
let pmtilesRegistered = false
function ensurePmtilesProtocol() {
  if (pmtilesRegistered) return
  const protocol = new Protocol()
  maplibregl.addProtocol("pmtiles", protocol.tile)
  pmtilesRegistered = true
}

const basemapLayers: Record<Basemap, string> = {
  standard: "basemap-standard",
  satellite: "basemap-satellite",
  terrain: "basemap-terrain",
}

const officialWatershedLayers = [
  { layer: "basins", min: 0, max: 8, color: "#1f5f8b" },
  { layer: "watersheds", min: 8, max: 11, color: "#2d8b65" },
  { layer: "micro_watersheds", min: 11, max: 24, color: "#6a8f2d" },
] as const

export function mapFeatureId(feature: {
  id?: string | number
  properties?: Record<string, unknown>
}): string | number | undefined {
  const id = feature.properties?.id ?? feature.id
  return typeof id === "string" || typeof id === "number" ? id : undefined
}

/**
 * All three basemaps live in one style as raster layers; switching basemap
 * only toggles visibility, so the camera and overlays are preserved.
 */
function baseStyle(initial: Basemap): maplibregl.StyleSpecification {
  const raster = (tiles: string, attribution: string, maxzoom: number) => ({
    type: "raster" as const,
    tiles: [tiles],
    tileSize: 256,
    attribution,
    maxzoom,
  })
  return {
    version: 8,
    sources: {
      "src-standard": raster(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "© OpenStreetMap contributors",
        19,
      ),
      "src-satellite": raster(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "Tiles © Esri",
        19,
      ),
      "src-terrain": raster(
        "https://tile.opentopomap.org/{z}/{x}/{y}.png",
        "© OpenStreetMap contributors, SRTM | OpenTopoMap (CC-BY-SA)",
        17,
      ),
    },
    layers: (Object.keys(basemapLayers) as Basemap[]).map((key) => ({
      id: basemapLayers[key],
      type: "raster" as const,
      source: `src-${key}`,
      layout: { visibility: key === initial ? "visible" : "none" },
    })),
  }
}

function assetCollection(assets: Asset[]): FeatureCollection<PointGeometry> {
  return {
    type: "FeatureCollection",
    features: assets.map((asset) => ({
      type: "Feature",
      properties: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        status: asset.status,
      },
      geometry: { type: "Point", coordinates: asset.location.coordinates },
    })),
  }
}

function watershedCollection(
  watersheds: Watershed[],
  choropleth?: ChoroplethConfig,
): FeatureCollection<PolygonGeometry | MultiPolygonGeometry> {
  return {
    type: "FeatureCollection",
    features: watersheds.map((watershed) => ({
      type: "Feature",
      properties: {
        id: watershed.id,
        name: watershed.name,
        code: watershed.code,
        level: watershed.level,
        metric: choropleth?.values[watershed.id] ?? 0,
      },
      geometry: watershed.boundary.geometry,
    })),
  }
}

const choroplethRamp = ["#e7f3ec", "#a9d8bd", "#5fb487", "#2d8b65", "#155a41"]

function fillColorExpression(
  choropleth?: ChoroplethConfig,
): maplibregl.ExpressionSpecification | string {
  if (!choropleth) return "#2d8b65"
  const max = Math.max(choropleth.max, 1)
  return [
    "interpolate",
    ["linear"],
    ["get", "metric"],
    0,
    choroplethRamp[0],
    max * 0.25,
    choroplethRamp[1],
    max * 0.5,
    choroplethRamp[2],
    max * 0.75,
    choroplethRamp[3],
    max,
    choroplethRamp[4],
  ]
}

export function WatershedMap({
  assets,
  watershed,
  watersheds,
  basemap,
  visibleLayers,
  measure,
  selectedAssetId,
  focusPosition,
  focusBounds,
  streams,
  ndviOverlay,
  ndwiOverlay,
  choropleth,
  highlightAssetIds,
  onSelectAsset,
  onSelectWatershed,
  onMapClick,
  onCenterChange,
  className,
}: WatershedMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const labelMarkers = useRef<maplibregl.Marker[]>([])
  const officialActiveId = useRef<string | undefined>(undefined)
  const callbacks = useRef({
    onSelectAsset,
    onSelectWatershed,
    onMapClick,
    onCenterChange,
  })
  const measureRef = useRef(measure)
  const assetsRef = useRef(assets)
  const initialBasemap = useRef(basemap)
  const [measurePoints, setMeasurePoints] = useState<WGS84Position[]>([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [threeDimensional, setThreeDimensional] = useState(false)
  const navigate = useNavigate()
  const assetData = useMemo(() => assetCollection(assets), [assets])
  const drawnWatersheds = useMemo(
    () => watersheds ?? (watershed ? [watershed] : []),
    [watershed, watersheds],
  )
  const watershedData = useMemo(
    () => watershedCollection(drawnWatersheds, choropleth),
    [choropleth, drawnWatersheds],
  )
  const initialCenter = useRef<WGS84Position>(
    watershed
      ? boundsCenter(geometryBounds(watershed.boundary.geometry))
      : [73.8567, 18.5204],
  )

  useEffect(() => {
    callbacks.current = {
      onSelectAsset,
      onSelectWatershed,
      onMapClick,
      onCenterChange,
    }
  }, [onCenterChange, onMapClick, onSelectAsset, onSelectWatershed])
  useEffect(() => {
    measureRef.current = measure
  }, [measure])
  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  // Create the map exactly once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (env.watershedPmtilesUrl) ensurePmtilesProtocol()
    const map = new maplibregl.Map({
      container,
      style: baseStyle(initialBasemap.current),
      center: initialCenter.current,
      zoom: 12.4,
    })
    mapRef.current = map
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      "top-right",
    )
    map.addControl(new maplibregl.FullscreenControl(), "top-right")
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    )
    map.on("load", () => {
      addOfficialWatershedTiles(map)
      map.addSource("watersheds", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      })
      map.addLayer({
        id: "watershed-fill",
        type: "fill",
        source: "watersheds",
        paint: {
          "fill-color": "#2d8b65",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            0.38,
            ["boolean", ["feature-state", "active"], false],
            0.22,
            0.12,
          ],
        },
      })
      map.addLayer({
        id: "watershed-line",
        type: "line",
        source: "watersheds",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "active"], false],
            "#155a41",
            "#43a477",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "active"], false],
            3,
            1.6,
          ],
          "line-dasharray": [2, 1.5],
        },
      })
      map.addSource("field-assets", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      // Halo for assets highlighted by the timeline (filter set by an effect).
      map.addLayer({
        id: "asset-new-halo",
        type: "circle",
        source: "field-assets",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": 14,
          "circle-color": "#f5a623",
          "circle-opacity": 0.28,
          "circle-stroke-color": "#d9822b",
          "circle-stroke-width": 2,
        },
      })
      map.addLayer({
        id: "asset-points",
        type: "circle",
        source: "field-assets",
        paint: {
          "circle-radius": 6.5,
          "circle-color": [
            "match",
            ["get", "type"],
            "Check dam",
            "#1686c3",
            "Farm pond",
            "#21a4c4",
            "Plantation",
            "#339768",
            "Percolation tank",
            "#e79b40",
            "#567b9f",
          ],
          "circle-stroke-color": [
            "match",
            ["get", "status"],
            "Flagged",
            "#d64545",
            "Pending review",
            "#e8a33a",
            "#ffffff",
          ],
          "circle-stroke-width": 2,
        },
      })
      map.addSource("measurement", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "measurement-line",
        type: "line",
        source: "measurement",
        paint: {
          "line-color": "#ec9e3d",
          "line-width": 3,
          "line-dasharray": [1.5, 1.5],
        },
      })
      map.addLayer({
        id: "measurement-points",
        type: "circle",
        source: "measurement",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ec9e3d",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      })

      let hoveredFeature: {
        source: string
        sourceLayer?: string
        id: string | number
      } | undefined
      const interactiveWatershedLayers = [
        "watershed-fill",
        ...(env.watershedPmtilesUrl
          ? officialWatershedLayers.map(({ layer }) => `official-${layer}-fill`)
          : []),
      ]
      for (const layerId of interactiveWatershedLayers) {
        map.on("mousemove", layerId, (event) => {
          const feature = event.features?.[0]
          if (!feature) return
          const id = mapFeatureId(feature)
          if (id === undefined) return
          const target = {
            source: feature.source,
            ...(feature.sourceLayer
              ? { sourceLayer: feature.sourceLayer }
              : {}),
            id,
          }
          if (
            target.source === hoveredFeature?.source &&
            target.sourceLayer === hoveredFeature?.sourceLayer &&
            target.id === hoveredFeature?.id
          ) {
            return
          }
          if (hoveredFeature) {
            map.setFeatureState(hoveredFeature, { hover: false })
          }
          hoveredFeature = target
          map.setFeatureState(target, { hover: true })
          if (!measureRef.current) map.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", layerId, () => {
          if (hoveredFeature) {
            map.setFeatureState(hoveredFeature, { hover: false })
            hoveredFeature = undefined
          }
          map.getCanvas().style.cursor = measureRef.current ? "crosshair" : ""
        })
      }
      map.on("click", "asset-points", (event) => {
        const id = event.features?.[0]?.properties?.id
        const asset = assetsRef.current.find((item) => item.id === id)
        if (asset) callbacks.current.onSelectAsset(asset)
      })
      map.on("mouseenter", "asset-points", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "asset-points", () => {
        map.getCanvas().style.cursor = measureRef.current ? "crosshair" : ""
      })
      map.on("click", (event) => {
        const position: WGS84Position = [event.lngLat.lng, event.lngLat.lat]
        if (measureRef.current) {
          setMeasurePoints((previous) =>
            previous.length === 2 ? [position] : [...previous, position],
          )
          return
        }
        const hits = map.queryRenderedFeatures(event.point)
        if (hits.some((hit) => hit.layer.id === "asset-points")) return
        const watershedHit = hits.find(
          (hit) =>
            hit.layer.id === "watershed-fill" ||
            hit.layer.id.startsWith("official-"),
        )
        if (watershedHit && callbacks.current.onSelectWatershed) {
          callbacks.current.onSelectWatershed(
            String(
              watershedHit.properties.code ??
                watershedHit.properties.id ??
                watershedHit.id ??
                "",
            ),
            watershedHit.properties,
          )
        }
        callbacks.current.onMapClick?.(position)
      })
      map.on("moveend", () => {
        const center = map.getCenter()
        callbacks.current.onCenterChange?.([center.lng, center.lat])
      })
      setMapLoaded(true)
    })
    return () => {
      labelMarkers.current.forEach((marker) => marker.remove())
      labelMarkers.current = []
      map.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  }, [])

  // Basemap switch: toggle raster layer visibility only.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    ;(Object.keys(basemapLayers) as Basemap[]).forEach((key) => {
      map.setLayoutProperty(
        basemapLayers[key],
        "visibility",
        key === basemap ? "visible" : "none",
      )
    })
  }, [basemap, mapLoaded])

  // Watershed polygons + choropleth colours.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    ;(map.getSource("watersheds") as maplibregl.GeoJSONSource).setData(
      watershedData,
    )
    map.setPaintProperty(
      "watershed-fill",
      "fill-color",
      fillColorExpression(choropleth),
    )
    drawnWatersheds.forEach((item) =>
      map.setFeatureState({ source: "watersheds", id: item.id }, {
        active: item.id === watershed?.id,
      }),
    )
    const activeId = watershed ? watershed.code || watershed.id : undefined
    if (officialActiveId.current) {
      for (const { layer } of officialWatershedLayers) {
        map.setFeatureState(
          {
            source: "official-watersheds",
            sourceLayer: layer,
            id: officialActiveId.current,
          },
          { active: false },
        )
      }
    }
    if (activeId) {
      for (const { layer } of officialWatershedLayers) {
        map.setFeatureState(
          {
            source: "official-watersheds",
            sourceLayer: layer,
            id: activeId,
          },
          { active: true },
        )
      }
    }
    officialActiveId.current = activeId
  }, [choropleth, drawnWatersheds, mapLoaded, watershed?.id, watershedData])

  // Fit to the active watershed when it changes (no map rebuild).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !watershed) return
    map.fitBounds(geometryBounds(watershed.boundary.geometry), {
      padding: 48,
      duration: 700,
      maxZoom: 14,
    })
  }, [mapLoaded, watershed?.id])

  useEffect(() => {
    if (!focusPosition) return
    mapRef.current?.flyTo({ center: focusPosition, zoom: 15, duration: 900 })
  }, [focusPosition])

  useEffect(() => {
    if (!focusBounds) return
    mapRef.current?.fitBounds(focusBounds, { padding: 48, duration: 800 })
  }, [focusBounds])

  // Thematic overlays.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    applyThematicLayers(map, streams, ndviOverlay, ndwiOverlay)
  }, [mapLoaded, ndviOverlay, ndwiOverlay, streams])

  // Asset point features only change when the underlying data changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    ;(map.getSource("field-assets") as maplibregl.GeoJSONSource).setData(
      assetData,
    )
  }, [assetData, mapLoaded])

  // Labels are independent from selection, thematic layers, and map center.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    labelMarkers.current.forEach((marker) => marker.remove())
    labelMarkers.current = []
    if (visibleLayers.assets) {
      for (const asset of assets) {
        const element = document.createElement("div")
        element.className = "hs-asset-label"
        element.textContent = asset.name
        labelMarkers.current.push(
          new maplibregl.Marker({ element, anchor: "top", offset: [0, 9] })
            .setLngLat(asset.location.coordinates)
            .addTo(map),
        )
      }
    }
    if (visibleLayers.boundary) {
      for (const item of drawnWatersheds) {
        const element = document.createElement("div")
        element.className = "hs-watershed-label"
        element.textContent = item.name
        labelMarkers.current.push(
          new maplibregl.Marker({ element })
            .setLngLat(boundsCenter(geometryBounds(item.boundary.geometry)))
            .addTo(map),
        )
      }
    }
    return () => {
      labelMarkers.current.forEach((marker) => marker.remove())
      labelMarkers.current = []
    }
  }, [
    assets,
    drawnWatersheds,
    mapLoaded,
    visibleLayers.assets,
    visibleLayers.boundary,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const visibility = [
      ["watershed-fill", visibleLayers.boundary],
      ["watershed-line", visibleLayers.boundary],
      ["streams-line", visibleLayers.streams],
      ["asset-points", visibleLayers.assets],
      ["asset-new-halo", visibleLayers.assets],
      ["ndvi-overlay", visibleLayers.ndvi],
      ["ndwi-overlay", visibleLayers.ndwi],
    ] as const
    visibility.forEach(([id, visible]) => {
      if (map.getLayer(id))
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none")
    })
  }, [mapLoaded, visibleLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.setPaintProperty("asset-points", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedAssetId ?? ""],
      9,
      6.5,
    ])
  }, [mapLoaded, selectedAssetId])

  // Timeline halo: ring the assets added in the selected period.
  const highlightKey = (highlightAssetIds ?? []).join("|")
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer("asset-new-halo")) return
    map.setFilter(
      "asset-new-halo",
      highlightKey
        ? ["in", ["get", "id"], ["literal", highlightKey.split("|")]]
        : ["==", ["get", "id"], ""],
    )
  }, [highlightKey, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.getCanvas().style.cursor = measure ? "crosshair" : ""
    if (!measure) setMeasurePoints([])
  }, [measure, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const source = map.getSource(
      "measurement",
    ) as maplibregl.GeoJSONSource | undefined
    const features: Feature[] = measurePoints.map((point) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: point },
    }))
    if (measurePoints.length === 2) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: measurePoints },
      })
    }
    source?.setData({ type: "FeatureCollection", features })
  }, [measurePoints, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.easeTo({
      pitch: threeDimensional ? 52 : 0,
      bearing: threeDimensional ? -14 : 0,
      duration: 650,
    })
    if (threeDimensional && !map.getSource("terrain-elevation")) {
      map.addSource("terrain-elevation", {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
        attribution: "Terrain: Mapzen Terrarium tiles (AWS Open Data)",
      })
    }
    map.setTerrain(
      threeDimensional
        ? { source: "terrain-elevation", exaggeration: 1.15 }
        : null,
    )
  }, [threeDimensional, mapLoaded])

  const measuredDistance =
    measurePoints.length === 2
      ? distanceMeters(measurePoints[0], measurePoints[1])
      : undefined

  return (
    <div className={`map-canvas ${className ?? ""}`}>
      <div ref={containerRef} className="map-render" />
      <div className="map-top-actions">
        <button
          type="button"
          className={`map-mode-button ${threeDimensional ? "selected" : ""}`}
          onClick={() => setThreeDimensional((value) => !value)}
        >
          <span>{threeDimensional ? "3D" : "2D"}</span>
          {threeDimensional ? "3D terrain" : "3D view"}
        </button>
        <button
          type="button"
          className="map-mode-button"
          onClick={() => navigate("/upload")}
        >
          <span className="map-mode-add">+</span> Add field evidence
        </button>
      </div>
      {measure && (
        <div className="map-measure-hint">
          {measuredDistance
            ? `${
                measuredDistance >= 1000
                  ? `${(measuredDistance / 1000).toFixed(2)} km`
                  : `${Math.round(measuredDistance)} m`
              } measured`
            : "Click two points on the map to measure"}
          <button type="button" onClick={() => setMeasurePoints([])}>
            Clear
          </button>
        </div>
      )}
      {choropleth && visibleLayers.boundary && (
        <div className="hs-legend">
          <strong>{choropleth.label}</strong>
          <div className="hs-legend-ramp">
            {choroplethRamp.map((color) => (
              <i key={color} style={{ background: color }} />
            ))}
          </div>
          <div className="hs-legend-scale">
            <span>0</span>
            <span>{choropleth.max}</span>
          </div>
        </div>
      )}
      <div className="map-attribution-note">
        {env.watershedPmtilesUrl
          ? "Watershed tiles: see the data sources documentation"
          : "DEMO watershed boundaries · not official records"}
      </div>
    </div>
  )
}

/**
 * Optional official boundaries served as PMTiles (Phase 1). Built by
 * scripts/prepare_watersheds. Source-layers: basins, watersheds,
 * micro_watersheds. Only loaded when VITE_WATERSHED_PMTILES_URL is set.
 */
function addOfficialWatershedTiles(map: MapLibreMap) {
  if (!env.watershedPmtilesUrl) return
  map.addSource("official-watersheds", {
    type: "vector",
    url: `pmtiles://${env.watershedPmtilesUrl}`,
    attribution: env.watershedAttribution,
    promoteId: {
      basins: "id",
      watersheds: "id",
      micro_watersheds: "id",
    },
  })
  for (const level of officialWatershedLayers) {
    map.addLayer({
      id: `official-${level.layer}-fill`,
      type: "fill",
      source: "official-watersheds",
      "source-layer": level.layer,
      minzoom: level.min,
      maxzoom: level.max,
      paint: {
        "fill-color": level.color,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.22,
          ["boolean", ["feature-state", "active"], false],
          0.16,
          0.06,
        ],
      },
    })
    map.addLayer({
      id: `official-${level.layer}-line`,
      type: "line",
      source: "official-watersheds",
      "source-layer": level.layer,
      minzoom: level.min,
      maxzoom: level.max,
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "active"], false],
          "#155a41",
          level.color,
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "active"], false],
          2.6,
          1.2,
        ],
      },
    })
  }
}

function applyThematicLayers(
  map: MapLibreMap,
  streams: FeatureCollection<LineStringGeometry> | undefined,
  ndvi: Feature<PolygonGeometry | MultiPolygonGeometry> | undefined,
  ndwi: Feature<PolygonGeometry | MultiPolygonGeometry> | undefined,
) {
  if (streams) {
    const source = map.getSource(
      "streams",
    ) as maplibregl.GeoJSONSource | undefined
    if (source) source.setData(streams)
    else map.addSource("streams", { type: "geojson", data: streams })
    if (!map.getLayer("streams-line")) {
      map.addLayer(
        {
          id: "streams-line",
          type: "line",
          source: "streams",
          paint: {
            "line-color": "#4aaed0",
            "line-width": 2.2,
            "line-opacity": 0.88,
          },
        },
        "asset-points",
      )
    }
  }
  // DEMO: NDVI/NDWI overlays are simulated polygons, not satellite rasters.
  addFillLayer(map, "ndvi-demo", "ndvi-overlay", ndvi, "#4aa76d", 0.27)
  addFillLayer(map, "ndwi-demo", "ndwi-overlay", ndwi, "#45a7dd", 0.32)
}

function addFillLayer(
  map: MapLibreMap,
  sourceId: string,
  layerId: string,
  feature: Feature<PolygonGeometry | MultiPolygonGeometry> | undefined,
  color: string,
  opacity: number,
) {
  if (!feature) return
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(feature)
  else map.addSource(sourceId, { type: "geojson", data: feature })
  if (!map.getLayer(layerId)) {
    map.addLayer(
      {
        id: layerId,
        type: "fill",
        source: sourceId,
        layout: { visibility: "none" },
        paint: { "fill-color": color, "fill-opacity": opacity },
      },
      "asset-points",
    )
  }
}



================================================
```


---

## `src/pages/MapAnalysisPage.tsx`

**REPLACE (full file; adds timeline state, filtering and `<MapTimeline />`)**

```tsx
import { useCallback, useContext, useMemo, useState } from "react"
import {
  Activity,
  ChevronDown,
  Crosshair,
  Droplets,
  Layers3,
  Leaf,
  Download,
  ListFilter,
  LocateFixed,
  MapPin,
  Ruler,
  Search,
  SlidersHorizontal,
  Waves,
  X,
} from "lucide-react"
import { AppContext } from "@/App"
import { useHydroSnap } from "@/hooks/useHydroSnap"
import {
  WatershedMap,
  type Basemap,
  type ChoroplethConfig,
} from "@/components/maps/WatershedMap"
import { DemoBadge } from "@/components/common/DemoBadge"
import { MapTimeline } from "@/components/maps/MapTimeline"
import { WatershedPanel } from "@/components/maps/WatershedPanel"
import { downloadAssetsCsv, downloadAssetsGeoJson } from "@/utils/exporters"
import {
  findContainingWatershed,
  geometryBounds,
  type Bounds,
} from "@/utils/geo"
import { watershedStats } from "@/utils/watershedStats"
import {
  assetsAsOf,
  buildTimelineSteps,
  summarizeStep,
} from "@/utils/timeline"
import type { Asset, Watershed } from "@/types/domain"
import type { ThematicLayer } from "@/types/domain"
import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
  MultiPolygonGeometry,
  PolygonGeometry,
} from "@/types/geojson"

const layerDefinitions = [
  { key: "boundary", icon: Waves, color: "#3c9b72" },
  { key: "streams", icon: Droplets, color: "#46a9cd" },
  { key: "assets", label: "Field assets", icon: MapPin, color: "#1b82b6" },
  { key: "ndvi", icon: Leaf, color: "#4b9d68" },
  { key: "ndwi", icon: Droplets, color: "#4096c6" },
] as const

type LayerKey = typeof layerDefinitions[number]["key"]

type ChoroplethMetric = "none" | "total" | "verified" | "pending"
const choroplethLabels: Record<Exclude<ChoroplethMetric, "none">, string> = {
  total: "Mapped assets",
  verified: "Verified assets",
  pending: "Pending reviews",
}

const EMPTY_ASSETS: Asset[] = []
const EMPTY_WATERSHEDS: Watershed[] = []
const EMPTY_THEMATIC_LAYERS: ThematicLayer[] = []

const defaultVisibleLayers = {
  boundary: true,
  streams: true,
  assets: true,
  ndvi: false,
  ndwi: false,
}

export function MapAnalysisPage() {
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const watersheds = data.watersheds.data ?? EMPTY_WATERSHEDS
  const watershed =
    watersheds.find(({ id }) => id === context?.watershedId) ?? watersheds[0]
  const allAssets = data.assets.data ?? EMPTY_ASSETS

  // ---- 6-monthly timeline -------------------------------------------------
  const timelineSteps = useMemo(() => buildTimelineSteps(), [])
  const [timelineEnabled, setTimelineEnabled] = useState(true)
  const [timelineIndex, setTimelineIndex] = useState(timelineSteps.length - 1)
  const [newOnly, setNewOnly] = useState(false)
  const handleTimelineIndex = useCallback(
    (index: number) => setTimelineIndex(index),
    [],
  )
  const timelineStep = timelineSteps[timelineIndex] ?? timelineSteps.at(-1)!
  const timelineSummary = useMemo(
    () => summarizeStep(allAssets, timelineStep),
    [allAssets, timelineStep],
  )
  // Assets the map, lists, stats and colouring should show at this date.
  const timelineAssets = useMemo(() => {
    if (!timelineEnabled) return allAssets
    return newOnly
      ? timelineSummary.added
      : assetsAsOf(allAssets, timelineStep.date)
  }, [allAssets, newOnly, timelineEnabled, timelineStep.date, timelineSummary])
  const highlightAssetIds = useMemo(
    () => (timelineEnabled ? timelineSummary.added.map(({ id }) => id) : []),
    [timelineEnabled, timelineSummary],
  )
  // -------------------------------------------------------------------------

  const assets = useMemo(
    () => timelineAssets.filter((asset) => asset.watershedId === watershed?.id),
    [timelineAssets, watershed?.id],
  )
  const thematicLayers = data.layers.data ?? EMPTY_THEMATIC_LAYERS
  const visibleLayers = context?.visibleLayers ?? defaultVisibleLayers
  const streamGeometry = useMemo(
    () => lineLayerGeometry(thematicLayers.find(({ id }) => id === "streams")),
    [thematicLayers],
  )
  const ndviGeometry = useMemo(
    () => polygonLayerGeometry(thematicLayers.find(({ id }) => id === "ndvi")),
    [thematicLayers],
  )
  const ndwiGeometry = useMemo(
    () => polygonLayerGeometry(thematicLayers.find(({ id }) => id === "ndwi")),
    [thematicLayers],
  )
  const [basemap, setBasemap] = useState<Basemap>("standard")
  const [pickedAsset, setSelectedAsset] = useState<Asset>()
  // An asset that does not exist yet at the chosen date cannot stay selected.
  const selectedAsset =
    pickedAsset && timelineAssets.some(({ id }) => id === pickedAsset.id)
      ? pickedAsset
      : undefined
  const [query, setQuery] = useState("")
  const [measure, setMeasure] = useState(false)
  const [focusPosition, setFocusPosition] = useState<[number, number]>()
  const [layersOpen, setLayersOpen] = useState(true)
  const [focusBounds, setFocusBounds] = useState<Bounds>()
  const [panelWatershedId, setPanelWatershedId] = useState<string>()
  const [watershedQuery, setWatershedQuery] = useState("")
  const [metric, setMetric] = useState<ChoroplethMetric>("none")
  const [center, setCenter] = useState<[number, number]>()
  const panelWatershed = watersheds.find(({ id }) => id === panelWatershedId)
  const watershedMatches = watershedQuery.trim()
    ? watersheds.filter((item) =>
        `${item.name} ${item.code} ${item.district}`
          .toLowerCase()
          .includes(watershedQuery.trim().toLowerCase()),
      )
    : []
  const choropleth = useMemo<ChoroplethConfig | undefined>(() => {
    if (metric === "none") return undefined
    const values: Record<string, number> = {}
    for (const item of watersheds) {
      const stats = watershedStats(item.id, timelineAssets)
      values[item.id] =
        metric === "verified"
          ? stats.verified
          : metric === "pending"
            ? stats.pending
            : stats.total
    }
    return {
      values,
      max: Math.max(1, ...Object.values(values)),
      label: choroplethLabels[metric],
    }
  }, [metric, timelineAssets, watersheds])

  function openWatershed(id: string) {
    const target = watersheds.find((item) => item.id === id)
    if (!target) return
    setPanelWatershedId(id)
    context?.setWatershedId(id)
    setFocusBounds(geometryBounds(target.boundary.geometry))
    setWatershedQuery("")
  }

  function whichWatershed() {
    if (!navigator.geolocation) {
      context?.notify("Device location is not supported by this browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position: [number, number] = [coords.longitude, coords.latitude]
        setFocusPosition(position)
        const found = findContainingWatershed(position, watersheds)
        if (found) {
          openWatershed(found.id)
          context?.notify(`You are inside ${found.name} (${found.code}).`)
        } else {
          context?.notify(
            "Your location is outside every watershed loaded in this workspace.",
          )
        }
      },
      () => context?.notify("Could not determine your device location."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }
  const filteredAssets = useMemo(
    () =>
      assets.filter((asset) =>
        `${asset.name} ${asset.type} ${asset.village}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [assets, query],
  )

  function locateDevice() {
    if (!navigator.geolocation) {
      context?.notify("Device location is not supported by this browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setFocusPosition([coords.longitude, coords.latitude]),
      ({ code }) =>
        context?.notify(
          code === 1
            ? "Location permission was denied."
            : "Could not determine your device location.",
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  return (
    <div className="map-page">
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-mark" /> SPATIAL WORKSPACE
          </div>
          <h1>Map analysis</h1>
          <p>
            Explore watershed boundaries, field assets and environmental layers.
          </p>
        </div>
        <div className="heading-actions">
          <DemoBadge label="Demo boundaries & assets" />
          <button
            className="button button-secondary"
            onClick={() => downloadAssetsGeoJson(allAssets)}
          >
            <Download size={15} /> GeoJSON
          </button>
          <button
            className="button button-secondary"
            onClick={() => downloadAssetsCsv(allAssets)}
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </div>
      <div className="map-workspace">
        <aside className="map-sidebar">
          <div className="map-sidebar-head">
            <div>
              <span className="section-kicker">
                <span className="kicker-dot blue-dot" /> MAP CONTENTS
              </span>
              <h2>Layers & features</h2>
            </div>
            <button
              className="icon-button small-icon"
              onClick={() => setLayersOpen((value) => !value)}
              aria-label="Toggle map layers"
            >
              <Layers3 size={17} />
            </button>
          </div>
          <div className="hs-watershed-search">
            <label className="map-feature-search">
              <Search size={15} />
              <input
                value={watershedQuery}
                onChange={(event) => setWatershedQuery(event.target.value)}
                placeholder="Find watershed (name, code, district)"
                aria-label="Search watersheds"
              />
            </label>
            {watershedMatches.length > 0 && (
              <div className="hs-search-results">
                {watershedMatches.slice(0, 8).map((item) => (
                  <button key={item.id} onClick={() => openWatershed(item.id)}>
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} · {item.district}
                    </small>
                  </button>
                ))}
              </div>
            )}
            {watershedQuery.trim() && !watershedMatches.length && (
              <div className="empty-inline">No watershed matches.</div>
            )}
            <button className="hs-which-button" onClick={whichWatershed}>
              <LocateFixed size={15} /> Which watershed am I in?
            </button>
            <label className="hs-metric-select">
              <span>Colour watersheds by</span>
              <select
                value={metric}
                onChange={(event) =>
                  setMetric(event.target.value as ChoroplethMetric)
                }
              >
                <option value="none">No colouring</option>
                <option value="total">Mapped assets</option>
                <option value="verified">Verified assets</option>
                <option value="pending">Pending reviews</option>
              </select>
            </label>
          </div>
          {layersOpen && (
            <div className="map-layer-section">
              <div className="layer-group-title">
                MAP LAYERS{" "}
                <button
                  onClick={() =>
                    context?.setVisibleLayers(() => ({
                      boundary: true,
                      streams: true,
                      assets: true,
                      ndvi: true,
                      ndwi: true,
                    }))
                  }
                >
                  Show all
                </button>
              </div>
              {layerDefinitions.map(({ key, icon: Icon, color }) => {
                const layer = thematicLayers.find(
                  (thematicLayer) => thematicLayer.id === key,
                )
                const label =
                  key === "assets"
                    ? "Field assets"
                    : (layer?.name ?? key[0].toUpperCase() + key.slice(1))
                return (
                  <label className="layer-row" key={key}>
                    <span
                      className="layer-symbol"
                      style={{ color, background: `${color}16` }}
                    >
                      <Icon size={15} />
                    </span>
                    <span>
                      {label}
                      {(key === "ndvi" || key === "ndwi") && layer?.demo && (
                        <small>Simulated overlay</small>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={visibleLayers[key]}
                      onChange={() =>
                        context?.setVisibleLayers((state) => ({
                          ...state,
                          [key]: !state[key],
                        }))
                      }
                    />
                  </label>
                )
              })}
            </div>
          )}
          <div className="map-sidebar-divider" />
          <div className="map-feature-title">
            <div>
              <span className="section-kicker">
                <span className="kicker-dot amber-dot" /> WATERSHED ASSETS
              </span>
              <strong>{filteredAssets.length} mapped features</strong>
            </div>
            <button
              className="icon-button small-icon"
              aria-label="Filter assets"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
          <label className="map-feature-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a feature"
            />
            <ListFilter size={14} />
          </label>
          <div className="map-feature-list">
            {filteredAssets.map((asset) => (
              <button
                key={asset.id}
                className={`map-feature ${
                  selectedAsset?.id === asset.id ? "selected" : ""
                }`}
                onClick={() => setSelectedAsset(asset)}
              >
                <span
                  className={`asset-feature-icon feature-${asset.type.toLowerCase().replace(/ /g, "-")}`}
                >
                  <MapPin size={16} />
                </span>
                <span className="map-feature-copy">
                  <strong>{asset.name}</strong>
                  <small>
                    {asset.type} <i>·</i> {asset.village}
                  </small>
                </span>
                <span
                  className={`feature-status ${
                    asset.status === "Verified"
                      ? "status-green"
                      : asset.status === "Flagged"
                        ? "status-red"
                        : "status-amber"
                  }`}
                />
              </button>
            ))}
            {!filteredAssets.length && (
              <div className="empty-inline">
                No matching assets in this watershed.
              </div>
            )}
          </div>
          <div className="map-sidebar-bottom">
            <span>Map data is illustrative</span>
            <span>WGS84 · EPSG:4326</span>
          </div>
        </aside>
        <section className="map-main">
          <div className="map-toolbar">
            <div className="map-toolbar-left">
              <div className="map-breadcrumb">
                <span>{watershed?.name ?? "Watershed"}</span>
                <ChevronDown size={14} />
              </div>
              <span className="toolbar-separator" />
              <span className="map-coordinates">
                {center
                  ? `${center[1].toFixed(3)}° N, ${center[0].toFixed(3)}° E`
                  : "—"}
              </span>
            </div>
            <div className="map-toolbar-right">
              <button
                className={`map-tool-button ${measure ? "tool-active" : ""}`}
                onClick={() => setMeasure((value) => !value)}
              >
                <Ruler size={16} /> Measure
              </button>
              <button className="map-tool-button" onClick={locateDevice}>
                <Crosshair size={16} /> Locate
              </button>
            </div>
          </div>
          <div
            className={`map-map-holder ${timelineEnabled ? "has-timeline" : ""}`}
          >
            <WatershedMap
              assets={timelineAssets}
              highlightAssetIds={highlightAssetIds}
              watershed={watershed}
              watersheds={watersheds}
              choropleth={choropleth}
              focusBounds={focusBounds}
              onSelectWatershed={(id) => {
                const target = watersheds.find(
                  (item) => item.id === id || item.code === id,
                )
                if (target) openWatershed(target.id)
              }}
              onCenterChange={setCenter}
              basemap={basemap}
              visibleLayers={visibleLayers}
              measure={measure}
              selectedAssetId={selectedAsset?.id}
              focusPosition={focusPosition}
              streams={streamGeometry}
              ndviOverlay={ndviGeometry}
              ndwiOverlay={ndwiGeometry}
              onSelectAsset={setSelectedAsset}
            />
            <div className="basemap-switcher">
              <span>BASEMAP</span>
              {(["standard", "satellite", "terrain"] as const).map((style) => (
                <button
                  key={style}
                  className={basemap === style ? "active" : ""}
                  onClick={() => setBasemap(style)}
                >
                  {style === "standard"
                    ? "Street"
                    : style[0].toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
            <MapTimeline
              steps={timelineSteps}
              index={timelineIndex}
              onIndexChange={handleTimelineIndex}
              enabled={timelineEnabled}
              onEnabledChange={setTimelineEnabled}
              newOnly={newOnly}
              onNewOnlyChange={setNewOnly}
              summary={timelineSummary}
              onFocusAsset={(asset) => {
                setSelectedAsset(asset)
                setFocusPosition([...asset.location.coordinates] as [
                  number,
                  number,
                ])
              }}
            />
            {panelWatershed && !selectedAsset && (
              <WatershedPanel
                watershed={panelWatershed}
                assets={timelineAssets}
                onClose={() => setPanelWatershedId(undefined)}
                onFocus={() => openWatershed(panelWatershed.id)}
              />
            )}
            {selectedAsset && (
              <div className="asset-map-card">
                <button
                  className="asset-card-close"
                  onClick={() => setSelectedAsset(undefined)}
                  aria-label="Close asset details"
                >
                  <X size={15} />
                </button>
                <div className="asset-card-top">
                  <div className="asset-detail-icon">
                    <MapPin size={17} />
                  </div>
                  <span
                    className={`status-pill ${
                      selectedAsset.status === "Verified"
                        ? "status-green"
                        : "status-amber"
                    }`}
                  >
                    {selectedAsset.status}
                  </span>
                </div>
                <h3>{selectedAsset.name}</h3>
                <p>
                  {selectedAsset.type} <span>·</span> {selectedAsset.village}
                </p>
                <div className="asset-card-coords">
                  {selectedAsset.location.coordinates[1].toFixed(5)}° N,{" "}
                  {selectedAsset.location.coordinates[0].toFixed(5)}° E
                </div>
                <button
                  className="asset-card-link"
                  onClick={() =>
                    context?.notify(
                      "Asset detail opened in the Field evidence registry.",
                    )
                  }
                >
                  View asset details <ChevronDown size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="map-bottom-bar">
            <div>
              <span className="bottom-dot" /> {watershed?.code ?? "—"} <i>·</i>{" "}
              {watershed?.areaSqKm ?? "—"} km² <i>·</i>{" "}
              {watershed?.district ?? "—"} district
            </div>
            <div className="map-data-warning">
              <Activity size={13} /> DEMO DATA · SAMPLE FEATURES · NDVI/NDWI
              OVERLAYS SIMULATED
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function lineLayerGeometry(
  layer?: ThematicLayer,
): FeatureCollection<LineStringGeometry> | undefined {
  const geometry = layer?.geometry
  if (!geometry || geometry.type !== "FeatureCollection") return undefined
  const features = geometry.features.filter(
    (feature): feature is Feature<LineStringGeometry> =>
      feature.geometry.type === "LineString",
  )
  return { type: "FeatureCollection", features }
}

function polygonLayerGeometry(
  layer?: ThematicLayer,
): Feature<PolygonGeometry | MultiPolygonGeometry> | undefined {
  const geometry = layer?.geometry
  if (
    !geometry ||
    geometry.type !== "Feature" ||
    (geometry.geometry.type !== "Polygon" &&
      geometry.geometry.type !== "MultiPolygon")
  ) {
    return undefined
  }
  return {
    type: "Feature",
    properties: geometry.properties,
    geometry: geometry.geometry,
  }
}



================================================
```
