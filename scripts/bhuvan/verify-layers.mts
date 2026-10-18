/**
 * Checks that every layer in the Bhuvan catalogue really exists on Bhuvan's
 * WMS and actually renders. Run from the project root:
 *
 *   pnpm bhuvan:verify
 *   VITE_BHUVAN_STATE_CODE=KA VITE_BHUVAN_DISTRICT=BELGAUM pnpm bhuvan:verify
 *   pnpm bhuvan:verify -- --list     # also print every layer for your state
 *
 * Needs outbound internet. If the Bhuvan certificate chain is rejected on
 * your machine, re-run with NODE_TLS_REJECT_UNAUTHORIZED=0 (testing only).
 */
import {
  bhuvanTileTemplate,
  buildBhuvanCatalog,
  lngLatToWebMercator,
} from "../../src/utils/bhuvanLayers.ts"

const HOST = process.env.BHUVAN_PROXY_TARGET ?? "https://bhuvan-vec2.nrsc.gov.in"
const WMS = `${HOST}/bhuvan/wms`
const state = (process.env.VITE_BHUVAN_STATE_CODE ?? "MH").toUpperCase()
const district = (process.env.VITE_BHUVAN_DISTRICT ?? "PUNE").toUpperCase()
const listAll = process.argv.includes("--list")

const catalog = buildBhuvanCatalog({ stateCode: state, district })

console.log(`Bhuvan WMS: ${WMS}\nState: ${state}  District: ${district}\n`)
console.log("Downloading GetCapabilities (large, can take a minute)...")
const capsResponse = await fetch(
  `${WMS}?service=WMS&version=1.1.1&request=GetCapabilities`,
  { signal: AbortSignal.timeout(180_000) },
)
if (!capsResponse.ok) {
  console.error(`GetCapabilities failed: HTTP ${capsResponse.status}`)
  process.exit(1)
}
const xml = await capsResponse.text()
const available = new Set(
  [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((match) => match[1]),
)
console.log(`Server advertises ${available.size} layer/style names.\n`)

// A small window around Pune (override with VERIFY_LNG / VERIFY_LAT).
const lng = Number(process.env.VERIFY_LNG ?? 73.8567)
const lat = Number(process.env.VERIFY_LAT ?? 18.5204)
const [cx, cy] = lngLatToWebMercator(lng, lat)
const half = 20_000
const bbox = [cx - half, cy - half, cx + half, cy + half].join(",")

let failures = 0
for (const layer of catalog) {
  const listed = available.has(layer.wmsName)
  let render = "skipped"
  if (listed) {
    const url = bhuvanTileTemplate(WMS, layer.wmsName).replace(
      "{bbox-epsg-3857}",
      bbox,
    )
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      const type = response.headers.get("content-type") ?? "?"
      const bytes = (await response.arrayBuffer()).byteLength
      render =
        response.ok && type.startsWith("image/")
          ? `OK (${type}, ${bytes} bytes)`
          : `FAILED (HTTP ${response.status}, ${type})`
    } catch (error) {
      render = `FAILED (${(error as Error).message})`
    }
  }
  const ok = listed && render.startsWith("OK")
  if (!ok) failures++
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${layer.wmsName.padEnd(34)} listed=${listed}  render=${render}`,
  )
  if (!listed) {
    const stem = layer.wmsName.split(":")[1]?.split("_").slice(0, 2).join("_")
    const similar = [...available]
      .filter((name) => stem && name.toUpperCase().includes(stem))
      .slice(0, 6)
    if (similar.length) console.log(`      similar names: ${similar.join(", ")}`)
  }
}

if (listAll) {
  console.log(`\nAll layers whose name mentions ${state}_ or ${district}:`)
  for (const name of [...available].sort()) {
    if (name.includes(`${state}_`) || name.includes(district)) {
      console.log(`  ${name}`)
    }
  }
}

console.log(
  failures
    ? `\n${failures} layer(s) need attention. Edit src/utils/bhuvanLayers.ts with the correct names.`
    : "\nAll catalogue layers exist and render.",
)
process.exit(failures ? 1 : 0)
