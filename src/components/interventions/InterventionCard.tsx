import { useState } from "react"
import {
  Droplets,
  Leaf,
  LoaderCircle,
  Play,
  RefreshCw,
  Sprout,
} from "lucide-react"
import type {
  SatelliteMeasurementRow,
  WatershedEvidence,
} from "@/types/evidence"
import {
  calculateIndexChange,
  formatIndex,
  type IndexType,
} from "@/utils/satelliteStyles"

type InterventionMonitoring = {
  measurements: SatelliteMeasurementRow[]
  jobs: Array<{
    indexType: IndexType
    status: "queued" | "running" | "done" | "failed"
    error?: string | null
  }>
}

export type EvidenceIntervention = WatershedEvidence["interventions"][number] & {
  name?: string
  village?: string
  monitoring?: InterventionMonitoring
}

type Props = {
  item: EvidenceIntervention
  assetName?: string
  canEdit: boolean
  busy: boolean
  onStart: (item: EvidenceIntervention) => void
  onRefresh: (item: EvidenceIntervention) => void
}

const INDEXES: Array<{ type: IndexType; label: string; Icon: typeof Leaf }> = [
  { type: "NDVI", label: "NDVI · vegetation", Icon: Leaf },
  { type: "NDWI", label: "NDWI · water", Icon: Droplets },
]

function statusClass(status: string) {
  return status === "Completed"
    ? "status-green"
    : status === "In progress"
      ? "status-blue"
      : "status-amber"
}

function IndexBlock({
  item,
  type,
  label,
  Icon,
}: {
  item: EvidenceIntervention
  type: IndexType
  label: string
  Icon: typeof Leaf
}) {
  const monitoring = item.monitoring
  const job = monitoring?.jobs
    .filter((entry) => entry.indexType === type)
    .at(-1)
  const { baseline, current, change, changePct } = calculateIndexChange(
    monitoring?.measurements ?? [],
    type,
  )
  const pending = job?.status === "queued" || job?.status === "running"
  const rising = change !== null && change > 0
  return (
    <div className="intervention-index" data-index={type}>
      <div className="intervention-index-head">
        <span>
          <Icon size={12} /> {label}
        </span>
        {pending && (
          <small className="status-pill status-blue">
            <LoaderCircle size={10} className="spin" /> {job?.status}
          </small>
        )}
        {job?.status === "failed" && (
          <small
            className="status-pill status-red"
            title={job.error ?? undefined}
          >
            failed
          </small>
        )}
      </div>
      {current ? (
        <>
          <div className="intervention-index-value">
            <strong>{formatIndex(current.mean)}</strong>
            <span>
              {current.windowStart} → {current.windowEnd}
            </span>
          </div>
          <div className="intervention-index-row">
            <span>Baseline</span>
            <b>{baseline ? formatIndex(baseline.mean) : "—"}</b>
          </div>
          <div className="intervention-index-row">
            <span>Change</span>
            <b
              className={
                change === null ? "" : rising ? "index-up" : "index-down"
              }
            >
              {change === null
                ? "—"
                : `${change > 0 ? "+" : ""}${formatIndex(change)}${
                    changePct === null
                      ? ""
                      : ` (${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%)`
                  }`}
            </b>
          </div>
          <small>
            {current.sceneCount ?? 0} scenes ·{" "}
            {formatIndex(current.validPixelPct, 0)}% valid pixels
            {current.aoiScope === "asset_buffer" && current.bufferM
              ? ` · ${current.bufferM} m around field node`
              : " · whole watershed"}
          </small>
        </>
      ) : (
        <small className="intervention-index-empty">
          {pending
            ? "Satellite analysis is running…"
            : job?.status === "failed"
              ? `Analysis failed${job.error ? `: ${job.error}` : ""}`
              : job?.status === "done"
                ? "Not enough cloud-free pixels for this window."
                : item.status === "In progress"
                  ? "No measurement yet."
                  : "Starts when work is marked In progress."}
        </small>
      )}
    </div>
  )
}

export function InterventionCard({
  item,
  assetName,
  canEdit,
  busy,
  onStart,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false)
  const active = item.status === "In progress"
  return (
    <article
      className={`intervention-card ${
        active ? "intervention-card-active" : ""
      }`}
    >
      <div className="intervention-card-top">
        <span className="intervention-icon">
          <Sprout size={18} />
        </span>
        <span className={`status-pill ${statusClass(item.status)}`}>
          {item.status}
        </span>
      </div>
      <span className="section-kicker">{item.type}</span>
      <h3>{item.name || item.type}</h3>
      <p>
        {assetName ? `Field node: ${assetName}` : "Whole watershed"}
        {item.village ? ` · ${item.village}` : ""}
        {item.installedAt
          ? ` · Installed ${item.installedAt}`
          : ` · Recorded ${item.recordedAt.slice(0, 10)}`}
      </p>

      {active ||
      item.monitoring?.measurements.length ||
      item.monitoring?.jobs.length ? (
        <div className="intervention-indices">
          {INDEXES.map((entry) => (
            <IndexBlock key={entry.type} item={item} {...entry} />
          ))}
        </div>
      ) : null}

      <div className="intervention-card-foot">
        {item.status === "Planned" && canEdit && (
          <button
            className="button button-primary button-small"
            disabled={busy}
            onClick={() => onStart(item)}
          >
            <Play size={12} /> Start work
          </button>
        )}
        {active && canEdit && !item.demo && (
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() => onRefresh(item)}
          >
            <RefreshCw size={12} /> Refresh NDVI/NDWI
          </button>
        )}
        <button
          className="text-button"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide details" : "View details"}
        </button>
      </div>
      {open && (
        <div className="intervention-details">
          <strong>Satellite method</strong>
          <span>
            {item.monitoring?.measurements[0]?.method ??
              "Sentinel-2 L2A median composite via Element84 Earth Search STAC; current window is the latest 90 days compared with the same dates a year earlier."}
          </span>
          <span>
            Differences are descriptive only; rainfall and season are not
            normalised.
          </span>
          <small>
            Source: {item.source}
            {item.demo ? " · demo record" : ""}
          </small>
        </div>
      )}
    </article>
  )
}
