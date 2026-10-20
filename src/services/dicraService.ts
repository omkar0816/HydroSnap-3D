import {
  dicraCollectionSchema,
  dicraCollectionsSchema,
  dicraQueryablesSchema,
  dicraSearchRequestSchema,
  dicraSearchResponseSchema,
  type DicraCollection,
  type DicraCollections,
  type DicraQueryables,
  type DicraSearchRequest,
  type DicraSearchResponse,
} from "../../shared/dicra.ts"
import { z } from "zod"
import { apiRequest } from "@/services/apiClient"

const dicraStatusSchema = z.object({
  available: z.boolean(),
  title: z.string(),
  stacVersion: z.string().nullable(),
  rasterRenderingConfigured: z.boolean(),
})

export type DicraStatus = z.infer<typeof dicraStatusSchema>

async function parsedRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await apiRequest<unknown>(path, options)
  const parsed = schema.safeParse(response)
  if (!parsed.success) {
    throw new Error("The DiCRA service returned an unexpected response.")
  }
  return parsed.data
}

export const dicraService = {
  getStatus: () => parsedRequest("/api/v1/dicra/status", dicraStatusSchema),

  getCollections: () =>
    parsedRequest("/api/v1/dicra/collections", dicraCollectionsSchema),

  getCollection: (collectionId: string) =>
    parsedRequest(
      `/api/v1/dicra/collections/${encodeURIComponent(collectionId)}`,
      dicraCollectionSchema,
    ),

  getQueryables: () =>
    parsedRequest("/api/v1/dicra/queryables", dicraQueryablesSchema),

  searchItems: async (input: DicraSearchRequest) => {
    const parsed = dicraSearchRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? "Search parameters are invalid.",
      )
    }
    return parsedRequest("/api/v1/dicra/search", dicraSearchResponseSchema, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    })
  },
}

export type {
  DicraCollection,
  DicraCollections,
  DicraQueryables,
  DicraSearchResponse,
}
