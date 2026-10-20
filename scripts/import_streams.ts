import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import dotenv from "dotenv"
import pg from "pg"
import { lineGeometry } from "../server/validation.ts"

dotenv.config({ path: [".env.local", ".env"] })

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
})

function option(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value?.trim()) throw new Error(`${name} requires a value.`)
  return value.trim()
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath || inputPath.startsWith("--")) {
    throw new Error('Usage: tsx scripts/import_streams.ts <file.geojson> --source "name" --licence "licence"')
  }
  const source = option("--source")
  const licence = option("--licence")
  const document = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>
  const features = document.type === "FeatureCollection"
    ? document.features
    : document.type === "Feature"
      ? [document]
      : null
  if (!Array.isArray(features)) throw new Error("Input must be a GeoJSON Feature or FeatureCollection.")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const [index, rawFeature] of features.entries()) {
      if (!rawFeature || typeof rawFeature !== "object") {
        throw new Error(`Feature ${index} is not an object.`)
      }
      const feature = rawFeature as Record<string, unknown>
      if (feature.type !== "Feature") throw new Error(`Feature ${index} is not a GeoJSON Feature.`)
      const geometry = lineGeometry(feature.geometry)
      const properties = feature.properties && typeof feature.properties === "object"
        ? feature.properties as Record<string, unknown>
        : {}
      const idValue = properties.id ?? feature.id
      const id = typeof idValue === "string" || typeof idValue === "number"
        ? String(idValue)
        : createHash("sha256").update(JSON.stringify(geometry)).digest("hex").slice(0, 24)
      const watershedId = properties.watershed_id ?? properties.watershedId ?? null
      if (watershedId !== null && typeof watershedId !== "string") {
        throw new Error(`Feature ${index} watershed_id must be a string.`)
      }
      const payload = { ...properties, id, source, sourceLicence: licence, demo: false, geometry }
      await client.query(
        `INSERT INTO streams
           (id, watershed_id, payload, geometry, source, source_licence, demo)
         VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6, false)
         ON CONFLICT (id) DO UPDATE SET
           watershed_id = EXCLUDED.watershed_id,
           payload = EXCLUDED.payload,
           geometry = EXCLUDED.geometry,
           source = EXCLUDED.source,
           source_licence = EXCLUDED.source_licence,
           demo = false`,
        [id, watershedId, JSON.stringify(payload), JSON.stringify(geometry), source, licence],
      )
    }
    await client.query("COMMIT")
    console.info(`Imported ${features.length} stream feature(s) from ${source}.`)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Stream import failed.", error)
  process.exitCode = 1
})
