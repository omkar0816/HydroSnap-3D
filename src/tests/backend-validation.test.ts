import { describe, expect, it } from "vitest"
import {
  lineGeometry,
  pointCoordinates,
  polygonGeometry,
  RequestValidationError,
} from "../../server/validation"

describe("backend GeoJSON validation", () => {
  it("accepts valid WGS84 points and polygon coordinates", () => {
    expect(
      pointCoordinates({ type: "Point", coordinates: [73.9, 18.5] }),
    ).toEqual([73.9, 18.5])
    expect(
      polygonGeometry({
        type: "Polygon",
        coordinates: [
          [
            [73.9, 18.5],
            [74, 18.5],
            [74, 18.6],
            [73.9, 18.5],
          ],
        ],
      }).type,
    ).toBe("Polygon")
  })

  it("rejects malformed or out-of-range coordinates", () => {
    expect(() =>
      pointCoordinates({ type: "Point", coordinates: [181, 18] }),
    ).toThrow(RequestValidationError)
    expect(() =>
      polygonGeometry({
        type: "MultiPolygon",
        coordinates: [[[[181, 18], [182, 18], [182, 19], [181, 18]]]],
      }),
    ).toThrow(RequestValidationError)
    expect(() =>
      lineGeometry({ type: "LineString", coordinates: [] }),
    ).toThrow(RequestValidationError)
  })
})
