import { env } from "@/config/env"
import type {
  AnalysisJob,
  AnalysisResult,
  Asset,
  FieldObservation,
  Intervention,
  PilotAnalysis,
  Report,
  ThematicLayer,
  TeamMember,
  User,
  Watershed,
} from "@/types/domain"
import { z } from "zod"
import {
  assets,
  interventions,
  jobs,
  reports,
  results,
  teamMembers,
  thematicLayers,
  currentUser,
  watersheds,
} from "@/services/mock/mockData"
import { apiRequest } from "@/services/apiClient"
import {
  enqueueObservation,
  getQueued,
  listOfflineObservations,
  listQueue,
  putQueued,
} from "@/services/offlineStore"
import { notifyQueueChanged, syncNow } from "@/services/syncService"

let observationStore: FieldObservation[] = []
let jobStore: AnalysisJob[] = [...jobs]
let reportStore: Report[] = [...reports]

const pilotSceneSchema = z.object({
  id: z.string(),
  date: z.string(),
  cloudCover: z.number().nullable(),
})
const pilotWindowSchema = z.object({
  window: z.string(),
  scenes: z.array(pilotSceneSchema),
  nearMean: z.number().nullable(),
  controlMean: z.number().nullable(),
  validNearPixels: z.number().int().nonnegative(),
  validControlPixels: z.number().int().nonnegative(),
})
const pilotMetricSchema = z.object({
  name: z.string(),
  definition: z.string(),
  before: pilotWindowSchema,
  after: pilotWindowSchema,
  nearChange: z.number().nullable(),
  controlChange: z.number().nullable(),
  differenceInDifferences: z.number().nullable(),
})
const pilotAnalysisSchema: z.ZodType<PilotAnalysis> = z.object({
  status: z.enum(["pipeline-test", "no-data", "no-clear-signal"]),
  label: z.literal("Pipeline test, not a real result"),
  fixtureAssetId: z.string(),
  source: z.string(),
  attribution: z.string(),
  generatedAt: z.string(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  images: z.object({
    ndviBefore: z.string().optional(),
    ndviAfter: z.string().optional(),
    ndwiBefore: z.string().optional(),
    ndwiAfter: z.string().optional(),
  }),
  indices: z.object({
    ndvi: pilotMetricSchema,
    ndwi: pilotMetricSchema,
  }),
  interpretation: z.string(),
})

const delay = (milliseconds = 180) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

async function list<T>(path: string, demoData: T[]): Promise<T[]> {
  if (!env.useMockApi) return apiRequest<T[]>(path)
  await delay()
  return demoData
}

export const hydrosnapService = {
  getCurrentUser: () => {
    if (!env.useMockApi) return apiRequest<User>("/api/v1/users/me")
    return Promise.resolve(currentUser)
  },
  getTeamMembers: () => list<TeamMember>("/api/v1/users/team", teamMembers),
  getWatersheds: () => list<Watershed>("/api/v1/watersheds", watersheds),
  getLayers: () => list<ThematicLayer>("/api/v1/layers", thematicLayers),
  getAssets: async () => {
    if (!env.useMockApi) {
      const apiAssets = await apiRequest<Asset[]>("/api/v1/assets")
      // Show records that have not reached the server yet; synced ones come
      // back from the API, so they are not added twice.
      const unsynced = (await safeListQueue())
        .filter((record) => record.syncStatus !== "synced")
        .filter((record) => !record.observation.assetId)
        .map((record) => observationToAsset(record.observation))
      const ids = new Set(apiAssets.map((asset) => asset.id))
      return [...apiAssets, ...unsynced.filter((asset) => !ids.has(asset.id))]
    }
    await delay()
    await loadOfflineObservations()
    return [
      ...assets,
      ...observationStore
        .filter((observation) => !observation.assetId)
        .map(observationToAsset),
    ]
  },
  getObservations: async () => {
    if (!env.useMockApi) {
      const apiObservations =
        await apiRequest<FieldObservation[]>("/api/v1/uploads")
      const localObservations = await loadOfflineObservations()
      return [
        ...new Map(
          [...localObservations, ...apiObservations].map((item) => [
            item.id,
            item,
          ]),
        ).values(),
      ]
    }
    await delay()
    await loadOfflineObservations()
    return observationStore
  },
  getJobs: async () => {
    if (!env.useMockApi)
      return apiRequest<AnalysisJob[]>("/api/v1/analytics/jobs")
    await delay()
    return jobStore
  },
  getResults: () => list<AnalysisResult>("/api/v1/analytics/results", results),
  getPilotAnalysis: async (): Promise<PilotAnalysis | null> => {
    const response = await fetch("/data/pilot/summary.json", {
      headers: { Accept: "application/json" },
    })
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(
        `Could not load pilot analysis (HTTP ${response.status}).`,
      )
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
      return null
    }
    return pilotAnalysisSchema.parse(await response.json())
  },
  getInterventions: () =>
    list<Intervention>("/api/v1/interventions", interventions),
  getReports: async () => {
    if (!env.useMockApi) return apiRequest<Report[]>("/api/v1/reports")
    await delay()
    return reportStore
  },
  /**
   * Local-first save: the observation is queued in IndexedDB as "pending",
   * then a sync is attempted if the device is online. The returned promise
   * resolves once the record is safely stored locally, not when it is uploaded.
   */
  saveObservation: async (observation: FieldObservation) => {
    await enqueueObservation(observation)
    observationStore = [
      observation,
      ...observationStore.filter(({ id }) => id !== observation.id),
    ]
    notifyQueueChanged()
    if (navigator.onLine) void syncNow()
    return observation
  },
  createAnalysis: async (
    watershedId: string,
    type: AnalysisJob["type"],
  ): Promise<AnalysisJob> => {
    if (!env.useMockApi) {
      return apiRequest<AnalysisJob>("/api/v1/analytics", {
        method: "POST",
        body: JSON.stringify({ watershedId, type }),
      })
    }
    const job: AnalysisJob = {
      id: `job-${Date.now()}`,
      watershedId,
      type,
      status: "Queued",
      createdAt: new Date().toISOString().slice(0, 10),
      progress: 0,
      demo: true,
    }
    jobStore = [job, ...jobStore]
    return job
  },
  createReport: async (report: Omit<Report, "id" | "createdAt" | "status">) => {
    if (!env.useMockApi) {
      return apiRequest<Report>("/api/v1/reports", {
        method: "POST",
        body: JSON.stringify(report),
      })
    }
    const created: Report = {
      ...report,
      id: `rpt-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      status: "Ready",
    }
    reportStore = [created, ...reportStore]
    return created
  },
  verifyObservation: async (observationId: string) => {
    if (!env.useMockApi) {
      const verified = await apiRequest<FieldObservation>(
        `/api/v1/uploads/${encodeURIComponent(observationId)}/verify`,
        {
          method: "PATCH",
          body: JSON.stringify({ verificationStatus: "Verified" }),
        },
      )
      observationStore = [
        verified,
        ...observationStore.filter(({ id }) => id !== verified.id),
      ]
      const queued = await getQueued(verified.id)
      if (queued) await putQueued({ ...queued, observation: verified })
      return verified
    }
    await loadOfflineObservations()
    const observation = observationStore.find(({ id }) => id === observationId)
    if (!observation) throw new Error("Field observation was not found.")
    observation.verificationStatus = "Verified"
    observation.auditHistory.push({
      action: "Verified (demo reviewer)",
      actor: currentUser.name,
      timestamp: new Date().toISOString(),
    })
    const queued = await getQueued(observation.id)
    if (queued) await putQueued({ ...queued, observation })
    return observation
  },
}

async function safeListQueue() {
  try {
    return await listQueue()
  } catch {
    return []
  }
}

async function loadOfflineObservations(): Promise<FieldObservation[]> {
  let stored: FieldObservation[] = []
  try {
    stored = await listOfflineObservations()
  } catch {
    // IndexedDB unavailable (private mode); keep in-memory records only.
  }
  const observationsById = new Map(
    [...observationStore, ...stored].map((item) => [item.id, item]),
  )
  observationStore = [...observationsById.values()]
  return stored
}

function observationToAsset(observation: FieldObservation): Asset {
  return {
    id: observation.id,
    name: observation.village
      ? `${observation.village} ${observation.assetType}`
      : observation.assetType,
    type: observation.assetType,
    watershedId: observation.watershedId,
    location: observation.location,
    status: observation.verificationStatus,
    lastInspected: observation.inspectionDate,
    village: observation.village,
    description: observation.description,
    imageUrl: observation.imageDataUrl,
  }
}
