function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value.toLowerCase() === "true"
}

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  // With no API URL configured (e.g. a Vercel deploy without a hosted backend)
  // default to demo data instead of calling the visitor's own localhost:8000.
  useMockApi: readBoolean(
    import.meta.env.VITE_USE_MOCK_API,
    !import.meta.env.VITE_API_BASE_URL,
  ),
  // The prototype can show explicitly illustrative fixtures for empty API
  // collections without changing API reads that contain data or API writes.
  useDemoFallback: readBoolean(import.meta.env.VITE_DEMO_EMPTY_FALLBACK, true),
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
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
}