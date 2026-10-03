import type { FieldObservation, QueuedObservation } from "@/types/domain"

/**
 * IndexedDB store for field observations and their sync state.
 * v1 kept bare observations in "field-observations"; v2 adds "sync-queue"
 * and migrates v1 records into it as "pending".
 */
const databaseName = "hydrosnap-offline"
const legacyStore = "field-observations"
const queueStore = "sync-queue"
let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Offline storage is not available in this browser."),
    )
  }
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (!db.objectStoreNames.contains(legacyStore)) {
        db.createObjectStore(legacyStore, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(queueStore)) {
        const queue = db.createObjectStore(queueStore, { keyPath: "id" })
        queue.createIndex("syncStatus", "syncStatus")
      }
      if (event.oldVersion === 1) {
        const transaction = request.transaction
        if (!transaction) return
        const legacy = transaction.objectStore(legacyStore).getAll()
        legacy.onsuccess = () => {
          const queue = transaction.objectStore(queueStore)
          for (const observation of legacy.result as FieldObservation[]) {
            queue.put(newQueueRecord(observation))
          }
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open offline storage."))
  })
  return databasePromise
}

function newQueueRecord(observation: FieldObservation): QueuedObservation {
  return {
    id: observation.id,
    observation,
    syncStatus: "pending",
    attempts: 0,
  }
}

function runRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(queueStore, mode)
        let request: IDBRequest<T> | undefined
        try {
          request = action(transaction.objectStore(queueStore))
        } catch (error) {
          transaction.abort()
          reject(error)
          return
        }
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () => {
          reject(
            transaction.error ??
              request?.error ??
              new Error("Offline storage failed."),
          )
        }
        transaction.onabort = () => {
          reject(
            transaction.error ??
              request?.error ??
              new Error("Offline storage transaction was aborted."),
          )
        }
      }),
  )
}

export function listQueue(): Promise<QueuedObservation[]> {
  return runRequest("readonly", (store) =>
    store.getAll(),
  ) as Promise<QueuedObservation[]>
}

export function getQueued(id: string): Promise<QueuedObservation | undefined> {
  return runRequest("readonly", (store) =>
    store.get(id),
  ) as Promise<QueuedObservation | undefined>
}

export async function putQueued(record: QueuedObservation): Promise<void> {
  await runRequest("readwrite", (store) => store.put(record))
}

/** Applies one read-modify-write operation atomically within IndexedDB. */
export function updateQueued(
  id: string,
  update: (
    record: QueuedObservation | undefined,
  ) => QueuedObservation | undefined,
): Promise<QueuedObservation | undefined> {
  return openDatabase().then(
    (db) =>
      new Promise<QueuedObservation | undefined>((resolve, reject) => {
        const transaction = db.transaction(queueStore, "readwrite")
        const store = transaction.objectStore(queueStore)
        const request = store.get(id)
        let updated: QueuedObservation | undefined
        let updateError: unknown
        request.onsuccess = () => {
          try {
            updated = update(request.result)
            if (updated) store.put(updated)
          } catch (error) {
            updateError = error
            transaction.abort()
          }
        }
        transaction.oncomplete = () => resolve(updated)
        transaction.onerror = () =>
          reject(
            updateError ??
              transaction.error ??
              request.error ??
              new Error("Offline storage failed."),
          )
        transaction.onabort = () =>
          reject(
            updateError ??
              transaction.error ??
              request.error ??
              new Error("Offline storage transaction was aborted."),
          )
      }),
  )
}

/** Returns persisted records abandoned mid-upload to the retryable queue. */
export async function recoverInterruptedSync(): Promise<number> {
  const interrupted = (await listQueue()).filter(
    (record) => record.syncStatus === "syncing",
  )
  let recovered = 0
  for (const record of interrupted) {
    const updated = await updateQueued(record.id, (current) => {
      if (!current || current.syncStatus !== "syncing") return current
      return { ...current, syncStatus: "pending" }
    })
    if (updated?.syncStatus === "pending") recovered++
  }
  return recovered
}

/** Adds a new observation to the queue as "pending" (never overwrites a synced one). */
export async function enqueueObservation(
  observation: FieldObservation,
): Promise<QueuedObservation> {
  const existing = await getQueued(observation.id)
  const record = existing
    ? { ...existing, observation }
    : newQueueRecord(observation)
  await putQueued(record)
  return record
}

/** Updates the stored observation body while keeping its sync state. */
export async function saveObservationOffline(
  observation: FieldObservation,
): Promise<void> {
  await enqueueObservation(observation)
}

export async function listOfflineObservations(): Promise<FieldObservation[]> {
  return (await listQueue()).map((record) => record.observation)
}
