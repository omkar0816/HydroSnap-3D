export type LonLat = [longitude: number, latitude: number]
export type ImageCorners = [LonLat, LonLat, LonLat, LonLat]

export function boundsToCorners(
  [[west, south], [east, north]]: [LonLat, LonLat],
): ImageCorners {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}
