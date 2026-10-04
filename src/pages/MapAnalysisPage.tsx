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
  type TimelineInterval,
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
  const [timelineInterval, setTimelineInterval] = useState<TimelineInterval>(6)
  const timelineSteps = useMemo(
    () => buildTimelineSteps(new Date(), 2023, timelineInterval),
    [timelineInterval],
  )
  const [timelineEnabled, setTimelineEnabled] = useState(true)
  const [timelineIndex, setTimelineIndex] = useState(timelineSteps.length - 1)
  const [newOnly, setNewOnly] = useState(false)
  const handleTimelineIndex = useCallback(
    (index: number) => setTimelineIndex(index),
    [],
  )
  const timelineStep = timelineSteps[timelineIndex] ?? timelineSteps.at(-1)
  const timelineSummary = useMemo(
    () => (timelineStep ? summarizeStep(allAssets, timelineStep) : undefined),
    [allAssets, timelineStep],
  )
  const timelineAssets = useMemo(() => {
    if (!timelineEnabled || !timelineStep || !timelineSummary) return allAssets
    return newOnly
      ? timelineSummary.added
      : assetsAsOf(allAssets, timelineStep.date)
  }, [allAssets, newOnly, timelineEnabled, timelineStep, timelineSummary])
  const highlightAssetIds = useMemo(
    () =>
      timelineEnabled && timelineSummary
        ? timelineSummary.added.map(({ id }) => id)
        : [],
    [timelineEnabled, timelineSummary],
  )
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
  const selectedAsset =
    pickedAsset && timelineAssets.some(({ id }) => id === pickedAsset.id)
      ? pickedAsset
      : undefined
  const [query, setQuery] = useState("")
  const [measure, setMeasure] = useState(false)
  const [focusPosition, setFocusPosition] = useState<[number, number]>()
  const [layersOpen, setLayersOpen] = useState(true)
  const [mapSidebarOpen, setMapSidebarOpen] = useState(false)
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

  function changeTimelineInterval(interval: TimelineInterval) {
    setTimelineInterval(interval)
    setTimelineIndex(buildTimelineSteps(new Date(), 2023, interval).length - 1)
  }

  const imageryDate =
    timelineEnabled && timelineStep
      ? timelineStep.isNow
        ? recentSatelliteDate()
        : timelineStep.date
      : undefined

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
        {mapSidebarOpen && (
          <button
            type="button"
            className="mobile-map-backdrop"
            aria-label="Close map contents"
            onClick={() => setMapSidebarOpen(false)}
          />
        )}
        <aside
          id="map-contents-panel"
          className={`map-sidebar ${mapSidebarOpen ? "mobile-map-open" : ""}`}
        >
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
                  <button
                    key={item.id}
                    onClick={() => {
                      openWatershed(item.id)
                      setMapSidebarOpen(false)
                    }}
                  >
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
                onClick={() => {
                  setSelectedAsset(asset)
                  setMapSidebarOpen(false)
                }}
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
              <button
                type="button"
                className="mobile-map-panel-toggle"
                onClick={() => setMapSidebarOpen((open) => !open)}
                aria-label="Open map contents"
                aria-expanded={mapSidebarOpen}
                aria-controls="map-contents-panel"
              >
                <Layers3 size={16} />
              </button>
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
              imageryDate={imageryDate}
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
          {timelineSummary && (
            <MapTimeline
              steps={timelineSteps}
              index={timelineIndex}
              onIndexChange={handleTimelineIndex}
              enabled={timelineEnabled}
              onEnabledChange={setTimelineEnabled}
              interval={timelineInterval}
              onIntervalChange={changeTimelineInterval}
              newOnly={newOnly}
              onNewOnlyChange={setNewOnly}
              summary={timelineSummary}
              onFocusAsset={(asset) => {
                setSelectedAsset(asset)
                setFocusPosition(asset.location.coordinates)
              }}
            />
          )}
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

function recentSatelliteDate(): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 3)
  return date.toISOString().slice(0, 10)
}
