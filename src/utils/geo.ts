import type { GeoLocation, Watershed, WGS84Position } from "@/types/domain"
import type {
  FeatureCollection,
  LineStringGeometry,
  MultiPolygonGeometry,
  PolygonGeometry,
} from "@/types/geojson"

export function toGeoLocation(
  longitude: number,
  latitude: number,
  source: GeoLocation["source"],
  accuracyMeters?: number,
): GeoLocation {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error("Coordinates must be valid WGS84 longitude and latitude.")
  }
  return {
    type: "Point",
    coordinates: [longitude, latitude],
    source,
    ...(accuracyMeters === undefined ? {} : { accuracyMeters }),
  }
}

export function distanceMeters(a: WGS84Position, b: WGS84Position): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const [lon1, lat1] = a.map(radians)
  const [lon2, lat2] = b.map(radians)
  const latDelta = lat2 - lat1
  const lonDelta = lon2 - lon1
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2
  return (
    6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

// ---------------------------------------------------------------------------
// Spatial helpers used for point-in-watershed resolution and stream snapping.
// All coordinates are WGS84 [longitude, latitude].
// ---------------------------------------------------------------------------

type Ring = WGS84Position[]
type PolygonCoords = Ring[]

/** Ray-casting test for a single ring (boundary points count as inside). */
export function pointInRing(point: WGS84Position, ring: Ring): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (onSegment(point, ring[j], ring[i])) return true
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function onSegment(p: WGS84Position, a: WGS84Position, b: WGS84Position) {
  const cross = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1])
  if (Math.abs(cross) > 1e-12) return false
  return (
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  )
}

/** Polygon with holes: inside the outer ring and outside every hole. */
export function pointInPolygon(
  point: WGS84Position,
  polygon: PolygonCoords,
): boolean {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false
  return !polygon.slice(1).some((hole) => pointInRing(point, hole))
}

export function pointInGeometry(
  point: WGS84Position,
  geometry: PolygonGeometry | MultiPolygonGeometry,
): boolean {
  return geometry.type === "Polygon"
    ? pointInPolygon(point, geometry.coordinates)
    : geometry.coordinates.some((polygon) => pointInPolygon(point, polygon))
}

const levelRank: Record<Watershed["level"], number> = {
  "micro-watershed": 0,
  watershed: 1,
  basin: 2,
}

/**
 * Returns the finest-level watershed containing the point, or undefined when
 * the point is outside every known boundary.
 */
export function findContainingWatershed(
  point: WGS84Position,
  watersheds: Watershed[],
): Watershed | undefined {
  return watersheds
    .filter((watershed) =>
      pointInGeometry(point, watershed.boundary.geometry),
    )
    .sort((a, b) => levelRank[a.level] - levelRank[b.level])[0]
}

export type Bounds = [[number, number], [number, number]]

export function geometryBounds(
  geometry: PolygonGeometry | MultiPolygonGeometry,
): Bounds {
  const positions =
    geometry.type === "Polygon"
      ? geometry.coordinates.flat()
      : geometry.coordinates.flat(2)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of positions) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}

export function boundsCenter(bounds: Bounds): WGS84Position {
  return [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
}

/**
 * Closest point on a polyline. Uses a local equirectangular projection, which
 * is accurate enough for the sub-kilometre distances used in snapping.
 */
export function nearestPointOnLine(
  point: WGS84Position,
  line: WGS84Position[],
): { position: WGS84Position; distanceMeters: number } | undefined {
  if (line.length < 2) return undefined
  const kx = Math.cos((point[1] * Math.PI) / 180)
  let best: { position: WGS84Position; distanceMeters: number } | undefined
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const dx = (b[0] - a[0]) * kx
    const dy = b[1] - a[1]
    const lengthSquared = dx * dx + dy * dy
    let t = 0
    if (lengthSquared > 0) {
      t = (((point[0] - a[0]) * kx) * dx + (point[1] - a[1]) * dy) / lengthSquared
      t = Math.max(0, Math.min(1, t))
    }
    const candidate: WGS84Position = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ]
    const distance = distanceMeters(point, candidate)
    if (!best || distance < best.distanceMeters) {
      best = { position: candidate, distanceMeters: distance }
    }
  }
  return best
}

export function nearestStreamPoint(
  point: WGS84Position,
  streams: FeatureCollection<LineStringGeometry> | undefined,
) {
  let best:
    | { position: WGS84Position; distanceMeters: number; streamName?: string }
    | undefined
  for (const feature of streams?.features ?? []) {
    const hit = nearestPointOnLine(point, feature.geometry.coordinates)
    if (hit && (!best || hit.distanceMeters < best.distanceMeters)) {
      best = { ...hit, streamName: String(feature.properties.name ?? "") }
    }
  }
  return best
}
