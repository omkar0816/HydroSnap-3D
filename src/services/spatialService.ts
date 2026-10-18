import { env } from "@/config/env"
import { ApiError, apiRequest } from "@/services/apiClient"
import { findContainingWatershed, nearestStreamPoint } from "@/utils/geo"
import type { FeatureCollection, LineStringGeometry } from "@/types/geojson"
import type { Watershed, WGS84Position } from "@/types/domain"

interface ResolveResponse {
  watershedId: string | null
  resolution: "inside" | "outside"
}

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
): Promise<Watershed | undefined> {
  if (env.useMockApi) return findContainingWatershed(position, watersheds)

  const query = new URLSearchParams({
    longitude: String(position[0]),
    latitude: String(position[1]),
  })
  try {
    const result = await apiRequest<ResolveResponse>(
      `/api/v1/spatial/resolve-watershed?${query.toString()}`,
    )
    return result.watershedId
      ? watersheds.find(({ id }) => id === result.watershedId)
      : undefined
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    return findContainingWatershed(position, watersheds)
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
