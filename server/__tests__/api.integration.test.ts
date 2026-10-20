import { createServer, type Server } from "node:http"
import { generateKeyPairSync } from "node:crypto"
import { exportJWK, SignJWT } from "jose"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createPostgisTestSchema, testServerEnv } from "./helpers.ts"

vi.mock("../llm.ts", () => ({
  generateJson: vi.fn(),
  LlmError: class extends Error {
    status = 503
    code = "not-configured"
  },
}))
import { generateJson } from "../llm.ts"

const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 })
const nativeFetch = globalThis.fetch.bind(globalThis)

describe("API against an isolated PostGIS schema", () => {
  let server: Server
  let baseUrl: string
  let closeSchema: (() => Promise<void>) | undefined
  let closePool: (() => Promise<void>) | undefined

  beforeAll(async () => {
    const database = await createPostgisTestSchema()
    closeSchema = database.close
    process.env.DATABASE_URL = database.databaseUrl
    process.env.SUPABASE_URL = testServerEnv.supabaseUrl
    process.env.SUPABASE_ANON_KEY = testServerEnv.supabaseAnonKey

    const [{ default: app }, { pool }] = await Promise.all([
      import("../api.ts"),
      import("../database.ts"),
    ])
    closePool = () => pool.end()
    server = createServer(app)
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Test API did not bind to a TCP port.")
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
    await closePool?.()
    await closeSchema?.()
  })

  it("keeps health public and confirms the PostGIS database connection", async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok", database: "connected" })
  })

  it("rejects unauthenticated user and photo requests", async () => {
    const userResponse = await fetch(`${baseUrl}/api/v1/users/me`)
    const photoResponse = await fetch(
      `${baseUrl}/api/v1/uploads/not-a-real-upload/photo`,
    )
    expect(userResponse.status).toBe(401)
    expect(photoResponse.status).toBe(401)
  })

  it("requires authentication on each knowledge-engine route", async () => {
    const evidence = await fetch(`${baseUrl}/api/v1/watersheds/evidence-a/evidence`)
    const satellite = await fetch(`${baseUrl}/api/v1/watersheds/evidence-a/satellite`)
    const createIntervention = await fetch(`${baseUrl}/api/v1/interventions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const updateIntervention = await fetch(`${baseUrl}/api/v1/interventions/missing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(evidence.status).toBe(401)
    expect(satellite.status).toBe(401)
    expect(createIntervention.status).toBe(401)
    expect(updateIntervention.status).toBe(401)
  })

  it("returns watershed-scoped evidence and an empty satellite list", async () => {
    const { pool } = await import("../database.ts")
    await pool.query(`
      INSERT INTO watersheds (id, payload, boundary, source, demo)
      VALUES
        ('evidence-a', '{"name":"Evidence A"}',
         ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))', 4326), 'test', false),
        ('evidence-b', '{"name":"Evidence B"}',
         ST_GeomFromText('POLYGON((2 2,3 2,3 3,2 3,2 2))', 4326), 'test', false)
    `)
    await pool.query(`
      INSERT INTO assets (id, watershed_id, payload, location, source, demo)
      VALUES
        ('asset-a', 'evidence-a', '{"type":"Check dam","name":"A"}',
         ST_SetSRID(ST_MakePoint(0.5, 0.5), 4326), 'test', false),
        ('asset-b', 'evidence-b', '{"type":"Farm pond","name":"B"}',
         ST_SetSRID(ST_MakePoint(2.5, 2.5), 4326), 'test', false)
    `)
    await pool.query(`
      INSERT INTO field_observations
        (id, watershed_id, payload_hash, payload, location, created_at,
         officer_id, asset_id, asset_type, inspection_date,
         verification_status, source, demo)
      VALUES ('observation-a', 'evidence-a', 'hash-a', '{}',
              ST_SetSRID(ST_MakePoint(0.5, 0.5), 4326), now(),
              'officer-a', 'asset-a', 'Check dam', CURRENT_DATE,
              'Pending review', 'test-observation', false)
    `)
    await pool.query(`
      INSERT INTO interventions
        (id, payload, watershed_id, status, source, source_licence, demo)
      VALUES ('intervention-a', '{"type":"Restoration","progress":30}',
              'evidence-a', 'Planned', 'test-intervention', 'test licence', false)
    `)
    await pool.query(`
      INSERT INTO land_use
        (id, watershed_id, class_name, area_ha, pct, reference_year, source, demo)
      VALUES ('land-a', 'evidence-a', 'forest', 12, 60, 2024, 'test-land', false)
    `)
    await pool.query(`
      INSERT INTO drainage
        (watershed_id, stream_length_km, drainage_density_km_per_km2, source, demo)
      VALUES ('evidence-a', 2, 0.2, 'test-drainage', false)
    `)

    const { loadEvidence } = await import("../evidence.ts")
    const evidence = await loadEvidence("evidence-a")
    expect(evidence?.watershed.id).toBe("evidence-a")
    expect(evidence?.assets.map(({ id }) => id)).toEqual(["asset-a"])
    expect(evidence?.assets[0]).toMatchObject({ source: "test", demo: false })
    expect(evidence?.observations[0]).toMatchObject({
      id: "observation-a",
      source: "test-observation",
      demo: false,
    })
    expect(evidence?.interventions[0]).toMatchObject({
      id: "intervention-a",
      source: "test-intervention",
      demo: false,
    })
    expect(evidence?.satellite).toEqual([])
    expect(evidence?.landUse[0]).toMatchObject({
      class: "forest",
      source: "test-land",
      demo: false,
    })
    expect(evidence?.drainage).toMatchObject({
      source: "test-drainage",
      demo: false,
    })
  })

  it("requires an install date to complete an intervention and records history", async () => {
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.kid = "integration-key"
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(".well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })
      }
      if (url.includes("/rest/v1/officers")) {
        return new Response(JSON.stringify([
          { id: "officer-a", officer_code: "OFF-A", name: "Officer A", status: "active" },
        ]), { status: 200 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }))
    const { clearAuthCache } = await import("../auth.ts")
    clearAuthCache()
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "integration-key" })
      .setIssuedAt()
      .setIssuer(`${testServerEnv.supabaseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("officer-a")
      .setExpirationTime("5m")
      .sign(keyPair.privateKey)

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
    const incompleteCreate = await nativeFetch(`${baseUrl}/api/v1/interventions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        watershedId: "evidence-a",
        name: "Test intervention",
        type: "Restoration",
        status: "Completed",
      }),
    })
    expect(incompleteCreate.status).toBe(422)

    const createdResponse = await nativeFetch(`${baseUrl}/api/v1/interventions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        watershedId: "evidence-a",
        name: "Test intervention",
        type: "Restoration",
        status: "Planned",
      }),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json() as { id: string; demo: boolean }
    expect(created.demo).toBe(false)

    const incompleteUpdate = await nativeFetch(
      `${baseUrl}/api/v1/interventions/${created.id}`,
      { method: "PATCH", headers, body: JSON.stringify({ status: "Completed" }) },
    )
    expect(incompleteUpdate.status).toBe(422)

    const completedUpdate = await nativeFetch(
      `${baseUrl}/api/v1/interventions/${created.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "Completed", installedAt: "2026-10-01" }),
      },
    )
    expect(completedUpdate.status).toBe(200)
    const { pool } = await import("../database.ts")
    const history = await pool.query(
      "SELECT from_status, to_status FROM intervention_status_history WHERE intervention_id = $1 ORDER BY id",
      [created.id],
    )
    expect(history.rows).toEqual([
      { from_status: null, to_status: "Planned" },
      { from_status: "Planned", to_status: "Completed" },
    ])
    vi.unstubAllGlobals()
  })

  it("rejects client-supplied facts and persists the server fact set", async () => {
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.kid = "integration-key"
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(".well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })
      }
      if (url.includes("/rest/v1/officers")) {
        return new Response(JSON.stringify([
          { id: "officer-a", officer_code: "OFF-A", name: "Officer A", status: "active" },
        ]), { status: 200 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }))
    const { clearAuthCache } = await import("../auth.ts")
    clearAuthCache()
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "integration-key" })
      .setIssuedAt()
      .setIssuer(`${testServerEnv.supabaseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("officer-a")
      .setExpirationTime("5m")
      .sign(keyPair.privateKey)
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }

    const clientFactsResponse = await nativeFetch(
      `${baseUrl}/api/v1/watersheds/evidence-a/report`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ facts: [{ id: "made-up", value: 123 }] }),
      },
    )
    expect(clientFactsResponse.status).toBe(422)
    expect(generateJson).not.toHaveBeenCalled()

    vi.mocked(generateJson).mockResolvedValueOnce({
      result: {
        claims: [{
          text: "The report uses the recorded watershed area.",
          factIds: ["watershed.area_km2"],
        }],
      },
      modelUsed: "test-model",
    })
    const generatedResponse = await nativeFetch(
      `${baseUrl}/api/v1/watersheds/evidence-a/report`,
      { method: "POST", headers, body: JSON.stringify({ language: "en" }) },
    )
    expect(generatedResponse.status).toBe(201)
    const generated = await generatedResponse.json() as {
      id: string
      factSet: { facts: Array<{ id: string }> }
      factSetSha256: string
    }
    expect(generated.factSet.facts.some(({ id }) => id === "sat.ndvi.current.mean")).toBe(true)

    const savedResponse = await nativeFetch(
      `${baseUrl}/api/v1/reports/${generated.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(savedResponse.status).toBe(200)
    const saved = await savedResponse.json() as typeof generated
    expect(saved.factSetSha256).toBe(generated.factSetSha256)
    expect(saved.factSet).toEqual(generated.factSet)
    vi.unstubAllGlobals()
  })

  it("queues validated analysis with server-derived windows and supports polling", async () => {
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.kid = "integration-key"
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(".well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })
      }
      if (url.includes("/rest/v1/officers")) {
        return new Response(JSON.stringify([
          { id: "officer-a", officer_code: "OFF-A", name: "Officer A", status: "active" },
        ]), { status: 200 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }))
    const { clearAuthCache } = await import("../auth.ts")
    clearAuthCache()
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "integration-key" })
      .setIssuedAt()
      .setIssuer(`${testServerEnv.supabaseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("officer-a")
      .setExpirationTime("5m")
      .sign(keyPair.privateKey)
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
    const response = await nativeFetch(`${baseUrl}/api/v1/analytics`, {
      method: "POST",
      headers,
      body: JSON.stringify({ watershedId: "evidence-a", type: "NDVI" }),
    })
    expect(response.status).toBe(201)
    const job = await response.json() as {
      id: string
      status: string
      params: { windows: { baseline: { start: string }; current: { start: string } } }
    }
    expect(job.status).toBe("Queued")
    expect(job.params.windows.baseline.start).toMatch(/^\d{4}-11-01$/)
    expect(job.params.windows.current.start).toMatch(/^\d{4}-11-01$/)

    const polled = await nativeFetch(`${baseUrl}/api/v1/analytics/jobs/${job.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(polled.status).toBe(200)
    expect(await polled.json()).toMatchObject({
      id: job.id,
      watershedId: "evidence-a",
      status: "queued",
      attempts: 0,
    })
    vi.unstubAllGlobals()
  })

  it("re-derives upload trust, rejects duplicates, detects spatial/travel flags, and gates overrides", async () => {
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.kid = "integration-key"
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(".well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })
      }
      if (url.includes("/rest/v1/officers")) {
        const subject = new URL(url).searchParams.get("id")?.replace("eq.", "")
        return new Response(subject === "government-a" ? "[]" : JSON.stringify([
          { id: subject, officer_code: "OFF-A", name: "Officer A", status: "active" },
        ]), { status: 200 })
      }
      if (url.includes("/rest/v1/government_admins")) {
        return new Response(JSON.stringify([
          { id: "government-a", name: "Government A", status: "active" },
        ]), { status: 200 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }))
    const { clearAuthCache } = await import("../auth.ts")
    const { pool } = await import("../database.ts")
    clearAuthCache()
    const tokenFor = async (subject: string) => new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "integration-key" })
      .setIssuedAt()
      .setIssuer(`${testServerEnv.supabaseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject(subject)
      .setExpirationTime("5m")
      .sign(keyPair.privateKey)
    const requestUpload = async (subject: string, payload: Record<string, unknown>) =>
      nativeFetch(`${baseUrl}/api/v1/uploads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await tokenFor(subject)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

    const spoofed = await requestUpload("officer-a", {
      id: "server-trust-upload",
      watershedId: "evidence-a",
      assetType: "Farm pond",
      inspectionDate: "2026-10-19",
      location: { type: "Point", coordinates: [0.5, 0.5], source: "manual" },
      officerId: "spoofed-officer",
      officerName: "Spoofed",
      verificationStatus: "Verified",
      exif: { hasGps: true, takenAt: "2026-10-19" },
      trust: { status: "Consistent", reasons: [] },
      auditHistory: [{ actor: "spoofed", action: "verified" }],
    })
    expect(spoofed.status).toBe(201)
    const saved = await spoofed.json() as {
      officerId: string
      verificationStatus: string
      exif: { hasGps: boolean }
      trust: { reasons: Array<{ code: string }> }
    }
    expect(saved.officerId).toBe("officer-a")
    expect(saved.verificationStatus).toBe("Flagged")
    expect(saved.exif.hasGps).toBe(false)
    expect(saved.trust.reasons.map(({ code }) => code)).toContain("image_missing")
    const storedResult = await pool.query(
      `SELECT engine, status, rules_version FROM verification_results
       WHERE observation_id = 'server-trust-upload'`,
    )
    expect(storedResult.rows).toEqual([
      { engine: "server", status: "Flagged", rules_version: "1" },
    ])

    const officerVerify = await nativeFetch(
      `${baseUrl}/api/v1/uploads/server-trust-upload/verify`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await tokenFor("officer-a")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verificationStatus: "Verified" }),
      },
    )
    expect(officerVerify.status).toBe(409)

    const governmentVerify = await nativeFetch(
      `${baseUrl}/api/v1/uploads/server-trust-upload/verify`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await tokenFor("government-a")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verificationStatus: "Verified",
          overrideReason: "Reviewed original field evidence.",
        }),
      },
    )
    expect(governmentVerify.status).toBe(200)
    const audit = await pool.query(
      `SELECT actor, action, reason FROM audit_history
       WHERE observation_id = 'server-trust-upload'`,
    )
    expect(audit.rows).toEqual([{
      actor: "government-a",
      action: "government_override_verify",
      reason: "Reviewed original field evidence.",
    }])

    const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/d3sAAAAASUVORK5CYII="
    const firstImage = await requestUpload("officer-b", {
      id: "duplicate-image-a",
      watershedId: "evidence-a",
      assetType: "Farm pond",
      inspectionDate: "2026-10-19",
      location: { type: "Point", coordinates: [0.5, 0.5], source: "manual" },
      imageDataUrl: pngDataUrl,
    })
    expect(firstImage.status).toBe(201)
    const duplicateImage = await requestUpload("officer-b", {
      id: "duplicate-image-b",
      watershedId: "evidence-a",
      assetType: "Farm pond",
      inspectionDate: "2026-10-19",
      location: { type: "Point", coordinates: [0.5, 0.5], source: "manual" },
      imageDataUrl: pngDataUrl,
    })
    expect(duplicateImage.status).toBe(409)
    expect(await duplicateImage.json()).toMatchObject({ code: "duplicate_image" })

    const outside = await requestUpload("officer-c", {
      id: "outside-watershed-upload",
      watershedId: "evidence-a",
      assetType: "Farm pond",
      inspectionDate: "2026-10-19",
      location: { type: "Point", coordinates: [1.5, 1.5], source: "manual" },
    })
    expect(outside.status).toBe(201)
    expect((await outside.json()).trust.reasons).toContainEqual(
      expect.objectContaining({ code: "outside_watershed", severity: "critical" }),
    )

    await pool.query(`
      INSERT INTO watersheds (id, payload, boundary, source, demo)
      VALUES ('travel-ws', '{"name":"Travel watershed"}',
              ST_GeomFromText('POLYGON((0 0,4 0,4 4,0 4,0 0))', 4326), 'test', false)
    `)
    await pool.query(`
      INSERT INTO field_observations
        (id, watershed_id, payload_hash, payload, location, created_at, officer_id)
      VALUES ('travel-first', 'travel-ws', 'travel-hash', '{}',
              ST_SetSRID(ST_MakePoint(0.25, 0.25), 4326), now() - interval '10 minutes',
              'traveler')
    `)
    const travel = await requestUpload("traveler", {
      id: "travel-second",
      watershedId: "travel-ws",
      assetType: "Farm pond",
      inspectionDate: "2026-10-19",
      location: { type: "Point", coordinates: [3.75, 3.75], source: "manual" },
    })
    expect(travel.status).toBe(201)
    expect((await travel.json()).trust.reasons).toContainEqual(
      expect.objectContaining({ code: "impossible_travel", severity: "critical" }),
    )
    vi.unstubAllGlobals()
  })

  it("runs the stitched upload-to-saved-report workflow with record citations", async () => {
    const publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.kid = "integration-key"
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(".well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })
      }
      if (url.includes("/rest/v1/officers")) {
        return new Response(JSON.stringify([
          { id: "officer-e2e", officer_code: "OFF-E2E", name: "Officer E2E", status: "active" },
        ]), { status: 200 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }))
    const { clearAuthCache } = await import("../auth.ts")
    const { pool } = await import("../database.ts")
    clearAuthCache()
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "integration-key" })
      .setIssuedAt()
      .setIssuer(`${testServerEnv.supabaseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("officer-e2e")
      .setExpirationTime("5m")
      .sign(keyPair.privateKey)
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }

    const upload = await nativeFetch(`${baseUrl}/api/v1/uploads`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: "e2e-observation",
        watershedId: "evidence-a",
        assetType: "Farm pond",
        inspectionDate: "2026-10-19",
        location: { type: "Point", coordinates: [0.5, 0.5], source: "manual" },
      }),
    })
    expect(upload.status).toBe(201)

    const intervention = await nativeFetch(`${baseUrl}/api/v1/interventions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        watershedId: "evidence-a",
        name: "E2E restoration",
        type: "Restoration",
        status: "In progress",
      }),
    })
    expect(intervention.status).toBe(201)

    const jobResponse = await nativeFetch(`${baseUrl}/api/v1/analytics`, {
      method: "POST",
      headers,
      body: JSON.stringify({ watershedId: "evidence-a", type: "NDVI" }),
    })
    expect(jobResponse.status).toBe(201)
    const job = await jobResponse.json() as { id: string }
    const measurementBase = {
      watershed_id: "evidence-a",
      aoi_scope: "watershed",
      index_type: "NDVI",
      season_label: "Nov-Dec",
      median: 0.45,
      p10: 0.3,
      p90: 0.6,
      std: 0.1,
      valid_pixel_pct: 85,
      scene_count: 2,
      scene_ids: ["e2e-scene"],
      cloud_limit_pct: 30,
      method: "Synthetic integration fixture, not worker output",
      resolution_m: 10,
      status: "measured",
      job_id: job.id,
      source: "test satellite fixture",
      source_licence: "test fixture licence",
      attribution: "Synthetic integration fixture",
      demo: false,
    }
    await pool.query(
      `INSERT INTO satellite_measurements
         (id, watershed_id, aoi_scope, index_type, window_role, window_start,
          window_end, season_label, mean, median, p10, p90, std, valid_pixel_pct,
          scene_count, scene_ids, cloud_limit_pct, method, resolution_m, status,
          job_id, source, source_licence, attribution, demo)
       VALUES
         ('e2e-sat-baseline', $1, $2, $3, 'baseline', '2024-11-01', '2024-12-31',
          $4, 0.4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, false),
         ('e2e-sat-current', $1, $2, $3, 'current', '2025-11-01', '2025-12-31',
          $4, 0.6, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, false)`,
      [
        measurementBase.watershed_id, measurementBase.aoi_scope,
        measurementBase.index_type, measurementBase.season_label,
        measurementBase.median, measurementBase.p10, measurementBase.p90,
        measurementBase.std, measurementBase.valid_pixel_pct,
        measurementBase.scene_count, measurementBase.scene_ids,
        measurementBase.cloud_limit_pct, measurementBase.method,
        measurementBase.resolution_m, measurementBase.status,
        measurementBase.job_id, measurementBase.source,
        measurementBase.source_licence, measurementBase.attribution,
      ],
    )

    vi.mocked(generateJson).mockResolvedValueOnce({
      result: {
        claims: [{
          text: "A measured NDVI difference is available between the seasonal windows.",
          factIds: ["sat.ndvi.delta.yoy"],
        }],
      },
      modelUsed: "test-model",
    })
    const reportResponse = await nativeFetch(
      `${baseUrl}/api/v1/watersheds/evidence-a/report`,
      { method: "POST", headers, body: JSON.stringify({ language: "en" }) },
    )
    expect(reportResponse.status).toBe(201)
    const report = await reportResponse.json() as {
      id: string
      factSet: { facts: Array<{ id: string; recordIds: string[] }> }
      gaps: Array<{ code: string }>
    }
    const trend = report.factSet.facts.find(({ id }) => id === "sat.ndvi.delta.yoy")
    expect(trend?.recordIds).toEqual(["e2e-sat-baseline", "e2e-sat-current"])
    expect(report.gaps.map(({ code }) => code)).toContain("rainfall_normalisation_missing")
    const saved = await nativeFetch(`${baseUrl}/api/v1/reports/${report.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(saved.status).toBe(200)
    expect((await saved.json()).factSet).toEqual(report.factSet)
    vi.unstubAllGlobals()
  })
})