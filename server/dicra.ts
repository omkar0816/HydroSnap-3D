import type { ZodType } from "zod"
import {
  dicraCollectionSchema,
  dicraCollectionsSchema,
  dicraQueryablesSchema,
  dicraRootSchema,
  dicraSearchResponseSchema,
  type DicraCollection,
  type DicraCollections,
  type DicraQueryables,
  type DicraRoot,
  type DicraSearchRequest,
  type DicraSearchResponse,
} from "../shared/dicra.ts"

export type DicraClientConfig = {
  baseUrl: string
  timeoutMs: number
  collectionsCacheTtlSeconds: number
  maxSearchLimit: number
}

export class DicraClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "DicraClientError"
  }
}

type Fetcher = typeof fetch

type StacPageLink = {
  rel?: string
  href?: string
  method?: string
  body?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeBaseUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("DICRA_STAC_BASE_URL must be a valid absolute URL.")
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "DICRA_STAC_BASE_URL must be HTTPS and must not contain credentials or query parameters.",
    )
  }
  url.pathname = url.pathname.replace(/\/+$/, "")
  return url
}

export function createDicraClient(
  config: DicraClientConfig,
  fetcher: Fetcher = fetch,
) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  let cachedCollections: {
    expiresAt: number
    value: DicraCollections
  } | undefined

  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1000 ||
    config.timeoutMs > 120_000
  ) {
    throw new Error("DICRA_REQUEST_TIMEOUT_MS must be between 1000 and 120000.")
  }
  if (
    !Number.isSafeInteger(config.collectionsCacheTtlSeconds) ||
    config.collectionsCacheTtlSeconds < 0 ||
    config.collectionsCacheTtlSeconds > 86_400
  ) {
    throw new Error(
      "DICRA_COLLECTIONS_CACHE_TTL_SECONDS must be between 0 and 86400.",
    )
  }
  if (
    !Number.isSafeInteger(config.maxSearchLimit) ||
    config.maxSearchLimit < 1 ||
    config.maxSearchLimit > 1000
  ) {
    throw new Error("DICRA_MAX_SEARCH_LIMIT must be between 1 and 1000.")
  }

  function trustedUrl(pathOrHref: string): URL {
    const url = new URL(pathOrHref, `${baseUrl.toString().replace(/\/$/, "")}/`)
    const basePath = baseUrl.pathname
    if (
      url.origin !== baseUrl.origin ||
      (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new DicraClientError(
        "DiCRA returned an unsafe pagination link.",
        "unsafe_link",
        502,
      )
    }
    return url
  }

  async function requestJson(
    url: URL,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await fetcher(url, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept:
            "application/json, application/geo+json, application/schema+json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (response.status >= 300 && response.status < 400) {
        throw new DicraClientError(
          "DiCRA returned an unsupported redirect.",
          "upstream_redirect",
          502,
        )
      }
      if (!response.ok) {
        const status =
          response.status === 404 ? 404 : response.status === 429 ? 503 : 502
        throw new DicraClientError(
          response.status === 404
            ? "The requested DiCRA collection was not found."
            : "DiCRA could not complete the request.",
          response.status === 404 ? "collection_not_found" : "upstream_error",
          status,
        )
      }
      try {
        return (await response.json()) as unknown
      } catch {
        throw new DicraClientError(
          "DiCRA returned malformed JSON.",
          "malformed_upstream_response",
          502,
        )
      }
    } catch (error) {
      if (error instanceof DicraClientError) throw error
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "TimeoutError")
      ) {
        throw new DicraClientError(
          "DiCRA request timed out.",
          "upstream_timeout",
          504,
        )
      }
      throw new DicraClientError(
        "DiCRA is temporarily unavailable.",
        "upstream_unavailable",
        502,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  function parseResponse<T>(value: unknown, schema: ZodType<T>): T {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      throw new DicraClientError(
        "DiCRA returned an unexpected response shape.",
        "invalid_upstream_response",
        502,
      )
    }
    return parsed.data
  }

  function endpoint(path: string) {
    return trustedUrl(path)
  }

  async function getRoot(): Promise<DicraRoot> {
    return parseResponse(await requestJson(endpoint("")), dicraRootSchema)
  }

  async function getCollections(): Promise<DicraCollections> {
    if (cachedCollections && cachedCollections.expiresAt > Date.now())
      return cachedCollections.value
    const response = parseResponse(
      await requestJson(endpoint("collections")),
      dicraCollectionsSchema,
    )
    if (config.collectionsCacheTtlSeconds > 0) {
      cachedCollections = {
        value: response,
        expiresAt: Date.now() + config.collectionsCacheTtlSeconds * 1000,
      }
    }
    return response
  }

  async function getCollection(collectionId: string): Promise<DicraCollection> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(collectionId)) {
      throw new DicraClientError(
        "Collection ID is invalid.",
        "invalid_collection_id",
        400,
      )
    }
    return parseResponse(
      await requestJson(
        endpoint(`collections/${encodeURIComponent(collectionId)}`),
      ),
      dicraCollectionSchema,
    )
  }

  async function getQueryables(): Promise<DicraQueryables> {
    return parseResponse(
      await requestJson(endpoint("queryables")),
      dicraQueryablesSchema,
    )
  }

  async function searchItems(
    input: DicraSearchRequest,
  ): Promise<DicraSearchResponse> {
    const limit = input.limit ?? Math.min(config.maxSearchLimit, 25)
    if (limit > config.maxSearchLimit) {
      throw new DicraClientError(
        `Search limit cannot exceed ${config.maxSearchLimit}.`,
        "invalid_search_limit",
        400,
      )
    }
    const body = {
      bbox: input.bbox,
      ...(input.collections ? { collections: input.collections } : {}),
      ...(input.datetime ? { datetime: input.datetime } : {}),
      limit,
    }
    const firstUrl = endpoint("search")
    const first = parseResponse(
      await requestJson(firstUrl, "POST", body),
      dicraSearchResponseSchema,
    )
    const features = [...first.features]
    let links: StacPageLink[] = first.links ?? []
    let pageCount = 1
    while (features.length < limit && pageCount < 5) {
      const next = links.find((link) => link.rel === "next")
      if (!next?.href) break
      const url = trustedUrl(next.href)
      const method = next.method === "POST" ? "POST" : "GET"
      const page = parseResponse(
        await requestJson(
          url,
          method,
          method === "POST"
            ? isRecord(next.body)
              ? next.body
              : body
            : undefined,
        ),
        dicraSearchResponseSchema,
      )
      if (page.features.length === 0) break
      features.push(...page.features)
      links = page.links ?? []
      pageCount += 1
    }
    return {
      ...first,
      features: features.slice(0, limit),
      numberReturned: Math.min(features.length, limit),
    }
  }

  return { getRoot, getCollections, getCollection, getQueryables, searchItems }
}

export type DicraClient = ReturnType<typeof createDicraClient>
