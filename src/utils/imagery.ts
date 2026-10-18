/**
 * Cloud-free satellite imagery sources.
 *
 * Why this exists: the timeline used NASA GIBS VIIRS *daily* true-colour
 * tiles. Daily scenes contain whatever clouds were over the area that day
 * (very visible over Maharashtra in the monsoon) and are only ~250 m/px.
 *
 * Replacement:
 *  - "Now"      -> Esri World Imagery (curated, cloud-free composite).
 *  - Historical -> EOX "Sentinel-2 cloudless" annual mosaics (10 m/px, built
 *                  by picking the clearest pixels across a whole year).
 *
 * Pure functions only (no import.meta.env) so they are trivially testable.
 */

/** First / last EOX mosaic year that exists with the `_3857` tile matrix. */
export const CLOUDLESS_FIRST_YEAR = 2018
export const CLOUDLESS_LATEST_YEAR = 2025

export const CLOUDLESS_ATTRIBUTION =
  "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2018–2025)"

export const CLOUDLESS_MAX_ZOOM = 14

/**
 * Annual mosaics only cover complete calendar years. A timeline step dated
 * 31 Dec of year Y can show the Y mosaic; any earlier date in Y must show
 * the previous year's mosaic, otherwise we would be displaying imagery from
 * the *future* relative to the step. Clamped to the available range.
 */
export function cloudlessYearFor(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4))
  const monthDay = isoDate.slice(5, 10)
  const completeYear = monthDay >= "12-31" ? year : year - 1
  return Math.min(
    CLOUDLESS_LATEST_YEAR,
    Math.max(CLOUDLESS_FIRST_YEAR, completeYear),
  )
}

export function cloudlessTileUrl(year: number): string {
  const clamped = Math.min(
    CLOUDLESS_LATEST_YEAR,
    Math.max(CLOUDLESS_FIRST_YEAR, year),
  )
  return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${clamped}_3857/default/g/{z}/{y}/{x}.jpg`
}

export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
