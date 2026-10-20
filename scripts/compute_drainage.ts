import dotenv from "dotenv"
import pg from "pg"

dotenv.config({ path: [".env.local", ".env"] })

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
})

async function main() {
  try {
    const { rowCount } = await pool.query(`
      INSERT INTO drainage (
        watershed_id, stream_length_km, drainage_density_km_per_km2,
        max_stream_order, source, source_licence, demo, recorded_at
      )
      SELECT w.id,
             totals.stream_length_km,
             totals.stream_length_km / NULLIF(ST_Area(w.boundary::geography) / 1000000, 0),
             totals.max_stream_order,
             CASE WHEN totals.demo THEN 'demo' ELSE 'imported stream network' END,
             totals.source_licence,
             totals.demo,
             now()
      FROM watersheds w
      JOIN LATERAL (
        SELECT sum(ST_Length(ST_Intersection(s.geometry, w.boundary)::geography) / 1000.0)
                 AS stream_length_km,
               max(s.stream_order) AS max_stream_order,
               bool_or(s.demo) AS demo,
               max(s.source_licence) AS source_licence
        FROM streams s
        WHERE (s.watershed_id = w.id OR s.watershed_id IS NULL)
          AND ST_Intersects(s.geometry, w.boundary)
      ) totals ON true
      WHERE totals.stream_length_km IS NOT NULL
        AND ST_Area(w.boundary::geography) > 0
      ON CONFLICT (watershed_id) DO UPDATE SET
        stream_length_km = EXCLUDED.stream_length_km,
        drainage_density_km_per_km2 = EXCLUDED.drainage_density_km_per_km2,
        max_stream_order = EXCLUDED.max_stream_order,
        source = EXCLUDED.source,
        source_licence = EXCLUDED.source_licence,
        demo = EXCLUDED.demo,
        recorded_at = EXCLUDED.recorded_at
    `)
    console.info(`Computed drainage summaries for ${rowCount ?? 0} watershed(s).`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Drainage computation failed.", error)
  process.exitCode = 1
})
