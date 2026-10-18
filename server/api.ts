import { createHash, randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import cors from "cors"
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express"
import { pool } from "./database.ts"
import { serverEnv } from "./env.ts"
import {
  asRecord,
  HttpError,
  lineGeometry,
  pointCoordinates,
  polygonGeometry,
  RequestValidationError,
  requireFields,
  requireText,
} from "./validation.ts"

const app = express()
const uploadRoot = path.resolve(serverEnv.uploadDirectory)
const maxImageBytes = 20 * 1024 * 1024

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
    allowedHeaders: ["Content-Type", "Idempotency-Key"],
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

app.get("/api/v1/users/me", (_request, response) => {
  response.json({
    id: "usr-001",
    name: "Ananya Deshmukh",
    email: "ananya.deshmukh@example.gov.in",
    role: "GIS Analyst",
    initials: "AD",
  })
})

app.get("/api/v1/users/team", async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM users ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/watersheds", async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM watersheds ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.post("/api/v1/watersheds", async (request, response) => {
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

app.get("/api/v1/layers", async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM map_layers ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/satellite/timeline", async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM satellite_timeline ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.get("/api/v1/assets", async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM assets ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.post("/api/v1/assets", async (request, response) => {
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
      `INSERT INTO assets (id, watershed_id, payload, location)
       VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_MakePoint($4, $5), 4326))`,
      [
        requireText(body.id, "id"),
        requireText(body.watershedId, "watershedId"),
        JSON.stringify(body),
        longitude,
        latitude,
      ],
    )
  } catch (error) {
    if (isUniqueViolation(error))
      throw new HttpError("Asset id already exists.", 409)
    throw error
  }
  response.status(201).json(body)
})

app.get("/api/v1/uploads", async (request, response) => {
  const { rows } = await pool.query(
    `SELECT id, payload, image_path, image_sha256
     FROM field_observations ORDER BY created_at DESC`,
  )
  response.json(rows.map((row) => rowPayload(request, row)))
})

app.get("/api/v1/uploads/:observationId/photo", async (request, response) => {
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

app.post("/api/v1/uploads", async (request, response) => {
  const body = asRecord(request.body)
  requireFields(body, [
    "id",
    "watershedId",
    "assetType",
    "inspectionDate",
    "officerId",
    "officerName",
    "verificationStatus",
    "createdAt",
  ])
  const [longitude, latitude] = pointCoordinates(body.location)
  if (!Array.isArray(body.auditHistory)) {
    throw new RequestValidationError("auditHistory must be an array.")
  }
  if (body.assetId !== undefined && body.assetId !== null) {
    requireText(body.assetId, "assetId")
  }
  const decodedImage = dataUrlImage(body.imageDataUrl)
  const computedImageHash = decodedImage
    ? sha256(decodedImage.bytes)
    : undefined
  if (
    decodedImage &&
    typeof body.imageSha256 === "string" &&
    body.imageSha256.toLowerCase() !== computedImageHash
  ) {
    throw new RequestValidationError(
      "imageSha256 does not match the uploaded image.",
    )
  }
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
  const payloadHash = sha256(stableJson(body))
  const storedPayload = { ...body }
  delete storedPayload.imageDataUrl
  if (computedImageHash) storedPayload.imageSha256 = computedImageHash
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
          image_path, image_sha256, location, created_at)
       VALUES
         ($1, $2, $3, $4, $5::jsonb, $6, $7,
          ST_SetSRID(ST_MakePoint($8, $9), 4326), $10::timestamptz)
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
        body.createdAt,
      ],
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
        status: body.verificationStatus,
        lastInspected: body.inspectionDate,
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
        `INSERT INTO assets (id, watershed_id, payload, location)
         VALUES ($1, $2, $3::jsonb, ST_SetSRID(ST_MakePoint($4, $5), 4326))
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
  async (request, response) => {
    const body = asRecord(request.body)
    if (body.verificationStatus !== "Verified") {
      throw new RequestValidationError("verificationStatus must be Verified.")
    }
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
            action: "Verified (API)",
            actor: "Unverified API user",
            timestamp: new Date().toISOString(),
          },
        ],
      }
      await client.query(
        "UPDATE field_observations SET payload = $2::jsonb WHERE id = $1",
        [request.params.observationId, JSON.stringify(updated)],
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

app.get("/api/v1/spatial/resolve-watershed", async (request, response) => {
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

app.get("/api/v1/spatial/snap-to-stream", async (request, response) => {
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

app.get("/api/v1/streams", async (_request, response) => {
  const { rows } = await pool.query<{ payload: object }>(
    "SELECT payload FROM streams ORDER BY id",
  )
  response.json(rows.map(({ payload }) => payload))
})

app.post("/api/v1/streams", async (request, response) => {
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

app.get("/api/v1/analytics/jobs", async (_request, response) => {
  response.json(await listPayloads("analysis_jobs"))
})

app.post("/api/v1/analytics", async (request, response) => {
  const body = asRecord(request.body)
  const watershedId = requireText(body.watershedId, "watershedId")
  const type = requireText(body.type, "type")
  if (!["NDVI", "NDWI", "Change detection", "Land cover"].includes(type)) {
    throw new RequestValidationError("Unsupported analysis type.")
  }
  const data = {
    id: randomUUID(),
    watershedId,
    type,
    status: "Queued",
    createdAt: new Date().toISOString().slice(0, 10),
    progress: 0,
    demo: false,
  }
  await pool.query(
    "INSERT INTO analysis_jobs (id, payload) VALUES ($1, $2::jsonb)",
    [data.id, JSON.stringify(data)],
  )
  response.status(201).json(data)
})

app.get("/api/v1/analytics/results", async (_request, response) => {
  response.json(await listPayloads("analysis_results"))
})

app.get("/api/v1/interventions", async (_request, response) => {
  response.json(await listPayloads("interventions"))
})

app.get("/api/v1/reports", async (_request, response) => {
  response.json(await listPayloads("reports"))
})

app.post("/api/v1/reports", async (request, response) => {
  const body = asRecord(request.body)
  requireFields(body, ["name", "type", "watershedId"])
  const data = {
    ...body,
    id: randomUUID(),
    createdAt: new Date().toISOString().slice(0, 10),
    status: "Ready",
  }
  await pool.query("INSERT INTO reports (id, payload) VALUES ($1, $2::jsonb)", [
    data.id,
    JSON.stringify(data),
  ])
  response.status(201).json(data)
})

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
