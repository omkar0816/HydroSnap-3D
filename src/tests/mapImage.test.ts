import { describe, expect, it } from "vitest"
import { boundsToCorners } from "@/utils/mapImage"

describe("boundsToCorners", () => {
  it("returns the image-source quad in top-left clockwise order", () => {
    expect(
      boundsToCorners([
        [73.6, 18.5],
        [73.64, 18.54],
      ]),
    ).toEqual([
      [73.6, 18.54],
      [73.64, 18.54],
      [73.64, 18.5],
      [73.6, 18.5],
    ])
  })
})
