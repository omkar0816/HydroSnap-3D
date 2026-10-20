import { randomUUID } from "node:crypto"
import dotenv from "dotenv"
import pg from "pg"
import { DEFAULT_SEASON, seasonMatchedWindows } from "../../server/satellite/windows.ts"

dotenv.config({ path: [".env.local", ".env"] })

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
})
const dryRun = process.argv.includes("--dry-run")

async function main() {
  const windows = seasonMatchedWindows(new Date())
  if (!windows.baseline || !windows.current) {
    throw new Error("No complete season-matched windows are available.")
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const candidates = await client.query<{ id: string }>(
      `SELECT w.id
       FROM watersheds w
       WHERE NOT EXISTS (
         SELECT 1 FROM satellite_measurements m
         WHERE m.watershed_id = w.id
           AND m.index_type = 'NDVI'
           AND m.demo = false
           AND m.computed_at >= now() - interval '90 days'
       )
       AND NOT EXISTS (
         SELECT 1 FROM analysis_jobs j
         WHERE j.watershed_id = w.id
           AND j.status IN ('queued', 'running')
           AND j.created_at >= now() - interval '90 days'
       )
       ORDER BY w.id`,
    )
    for (const { id: watershedId } of candidates.rows) {
      if (dryRun) continue
      const id = randomUUID()
      const createdAt = new Date().toISOString()
      const params = {
        type: "NDVI",
        indexType: "NDVI",
        assetId: null,
        bufferM: null,
        seasonLabel: DEFAULT_SEASON.label,
        windows,
      }
      const payload = {
        id,
        watershedId,
        type: "NDVI",
        status: "Queued",
        createdAt,
        progress: 0,
        demo: false,
      }
      await client.query(
        `INSERT INTO analysis_jobs
           (id, payload, status, watershed_id, params, created_by, created_at)
         VALUES ($1, $2::jsonb, 'queued', $3, $4::jsonb,
                 'satellite-refresh-scheduler', $5)`,
        [id, JSON.stringify(payload), watershedId, JSON.stringify(params), createdAt],
      )
    }
    await client.query("COMMIT")
    console.info(
      `${dryRun ? "Found" : "Enqueued"} refresh jobs for ${candidates.rowCount ?? 0} watershed(s).${dryRun ? " (dry run)" : ""}`,
    )
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Satellite refresh enqueue failed.", error)
  process.exitCode = 1
})
