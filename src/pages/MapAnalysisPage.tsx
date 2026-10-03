import { useContext, useMemo, useState } from "react"
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
import { WatershedPanel } from "@/components/maps/WatershedPanel"
import { downloadAssetsCsv, downloadAssetsGeoJson } from "@/utils/exporters"
import { findContainingWatershed, geometryBounds, type Bounds } from "@/utils/geo"
import { watershedStats } from "@/utils/watershedStats"
import type { Asset } from "@/types/domain"
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

export function MapAnalysisPage() {
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const watersheds = data.watersheds.data ?? []
  const watershed =
    watersheds.find(({ id }) => id === context?.watershedId) ?? watersheds[0]
  const assets = (data.assets.data ?? []).filter(
    (asset) => asset.watershedId === watershed?.id,
  )
  const thematicLayers = data.layers.data ?? []
  const visibleLayers = context?.visibleLayers ?? {
    boundary: true,
    streams: true,
    assets: true,
    ndvi: false,
    ndwi: false,
  }
  const streamGeometry = lineLayerGeometry(
    thematicLayers.find(({ id }) => id === "streams"),
  )
  const ndviGeometry = polygonLayerGeometry(
    thematicLayers.find(({ id }) => id === "ndvi"),
  )
  const ndwiGeometry = polygonLayerGeometry(
    thematicLayers.find(({ id }) => id === "ndwi"),
  )
  const [basemap, setBasemap] = useState<Basemap>("standard")
  const [selectedAsset, setSelectedAsset] = useState<Asset>()
  const [query, setQuery] = useState("")
  const [measure, setMeasure] = useState(false)
  const [focusPosition, setFocusPosition] = useState<[number, number]>()
  const [layersOpen, setLayersOpen] = useState(true)
  const [focusBounds, setFocusBounds] = useState<Bounds>()
  const [panelWatershedId, setPanelWatershedId] = useState<string>()
  const [watershedQuery, setWatershedQuery] = useState("")
  const [metric, setMetric] = useState<ChoroplethMetric>("none")
  const [center, setCenter] = useState<[number, number]>()
  const allAssets = data.assets.data ?? []
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
      const stats = watershedStats(item.id, allAssets)
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
  }, [allAssets, metric, watersheds])

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
          <div className="map-map-holder">
            <WatershedMap
              assets={allAssets}
              watershed={watershed}
              watersheds={watersheds}
              choropleth={choropleth}
              focusBounds={focusBounds}
              onSelectWatershed={(id) => {
                if (watersheds.some((item) => item.id === id)) {
                  setPanelWatershedId(id)
                }
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
            {panelWatershed && !selectedAsset && (
              <WatershedPanel
                watershed={panelWatershed}
                assets={allAssets}
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
              <Activity size={13} /> DEMO DATA · SAMPLE FEATURES ·
              {" "}NDVI/NDWI OVERLAYS SIMULATED
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
