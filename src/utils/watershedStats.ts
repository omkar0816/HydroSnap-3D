import type { Asset } from "@/types/domain"

export interface WatershedStats {
  total: number
  verified: number
  pending: number
  flagged: number
  percentVerified: number
  lastInspection?: string
}

export function watershedStats(
  watershedId: string,
  assets: Asset[],
): WatershedStats {
  const inside = assets.filter((asset) => asset.watershedId === watershedId)
  const verified = inside.filter((asset) => asset.status === "Verified").length
  const pending = inside.filter(
    (asset) => asset.status === "Pending review",
  ).length
  const flagged = inside.filter((asset) => asset.status === "Flagged").length
  const lastInspection = inside
    .map((asset) => asset.lastInspected)
    .sort()
    .at(-1)
  return {
    total: inside.length,
    verified,
    pending,
    flagged,
    percentVerified: inside.length
      ? Math.round((verified / inside.length) * 100)
      : 0,
    lastInspection,
  }
}
