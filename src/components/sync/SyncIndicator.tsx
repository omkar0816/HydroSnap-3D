import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { CloudOff, CloudUpload, LoaderCircle, RefreshCw } from "lucide-react"
import { env } from "@/config/env"
import { startAutoSync, subscribeSync, syncNow } from "@/services/syncService"
import type { QueuedObservation } from "@/types/domain"

/** Topbar sync status + manual "Sync now". Starts auto-sync on mount. */
export function SyncIndicator() {
  const queryClient = useQueryClient()
  const [records, setRecords] = useState<QueuedObservation[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string>()
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeSync((next, isSyncing) => {
      setRecords(next)
      setSyncing(isSyncing)
    })
    const stop = startAutoSync(() => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] })
      void queryClient.invalidateQueries({ queryKey: ["observations"] })
    }, setSyncError)
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      unsubscribe()
      stop()
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [queryClient])

  const pending = records.filter((r) => r.syncStatus === "pending").length
  const failed = records.filter((r) => r.syncStatus === "failed").length
  const synced = records.filter((r) => r.syncStatus === "synced").length
  const waiting = pending + failed

  const label = !online
    ? `Offline · ${waiting} queued`
    : syncing
      ? "Syncing…"
      : syncError
        ? "Sync unavailable"
        : waiting
          ? `${waiting} to sync`
          : "All synced"

  return (
    <div className="popover-anchor">
      <button
        className={`hs-sync-button ${
          !online ? "offline" : waiting || syncError ? "waiting" : ""
        }`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Sync status"
      >
        {!online ? (
          <CloudOff size={15} />
        ) : syncing ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <CloudUpload size={15} />
        )}
        <span>{label}</span>
      </button>
      {open && (
        <div className="popover hs-sync-popover">
          <div className="popover-title">Field sync</div>
          {syncError && (
            <p className="hs-muted" role="alert">
              Could not access the offline queue: {syncError}
            </p>
          )}
          <p>
            {pending} pending · {failed} failed · {synced} synced
          </p>
          {records
            .filter((r) => r.syncStatus === "failed")
            .slice(0, 3)
            .map((r) => (
              <p key={r.id} className="hs-muted">
                {r.observation.assetType}: {r.lastError} (retry{" "}
                {r.nextAttemptAt
                  ? new Date(r.nextAttemptAt).toLocaleTimeString()
                  : "soon"}
                )
              </p>
            ))}
          {env.useMockApi && (
            <p className="hs-muted">
              Demo mode: records sync to the in-browser demo API only, not a
              server.
            </p>
          )}
          <button
            className="text-button"
            disabled={!online || syncing}
            onClick={() => {
              void syncNow(true)
                .then(() => {
                  setSyncError(undefined)
                  void queryClient.invalidateQueries({ queryKey: ["assets"] })
                  void queryClient.invalidateQueries({
                    queryKey: ["observations"],
                  })
                })
                .catch((error: unknown) => {
                  setSyncError(
                    error instanceof Error
                      ? error.message
                      : "Could not sync offline records.",
                  )
                })
            }}
          >
            <RefreshCw size={13} /> Sync now
          </button>
        </div>
      )}
    </div>
  )
}

export default SyncIndicator
