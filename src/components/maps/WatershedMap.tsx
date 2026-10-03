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
  onSelectAsset,
  onSelectWatershed,
  onMapClick,
  onCenterChange,
  className,
}: WatershedMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const labelMarkers = useRef<maplibregl.Marker[]>([])
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

      let hoveredId: string | number | undefined
      map.on("mousemove", "watershed-fill", (event) => {
        const id = event.features?.[0]?.id
        if (id === undefined || id === hoveredId) return
        if (hoveredId !== undefined) {
          map.setFeatureState(
            { source: "watersheds", id: hoveredId },
            { hover: false },
          )
        }
        hoveredId = id
        map.setFeatureState({ source: "watersheds", id }, { hover: true })
        if (!measureRef.current) map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "watershed-fill", () => {
        if (hoveredId !== undefined) {
          map.setFeatureState(
            { source: "watersheds", id: hoveredId },
            { hover: false },
          )
        }
        hoveredId = undefined
        map.getCanvas().style.cursor = measureRef.current ? "crosshair" : ""
      })
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
            String(watershedHit.properties.id ?? watershedHit.id ?? ""),
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
      map.setFeatureState(
        { source: "watersheds", id: item.id },
        { active: item.id === watershed?.id },
      ),
    )
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

  // Assets, labels (HTML markers: no glyph server needed) and visibility.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    ;(map.getSource("field-assets") as maplibregl.GeoJSONSource).setData(
      assetData,
    )
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
    const visibility = [
      ["watershed-fill", visibleLayers.boundary],
      ["watershed-line", visibleLayers.boundary],
      ["streams-line", visibleLayers.streams],
      ["asset-points", visibleLayers.assets],
      ["ndvi-overlay", visibleLayers.ndvi],
      ["ndwi-overlay", visibleLayers.ndwi],
    ] as const
    visibility.forEach(([id, visible]) => {
      if (map.getLayer(id))
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none")
    })
    map.setPaintProperty("asset-points", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedAssetId ?? ""],
      9,
      6.5,
    ])
  }, [
    assetData,
    assets,
    drawnWatersheds,
    mapLoaded,
    selectedAssetId,
    visibleLayers,
    streams,
    ndviOverlay,
    ndwiOverlay,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.getCanvas().style.cursor = measure ? "crosshair" : ""
    if (!measure) setMeasurePoints([])
  }, [measure, mapLoaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const source = map.getSource("measurement") as
      | maplibregl.GeoJSONSource
      | undefined
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
  })
  const levels = [
    { layer: "basins", min: 0, max: 8, color: "#1f5f8b" },
    { layer: "watersheds", min: 8, max: 11, color: "#2d8b65" },
    { layer: "micro_watersheds", min: 11, max: 24, color: "#6a8f2d" },
  ]
  for (const level of levels) {
    map.addLayer({
      id: `official-${level.layer}-fill`,
      type: "fill",
      source: "official-watersheds",
      "source-layer": level.layer,
      minzoom: level.min,
      maxzoom: level.max,
      paint: { "fill-color": level.color, "fill-opacity": 0.06 },
    })
    map.addLayer({
      id: `official-${level.layer}-line`,
      type: "line",
      source: "official-watersheds",
      "source-layer": level.layer,
      minzoom: level.min,
      maxzoom: level.max,
      paint: { "line-color": level.color, "line-width": 1.2 },
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
    const source = map.getSource("streams") as
      | maplibregl.GeoJSONSource
      | undefined
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
