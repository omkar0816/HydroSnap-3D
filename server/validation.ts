import { z } from "zod"

export const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ]),
})

const polygonSchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.unknown()),
})

const lineSchema = z.object({
  type: z.enum(["LineString", "MultiLineString"]),
  coordinates: z.array(z.unknown()),
})

const recordSchema = z.record(z.string(), z.unknown())

export const interventionCreateSchema = z.object({
  watershedId: z.string().trim().min(1),
  assetId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  installedAt: z.iso.date().optional(),
  status: z.enum(["Planned", "In progress", "Completed"]).default("Planned"),
}).strict()

export const interventionUpdateSchema = z.object({
  status: z.enum(["Planned", "In progress", "Completed"]),
  installedAt: z.iso.date().optional(),
  note: z.string().trim().max(1000).optional(),
}).strict()

export function parseRequest<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new RequestValidationError(parsed.error.issues[0]?.message ?? "Request is invalid.")
  }
  return parsed.data
}

function validateCoordinateTree(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestValidationError(
      "Geometry coordinates must be a non-empty WGS84 coordinate array.",
    )
  }
  if (value.length === 2 && value.every((coordinate) => typeof coordinate === "number")) {
    const [longitude, latitude] = value as number[]
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new RequestValidationError(
        "Geometry coordinates must use finite WGS84 longitude and latitude.",
      )
    }
    return
  }
  for (const item of value) validateCoordinateTree(item)
}

export function asRecord(
  value: unknown,
  message = "Body must be a JSON object.",
) {
  const parsed = recordSchema.safeParse(value)
  if (!parsed.success) throw new RequestValidationError(message)
  return parsed.data
}

export function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} must be a non-empty string.`)
  }
  return value
}

export function pointCoordinates(value: unknown): [number, number] {
  const parsed = pointSchema.safeParse(value)
  if (!parsed.success) {
    throw new RequestValidationError(
      "location must be a GeoJSON Point with valid WGS84 coordinates.",
    )
  }
  return parsed.data.coordinates
}

export function polygonGeometry(value: unknown): Record<string, unknown> {
  const parsed = polygonSchema.safeParse(value)
  if (!parsed.success) {
    throw new RequestValidationError(
      "boundary.geometry must be a GeoJSON Polygon or MultiPolygon.",
    )
  }
  validateCoordinateTree(parsed.data.coordinates)
  return parsed.data
}

export function lineGeometry(value: unknown): Record<string, unknown> {
  const parsed = lineSchema.safeParse(value)
  if (!parsed.success) {
    throw new RequestValidationError(
      "geometry must be a GeoJSON LineString or MultiLineString.",
    )
  }
  validateCoordinateTree(parsed.data.coordinates)
  return parsed.data
}

export function requireFields(
  body: Record<string, unknown>,
  fields: string[],
): void {
  for (const field of fields) requireText(body[field], field)
}

export class RequestValidationError extends Error {
  readonly status = 422
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}
