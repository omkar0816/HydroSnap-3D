import { randomUUID } from "node:crypto"
import type pg from "pg"
import { DEFAULT_SEASON, type SeasonalWindows } from "./windows.ts"

type Queryable = Pick<pg.Pool, "query">

export const DEFAULT_ASSET_BUFFER_M = 500
export const INDEX_TYPES = ["NDVI", "NDWI"] as const
export type IndexType = (typeof INDEX_TYPES)[number]

export type EnqueueInput = {
  watershedId: string
  indexType: IndexType
  assetId?: string | null
  bufferM?: number | null
  windows: SeasonalWindows
  createdBy: string
  interventionId?: string
  installedAt?: string | null
}

/**
 * Queue one Earth Engine analysis job. When `interventionId` is supplied the
 * job is skipped if an equivalent job is already queued or running, so
 * repeated saves never pile up duplicate work.
 */
export async function enqueueAnalysisJob(
  db: Queryable,
  input: EnqueueInput,
): Promise<{ id: string; queued: boolean }> {
  if (!input.windows.baseline || !input.windows.current) {
    throw new Error("Both analysis windows are required.")
  }
  if (input.interventionId) {
    const pending = await db.query(
      `SELECT id FROM analysis_jobs
       WHERE status IN ('queued', 'running')
         AND params->>'interventionId' = $1
         AND params->>'indexType' = $2
       LIMIT 1`,
      [input.interventionId, input.indexType],
    )
    if (pending.rows[0]) return { id: pending.rows[0].id as string, queued: false }
  }
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const bufferM = input.bufferM ?? (input.assetId ? DEFAULT_ASSET_BUFFER_M : null)
  const params = {
    type: input.indexType,
    indexType: input.indexType,
    assetId: input.assetId ?? null,
    bufferM,
    seasonLabel: input.interventionId ? "Active work (rolling 90 days)" : DEFAULT_SEASON.label,
    windows: input.windows,
    installedAt: input.installedAt ?? null,
    includeRaster: true,
    ...(input.interventionId ? { interventionId: input.interventionId } : {}),
  }
  const payload = {
    id,
    watershedId: input.watershedId,
    type: input.indexType,
    status: "Queued",
    createdAt,
    progress: 0,
    demo: false,
    assetId: input.assetId ?? null,
  }
  await db.query(
    `INSERT INTO analysis_jobs
       (id, payload, status, watershed_id, asset_id, params, created_by, created_at)
     VALUES ($1, $2::jsonb, 'queued', $3, $4, $5::jsonb, $6, $7)`,
    [id, JSON.stringify(payload), input.watershedId, input.assetId ?? null,
     JSON.stringify(params), input.createdBy, createdAt],
  )
  return { id, queued: true }
}

/** NDVI and NDWI jobs for one in-progress intervention. */
export async function enqueueInterventionIndices(
  db: Queryable,
  input: Omit<EnqueueInput, "indexType">,
) {
  const jobs: Array<{ id: string; indexType: IndexType; queued: boolean }> = []
  for (const indexType of INDEX_TYPES) {
    const job = await enqueueAnalysisJob(db, { ...input, indexType })
    jobs.push({ ...job, indexType })
  }
  return jobs
}
