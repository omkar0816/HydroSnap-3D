import { readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import { serverEnv } from "../server/env.ts"
import {
  assets,
  currentUser,
  interventions,
  jobs,
  reports,
  results,
  teamMembers,
  thematicLayers,
  watersheds,
} from "../src/services/mock/mockData.ts"
import type {
  FeatureCollection,
  LineStringGeometry,
} from "../src/types/geojson.ts"

const pool = new pg.Pool({ connectionString: serverEnv.databaseUrl })

async function main() {
  let client: pg.PoolClient | undefined
  try {
    client = await pool.connect()
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    const migrationName = "001_init.sql"
    const migrationPath = path.resolve("db/migrations", migrationName)
    const migration = await readFile(migrationPath, "utf8")
    await client.query("BEGIN")
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [migrationName],
    )
    if (!applied.rowCount) {
      await client.query(migration)
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [migrationName],
      )
    }
    await seedDemoData(client)
    await client.query("COMMIT")
    console.info(
      `${
        applied.rowCount
          ? "Database migration already applied;"
          : "Database migrated;"
      } demo records loaded.`,
    )
  } catch (error) {
    if (client) await client.query("ROLLBACK")
    throw error
  } finally {
    client?.release()
    await pool.end()
  }
}

async function insertPayload(
  client: pg.PoolClient,
  table: "users" | "map_layers" | "satellite_timeline" | "interventions" | "analysis_jobs" | "analysis_results" | "reports",
  id: string,
  payload: unknown,
) {
  await client.query(
    `INSERT INTO ${table} (id, payload) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [id, JSON.stringify(payload)],
  )
}

async function seedDemoData(client: pg.PoolClient) {
  const users = new Map(
    [currentUser, ...teamMembers].map((user) => [user.id, user]),
  )
  for (const [id, user] of users) await insertPayload(client, "users", id, user)

  for (const watershed of watersheds) {
    await client.query(
      `INSERT INTO watersheds (id, payload, boundary)
       VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
       ON CONFLICT (id) DO NOTHING`,
      [
        watershed.id,
        JSON.stringify(watershed),
        JSON.stringify(watershed.boundary.geometry),
      ],
    )
  }

  for (const asset of assets) {
    await client.query(
      `INSERT INTO assets (id, watershed_id, payload, location)
       VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       ON CONFLICT (id) DO NOTHING`,
      [
        asset.id,
        asset.watershedId,
        JSON.stringify(asset),
        asset.location.coordinates[0],
        asset.location.coordinates[1],
      ],
    )
  }

  for (const layer of thematicLayers) {
    await insertPayload(client, "map_layers", layer.id, layer)
  }

  const streamLayer = thematicLayers.find(({ id }) => id === "streams")
  if (streamLayer?.geometry?.type === "FeatureCollection") {
    const collection =
      streamLayer.geometry as FeatureCollection<LineStringGeometry>
    for (const [index, feature] of collection.features.entries()) {
      const id = `demo-stream-${index + 1}`
      const payload = {
        id,
        name: String(feature.properties.name ?? `Demo stream ${index + 1}`),
        geometry: feature.geometry,
      }
      await client.query(
        `INSERT INTO streams (id, watershed_id, payload, geometry)
         VALUES ($1, NULL, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
         ON CONFLICT (id) DO NOTHING`,
        [id, JSON.stringify(payload), JSON.stringify(feature.geometry)],
      )
    }
  }

  for (const job of jobs)
    await insertPayload(client, "analysis_jobs", job.id, job)
  for (const result of results) {
    await insertPayload(client, "analysis_results", result.id, result)
    await insertPayload(client, "satellite_timeline", result.id, result)
  }
  for (const item of interventions) {
    await insertPayload(client, "interventions", item.id, item)
  }
  for (const report of reports) {
    await insertPayload(client, "reports", report.id, report)
  }
}

main().catch((error: unknown) => {
  console.error("Database setup failed.", error)
  process.exitCode = 1
})
