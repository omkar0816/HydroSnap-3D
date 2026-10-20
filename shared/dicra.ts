import { z } from "zod"

const stacLinkSchema = z
  .object({
    rel: z.string(),
    href: z.string(),
    type: z.string().optional(),
    method: z.enum(["GET", "POST"]).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export const dicraCollectionSchema = z
  .object({
    type: z.literal("Collection"),
    id: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    extent: z.unknown().optional(),
    links: z.array(stacLinkSchema).optional(),
  })
  .passthrough()

export const dicraCollectionsSchema = z
  .object({
    collections: z.array(dicraCollectionSchema),
    links: z.array(stacLinkSchema).optional(),
  })
  .passthrough()

export const dicraAssetSchema = z
  .object({
    href: z.string().min(1),
    type: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    roles: z.array(z.string()).optional(),
  })
  .passthrough()

export const dicraItemSchema = z
  .object({
    type: z.literal("Feature"),
    id: z.string().min(1),
    collection: z.string().optional(),
    properties: z.record(z.string(), z.unknown()),
    assets: z.record(z.string(), dicraAssetSchema),
    bbox: z.array(z.number().finite()).length(4).optional(),
    geometry: z.unknown().nullable().optional(),
    links: z.array(stacLinkSchema).optional(),
  })
  .passthrough()

export const dicraSearchResponseSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(dicraItemSchema),
    links: z.array(stacLinkSchema).optional(),
    numberMatched: z.union([z.number(), z.string()]).optional(),
    numberReturned: z.number().optional(),
  })
  .passthrough()

export const dicraRootSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    stac_version: z.string().optional(),
    links: z.array(stacLinkSchema).optional(),
  })
  .passthrough()

export const dicraQueryablesSchema = z
  .object({
    properties: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

function isStacDatetime(value: string): boolean {
  const instant =
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/
  if (value === "..") return true
  return instant.test(value) && Number.isFinite(Date.parse(value))
}

export const dicraSearchRequestSchema = z
  .object({
    bbox: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
      .refine(
        ([west, south, east, north]) => west < east && south < north,
        "bbox must be ordered [west, south, east, north] with positive area.",
      ),
    collections: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
      )
      .min(1)
      .max(20)
      .optional(),
    datetime: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((value) => {
        const parts = value.split("/")
        return parts.length === 1
          ? isStacDatetime(parts[0])
          : parts.length === 2 &&
              !(parts[0] === ".." && parts[1] === "..") &&
              parts.every(isStacDatetime) &&
              (parts[0] === ".." ||
                parts[1] === ".." ||
                Date.parse(parts[0]) <= Date.parse(parts[1]))
      }, "datetime must be an RFC 3339 instant or interval.")
      .optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .strict()

export type DicraCollection = z.infer<typeof dicraCollectionSchema>
export type DicraCollections = z.infer<typeof dicraCollectionsSchema>
export type DicraItem = z.infer<typeof dicraItemSchema>
export type DicraSearchResponse = z.infer<typeof dicraSearchResponseSchema>
export type DicraRoot = z.infer<typeof dicraRootSchema>
export type DicraQueryables = z.infer<typeof dicraQueryablesSchema>
export type DicraSearchRequest = z.infer<typeof dicraSearchRequestSchema>
