import dotenv from "dotenv"
import pg from "pg"

dotenv.config({ path: [".env.local", ".env"] })

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
})

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(`
      UPDATE assets
      SET installed_at = COALESCE(installed_at,
            CASE WHEN payload->>'installedAt' ~ '^\\d{4}-\\d{2}-\\d{2}$'
                 THEN (payload->>'installedAt')::date END),
          source = COALESCE(NULLIF(payload->>'source', ''), source),
          source_licence = COALESCE(NULLIF(payload->>'sourceLicence', ''), source_licence),
          demo = CASE payload->>'demo'
            WHEN 'true' THEN true WHEN 'false' THEN false ELSE demo END
      WHERE installed_at IS NULL OR payload ? 'source' OR payload ? 'sourceLicence'
         OR payload ? 'demo'
    `)
    await client.query(`
      UPDATE watersheds
      SET source = COALESCE(NULLIF(payload->>'source', ''), source),
          source_licence = COALESCE(NULLIF(payload->>'sourceLicence', ''), source_licence),
          demo = CASE payload->>'demo'
            WHEN 'true' THEN true WHEN 'false' THEN false ELSE demo END
      WHERE payload ? 'source' OR payload ? 'sourceLicence' OR payload ? 'demo'
    `)
    await client.query(`
      UPDATE streams
      SET source = COALESCE(NULLIF(payload->>'source', ''), source),
          source_licence = COALESCE(NULLIF(payload->>'sourceLicence', ''), source_licence),
          stream_order = COALESCE(stream_order,
            CASE WHEN payload->>'stream_order' ~ '^\\d+$'
                 THEN (payload->>'stream_order')::int END),
          demo = CASE payload->>'demo'
            WHEN 'true' THEN true WHEN 'false' THEN false ELSE demo END
      WHERE payload ? 'source' OR payload ? 'sourceLicence'
         OR payload ? 'stream_order' OR payload ? 'demo'
    `)
    await client.query(`
      UPDATE field_observations
      SET officer_id = COALESCE(officer_id, payload->>'officerId'),
          asset_id = COALESCE(asset_id, payload->>'assetId'),
          asset_type = COALESCE(asset_type, payload->>'assetType'),
          inspection_date = COALESCE(inspection_date,
            CASE WHEN payload->>'inspectionDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
                 THEN (payload->>'inspectionDate')::date END),
          verification_status = COALESCE(NULLIF(payload->>'verificationStatus', ''), verification_status),
          source = COALESCE(NULLIF(payload->>'source', ''), source),
          source_licence = COALESCE(NULLIF(payload->>'sourceLicence', ''), source_licence),
          demo = CASE payload->>'demo'
            WHEN 'true' THEN true WHEN 'false' THEN false ELSE demo END
      WHERE officer_id IS NULL OR asset_id IS NULL OR asset_type IS NULL
         OR inspection_date IS NULL OR payload ? 'verificationStatus'
         OR payload ? 'source' OR payload ? 'sourceLicence' OR payload ? 'demo'
    `)
    await client.query(`
      UPDATE interventions
      SET watershed_id = COALESCE(watershed_id, payload->>'watershedId'),
          asset_id = COALESCE(asset_id, payload->>'assetId'),
          installed_at = COALESCE(installed_at,
            CASE WHEN payload->>'installedAt' ~ '^\\d{4}-\\d{2}-\\d{2}$'
                 THEN (payload->>'installedAt')::date END),
          status = COALESCE(NULLIF(payload->>'status', ''), status),
          source = COALESCE(NULLIF(payload->>'source', ''), source),
          source_licence = COALESCE(NULLIF(payload->>'sourceLicence', ''), source_licence),
          demo = CASE payload->>'demo'
            WHEN 'true' THEN true WHEN 'false' THEN false ELSE demo END
      WHERE watershed_id IS NULL OR asset_id IS NULL OR installed_at IS NULL
         OR payload ? 'status' OR payload ? 'source' OR payload ? 'sourceLicence'
         OR payload ? 'demo'
    `)
    await client.query("COMMIT")
    console.info("Legacy payload backfill complete.")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Legacy payload backfill failed.", error)
  process.exitCode = 1
})
