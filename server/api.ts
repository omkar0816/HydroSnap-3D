import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import cors from "cors"
import { rateLimit } from "express-rate-limit"
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express"
import { pool } from "./database.ts"
import { requireAuth, requireOfficer } from "./auth.ts"
import { loadEvidence, loadSatelliteMeasurements } from "./evidence.ts"
import { generateWatershedReport, reportRequestSchema, ReportGenerationError } from "./report/generate.ts"
import { LlmError } from "./llm.ts"
import { parseImageExif, verifyUpload } from "./verification.ts"
import { analysisRequestSchema } from "./satellite/request.ts"
import { interventionWindows, seasonMatchedWindows, DEFAULT_SEASON } from "./satellite/windows.ts"
import { serverEnv } from "./env.ts"
import {
  asRecord,
  HttpError,
  interventionCreateSchema,
  interventionUpdateSchema,
  lineGeometry,
  parseRequest,
  pointCoordinates,
  polygonGeometry,
  RequestValidationError,
  requireFields,
  requireText,
} from "./validation.ts"

const app = express()
const uploadRoot = path.resolve(serverEnv.uploadDirectory)
const maxImageBytes = 20 * 1024 * 1024
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ code: "rate_limited", detail: "Too many uploads. Try again later." })
  },
})
const reportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ code: "rate_limited", detail: "Too many report requests. Try again later." })
  },
})

app.disable("x-powered-by")
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || serverEnv.corsOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error("Origin is not allowed by CORS."))
      }
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
)
app.use(express.json({ limit: "28mb", strict: true }))

function apiUrl(request: Request, route: string): string {
  const origin =
    serverEnv.publicUrl ??
    `${request.protocol}://${request.get("host") ?? `localhost:${serverEnv.port}`}`
  return `${origin}${route}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function dataUrlImage(
  value: unknown,
): { bytes: Buffer; extension: string } | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new RequestValidationError(
      "imageDataUrl must be a base64 image data URL.",
    )
  }
  const match =
    /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      value,
    )
  if (!match || match[2].length % 4 !== 0) {
    throw new RequestValidationError(
      "imageDataUrl must contain a supported base64 image.",
    )
  }
  const bytes = Buffer.from(match[2], "base64")
  if (
    !bytes.length ||
    bytes.length > maxImageBytes ||
    bytes.toString("base64") !== match[2]
  ) {
    throw new RequestValidationError(
      "Image must be non-empty and no larger than 20 MB.",
    )
  }
  const mime = match[1]
  const hasMatchingSignature =
    (mime === "image/jpeg" &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (mime === "image/png" &&
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === "image/gif" &&
      ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) ||
    (mime === "image/webp" &&
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP") ||
    (mime === "image/avif" &&
      bytes.length >= 12 &&
      bytes.toString("ascii", 4, 12).includes("ftyp") &&
      /avif|avis/.test(bytes.toString("ascii", 8, 16)))
  if (!hasMatchingSignature) {
    throw new RequestValidationError(
      "Image bytes do not match the declared image format.",
    )
  }
  const extensionByMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  }
  return { bytes, extension: extensionByMime[match[1]] }
}

function photoDataUrl(
  request: Request,
  id: string,
  imagePath: string | null,
  imageSha256: string | null,
) {
  return imagePath
    ? {
        imageDataUrl: apiUrl(
          request,
          `/api/v1/uploads/${encodeURIComponent(id)}/photo`,
        ),
        ...(imageSha256 ? { imageSha256 } : {}),
      }
    : {}
}

function queryCoordinates(request: Request): [number, number] {
  const longitude = request.query.longitude
  const latitude = request.query.latitude
  if (
    typeof longitude !== "string" ||
    !longitude.trim() ||
    typeof latitude !== "string" ||
    !latitude.trim()
  ) {
    throw new RequestValidationError(
      "longitude and latitude query values are required.",
    )
  }
  return pointCoordinates({
    type: "Point",
    coordinates: [Number(longitude), Number(latitude)],
  })
}

function rowPayload(request: Request, row: Record<string, unknown>) {
  const payload = row.payload as Record<string, unknown>
  return {
    ...payload,
    ...photoDataUrl(
      request,
      String(row.id),
      (row.image_path as string | null) ?? null,
      (row.image_sha256 as string | null) ?? null,
    ),
  }
}

function ensureValidGeometry(geometry: Record<string, unknown>) {
  return pool.query<{ valid: boolean; reason: string | null }>(
    `SELECT
       ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS valid,
       ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS reason`,
    [JSON.stringify(geometry)],
  )
}

app.get("/health", async (_request, response) => {
  await pool.query("SELECT 1")
  response.json({ status: "ok", database: "connected" })
})

app.get("/api/v1/users/me", requireAuth, (request, response) => {
  response.json({
    id: request.user?.id ?? "usr-001",
    name: request.user?.name ?? "HydroSnap Officer",
    email: "ananya.deshmukh@example.gov.in",
    role: request.user?.role ?? "officer",
    initials: (request.user?.name ?? "HO")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "HO",
  })
})

app.get("/api/v1/users/team", requireAuth, async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM users ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/watersheds", requireAuth, async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM watersheds ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/watersheds/:id/evidence", requireAuth, async (request, response) => {
  const watershedId = requireText(request.params.id, "watershed id")
  const evidence = await loadEvidence(watershedId)
  if (!evidence) throw new HttpError("Watershed was not found.", 404)
  response.json(evidence)
})

app.get("/api/v1/watersheds/:id/satellite", requireAuth, async (request, response) => {
  const watershedId = requireText(request.params.id, "watershed id")
  const { rows } = await pool.query("SELECT 1 FROM watersheds WHERE id = $1", [watershedId])
  if (!rows[0]) throw new HttpError("Watershed was not found.", 404)
  response.json(await loadSatelliteMeasurements(watershedId))
})

app.get("/api/v1/watersheds/:id/reports", requireAuth, async (request, response) => {
  const watershedId = requireText(request.params.id, "watershed id")
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", created_by AS "createdBy",
            created_at::text AS "createdAt", fact_set_sha256 AS "factSetSha256",
            model, validator_version AS "validatorVersion", language
     FROM watershed_reports WHERE watershed_id = $1 ORDER BY created_at DESC`,
    [watershedId],
  )
  response.json(rows)
})

app.post("/api/v1/watersheds/:id/report", reportRateLimit, requireOfficer, async (request, response) => {
  const watershedId = requireText(request.params.id, "watershed id")
  const input = parseRequest(reportRequestSchema, request.body ?? {})
  const evidence = await loadEvidence(watershedId)
  if (!evidence) throw new HttpError("Watershed was not found.", 404)
  try {
    const report = await generateWatershedReport(evidence, input.language)
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO watershed_reports
         (id, watershed_id, created_by, fact_set, fact_set_sha256, claims,
          gaps, rendered_markdown, model, validator_version, language)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb,
               $8, $9, $10, $11)
       RETURNING id, watershed_id AS "watershedId",
                 created_by AS "createdBy", created_at::text AS "createdAt",
                 fact_set AS "factSet", fact_set_sha256 AS "factSetSha256",
                 claims, gaps, rendered_markdown AS "renderedMarkdown",
                 model, validator_version AS "validatorVersion", language`,
      [
        id,
        watershedId,
        request.user!.id,
        JSON.stringify(report.factSet),
        report.factSetSha256,
        JSON.stringify(report.claims),
        JSON.stringify(report.gaps),
        report.renderedMarkdown,
        report.model,
        "2",
        input.language,
      ],
    )
    response.status(201).json(rows[0])
  } catch (error) {
    if (error instanceof ReportGenerationError) {
      response.status(422).json({ detail: error.message, errors: error.errors })
      return
    }
    if (error instanceof LlmError) {
      throw new HttpError(error.message, error.status)
    }
    throw error
  }
})

app.post("/api/v1/watersheds", requireOfficer, async (request, response) => {
  const body = asRecord(request.body)
  requireFields(body, ["id", "name", "code", "district", "state", "source"])
  const boundary = asRecord(
    body.boundary,
    "boundary must be a GeoJSON Feature.",
  )
  if (boundary.type !== "Feature") {
    throw new RequestValidationError("boundary must be a GeoJSON Feature.")
  }
  const geometry = polygonGeometry(boundary.geometry)
  const { rows: validity } = await ensureValidGeometry(geometry)
  if (!validity[0]?.valid) {
    throw new RequestValidationError(
      `Watershed boundary is invalid: ${validity[0]?.reason ?? "unknown reason"}.`,
    )
  }
  const id = requireText(body.id, "id")
  try {
    await pool.query(
      `INSERT INTO watersheds (id, payload, boundary)
       VALUES ($1, $2::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))`,
      [id, JSON.stringify(body), JSON.stringify(geometry)],
    )
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError("Watershed id already exists.", 409)
    throw error
  }
  response.status(201).json(body)
})

app.get("/api/v1/layers", requireAuth, async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM map_layers ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/satellite/timeline", requireAuth, async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM satellite_timeline ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/assets", requireAuth, async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM assets ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.post("/api/v1/assets", requireOfficer, async (request, response) => {
  const body = asRecord(request.body)
  requireFields(body, [
    "id",
    "name",
    "type",
    "watershedId",
    "status",
    "lastInspected",
  ])
  const [longitude, latitude] = pointCoordinates(body.location)
  try {
    await pool.query(
      `INSERT INTO assets
        (id, watershed_id, payload, location, installed_at, source,
         source_licence, demo)
       VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_MakePoint($4, $5), 4326),
            $6, 'officer-entry', 'Officer supplied; no external licence', false)`,
      [
        requireText(body.id, "id"),
        requireText(body.watershedId, "watershedId"),
        JSON.stringify(body),
        longitude,
        latitude,
        body.installedAt ?? null,
      ],
    )
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError("Asset id already exists.", 409)
    throw error
  }
  response.status(201).json(body)
})

app.get("/api/v1/uploads", requireAuth, async (request, response) => {
  const { rows } = await pool.query(
    `SELECT id, payload, image_path, image_sha256
     FROM field_observations ORDER BY created_at DESC`,
  )
  response.json(rows.map((row) => rowPayload(request, row)))
})

app.get("/api/v1/uploads/:observationId/photo", requireAuth, async (request, response) => {
  const { rows } = await pool.query<{ image_path: string | null }>(
    "SELECT image_path FROM field_observations WHERE id = $1",
    [request.params.observationId],
  )
  const imagePath = rows[0]?.image_path
  if (!imagePath) throw new HttpError("Photo was not found.", 404)
  const resolved = path.resolve(uploadRoot, imagePath)
  if (!resolved.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new HttpError("Photo path is invalid.", 500)
  }
  response.sendFile(resolved, (error) => {
    if (error && !response.headersSent) {
      const status =
        "statusCode" in error &&
        typeof error.statusCode === "number" &&
        error.statusCode >= 400 &&
        error.statusCode < 600
          ? error.statusCode
          : 404
      response.status(status).end()
    }
  })
})

app.post("/api/v1/uploads", uploadRateLimit, requireOfficer, async (request, response) => {
  const body = asRecord(request.body)
  requireFields(body, [
    "id",
    "watershedId",
    "assetType",
    "inspectionDate",
  ])
  const assetType = requireText(body.assetType, "assetType")
  if (!(["Check dam", "Farm pond", "Plantation", "Percolation tank"] as string[]).includes(assetType)) {
    throw new RequestValidationError("assetType is unsupported.")
  }
  const inspectionDate = requireText(body.inspectionDate, "inspectionDate")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate) || Number.isNaN(Date.parse(inspectionDate))) {
    throw new RequestValidationError("inspectionDate must be an ISO calendar date.")
  }
  const [longitude, latitude] = pointCoordinates(body.location)
  if (body.assetId !== undefined && body.assetId !== null) {
    requireText(body.assetId, "assetId")
  }
  const decodedImage = dataUrlImage(body.imageDataUrl)
  const computedImageHash = decodedImage
    ? sha256(decodedImage.bytes)
    : undefined
  const hashMismatch = Boolean(
    decodedImage && typeof body.imageSha256 === "string" &&
    body.imageSha256.toLowerCase() !== computedImageHash,
  )
  const parsedExif = await parseImageExif(decodedImage?.bytes)
  const id = requireText(body.id, "id")
  const idempotencyKey =
    request.header("Idempotency-Key") ??
    body.idempotencyKey as string | undefined ??
    id
  requireText(idempotencyKey, "Idempotency-Key")
  if (idempotencyKey.length > 200) {
    throw new RequestValidationError(
      "Idempotency-Key must be 200 characters or fewer.",
    )
  }
  const idempotencyPayload = { ...body }
  for (const untrustedField of [
    "trust", "exif", "officerId", "officerName", "verificationStatus",
    "createdAt", "auditHistory", "imageDataUrl", "imageSha256",
  ]) delete idempotencyPayload[untrustedField]
  const payloadHash = sha256(stableJson({
    ...idempotencyPayload,
    imageSha256: computedImageHash ?? null,
  }))
  const client = await pool.connect()
  let writtenFile: string | undefined
  try {
    await client.query("BEGIN")
    const existing = await client.query<{
      id: string
      payload_hash: string
      payload: Record<string, unknown>
      image_path: string | null
      image_sha256: string | null
    }>(
      `SELECT id, payload_hash, payload, image_path, image_sha256
       FROM field_observations WHERE idempotency_key = $1`,
      [idempotencyKey],
    )
    if (existing.rows[0]) {
      if (existing.rows[0].payload_hash !== payloadHash) {
        throw new HttpError(
          "Idempotency-Key was already used for a different upload.",
          409,
        )
      }
      await client.query("COMMIT")
      response.json(rowPayload(request, existing.rows[0]))
      return
    }

    if (computedImageHash) {
      const duplicate = await client.query(
        "SELECT id FROM field_observations WHERE image_sha256 = $1 LIMIT 1",
        [computedImageHash],
      )
      if (duplicate.rows[0]) {
        await client.query("ROLLBACK")
        response.status(409).json({
          code: "duplicate_image",
          detail: "An observation with these image bytes already exists.",
          duplicateObservationId: duplicate.rows[0].id,
        })
        return
      }
    }

    if (body.assetId) {
      const asset = await client.query(
        "SELECT 1 FROM assets WHERE id = $1 AND watershed_id = $2",
        [body.assetId, body.watershedId],
      )
      if (!asset.rows[0]) {
        throw new HttpError("assetId does not belong to the selected watershed.", 422)
      }
    }
    const verification = await verifyUpload({
      client,
      watershedId: String(body.watershedId),
      longitude,
      latitude,
      officerId: request.user!.id,
      assetType,
      assetId: typeof body.assetId === "string" ? body.assetId : undefined,
      inspectionDate,
      locationSource: asRecord(body.location).source as string | undefined,
      reportedAccuracyMeters:
        typeof asRecord(body.location).accuracyMeters === "number"
          ? asRecord(body.location).accuracyMeters as number
          : undefined,
      imageMissing: !decodedImage,
      hashMismatch,
      duplicateImage: false,
      exif: parsedExif,
    })
    const createdAt = new Date().toISOString()
    const storedPayload = {
      ...idempotencyPayload,
      id,
      watershedId: body.watershedId,
      assetType,
      inspectionDate,
      createdAt,
      officerId: request.user!.id,
      officerName: request.user!.name ?? "",
      verificationStatus: verification.status,
      auditHistory: [],
      exif: parsedExif.summary,
      trust: verification.preview,
      ...(computedImageHash ? { imageSha256: computedImageHash } : {}),
    }

    let imagePath: string | null = null
    if (decodedImage && computedImageHash) {
      await mkdir(uploadRoot, { recursive: true })
      imagePath = `${randomUUID()}${decodedImage.extension}`
      writtenFile = path.resolve(uploadRoot, imagePath)
      await writeFile(writtenFile, decodedImage.bytes, { flag: "wx" })
    }
    const { rows } = await client.query(
      `INSERT INTO field_observations
         (id, watershed_id, idempotency_key, payload_hash, payload,
         image_path, image_sha256, location, created_at, officer_id, asset_id,
         asset_type, inspection_date, verification_status, source,
         source_licence, demo)
       VALUES
         ($1, $2, $3, $4, $5::jsonb, $6, $7,
         ST_SetSRID(ST_MakePoint($8, $9), 4326), $10::timestamptz,
         $11, $12, $13, $14::date, $15, 'officer-field-photo',
         'Officer supplied; no external licence', false)
       RETURNING id, payload, image_path, image_sha256`,
      [
        id,
        requireText(body.watershedId, "watershedId"),
        idempotencyKey,
        payloadHash,
        JSON.stringify(storedPayload),
        imagePath,
        computedImageHash ?? null,
        longitude,
        latitude,
        createdAt,
        request.user!.id,
        body.assetId ?? null,
        assetType,
        inspectionDate,
        verification.status,
      ],
    )
    await client.query(
      `INSERT INTO verification_results
         (observation_id, engine, status, flags, rules_version)
       VALUES ($1, 'server', $2, $3::jsonb, $4)`,
      [id, verification.status, JSON.stringify(verification.flags), verification.rulesVersion],
    )
    if (!body.assetId) {
      const assetPayload = {
        id,
        name: body.village
          ? `${String(body.village)} ${String(body.assetType)}`
          : String(body.assetType),
        type: body.assetType,
        watershedId: body.watershedId,
        location: body.location,
        status: verification.status,
        lastInspected: inspectionDate,
        village: typeof body.village === "string" ? body.village : "",
        description:
          typeof body.description === "string" ? body.description : "",
        ...(imagePath
          ? {
              imageUrl: apiUrl(
                request,
                `/api/v1/uploads/${encodeURIComponent(id)}/photo`,
              ),
            }
          : {}),
      }
      await client.query(
        `INSERT INTO assets
           (id, watershed_id, payload, location, source, source_licence, demo)
         VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_MakePoint($4, $5), 4326),
           'officer-entry', 'Officer supplied; no external licence', false)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          body.watershedId,
          JSON.stringify(assetPayload),
          longitude,
          latitude,
        ],
      )
    }
    await client.query("COMMIT")
    response.status(201).json(rowPayload(request, rows[0]))
  } catch (error) {
    await client.query("ROLLBACK")
    if (writtenFile)
      await unlink(writtenFile).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT") throw cleanupError
      })
    if (isUniqueViolation(error)) {
      if (
        typeof error === "object" && error !== null &&
        "constraint" in error &&
        error.constraint === "field_obs_sha_uidx"
      ) {
        response.status(409).json({
          code: "duplicate_image",
          detail: "An observation with these image bytes already exists.",
        })
        return
      }
      throw new HttpError(
        "An upload with this id or idempotency key already exists.",
        409,
      )
    }
    throw error
  } finally {
    client.release()
  }
})

app.patch(
  "/api/v1/uploads/:observationId/verify",
  requireAuth,
  async (request, response) => {
    const body = asRecord(request.body)
    if (body.verificationStatus !== "Verified") {
      throw new RequestValidationError("verificationStatus must be Verified.")
    }
    const overrideReason = typeof body.overrideReason === "string"
      ? body.overrideReason.trim()
      : ""
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const existing = await client.query(
        `SELECT id, payload, image_path, image_sha256
       FROM field_observations WHERE id = $1 FOR UPDATE`,
        [request.params.observationId],
      )
      const row = existing.rows[0]
      if (!row) throw new HttpError("Field observation was not found.", 404)
      const latestResult = await client.query<{ flags: Array<{ severity?: string }> }>(
        `SELECT flags FROM verification_results
         WHERE observation_id = $1 AND engine = 'server'
         ORDER BY computed_at DESC, id DESC LIMIT 1`,
        [request.params.observationId],
      )
      const hasCritical = latestResult.rows[0]?.flags.some(
        (flag) => flag.severity === "critical",
      ) ?? false
      if (hasCritical && !(request.user?.role === "government" && overrideReason)) {
        throw new HttpError(
          "Critical server verification flags require a government override reason.",
          409,
        )
      }
      const payload = row.payload as Record<string, unknown>
      const auditHistory = Array.isArray(payload.auditHistory)
        ? payload.auditHistory
        : []
      const updated = {
        ...payload,
        verificationStatus: "Verified",
        auditHistory: [
          ...auditHistory,
          {
            action: hasCritical ? "Verified with government override" : "Verified",
            actor: request.user!.id,
            timestamp: new Date().toISOString(),
            ...(overrideReason ? { reason: overrideReason } : {}),
          },
        ],
      }
      await client.query(
        `UPDATE field_observations
         SET payload = $2::jsonb, verification_status = 'Verified'
         WHERE id = $1`,
        [request.params.observationId, JSON.stringify(updated)],
      )
      await client.query(
        `INSERT INTO audit_history (observation_id, actor, action, reason)
         VALUES ($1, $2, $3, $4)`,
        [
          request.params.observationId,
          request.user!.id,
          hasCritical ? "government_override_verify" : "verify",
          overrideReason || null,
        ],
      )
      const assetId =
        typeof payload.assetId === "string" ? payload.assetId : String(row.id)
      await client.query(
        `UPDATE assets
       SET payload = jsonb_set(payload, '{status}', '"Verified"'::jsonb, true)
       WHERE id = $1`,
        [assetId],
      )
      await client.query("COMMIT")
      response.json({
        ...updated,
        ...photoDataUrl(
          request,
          String(row.id),
          row.image_path as string | null,
          row.image_sha256 as string | null,
        ),
      })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  },
)

app.get("/api/v1/spatial/resolve-watershed", requireAuth, async (request, response) => {
  const [validLongitude, validLatitude] = queryCoordinates(request)
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id
     FROM watersheds
     WHERE ST_Covers(
       boundary,
       ST_SetSRID(ST_MakePoint($1, $2), 4326)
     )
     ORDER BY ST_Area(boundary::geography) ASC, id ASC
     LIMIT 1`,
    [validLongitude, validLatitude],
  )
  response.json({
    watershedId: rows[0]?.id ?? null,
    resolution: rows[0] ? "inside" : "outside",
  })
})

app.get("/api/v1/spatial/snap-to-stream", requireAuth, async (request, response) => {
  const [validLongitude, validLatitude] = queryCoordinates(request)
  const watershedId =
    typeof request.query.watershedId === "string"
      ? request.query.watershedId
      : null
  const { rows } = await pool.query<{
    id: string
    name: string | null
    location: { type: "Point"; coordinates: [number, number] }
    distance_meters: number
  }>(
    `WITH origin AS (
       SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS point
     ),
     nearest AS (
       SELECT streams.id,
              streams.payload->>'name' AS name,
              streams.geometry,
              origin.point,
              ST_Distance(streams.geometry::geography, origin.point::geography) AS distance_meters
       FROM streams CROSS JOIN origin
       WHERE ($3::text IS NULL OR streams.watershed_id IS NULL OR streams.watershed_id = $3)
       ORDER BY streams.geometry::geography <-> origin.point::geography, streams.id
       LIMIT 1
     )
     SELECT nearest.id,
            nearest.name,
            ST_AsGeoJSON(ST_ClosestPoint(nearest.geometry, nearest.point))::json AS location,
            nearest.distance_meters
     FROM nearest
     WHERE ST_DWithin(
       nearest.geometry::geography,
       nearest.point::geography,
       nearest.distance_meters
     )`,
    [validLongitude, validLatitude, watershedId],
  )
  if (!rows[0]) {
    response.json(null)
    return
  }
  response.json({
    streamId: rows[0].id,
    streamName: rows[0].name,
    location: rows[0].location,
    distanceMeters: Number(rows[0].distance_meters),
  })
})

app.get("/api/v1/streams", requireAuth, async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM streams ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.post("/api/v1/streams", requireOfficer, async (request, response) => {
  const body = asRecord(request.body)
  const id = requireText(body.id, "id")
  const geometry = lineGeometry(body.geometry)
  const { rows: validity } = await ensureValidGeometry(geometry)
  if (!validity[0]?.valid) {
    throw new RequestValidationError(
      `Stream geometry is invalid: ${validity[0]?.reason ?? "unknown reason"}.`,
    )
  }
  if (body.watershedId !== undefined && body.watershedId !== null) {
    requireText(body.watershedId, "watershedId")
  }
  try {
    await pool.query(
      `INSERT INTO streams (id, watershed_id, payload, geometry)
       VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))`,
      [
        id,
        body.watershedId ?? null,
        JSON.stringify(body),
        JSON.stringify(geometry),
      ],
    )
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError("Stream id already exists.", 409)
    throw error
  }
  response.status(201).json(body)
})

app.get("/api/v1/analytics/jobs", requireAuth, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", asset_id AS "assetId", status,
            attempts, error, created_at::text AS "createdAt",
            finished_at::text AS "finishedAt", params
     FROM analysis_jobs ORDER BY created_at DESC`,
  )
  response.json(rows)
})

app.post("/api/v1/analytics", requireOfficer, async (request, response) => {
  const body = parseRequest(analysisRequestSchema, request.body)
  const watershedResult = await pool.query("SELECT 1 FROM watersheds WHERE id = $1", [body.watershedId])
  if (!watershedResult.rows[0]) throw new HttpError("Watershed was not found.", 404)

  let windows = {
    baseline: body.baselineWindow ?? null,
    current: body.currentWindow ?? null,
  }
  let interventionMode = false
  let installedAt: string | null = null
  if (body.assetId) {
    const assetResult = await pool.query<{ installed_at: string | null }>(
      "SELECT installed_at::text FROM assets WHERE id = $1 AND watershed_id = $2",
      [body.assetId, body.watershedId],
    )
    if (!assetResult.rows[0]) throw new HttpError("Asset does not belong to this watershed.", 422)
    installedAt = assetResult.rows[0].installed_at
    if (!body.baselineWindow && installedAt) {
      interventionMode = true
      windows = interventionWindows(installedAt, new Date())
    }
  }
  if (!body.baselineWindow && !interventionMode) {
    windows = seasonMatchedWindows(new Date())
  }
  if (!windows.baseline || !windows.current) {
    throw new HttpError("No complete season-matched analysis windows are available.", 422)
  }

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const indexType = body.type === "NDWI" ? "NDWI" : "NDVI"
  const params = {
    type: body.type,
    indexType,
    assetId: body.assetId ?? null,
    bufferM: body.bufferM ?? (body.assetId ? 500 : null),
    seasonLabel: DEFAULT_SEASON.label,
    windows,
    installedAt,
  }
  const payload = {
    id,
    watershedId: body.watershedId,
    type: body.type,
    status: "Queued",
    createdAt,
    progress: 0,
    demo: false,
    assetId: body.assetId ?? null,
  }
  await pool.query(
    `INSERT INTO analysis_jobs
       (id, payload, status, watershed_id, asset_id, params, created_by, created_at)
     VALUES ($1, $2::jsonb, 'queued', $3, $4, $5::jsonb, $6, $7)`,
    [id, JSON.stringify(payload), body.watershedId, body.assetId ?? null,
     JSON.stringify(params), request.user!.id, createdAt],
  )
  response.status(201).json({ ...payload, params })
})

app.get("/api/v1/analytics/jobs/:id", requireAuth, async (request, response) => {
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", asset_id AS "assetId", status,
            attempts, error, created_at::text AS "createdAt",
            finished_at::text AS "finishedAt", params
     FROM analysis_jobs WHERE id = $1`,
    [request.params.id],
  )
  if (!rows[0]) throw new HttpError("Analysis job was not found.", 404)
  response.json(rows[0])
})

app.get("/api/v1/analytics/results", requireAuth, async (_request, response) => {
  response.json(await listPayloads("analysis_results"))
})

app.get("/api/v1/interventions", requireAuth, async (_request, response) => {
  response.json(await listPayloads("interventions"))
})

app.post("/api/v1/interventions", requireOfficer, async (request, response) => {
  const body = parseRequest(interventionCreateSchema, request.body)
  if (body.status === "Completed" && !body.installedAt) {
    throw new RequestValidationError("installedAt is required when status is Completed.")
  }
  const client = await pool.connect()
  const id = randomUUID()
  const recordedAt = new Date().toISOString()
  const payload = {
    id,
    watershedId: body.watershedId,
    assetId: body.assetId ?? null,
    name: body.name,
    type: body.type,
    status: body.status,
    installedAt: body.installedAt ?? null,
    progress: body.status === "Completed" ? 100 : 0,
    recordedAt,
    source: "officer-entry",
    sourceLicence: "Officer supplied; no external licence",
    demo: false,
  }
  try {
    await client.query("BEGIN")
    const watershed = await client.query("SELECT 1 FROM watersheds WHERE id = $1", [body.watershedId])
    if (!watershed.rows[0]) throw new HttpError("Watershed was not found.", 404)
    if (body.assetId) {
      const asset = await client.query(
        "SELECT 1 FROM assets WHERE id = $1 AND watershed_id = $2",
        [body.assetId, body.watershedId],
      )
      if (!asset.rows[0]) throw new HttpError("Asset does not belong to this watershed.", 422)
    }
    await client.query(
      `INSERT INTO interventions
         (id, payload, watershed_id, asset_id, installed_at, status, created_by,
          source, source_licence, recorded_at, demo)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, 'officer-entry',
               'Officer supplied; no external licence', $8, false)`,
      [id, JSON.stringify(payload), body.watershedId, body.assetId ?? null,
       body.installedAt ?? null, body.status, request.user!.id, recordedAt],
    )
    await client.query(
      `INSERT INTO intervention_status_history
         (intervention_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, $2, $3)`,
      [id, body.status, request.user!.id],
    )
    await client.query("COMMIT")
    response.status(201).json(payload)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.patch("/api/v1/interventions/:id", requireOfficer, async (request, response) => {
  const body = parseRequest(interventionUpdateSchema, request.body)
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const existing = await client.query<{
      id: string
      payload: Record<string, unknown>
      status: string
      installed_at: string | null
      demo: boolean
    }>(
      `SELECT id, payload, status, installed_at::text, demo
       FROM interventions WHERE id = $1 FOR UPDATE`,
      [request.params.id],
    )
    const row = existing.rows[0]
    if (!row) throw new HttpError("Intervention was not found.", 404)
    const installedAt = body.installedAt ?? row.installed_at
    if (body.status === "Completed" && !installedAt) {
      throw new RequestValidationError("installedAt is required when status is Completed.")
    }
    const payload = {
      ...row.payload,
      status: body.status,
      installedAt,
      ...(body.status === "Completed" ? { progress: 100 } : {}),
    }
    await client.query(
      `UPDATE interventions SET status = $2, installed_at = $3, payload = $4::jsonb
       WHERE id = $1`,
      [row.id, body.status, installedAt, JSON.stringify(payload)],
    )
    if (row.status !== body.status) {
      await client.query(
        `INSERT INTO intervention_status_history
           (intervention_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.status, body.status, request.user!.id, body.note ?? null],
      )
    }
    await client.query("COMMIT")
    response.json({ ...payload, demo: row.demo })
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
})

app.get("/api/v1/reports/:reportId", requireAuth, async (request, response) => {
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", created_by AS "createdBy",
            created_at::text AS "createdAt", fact_set AS "factSet",
            fact_set_sha256 AS "factSetSha256", claims, gaps,
            rendered_markdown AS "renderedMarkdown", model,
            validator_version AS "validatorVersion", language
     FROM watershed_reports WHERE id = $1`,
    [request.params.reportId],
  )
  if (!rows[0]) throw new HttpError("Watershed report was not found.", 404)
  response.json(rows[0])
})

app.get("/api/v1/reports", requireAuth, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", created_at::text AS "createdAt",
            'Ready' AS status, 'Watershed summary' AS type,
            'Watershed report' AS name
     FROM watershed_reports ORDER BY created_at DESC`,
  )
  response.json(rows)
})

app.post("/api/v1/interventions/:id/indices/refresh", requireOfficer, async (request, response) => {
  const { rows } = await pool.query<{
    id: string
    watershed_id: string
    asset_id: string | null
    installed_at: string | null
    demo: boolean
  }>(
    `SELECT id, watershed_id, asset_id, installed_at::text, demo
     FROM interventions WHERE id = $1`,
    [request.params.id],
  )
  const row = rows[0]
  if (!row) throw new HttpError("Intervention was not found.", 404)
  if (row.demo) throw new HttpError("Demo interventions have no satellite monitoring.", 422)
  const jobs = await enqueueInterventionIndices(pool, {
    watershedId: row.watershed_id,
    assetId: row.asset_id,
    windows: activeWorkWindows(new Date()),
    createdBy: request.user!.id,
    interventionId: row.id,
    installedAt: row.installed_at,
  })
  response.status(202).json({ jobs })
})

app.get("/api/v1/reports/:reportId", requireAuth, async (request, response) => {
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", created_by AS "createdBy",
            created_at::text AS "createdAt", fact_set AS "factSet",
            fact_set_sha256 AS "factSetSha256", claims, gaps,
            rendered_markdown AS "renderedMarkdown", model,
            validator_version AS "validatorVersion", language
     FROM watershed_reports WHERE id = $1`,
    [request.params.reportId],
  )
  if (!rows[0]) throw new HttpError("Watershed report was not found.", 404)
  response.json(rows[0])
})

app.get("/api/v1/reports", requireAuth, async (_request, response) => {
  const { rows } = await pool.query(
    `SELECT id, watershed_id AS "watershedId", created_at::text AS "createdAt",
            'Ready' AS status, 'Watershed summary' AS type,
            'Watershed report' AS name
     FROM watershed_reports ORDER BY created_at DESC`,
  )
  response.json(rows)
})

/**
 * Queue NDVI + NDWI Earth Engine jobs for an intervention that is in progress.
 * Best effort: the officer's save must never fail because queueing failed.
 */
async function queueInterventionMonitoring(
  interventionId: string,
  watershedId: string,
  assetId: string | null,
  installedAt: string | null,
  userId: string,
) {
  try {
    return await enqueueInterventionIndices(pool, {
      watershedId,
      assetId,
      windows: activeWorkWindows(new Date()),
      createdBy: userId,
      interventionId,
      installedAt,
    })
  } catch (error) {
    console.error("Could not queue satellite monitoring for intervention.", interventionId, error)
    return []
  }
}

async function listPayloads(
  table: "analysis_jobs" | "analysis_results" | "interventions" | "reports",
) {
  const { rows } = await pool.query<{ payload: object }>(
    `SELECT payload FROM ${table} ORDER BY id`,
  )
  return rows.map(({ payload }) => payload)
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  )
}

app.use((_request, response) => {
  response.status(404).json({ detail: "Route was not found." })
})

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (error instanceof RequestValidationError || error instanceof HttpError) {
    response.status(error.status).json({ detail: error.message })
    return
  }
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ detail: "Request body contains invalid JSON." })
    return
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    response
      .status(413)
      .json({ detail: "Request body exceeds the 28 MB limit." })
    return
  }
  if (
    error instanceof Error &&
    error.message === "Origin is not allowed by CORS."
  ) {
    response.status(403).json({ detail: error.message })
    return
  }
  console.error("Unhandled API request error.", error)
  response.status(500).json({ detail: "Internal server error." })
}

app.use(errorHandler)

export default app
