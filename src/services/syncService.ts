import { env } from "@/config/env"
import { apiRequest } from "@/services/apiClient"
import {
  listQueue,
  recoverInterruptedSync,
  updateQueued,
} from "@/services/offlineStore"
import type { FieldObservation, QueuedObservation } from "@/types/domain"

/**
 * Offline → online sync for field observations.
 *
 * - Every observation is written to IndexedDB first ("pending").
 * - syncNow() uploads pending/failed records with exponential backoff.
 * - Each upload carries an Idempotency-Key so retries never duplicate.
 * - In mock mode the "server" is the in-browser demo API; records are marked
 *   `demoSync: true` and the UI labels them as demo-synced.
 */

const BASE_DELAY_MS = 5_000
const MAX_DELAY_MS = 5 * 60_000

type Listener = (records: QueuedObservation[], syncing: boolean) => void
const listeners = new Set<Listener>()
let running: Promise<SyncSummary> | undefined

export interface SyncSummary {
  attempted: number
  synced: number
  failed: number
}

export function mergeUploadedObservation(
  original: FieldObservation,
  current: FieldObservation,
  saved: FieldObservation,
): FieldObservation {
  const verificationChanged =
    current.verificationStatus !== original.verificationStatus ||
    current.auditHistory.length > original.auditHistory.length
  return {
    ...original,
    ...saved,
    ...(verificationChanged
      ? {
          verificationStatus: current.verificationStatus,
          auditHistory: current.auditHistory,
        }
      : {}),
  }
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener)
  void emit(Boolean(running))
  return () => listeners.delete(listener)
}

async function emit(syncing: boolean) {
  if (!listeners.size) return
  try {
    const records = await listQueue()
    listeners.forEach((listener) => listener(records, syncing))
  } catch {
    // IndexedDB unavailable; nothing to report.
  }
}

/** Lets the UI refresh counts after a record is queued locally. */
export function notifyQueueChanged(): void {
  void emit(Boolean(running))
}

export function backoffDelay(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1))
}

export function isDue(record: QueuedObservation, now = Date.now()): boolean {
  if (record.syncStatus === "synced" || record.syncStatus === "syncing") {
    return false
  }
  if (record.syncStatus === "failed" && record.nextAttemptAt) {
    return new Date(record.nextAttemptAt).getTime() <= now
  }
  return true
}

async function upload(
  observation: FieldObservation,
): Promise<FieldObservation> {
  if (env.useMockApi) {
    // DEMO: simulate network latency; nothing leaves the browser.
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    return observation
  }
  return apiRequest<FieldObservation>("/api/v1/uploads", {
    method: "POST",
    headers: {
      "Idempotency-Key": observation.idempotencyKey ?? observation.id,
    },
    body: JSON.stringify(observation),
  })
}

/**
 * Uploads every due record. `force` ignores the backoff window (used by the
 * "Sync now" button).
 */
export function syncNow(force = false): Promise<SyncSummary> {
  if (running) return running
  const job = (async () => {
    const summary: SyncSummary = { attempted: 0, synced: 0, failed: 0 }
    if (typeof navigator !== "undefined" && !navigator.onLine) return summary
    const records = (await listQueue()).filter(
      (record) =>
        record.syncStatus !== "synced" &&
        (force ? record.syncStatus !== "syncing" : isDue(record)),
    )
    for (const record of records) {
      let claimed = false
      const current = await updateQueued(record.id, (latest) => {
        const eligible = force
          ? latest?.syncStatus !== "synced" && latest?.syncStatus !== "syncing"
          : latest !== undefined && isDue(latest)
        if (!latest || !eligible) {
          return latest
        }
        claimed = true
        return { ...latest, syncStatus: "syncing" }
      })
      if (!claimed || !current) continue

      summary.attempted++
      await emit(true)
      let saved: FieldObservation
      try {
        saved = await upload(current.observation)
      } catch (error) {
        const updated = await updateQueued(record.id, (latest) => {
          if (!latest) return latest
          const attempts = latest.attempts + 1
          return {
            ...latest,
            syncStatus: "failed",
            attempts,
            lastError: error instanceof Error ? error.message : "Upload failed",
            nextAttemptAt: new Date(
              Date.now() + backoffDelay(attempts),
            ).toISOString(),
          }
        })
        if (updated) summary.failed++
        continue
      }

      const updated = await updateQueued(record.id, (latest) => {
        if (!latest) return latest
        return {
          ...latest,
          observation: mergeUploadedObservation(
            current.observation,
            latest.observation,
            saved,
          ),
          syncStatus: "synced",
          attempts: latest.attempts + 1,
          lastError: undefined,
          nextAttemptAt: undefined,
          syncedAt: new Date().toISOString(),
          demoSync: env.useMockApi,
        }
      })
      if (updated) summary.synced++
    }
    return summary
  })()
  running = job
  const cleanup = () => {
    running = undefined
    void emit(false)
  }
  void job.then(cleanup, cleanup)
  return job
}

/** Starts automatic sync on reconnect and on a timer. Returns a cleanup. */
export function startAutoSync(
  onSynced?: () => void,
  onError?: (message: string | undefined) => void,
): () => void {
  let recovered = false
  const run = async () => {
    try {
      if (!recovered) {
        await recoverInterruptedSync()
        recovered = true
      }
      const summary = await syncNow()
      onError?.(undefined)
      if (summary.synced) onSynced?.()
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Could not recover or sync offline records.",
      )
    }
  }
  window.addEventListener("online", run)
  const timer = window.setInterval(run, 30_000)
  void run()
  return () => {
    window.removeEventListener("online", run)
    window.clearInterval(timer)
  }
}
