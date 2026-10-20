import { useState } from "react"
import { ChevronDown, ExternalLink } from "lucide-react"
import { bhuvanCatalog, bhuvanWmsBase } from "@/config/bhuvan"
import {
  bhuvanLegendUrl,
  type BhuvanLayerDef,
  type BhuvanLayerState,
} from "@/utils/bhuvanLayers"

interface BhuvanLayerPanelProps {
  state: BhuvanLayerState
  onToggle: (layerId: string) => void
  onOpacity: (layerId: string, opacity: number) => void
  compact?: boolean
}

const GROUPS: BhuvanLayerDef["group"][] = [
  "Land use / land cover",
  "Water & watershed",
  "Terrain & hazards",
]

export function BhuvanLayerPanel({
  state,
  onToggle,
  onOpacity,
  compact = false,
}: BhuvanLayerPanelProps) {
  const [legendFor, setLegendFor] = useState<string>()
  const [legendBroken, setLegendBroken] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<BhuvanLayerDef["group"]>(
    GROUPS[0],
  )

  function renderLayer(layer: BhuvanLayerDef) {
    const visible = Boolean(state.visible[layer.id])
    const opacity = state.opacity[layer.id] ?? layer.defaultOpacity
    const legendOpen = visible && legendFor === layer.id

    return (
      <div className="hs-bhuvan-item" key={layer.id}>
        <label className="layer-row">
          <span>
            {layer.label}
            {!layer.verified && (
              <small title="Name follows Bhuvan's pattern but is not confirmed. Run scripts/bhuvan/verify-layers.mjs.">
                Unconfirmed layer name
              </small>
            )}
          </span>
          <input
            type="checkbox"
            checked={visible}
            onChange={() => onToggle(layer.id)}
          />
        </label>
        {visible && (
          <div className="hs-bhuvan-controls">
            <label>
              <span>Opacity</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(event) =>
                  onOpacity(layer.id, Number(event.target.value))
                }
                aria-label={`${layer.label} opacity`}
              />
            </label>
            <button
              type="button"
              className="hs-bhuvan-legend-toggle"
              onClick={() => setLegendFor(legendOpen ? undefined : layer.id)}
            >
              Legend{" "}
              <ChevronDown
                size={11}
                style={{ transform: legendOpen ? "rotate(180deg)" : "none" }}
              />
            </button>
            {legendOpen &&
              (legendBroken.includes(layer.id) ? (
                <p className="hs-bhuvan-note">
                  Legend not available from Bhuvan for this layer.
                </p>
              ) : (
                <img
                  className="hs-bhuvan-legend"
                  src={bhuvanLegendUrl(bhuvanWmsBase, layer.wmsName)}
                  alt={`${layer.label} legend`}
                  loading="lazy"
                  onError={() =>
                    setLegendBroken((previous) => [...previous, layer.id])
                  }
                />
              ))}
            <p className="hs-bhuvan-note">{layer.description}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`hs-bhuvan-panel ${compact ? "hs-bhuvan-panel-compact" : ""}`}
    >
      {compact ? (
        <details className="hs-bhuvan-picker">
          <summary>
            <span>Bhuvan thematic layers</span>
            <ChevronDown size={14} />
          </summary>
          <label className="hs-bhuvan-theme-select">
            <span>Bhuvan theme</span>
            <select
              value={selectedGroup}
              onChange={(event) =>
                setSelectedGroup(event.target.value as BhuvanLayerDef["group"])
              }
            >
              {GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          {bhuvanCatalog
            .filter((layer) => layer.group === selectedGroup)
            .map(renderLayer)}
          <p className="hs-bhuvan-note">
            Source: Bhuvan, NRSC/ISRO. Boundaries are indicative, not legal
            records.
          </p>
        </details>
      ) : (
        <>
          <div className="layer-group-title">
            BHUVAN THEMATIC LAYERS · NRSC/ISRO
            <a
              href="https://bhuvan-app1.nrsc.gov.in/iwmp/index.php?type=citizen"
              target="_blank"
              rel="noreferrer"
              aria-label="Open the Bhuvan IWMP portal"
            >
              <ExternalLink size={10} />
            </a>
          </div>
          {GROUPS.map((group) => {
            const layers = bhuvanCatalog.filter(
              (layer) => layer.group === group,
            )
            if (!layers.length) return null
            return (
              <div className="hs-bhuvan-group" key={group}>
                <div className="hs-bhuvan-group-name">{group}</div>
                {layers.map(renderLayer)}
              </div>
            )
          })}
          <p className="hs-bhuvan-note">
            Click the map with a layer on to see its attributes. Source: Bhuvan,
            NRSC/ISRO (WMS). Boundaries are indicative, not legal records.
          </p>
        </>
      )}
    </div>
  )
}

export default BhuvanLayerPanel
