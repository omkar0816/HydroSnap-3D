import { Crosshair, X } from "lucide-react"
import { DemoBadge } from "@/components/common/DemoBadge"
import { watershedStats } from "@/utils/watershedStats"
import type { Asset, Watershed } from "@/types/domain"

interface WatershedPanelProps {
  watershed: Watershed
  assets: Asset[]
  onClose: () => void
  onFocus: () => void
}

export function WatershedPanel({
  watershed,
  assets,
  onClose,
  onFocus,
}: WatershedPanelProps) {
  const stats = watershedStats(watershed.id, assets)
  return (
    <div className="hs-watershed-panel">
      <button
        className="asset-card-close"
        onClick={onClose}
        aria-label="Close watershed details"
      >
        <X size={15} />
      </button>
      <div className="hs-panel-kicker">
        {watershed.level.toUpperCase()}
        {watershed.demo && <DemoBadge label="Demo boundary" />}
      </div>
      <h3>{watershed.name}</h3>
      <p className="hs-panel-sub">
        {watershed.code} · {watershed.district}, {watershed.state}
      </p>
      <dl className="hs-panel-grid">
        <div>
          <dt>Area</dt>
          <dd>{watershed.areaSqKm} km²</dd>
        </div>
        <div>
          <dt>Assets</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>Verified</dt>
          <dd>{stats.percentVerified}%</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>{stats.pending}</dd>
        </div>
        <div>
          <dt>Flagged</dt>
          <dd>{stats.flagged}</dd>
        </div>
        <div>
          <dt>Last inspection</dt>
          <dd>{stats.lastInspection ?? "—"}</dd>
        </div>
      </dl>
      <p className="hs-panel-source">Boundary source: {watershed.source}</p>
      <button className="asset-card-link" onClick={onFocus}>
        <Crosshair size={14} /> Zoom to watershed
      </button>
    </div>
  )
}

export default WatershedPanel
