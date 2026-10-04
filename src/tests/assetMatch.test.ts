import { describe, expect, it } from "vitest"
import type { Asset } from "@/types/domain"
import {
  ASSET_MATCH_RADIUS_M,
  findAssetCandidates,
} from "@/utils/assetMatch"

function makeAsset(
  id: string,
  type: Asset["type"],
  coordinates: [number, number],
): Asset {
  return {
    id,
    name: `Asset ${id}`,
    type,
    watershedId: "ws-test",
    location: { type: "Point", coordinates, source: "demo" },
    status: "Pending review",
    lastInspected: "2026-09-01",
    village: "Test",
    description: "Test asset",
  }
}

describe("findAssetCandidates", () => {
  const position: [number, number] = [74.461, 18.214]

  it("returns a nearby same-type candidate in distance order", () => {
    const result = findAssetCandidates(
      position,
      "Check dam",
      [
        makeAsset("farther", "Check dam", [74.4611, 18.214]),
        makeAsset("nearest", "Check dam", [74.46101, 18.214]),
      ],
    )

    expect(result.sameType.map(({ asset }) => asset.id)).toEqual([
      "nearest",
      "farther",
    ])
    expect(result.otherType).toHaveLength(0)
  })

  it("returns no candidates when no asset is within the radius", () => {
    expect(
      findAssetCandidates(
        position,
        "Check dam",
        [makeAsset("distant", "Check dam", [74.47, 18.214])],
      ),
    ).toEqual({ sameType: [], otherType: [] })
  })

  it("returns multiple same-type candidates for officer review", () => {
    const result = findAssetCandidates(position, "Check dam", [
      makeAsset("one", "Check dam", [74.46101, 18.214]),
      makeAsset("two", "Check dam", [74.46102, 18.214]),
      makeAsset("other-type", "Farm pond", [74.46103, 18.214]),
    ])

    expect(result.sameType).toHaveLength(2)
    expect(result.otherType.map(({ asset }) => asset.id)).toEqual([
      "other-type",
    ])
    expect(ASSET_MATCH_RADIUS_M).toBe(50)
  })
})
