import { describe, expect, it, vi } from "vitest"
import { createDicraClient, type DicraClientConfig } from "../dicra.ts"
import {
  dicraSearchRequestSchema,
  dicraSearchResponseSchema,
} from "../../shared/dicra.ts"

const config: DicraClientConfig = {
  baseUrl: "https://dicra.nabard.org/api-stac",
  timeoutMs: 2_000,
  collectionsCacheTtlSeconds: 300,
  maxSearchLimit: 10,
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function feature(id: string) {
  return {
    type: "Feature",
    id,
    collection: "lulc",
    properties: { datetime: "2025-01-01T00:00:00Z" },
    assets: {},
    geometry: null,
  }
}

describe("DiCRA STAC client", () => {
  it("loads collection metadata and caches it for the configured TTL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        collections: [
          { type: "Collection", id: "lulc", license: "proprietary" },
        ],
      }),
    )
    const client = createDicraClient(config, fetcher)

    const first = await client.getCollections()
    const second = await client.getCollections()

    expect(first.collections[0]?.id).toBe("lulc")
    expect(second).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("sends an STAC POST search without forwarding optional empty API-key settings", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        type: "FeatureCollection",
        features: [feature("tile-1")],
        numberMatched: 1,
        numberReturned: 1,
      }),
    )
    const client = createDicraClient(config, fetcher)
    const result = await client.searchItems({
      bbox: [73, 18, 74, 19],
      collections: ["lulc"],
      limit: 5,
    })

    expect(result.features[0]?.id).toBe("tile-1")
    const [, init] = fetcher.mock.calls[0]!
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({
      bbox: [73, 18, 74, 19],
      collections: ["lulc"],
      limit: 5,
    })
    expect(new Headers(init?.headers).has("Authorization")).toBe(false)
  })

  it("rejects invalid bounding boxes and limits before an upstream request", () => {
    expect(
      dicraSearchRequestSchema.safeParse({ bbox: [74, 19, 73, 18] }).success,
    ).toBe(false)
    expect(
      dicraSearchRequestSchema.safeParse({ bbox: [73, 18, 74, 19], limit: 0 })
        .success,
    ).toBe(false)
    expect(
      dicraSearchRequestSchema.safeParse({ bbox: [181, 18, 182, 19] }).success,
    ).toBe(false)
  })

  it("rejects limits above the configured server cap", async () => {
    const fetcher = vi.fn<typeof fetch>()
    const client = createDicraClient(config, fetcher)

    await expect(
      client.searchItems({
        bbox: [73, 18, 74, 19],
        limit: 11,
      }),
    ).rejects.toMatchObject({ code: "invalid_search_limit", status: 400 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("maps upstream timeouts to a safe gateway timeout", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        Object.assign(new Error("request timed out"), { name: "TimeoutError" }),
      )
    const client = createDicraClient(config, fetcher)

    await expect(client.getRoot()).rejects.toMatchObject({
      code: "upstream_timeout",
      status: 504,
    })
  })

  it("maps upstream HTTP errors without exposing the response body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>private upstream detail</html>", { status: 503 }),
      )
    const client = createDicraClient(config, fetcher)

    await expect(client.getRoot()).rejects.toMatchObject({
      code: "upstream_error",
      status: 502,
      message: "DiCRA could not complete the request.",
    })
  })

  it("rejects malformed upstream JSON", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{", { status: 200 }))
    const client = createDicraClient(config, fetcher)

    await expect(client.getRoot()).rejects.toMatchObject({
      code: "malformed_upstream_response",
      status: 502,
    })
  })

  it("preserves a valid empty search response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        type: "FeatureCollection",
        features: [],
        numberMatched: 0,
        numberReturned: 0,
      }),
    )
    const result = await createDicraClient(config, fetcher).searchItems({
      bbox: [73, 18, 74, 19],
    })

    expect(result.features).toEqual([])
    expect(result.numberMatched).toBe(0)
  })

  it("maps a missing collection to 404", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not found", { status: 404 }))
    const client = createDicraClient(config, fetcher)

    await expect(client.getCollection("not-real")).rejects.toMatchObject({
      code: "collection_not_found",
      status: 404,
    })
  })

  it("follows only trusted pagination links and caps the requested results", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          type: "FeatureCollection",
          features: [feature("tile-1")],
          links: [
            {
              rel: "next",
              href: "https://dicra.nabard.org/api-stac/search?token=next",
              method: "POST",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          type: "FeatureCollection",
          features: [feature("tile-2"), feature("tile-3")],
        }),
      )
    const result = await createDicraClient(config, fetcher).searchItems({
      bbox: [73, 18, 74, 19],
      limit: 2,
    })
    expect(result.features.map(({ id }) => id)).toEqual(["tile-1", "tile-2"])
    expect(result.numberReturned).toBe(2)

    const unsafeFetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        type: "FeatureCollection",
        features: [feature("tile-1")],
        links: [
          {
            rel: "next",
            href: "http://169.254.169.254/latest/meta-data",
            method: "GET",
          },
        ],
      }),
    )
    await expect(
      createDicraClient(config, unsafeFetcher).searchItems({
        bbox: [73, 18, 74, 19],
        limit: 2,
      }),
    ).rejects.toMatchObject({ code: "unsafe_link", status: 502 })
    expect(unsafeFetcher).toHaveBeenCalledTimes(1)
  })

  it("stops pagination after five pages", async () => {
    const fetcher = vi.fn<typeof fetch>()
    for (let page = 1; page <= 5; page += 1) {
      fetcher.mockResolvedValueOnce(
        jsonResponse({
          type: "FeatureCollection",
          features: [feature(`tile-${page}`)],
          links: [
            {
              rel: "next",
              href: "https://dicra.nabard.org/api-stac/search",
              method: "POST",
            },
          ],
        }),
      )
    }
    const result = await createDicraClient(config, fetcher).searchItems({
      bbox: [73, 18, 74, 19],
      limit: 10,
    })

    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(result.features).toHaveLength(5)
  })

  it("validates STAC response shape and rejects unsafe configured endpoints", () => {
    expect(
      dicraSearchResponseSchema.safeParse({
        type: "FeatureCollection",
        features: [null],
      }).success,
    ).toBe(false)
    expect(() =>
      createDicraClient({ ...config, baseUrl: "http://example.com" }),
    ).toThrow()
    expect(() =>
      createDicraClient({
        ...config,
        baseUrl: "https://user:pass@dicra.nabard.org/api-stac",
      }),
    ).toThrow()
  })
})
