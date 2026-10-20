import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: [".env.local", ".env"] })

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap"
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

const pool = new pg.Pool({ connectionString: databaseUrl })

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
    const migrationDir = path.resolve("db/migrations")
    const migrationFiles = (await readdir(migrationDir))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort()

    await client.query("BEGIN")
    for (const migrationName of migrationFiles) {
      const migrationPath = path.resolve(migrationDir, migrationName)
      const migration = await readFile(migrationPath, "utf8")
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
    }
    await seedDemoData(client)
    await client.query("COMMIT")
    console.info(
      `Database migration check complete; ${migrationFiles.length} migration file(s) processed.`,
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
      `INSERT INTO watersheds
         (id, payload, boundary, source, source_licence, demo)
       VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 'demo', 'Illustrative demo data', true)
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
      `INSERT INTO assets
         (id, watershed_id, payload, location, source, source_licence, demo)
       VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_MakePoint($4, $5), 4326), 'demo', 'Illustrative demo data', true)
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
        `INSERT INTO streams
           (id, watershed_id, payload, geometry, source, source_licence, demo)
         VALUES ($1, NULL, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 'demo', 'Illustrative demo data', true)
         ON CONFLICT (id) DO NOTHING`,
        [id, JSON.stringify(payload), JSON.stringify(feature.geometry)],
      )
    }
  }

  for (const job of jobs) {
    await client.query(
      `INSERT INTO analysis_jobs
         (id, payload, status, watershed_id, params, created_by, created_at, finished_at)
       VALUES ($1, $2::jsonb, 'done', $3, '{"demo":true}'::jsonb,
               'demo-seed', $4::timestamptz, $4::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         payload = EXCLUDED.payload, status = 'done',
         watershed_id = EXCLUDED.watershed_id,
         params = EXCLUDED.params, created_by = EXCLUDED.created_by,
         finished_at = EXCLUDED.finished_at`,
      [job.id, JSON.stringify({ ...job, status: "Completed", demo: true }),
       job.watershedId, job.createdAt],
    )
  }
  for (const result of results) {
    await insertPayload(client, "analysis_results", result.id, result)
    await insertPayload(client, "satellite_timeline", result.id, result)
  }
  for (const item of interventions) {
    await client.query(
      `INSERT INTO interventions
         (id, payload, watershed_id, status, source, source_licence, recorded_at, demo)
       VALUES ($1, $2::jsonb, $3, $4, 'demo', 'Illustrative demo data', now(), true)
       ON CONFLICT (id) DO NOTHING`,
      [item.id, JSON.stringify(item), item.watershedId, item.status],
    )
  }
  for (const report of reports) {
    await insertPayload(client, "reports", report.id, report)
  }
}

main().catch((error: unknown) => {
  console.error("Database setup failed.", error)
  process.exitCode = 1
})
