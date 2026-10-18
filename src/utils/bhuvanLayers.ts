/**
 * Bhuvan (NRSC / ISRO) thematic layers consumed as OGC WMS 1.1.1.
 *
 * - Endpoint: https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms  (no API key needed
 *   for visualisation; see docs/BHUVAN_INTEGRATION.md).
 * - To avoid browser CORS restrictions the app calls a
 *   same-origin path (`/bhuvan-wms/wms`) that Vite (dev) and Vercel (prod)
 *   forward to Bhuvan. See vite.config.ts and vercel.json.
 *
 * Layer names are `<workspace>:<STATE>_<THEME>_<YEAR>`. Layers flagged
 * `verified: false` follow Bhuvan's naming pattern or an older server's
 * names and MUST be checked with `node scripts/bhuvan/verify-layers.mjs`
 * (Bhuvan reorganises workspaces from time to time).
 */

export interface BhuvanConfig {
  /** Same-origin proxy path or absolute URL of the WMS endpoint. */
  wmsBase: string
  /** Two-letter Bhuvan state code, e.g. "MH". */
  stateCode: string
  /** District name as used in Bhuvan IWMP layers, upper-case, e.g. "PUNE". */
  district: string
}

export interface BhuvanLayerDef {
  id: string
  label: string
  group: "Land use / land cover" | "Water & watershed" | "Terrain & hazards"
  /** Full WMS layer name incl. workspace. */
  wmsName: string
  description: string
  /**
   * true  = this naming pattern appears in Bhuvan's published GetCapabilities
   *         (confirmed for other states; run verify-layers.mjs to confirm
   *         your own state/district).
   * false = legacy or inferred name; may not exist on the current server.
   */
  verified: boolean
  /** lng/lat bounds [west, south, east, north] used to limit tile requests. */
  bounds: [number, number, number, number]
  defaultOpacity: number
}

export interface BhuvanLayerState {
  visible: Record<string, boolean>
  /** 0..1 per layer id. */
  opacity: Record<string, number>
}

export const DEFAULT_BHUVAN_CONFIG: BhuvanConfig = {
  wmsBase: "/bhuvan-wms/wms",
  stateCode: "MH",
  district: "PUNE",
}

/** Approximate state extents (lng/lat). Falls back to all of India. */
const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  MH: [72.6, 15.6, 80.9, 22.1],
  KA: [74.0, 11.5, 78.6, 18.5],
  GJ: [68.1, 20.1, 74.5, 24.7],
  AP: [76.7, 12.6, 84.8, 19.9],
}
const INDIA_BOUNDS: [number, number, number, number] = [68, 6, 98, 37.5]

export function stateBounds(
  stateCode: string,
): [number, number, number, number] {
  return STATE_BOUNDS[stateCode.toUpperCase()] ?? INDIA_BOUNDS
}

export function buildBhuvanCatalog(
  config: Pick<BhuvanConfig, "stateCode" | "district">,
): BhuvanLayerDef[] {
  const state = config.stateCode.toUpperCase()
  const district = config.district.toUpperCase().replace(/\s+/g, "_")
  const bounds = stateBounds(state)
  return [
    {
      id: "lulc-1516",
      label: "Land use / land cover 2015-16 (1:50K)",
      group: "Land use / land cover",
      wmsName: `lulc:${state}_LULC50K_1516`,
      description:
        "Latest 50K LULC from ortho-rectified IRS LISS-III imagery.",
      verified: true,
      bounds,
      defaultOpacity: 0.7,
    },
    {
      id: "lulc-1112",
      label: "Land use / land cover 2011-12 (1:50K)",
      group: "Land use / land cover",
      wmsName: `lulc:${state}_LULC50K_1112`,
      description: "Second LULC cycle; compare with 2015-16 to see change.",
      verified: true,
      bounds,
      defaultOpacity: 0.7,
    },
    {
      id: "lulc-0506",
      label: "Land use / land cover 2005-06 (1:50K)",
      group: "Land use / land cover",
      wmsName: `lulc:${state}_LULC50K_0506`,
      description: "Baseline LULC cycle.",
      verified: true,
      bounds,
      defaultOpacity: 0.7,
    },
    {
      id: "watershed",
      label: "Watershed boundaries (Bhuvan)",
      group: "Water & watershed",
      wmsName: `watershed:${state}_WS`,
      description: "State watershed atlas boundaries published on Bhuvan.",
      verified: true,
      bounds,
      defaultOpacity: 0.9,
    },
    {
      id: "iwmp-drainage",
      label: `IWMP drainage – ${config.district}`,
      group: "Water & watershed",
      wmsName: `iwmp:${state}_${district}_drn`,
      description:
        "District drainage network from the IWMP (watershed development) portal.",
      verified: false,
      bounds,
      defaultOpacity: 0.95,
    },
    {
      id: "geomorphology",
      label: "Geomorphology (1:50K)",
      group: "Terrain & hazards",
      wmsName: `vector:${state}_GM50K_0506`,
      description: "Landforms and geomorphic units (2005-06 cycle).",
      verified: false,
      bounds,
      defaultOpacity: 0.65,
    },
    {
      id: "lineament",
      label: "Lineaments (1:50K)",
      group: "Terrain & hazards",
      wmsName: `vector:${state}_LN50K_0506`,
      description: "Geological lineaments – relevant for groundwater.",
      verified: false,
      bounds,
      defaultOpacity: 0.9,
    },
    {
      id: "wasteland",
      label: "Wasteland (1:50K)",
      group: "Terrain & hazards",
      wmsName: `vector:${state}_WL50K_DOP`,
      description: "Degraded land classes useful for plantation planning.",
      verified: false,
      bounds,
      defaultOpacity: 0.7,
    },
  ]
}

/** Make a proxy path absolute so MapLibre web workers can fetch it. */
export function absoluteWmsBase(base: string, origin: string): string {
  return /^https?:\/\//i.test(base) ? base : `${origin}${base}`
}

/**
 * MapLibre raster tile template. `{bbox-epsg-3857}` is substituted by
 * MapLibre; everything else is fixed.
 */
export function bhuvanTileTemplate(wmsBase: string, layerName: string): string {
  const params = [
    "service=WMS",
    "version=1.1.1",
    "request=GetMap",
    `layers=${encodeURIComponent(layerName)}`,
    "styles=",
    "format=image%2Fpng",
    "transparent=true",
    "srs=EPSG%3A3857",
    "width=256",
    "height=256",
    "bbox={bbox-epsg-3857}",
  ]
  return `${wmsBase}?${params.join("&")}`
}

export function bhuvanLegendUrl(wmsBase: string, layerName: string): string {
  const params = [
    "service=WMS",
    "request=GetLegendGraphic",
    "version=1.1.1",
    "format=image%2Fpng",
    "width=18",
    "height=18",
    `layer=${encodeURIComponent(layerName)}`,
  ]
  return `${wmsBase}?${params.join("&")}`
}

const EARTH_RADIUS = 6378137

export function lngLatToWebMercator(
  lng: number,
  lat: number,
): [number, number] {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const x = (EARTH_RADIUS * lng * Math.PI) / 180
  const y =
    EARTH_RADIUS *
    Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360))
  return [x, y]
}

/** Web-Mercator metres per screen pixel at a MapLibre zoom (512 px tiles). */
export function metersPerPixel(zoom: number): number {
  return (2 * Math.PI * EARTH_RADIUS) / (512 * 2 ** zoom)
}

export const IDENTIFY_WINDOW_PX = 101

/**
 * GetFeatureInfo request for a click. Builds a 101x101 px window centred
 * on the click so the result does not depend on the current map size/pitch.
 */
export function bhuvanFeatureInfoUrl(
  wmsBase: string,
  layerName: string,
  lng: number,
  lat: number,
  zoom: number,
  infoFormat: "application/json" | "text/plain" = "application/json",
): string {
  const [cx, cy] = lngLatToWebMercator(lng, lat)
  const half = (IDENTIFY_WINDOW_PX - 1) / 2
  const span = half * metersPerPixel(zoom)
  const bbox = [cx - span, cy - span, cx + span, cy + span]
    .map((value) => value.toFixed(3))
    .join(",")
  const layer = encodeURIComponent(layerName)
  const params = [
    "service=WMS",
    "version=1.1.1",
    "request=GetFeatureInfo",
    `layers=${layer}`,
    `query_layers=${layer}`,
    "styles=",
    "srs=EPSG%3A3857",
    `bbox=${bbox}`,
    `width=${IDENTIFY_WINDOW_PX}`,
    `height=${IDENTIFY_WINDOW_PX}`,
    `x=${half}`,
    `y=${half}`,
    `info_format=${encodeURIComponent(infoFormat)}`,
    "feature_count=1",
  ]
  return `${wmsBase}?${params.join("&")}`
}

export function bhuvanSourceId(layerId: string): string {
  return `bhuvan-${layerId}`
}

/** Find which catalogue layer a failed Bhuvan request belonged to. */
export function bhuvanLayerIdFromUrl(
  url: string | undefined,
  catalog: BhuvanLayerDef[],
): string | undefined {
  if (!url || !url.includes("bhuvan-wms")) return undefined
  const match = /[?&]layers=([^&]+)/i.exec(url)
  if (!match) return undefined
  const name = decodeURIComponent(match[1])
  return catalog.find((layer) => layer.wmsName === name)?.id
}
