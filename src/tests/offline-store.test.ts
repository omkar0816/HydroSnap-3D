import "fake-indexeddb/auto"
import { describe, expect, it } from "vitest"
import type { FieldObservation } from "@/types/domain"
import {
  enqueueObservation,
  listQueue,
  recoverInterruptedSync,
  updateQueued,
} from "@/services/offlineStore"

function observation(id: string): FieldObservation {
  return {
    id,
    watershedId: "ws-test",
    assetType: "Farm pond",
    imageName: "field.jpg",
    location: {
      type: "Point",
      coordinates: [73.8, 18.5],
      source: "manual",
    },
    village: "Test village",
    description: "A test field observation.",
    inspectionDate: "2026-10-01",
    officerId: "officer-test",
    officerName: "Test Officer",
    verificationStatus: "Pending review",
    createdAt: "2026-10-01T00:00:00.000Z",
    auditHistory: [],
  }
}

describe("offline queue", () => {
  it("recovers a persisted upload interrupted in the syncing state", async () => {
    const record = await enqueueObservation(observation("interrupted-upload"))
    await updateQueued(record.id, (current) =>
      current ? { ...current, syncStatus: "syncing" } : current,
    )

    expect(await recoverInterruptedSync()).toBe(1)
    expect(
      (await listQueue()).find(({ id }) => id === record.id)?.syncStatus,
    ).toBe("pending")
  })

  it("applies concurrent verification changes without stale queue writes", async () => {
    const record = await enqueueObservation(observation("concurrent-review"))
    await updateQueued(record.id, (current) =>
      current ? { ...current, syncStatus: "syncing" } : current,
    )
    await updateQueued(record.id, (current) =>
      current
        ? {
            ...current,
            observation: {
              ...current.observation,
              verificationStatus: "Verified",
              auditHistory: [
                {
                  action: "Verified",
                  actor: "Reviewer",
                  timestamp: "2026-10-02T00:00:00.000Z",
                },
              ],
            },
          }
        : current,
    )
    await updateQueued(record.id, (current) =>
      current ? { ...current, syncStatus: "synced" } : current,
    )

    const latest = (await listQueue()).find(({ id }) => id === record.id)
    expect(latest?.syncStatus).toBe("synced")
    expect(latest?.observation.verificationStatus).toBe("Verified")
    expect(latest?.observation.auditHistory).toHaveLength(1)
  })
})
