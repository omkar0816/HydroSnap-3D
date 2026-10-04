import type { Asset, WGS84Position } from "@/types/domain"
import { distanceMeters } from "@/utils/geo"

export const ASSET_MATCH_RADIUS_M = 50

export interface AssetCandidate {
  asset: Asset
  distanceM: number
}

export function findAssetCandidates(
  position: WGS84Position,
  type: Asset["type"],
  assets: Asset[],
  radiusM = ASSET_MATCH_RADIUS_M,
) {
  const nearby = assets
    .map((asset) => ({
      asset,
      distanceM: distanceMeters(position, asset.location.coordinates),
    }))
    .filter(({ distanceM }) => distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)

  return {
    sameType: nearby.filter(({ asset }) => asset.type === type),
    otherType: nearby.filter(({ asset }) => asset.type !== type),
  }
}
