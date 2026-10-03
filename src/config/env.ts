function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === "true"
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  useMockApi: readBoolean(import.meta.env.VITE_USE_MOCK_API, true),
  /**
   * Optional URL of a .pmtiles file with official watershed boundaries
   * (built by scripts/prepare_watersheds). Empty = demo boundaries only.
   */
  watershedPmtilesUrl: import.meta.env.VITE_WATERSHED_PMTILES_URL ?? "",
  /** Attribution text required by the boundary dataset licence. */
  watershedAttribution: import.meta.env.VITE_WATERSHED_ATTRIBUTION ?? "",
}
