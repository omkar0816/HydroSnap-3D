import { describe, expect, it } from "vitest"
import {
  absoluteWmsBase,
  bhuvanFeatureInfoUrl,
  bhuvanLayerIdFromUrl,
  bhuvanLegendUrl,
  bhuvanTileTemplate,
  buildBhuvanCatalog,
  lngLatToWebMercator,
  metersPerPixel,
} from "@/utils/bhuvanLayers"

const catalog = buildBhuvanCatalog({ stateCode: "mh", district: "Pune" })

describe("bhuvan catalogue", () => {
  it("builds state/district specific WMS names", () => {
    const names = catalog.map((layer) => layer.wmsName)
    expect(names).toContain("lulc:MH_LULC50K_1516")
    expect(names).toContain("watershed:MH_WS")
    expect(names).toContain("iwmp:MH_PUNE_drn")
  })

  it("has unique ids and layer names", () => {
    expect(new Set(catalog.map((l) => l.id)).size).toBe(catalog.length)
    expect(new Set(catalog.map((l) => l.wmsName)).size).toBe(catalog.length)
  })

  it("normalises multi-word districts", () => {
    const other = buildBhuvanCatalog({ stateCode: "MH", district: "Ahmed Nagar" })
    expect(other.find((l) => l.id === "iwmp-drainage")?.wmsName).toBe(
      "iwmp:MH_AHMED_NAGAR_drn",
    )
  })
})

describe("bhuvan urls", () => {
  it("keeps the MapLibre bbox placeholder intact", () => {
    const url = bhuvanTileTemplate("https://x.test/bhuvan-wms/wms", "lulc:MH_LULC50K_1516")
    expect(url).toContain("bbox={bbox-epsg-3857}")
    expect(url).toContain("layers=lulc%3AMH_LULC50K_1516")
    expect(url).toContain("transparent=true")
  })

  it("makes proxy paths absolute but leaves absolute urls alone", () => {
    expect(absoluteWmsBase("/bhuvan-wms/wms", "https://app.test")).toBe(
      "https://app.test/bhuvan-wms/wms",
    )
    expect(absoluteWmsBase("https://h.test/wms", "https://app.test")).toBe(
      "https://h.test/wms",
    )
  })

  it("builds a legend request", () => {
    expect(bhuvanLegendUrl("/w", "lulc:MH_LULC50K_1516")).toContain(
      "request=GetLegendGraphic",
    )
  })

  it("centres the identify bbox on the click", () => {
    const [cx, cy] = lngLatToWebMercator(73.8567, 18.5204)
    const url = bhuvanFeatureInfoUrl("/w", "lulc:MH_LULC50K_1516", 73.8567, 18.5204, 12)
    const bbox = /bbox=([^&]+)/.exec(url)![1].split(",").map(Number)
    expect((bbox[0] + bbox[2]) / 2).toBeCloseTo(cx, 0)
    expect((bbox[1] + bbox[3]) / 2).toBeCloseTo(cy, 0)
    expect(bbox[2] - bbox[0]).toBeCloseTo(100 * metersPerPixel(12), 0)
    expect(url).toContain("x=50&y=50")
  })

  it("converts to web mercator", () => {
    const [x, y] = lngLatToWebMercator(0, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(lngLatToWebMercator(180, 0)[0]).toBeCloseTo(20037508.34, 0)
  })

  it("maps a failed request url back to its layer", () => {
    const url = bhuvanTileTemplate("https://app.test/bhuvan-wms/wms", "watershed:MH_WS")
    expect(bhuvanLayerIdFromUrl(url, catalog)).toBe("watershed")
    expect(bhuvanLayerIdFromUrl("https://other.test/x", catalog)).toBeUndefined()
  })
})
