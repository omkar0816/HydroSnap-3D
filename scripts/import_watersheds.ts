import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import dotenv from "dotenv"
import pg from "pg"
import type { Watershed, WatershedLevel } from "../src/types/domain.ts"
import type { MultiPolygonGeometry, PolygonGeometry } from "../src/types/geojson.ts"
import { polygonGeometry } from "../server/validation.ts"

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

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath || inputPath.startsWith("--")) {
    throw new Error(
      'Usage: pnpm db:import-watersheds <file.geojson> --source "name" --licence "licence"',
    )
  }
  const source = option("--source")
  const licence = option("--licence")
  const document = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>
  if (document.type !== "FeatureCollection" || !Array.isArray(document.features)) {
    throw new Error("Input must be a GeoJSON FeatureCollection.")
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const [index, rawFeature] of document.features.entries()) {
      if (!rawFeature || typeof rawFeature !== "object") {
        throw new Error(`Feature ${index} is not an object.`)
      }
      const feature = rawFeature as Record<string, unknown>
      if (feature.type !== "Feature") {
        throw new Error(`Feature ${index} is not a GeoJSON Feature.`)
      }
      const properties = feature.properties && typeof feature.properties === "object"
        ? feature.properties as Record<string, unknown>
        : {}
      const geometry = polygonGeometry(feature.geometry) as unknown as
        | PolygonGeometry
        | MultiPolygonGeometry
      const idValue = properties.id ?? feature.id
      const id = typeof idValue === "string" || typeof idValue === "number"
        ? String(idValue)
        : createHash("sha256").update(JSON.stringify(geometry)).digest("hex").slice(0, 24)
      const validity = await client.query<{
        valid: boolean
        reason: string
        area_sq_km: number
      }>(
        `SELECT ST_IsValid(geometry) AS valid,
                ST_IsValidReason(geometry) AS reason,
                ST_Area(geometry::geography) / 1000000 AS area_sq_km
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geometry) input`,
        [JSON.stringify(geometry)],
      )
      const geometryCheck = validity.rows[0]
      if (!geometryCheck?.valid) {
        throw new Error(`Feature ${id} has invalid geometry: ${geometryCheck?.reason ?? "unknown reason"}.`)
      }

      const levelValue = text(properties.level, "watershed")
      const level: WatershedLevel =
        levelValue === "basin" || levelValue === "micro-watershed"
          ? levelValue
          : "watershed"
      const boundary = {
        type: "Feature" as const,
        properties: { ...properties, source, demo: false },
        geometry,
      }
      const payload: Watershed = {
        id,
        name: text(properties.name, `Watershed ${id}`),
        code: text(properties.code, id),
        district: text(properties.district, "Unknown"),
        state: text(properties.state, "Unknown"),
        areaSqKm: number(properties.area_sq_km ?? properties.areaSqKm, geometryCheck.area_sq_km),
        villages: number(properties.villages, 0),
        status: "Active",
        boundary,
        level,
        ...(typeof properties.parent_id === "string"
          ? { parentId: properties.parent_id }
          : {}),
        source,
        demo: false,
      }
      await client.query(
        `INSERT INTO watersheds
           (id, payload, boundary, source, source_licence, demo)
         VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5, false)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload,
           boundary = EXCLUDED.boundary,
           source = EXCLUDED.source,
           source_licence = EXCLUDED.source_licence,
           demo = false`,
        [id, JSON.stringify(payload), JSON.stringify(geometry), source, licence],
      )
    }
    await client.query("COMMIT")
    console.info(`Imported ${document.features.length} watershed feature(s) from ${source}.`)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Watershed import failed.", error)
  process.exitCode = 1
})