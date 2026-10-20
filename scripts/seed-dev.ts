import { createHash } from "node:crypto"
import dotenv from "dotenv"
import pg from "pg"
import { assets, interventions, watersheds } from "../src/services/mock/mockData.ts"

dotenv.config({ path: [".env.local", ".env"] })

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
})
const demoSource = "HydroSnap illustrative development fixture"
const demoLicence = "Illustrative demo data; no external licence applies"

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    for (const watershed of watersheds) {
      await client.query(
        `INSERT INTO watersheds
           (id, payload, boundary, source, source_licence, demo)
         VALUES ($1, $2::jsonb,
                 ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 'demo', $4, true)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload, boundary = EXCLUDED.boundary,
           source = 'demo', source_licence = EXCLUDED.source_licence, demo = true`,
        [watershed.id, JSON.stringify(watershed), JSON.stringify(watershed.boundary.geometry), demoLicence],
      )
    }
    for (const asset of assets) {
      await client.query(
        `INSERT INTO assets
           (id, watershed_id, payload, location, installed_at, source,
            source_licence, demo)
         VALUES ($1, $2, $3::jsonb,
                 ST_SetSRID(ST_MakePoint($4, $5), 4326), $6::date,
                 'demo', $7, true)
         ON CONFLICT (id) DO UPDATE SET
           watershed_id = EXCLUDED.watershed_id, payload = EXCLUDED.payload,
           location = EXCLUDED.location,
           installed_at = COALESCE(EXCLUDED.installed_at, assets.installed_at),
           source = 'demo', source_licence = EXCLUDED.source_licence, demo = true`,
        [
          asset.id,
          asset.watershedId,
          JSON.stringify(asset),
          asset.location.coordinates[0],
          asset.location.coordinates[1],
          asset.installedAt ?? null,
          demoLicence,
        ],
      )
    }
    await client.query(
      `UPDATE streams
       SET source = 'demo', source_licence = $1, demo = true
       WHERE id LIKE 'demo-stream-%'`,
      [demoLicence],
    )
    for (const asset of assets) {
      await client.query(
        `UPDATE assets
         SET installed_at = COALESCE(installed_at, NULLIF(payload->>'installedAt', '')::date),
             source = 'demo', source_licence = $2, demo = true
         WHERE id = $1`,
        [asset.id, demoLicence],
      )
    }
    for (const intervention of interventions) {
      await client.query(
        `INSERT INTO interventions
           (id, payload, watershed_id, status, source, source_licence, demo)
         VALUES ($1, $2::jsonb, $3, $4, 'demo', $5, true)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload, watershed_id = EXCLUDED.watershed_id,
           status = EXCLUDED.status, source = 'demo',
           source_licence = EXCLUDED.source_licence, demo = true`,
        [intervention.id, JSON.stringify(intervention), intervention.watershedId, intervention.status, demoLicence],
      )
    }

    const sampleAsset = assets.find((asset) => asset.watershedId === "ws-bhima")
    if (sampleAsset) {
      const coordinates = sampleAsset.location.coordinates
      const observation = {
        id: "demo-observation-ws-bhima",
        watershedId: sampleAsset.watershedId,
        assetId: sampleAsset.id,
        assetType: sampleAsset.type,
        inspectionDate: "2026-10-01",
        officerId: "demo-officer",
        officerName: "Demo officer",
        verificationStatus: "Pending review",
        imageName: "illustrative-demo-photo.jpg",
        village: sampleAsset.village,
        description: "Illustrative seeded observation; not field evidence.",
        auditHistory: [],
        createdAt: "2026-10-01T00:00:00.000Z",
      }
      const payload = JSON.stringify(observation)
      const hash = createHash("sha256").update(payload).digest("hex")
      await client.query(
        `INSERT INTO field_observations
           (id, watershed_id, idempotency_key, payload_hash, payload,
            location, created_at, officer_id, asset_id, asset_type,
            inspection_date, verification_status, source, source_licence, demo)
         VALUES ($1, $2, $1, $3, $4::jsonb,
                 ST_SetSRID(ST_MakePoint($5, $6), 4326), $7,
                 'demo-officer', $8, $9, '2026-10-01', 'Pending review',
                 'demo', $10, true)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload, officer_id = EXCLUDED.officer_id,
           asset_id = EXCLUDED.asset_id, asset_type = EXCLUDED.asset_type,
           inspection_date = EXCLUDED.inspection_date,
           verification_status = EXCLUDED.verification_status,
           source = EXCLUDED.source, source_licence = EXCLUDED.source_licence,
           demo = true`,
        [
          observation.id,
          observation.watershedId,
          hash,
          payload,
          coordinates[0],
          coordinates[1],
          observation.createdAt,
          observation.assetId,
          observation.assetType,
          demoLicence,
        ],
      )
    }

    const satelliteWindows = [
      { role: "baseline", start: "2024-11-01", end: "2024-12-31", mean: 0.43 },
      { role: "current", start: "2025-11-01", end: "2025-12-31", mean: 0.51 },
    ] as const
    for (const [index, window] of satelliteWindows.entries()) {
      const id = `demo-ws-bhima-ndvi-${window.role}`
      await client.query(
        `INSERT INTO satellite_measurements
           (id, watershed_id, aoi_scope, index_type, window_role,
            window_start, window_end, season_label, mean, median, p10, p90,
            std, valid_pixel_pct, scene_count, scene_ids, cloud_limit_pct,
            method, resolution_m, status, source, source_licence,
            attribution, demo)
         VALUES ($1, 'ws-bhima', 'watershed', 'NDVI', $2,
                 $3, $4, 'Nov-Dec', $5::double precision,
                 $5::double precision, $5::double precision - 0.1,
                 $5::double precision + 0.1,
                 0.08, 85, 2, ARRAY['illustrative-scene-' || $6], 30,
                 'Illustrative seeded statistic; not derived from imagery', 10,
                 'measured', $7, $8, 'Illustrative data, not Copernicus imagery', true)
         ON CONFLICT (id) DO UPDATE SET
           mean = EXCLUDED.mean, median = EXCLUDED.median,
           status = EXCLUDED.status, demo = true`,
        [id, window.role, window.start, window.end, window.mean, index + 1, demoSource, demoLicence],
      )
    }

    const demoLandUse = [
      ["cropland", 2500, 42.3],
      ["forest", 1800, 30.5],
      ["built-up", 420, 7.1],
    ] as const
    for (const [className, areaHa, pct] of demoLandUse) {
      const id = `demo-ws-bhima-land-${className}`
      await client.query(
        `INSERT INTO land_use
           (id, watershed_id, class_name, area_ha, pct, reference_year,
            source, source_licence, demo)
         VALUES ($1, 'ws-bhima', $2, $3, $4, 2024, $5, $6, true)
         ON CONFLICT (id) DO UPDATE SET
           area_ha = EXCLUDED.area_ha, pct = EXCLUDED.pct, demo = true`,
        [id, className, areaHa, pct, demoSource, demoLicence],
      )
    }

    await client.query(`
      INSERT INTO drainage (
        watershed_id, stream_length_km, drainage_density_km_per_km2,
        max_stream_order, source, source_licence, demo
      )
      SELECT w.id,
             totals.stream_length_km,
             totals.stream_length_km / NULLIF(ST_Area(w.boundary::geography) / 1000000, 0),
             totals.max_stream_order,
             CASE WHEN totals.demo THEN 'demo' ELSE 'imported stream network' END,
             COALESCE(totals.source_licence, $1),
             totals.demo
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
        recorded_at = now()
    `, [demoLicence])

    await client.query("COMMIT")
    console.info("Demo knowledge-engine fixtures seeded with demo=true.")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("Demo seed failed.", error)
  process.exitCode = 1
})
