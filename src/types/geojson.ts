import type { WGS84Position } from "@/types/domain"

export interface PointGeometry {
  type: "Point"
  coordinates: WGS84Position
}

export interface LineStringGeometry {
  type: "LineString"
  coordinates: WGS84Position[]
}

export interface PolygonGeometry {
  type: "Polygon"
  coordinates: WGS84Position[][]
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon"
  coordinates: WGS84Position[][][]
}

export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry | MultiPolygonGeometry

export interface Feature<G extends Geometry = Geometry> {
  type: "Feature"
  properties: Record<string, unknown>
  geometry: G
}

export interface FeatureCollection<G extends Geometry = Geometry> {
  type: "FeatureCollection"
  features: Feature<G>[]
}
