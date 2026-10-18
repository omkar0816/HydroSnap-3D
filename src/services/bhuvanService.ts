import { bhuvanFeatureInfoUrl } from "@/utils/bhuvanLayers"

export interface BhuvanIdentifyResult {
  layerLabel: string
  /** Attribute name -> value of the first feature under the click. */
  properties: Record<string, string>
}

interface GeoJsonLike {
  features?: Array<{ properties?: Record<string, unknown> | null }>
}

// Columns that only describe geometry/ids and are noise in a popup.
const HIDDEN_KEYS = new Set([
  "id",
  "fid",
  "objectid",
  "shape_area",
  "shape_leng",
  "shape_len",
  "geom",
  "the_geom",
])

function readableProperties(
  properties: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (HIDDEN_KEYS.has(key.toLowerCase())) continue
    if (value === null || value === undefined || value === "") continue
    if (typeof value === "object") continue
    out[key] = String(value)
  }
  return out
}

/**
 * Ask Bhuvan what is under a click for one layer. Resolves to `undefined`
 * when the layer has nothing there or the server answers with something that
 * is not GeoJSON (network failures also resolve to `undefined`, because
 * identify is a convenience and must never break map clicks).
 */
export async function identifyBhuvanLayer(
  wmsBase: string,
  layer: { wmsName: string; label: string },
  lng: number,
  lat: number,
  zoom: number,
  signal?: AbortSignal,
): Promise<BhuvanIdentifyResult | undefined> {
  try {
    const response = await fetch(
      bhuvanFeatureInfoUrl(wmsBase, layer.wmsName, lng, lat, zoom),
      { signal },
    )
    if (!response.ok) return undefined
    const body = (await response.json()) as GeoJsonLike
    const properties = body.features?.[0]?.properties
    if (!properties) return undefined
    const readable = readableProperties(properties)
    return Object.keys(readable).length
      ? { layerLabel: layer.label, properties: readable }
      : undefined
  } catch {
    return undefined
  }
}
