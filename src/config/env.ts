function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === "true"
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  useMockApi: readBoolean(import.meta.env.VITE_USE_MOCK_API, false),
  /**
   * Optional URL of a .pmtiles file with official watershed boundaries
   * (built by scripts/prepare_watersheds). Empty = demo boundaries only.
   */
  watershedPmtilesUrl: import.meta.env.VITE_WATERSHED_PMTILES_URL ?? "",
  /** Attribution text required by the boundary dataset licence. */
  watershedAttribution: import.meta.env.VITE_WATERSHED_ATTRIBUTION ?? "",
  /**
   * Bhuvan (NRSC/ISRO) WMS. The default is a same-origin path that Vite (dev)
   * and Vercel (prod) forward to bhuvan-vec2.nrsc.gov.in, which avoids any
   * browser CORS restriction. No API key is needed for WMS.
   */
  bhuvanWmsBase: import.meta.env.VITE_BHUVAN_WMS_BASE ?? "/bhuvan-wms/wms",
  /** Bhuvan state code (MH = Maharashtra) and IWMP district name. */
  bhuvanStateCode: import.meta.env.VITE_BHUVAN_STATE_CODE ?? "MH",
  bhuvanDistrict: import.meta.env.VITE_BHUVAN_DISTRICT ?? "PUNE",
}
