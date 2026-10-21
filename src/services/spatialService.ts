import { env } from "@/config/env"
import { ApiError, apiRequest } from "@/services/apiClient"
import { findContainingWatershed, nearestStreamPoint } from "@/utils/geo"
import type { FeatureCollection, LineStringGeometry } from "@/types/geojson"
import type { Watershed, WGS84Position } from "@/types/domain"

interface ResolveResponse {
  watershedId: string | null
  resolution: "inside" | "outside"
}

export type WatershedResolution =
  | { status: "inside"; watershed: Watershed }
  | { status: "outside" }
  | { status: "error"; error: string }

interface SnapResponse {
  streamId: string
  streamName?: string | null
  location: { type: "Point"; coordinates: WGS84Position }
  distanceMeters: number
}

export interface StreamSnap {
  position: WGS84Position
  distanceMeters: number
  streamName?: string
}

export async function resolveWatershed(
  position: WGS84Position,
  watersheds: Watershed[],
): Promise<WatershedResolution> {
  if (env.useMockApi) {
    const watershed = findContainingWatershed(position, watersheds)
    return watershed ? { status: "inside", watershed } : { status: "outside" }
  }

  const query = new URLSearchParams({
    longitude: String(position[0]),
    latitude: String(position[1]),
  })
  try {
    const result = await apiRequest<ResolveResponse>(
      `/api/v1/spatial/resolve-watershed?${query.toString()}`,
    )
    if (!result.watershedId) return { status: "outside" }
    const watershed = watersheds.find(({ id }) => id === result.watershedId)
    return watershed
      ? { status: "inside", watershed }
      : { status: "error", error: "The resolved watershed is not in the loaded list." }
  } catch (error) {
    const canUseLocalFallback =
      error instanceof TypeError ||
      (error instanceof ApiError && error.status >= 500)
    if (canUseLocalFallback && watersheds.length > 0) {
      const watershed = findContainingWatershed(position, watersheds)
      return watershed ? { status: "inside", watershed } : { status: "outside" }
    }
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Watershed lookup failed.",
    }
  }
}

export async function snapToStream(
  position: WGS84Position,
  streams: FeatureCollection<LineStringGeometry> | undefined,
  watershedId?: string,
): Promise<StreamSnap | undefined> {
  if (env.useMockApi) return nearestStreamPoint(position, streams)

  const query = new URLSearchParams({
    longitude: String(position[0]),
    latitude: String(position[1]),
  })
  if (watershedId) query.set("watershedId", watershedId)
  try {
    const result = await apiRequest<SnapResponse | null>(
      `/api/v1/spatial/snap-to-stream?${query.toString()}`,
    )
    return result
      ? {
          position: result.location.coordinates,
          distanceMeters: result.distanceMeters,
          ...(result.streamName ? { streamName: result.streamName } : {}),
        }
      : undefined
  } catch (error) {
    if (error instanceof TypeError) return nearestStreamPoint(position, streams)
    if (error instanceof ApiError && error.status === 404) return undefined
    throw error
  }
}
