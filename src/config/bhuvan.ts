import { env } from "@/config/env"
import { buildBhuvanCatalog } from "@/utils/bhuvanLayers"

/** Resolved once at start-up from VITE_BHUVAN_* variables. */
export const bhuvanWmsBase = env.bhuvanWmsBase

export const bhuvanCatalog = buildBhuvanCatalog({
  stateCode: env.bhuvanStateCode,
  district: env.bhuvanDistrict,
})
