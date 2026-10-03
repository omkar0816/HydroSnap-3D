import { describe, expect, it } from "vitest"
import { watersheds, streams } from "@/services/mock/mockData"
import {
  distanceMeters,
  findContainingWatershed,
  geometryBounds,
  nearestPointOnLine,
  nearestStreamPoint,
  pointInPolygon,
} from "@/utils/geo"
import type { WGS84Position } from "@/types/domain"

const square: WGS84Position[][] = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
  [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ],
]

describe("pointInPolygon", () => {
  it("detects inside, outside, holes and edges", () => {
    expect(pointInPolygon([2, 2], square)).toBe(true)
    expect(pointInPolygon([12, 2], square)).toBe(false)
    expect(pointInPolygon([5, 5], square)).toBe(false) // in hole
    expect(pointInPolygon([0, 5], square)).toBe(true) // on edge
  })
})

describe("demo watersheds", () => {
  it("have distinct boundaries", () => {
    const keys = new Set(
      watersheds.map((w) => JSON.stringify(w.boundary.geometry.coordinates)),
    )
    expect(keys.size).toBe(watersheds.length)
  })

  it("resolve a point to the containing watershed", () => {
    expect(findContainingWatershed([74.48, 18.226], watersheds)?.id).toBe(
      "ws-bhima",
    )
    expect(findContainingWatershed([73.64, 18.56], watersheds)?.id).toBe(
      "ws-mula",
    )
    expect(findContainingWatershed([80, 20], watersheds)).toBeUndefined()
  })

  it("compute bounds", () => {
    const [[minX, minY], [maxX, maxY]] = geometryBounds(
      watersheds[0].boundary.geometry,
    )
    expect(minX).toBeLessThan(maxX)
    expect(minY).toBeLessThan(maxY)
  })
})

describe("stream snapping", () => {
  it("returns the closest point on a segment", () => {
    const hit = nearestPointOnLine(
      [0.5, 0.001],
      [
        [0, 0],
        [1, 0],
      ],
    )
    expect(hit?.position[0]).toBeCloseTo(0.5, 6)
    expect(hit?.position[1]).toBeCloseTo(0, 6)
    expect(hit?.distanceMeters).toBeGreaterThan(100)
    expect(hit?.distanceMeters).toBeLessThan(120)
  })

  it("finds the nearest demo stream", () => {
    const hit = nearestStreamPoint([73.632, 18.555], streams)
    expect(hit?.distanceMeters).toBeLessThan(5)
  })
})

describe("distanceMeters", () => {
  it("is about 111 km per degree of latitude", () => {
    expect(distanceMeters([74, 18], [74, 19]) / 1000).toBeCloseTo(111.2, 0)
  })
})
