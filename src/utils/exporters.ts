import type { Asset, FieldObservation } from "@/types/domain"

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export function assetsToGeoJson(assets: Asset[]) {
  return {
    type: "FeatureCollection",
    features: assets.map((asset) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: asset.location.coordinates },
      properties: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        status: asset.status,
        watershedId: asset.watershedId,
        village: asset.village,
        lastInspected: asset.lastInspected,
        locationSource: asset.location.source,
        demo: asset.location.source === "demo",
      },
    })),
  }
}

export function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function assetsToCsv(assets: Asset[]): string {
  const header = [
    "id",
    "name",
    "type",
    "status",
    "watershed_id",
    "village",
    "latitude",
    "longitude",
    "location_source",
    "last_inspected",
  ]
  const rows = assets.map((asset) =>
    [
      asset.id,
      asset.name,
      asset.type,
      asset.status,
      asset.watershedId,
      asset.village,
      asset.location.coordinates[1],
      asset.location.coordinates[0],
      asset.location.source,
      asset.lastInspected,
    ]
      .map(csvEscape)
      .join(","),
  )
  return [header.join(","), ...rows].join("\n")
}

export function downloadAssetsGeoJson(assets: Asset[]) {
  download(
    `hydrosnap-assets-${stamp()}.geojson`,
    JSON.stringify(assetsToGeoJson(assets), null, 2),
    "application/geo+json",
  )
}

export function downloadAssetsCsv(assets: Asset[]) {
  download(`hydrosnap-assets-${stamp()}.csv`, assetsToCsv(assets), "text/csv")
}

/** Audit record for one observation (JSON, image omitted, hash kept). */
export function downloadObservationAudit(observation: FieldObservation) {
  const { imageDataUrl: _image, ...record } = observation
  download(
    `hydrosnap-audit-${observation.id}.json`,
    JSON.stringify(record, null, 2),
    "application/json",
  )
}
