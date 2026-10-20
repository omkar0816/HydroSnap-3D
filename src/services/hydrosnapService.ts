import { env } from "@/config/env"
import type {
  AnalysisJob,
  AnalysisResult,
  AiPilotSummary,
  Asset,
  FieldObservation,
  Intervention,
  InterventionInput,
  PilotAnalysis,
  Report,
  ThematicLayer,
  TeamMember,
  User,
  Watershed,
} from "@/types/domain"
import type { WatershedEvidence } from "@/types/evidence"
import type { AnalysisJobStatusRow, SatelliteMeasurementRow } from "@/types/evidence"
import type { SavedWatershedReport } from "../../shared/reportFacts"
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
import { generatePilotSummary as runPilotSummary } from "@/services/aiService"
import {
  enqueueObservation,
  getQueued,
  listOfflineObservations,
  listQueue,
  putQueued,
} from "@/services/offlineStore"
import { notifyQueueChanged, syncNow } from "@/services/syncService"
import { isSupabaseConfigured } from "@/lib/supabase"
import { getCurrentOfficerUser } from "@/services/authService"

let observationStore: FieldObservation[] = []
let jobStore: AnalysisJob[] = [...jobs]
let reportStore: Report[] = [...reports]
let interventionStore: Intervention[] = [...interventions]

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
    if (isSupabaseConfigured) return getCurrentOfficerUser()
    if (!env.useMockApi) return apiRequest<User>("/api/v1/users/me")
    return Promise.resolve(currentUser)
  },
  getTeamMembers: () => list<TeamMember>("/api/v1/users/team", teamMembers),
  getWatersheds: () => list<Watershed>("/api/v1/watersheds", watersheds),
  getWatershedEvidence: async (watershedId: string): Promise<WatershedEvidence> => {
    if (!env.useMockApi) {
      return apiRequest<WatershedEvidence>(
        `/api/v1/watersheds/${encodeURIComponent(watershedId)}/evidence`,
      )
    }
    const watershed = watersheds.find((item) => item.id === watershedId)
    if (!watershed) throw new Error("Watershed was not found.")
    const [watershedAssets, observations] = await Promise.all([
      hydrosnapService.getAssets(),
      hydrosnapService.getObservations(),
    ])
    return {
      watershed: {
        id: watershed.id,
        name: watershed.name,
        areaKm2: watershed.areaSqKm,
        boundaryGeojson: watershed.boundary,
        source: "demo",
        sourceLicence: null,
        demo: true,
      },
      assets: watershedAssets
        .filter((item) => item.watershedId === watershedId)
        .map((item) => ({
          id: item.id,
          type: item.type,
          name: item.name,
          lng: item.location.coordinates[0],
          lat: item.location.coordinates[1],
          installedAt: item.installedAt ?? null,
          status: item.status,
          source: "demo",
          sourceLicence: "Illustrative demo data",
          demo: true,
          village: item.village,
          description: item.description,
        })),
      observations: observations
        .filter((item) => item.watershedId === watershedId)
        .map((item) => ({
          id: item.id,
          assetId: item.assetId ?? null,
          assetType: item.assetType,
          inspectionDate: item.inspectionDate,
          verificationStatus: item.verificationStatus,
          trustFlags: (item.trust?.reasons ?? []).map((flag) => ({
            ...flag,
            severity: flag.severity === "warning" ? "warn" as const : flag.severity,
          })),
          recordedAt: item.createdAt,
          officerId: item.officerId,
          source: "demo",
          sourceLicence: "Illustrative demo data",
          demo: true,
          lng: item.location.coordinates[0],
          lat: item.location.coordinates[1],
          village: item.village,
          description: item.description,
          imageSha256: item.imageSha256 ?? null,
          hasImage: Boolean(item.imageDataUrl),
          snapDistanceMeters: item.snapDistanceMeters ?? null,
          trust: item.trust ?? null,
          photoContentReview: item.photoContentReview ?? null,
        })),
      interventions: interventionStore
        .filter((item) => item.watershedId === watershedId)
        .map((item) => ({
          id: item.id,
          assetId: null,
          type: item.type,
          status: item.status,
          installedAt: null,
          progress: item.progress,
          recordedAt: item.dueDate,
          source: "demo",
          sourceLicence: "Illustrative demo data",
          demo: true,
        })),
      satellite: [],
      landUse: [],
      drainage: null,
      generatedAt: new Date().toISOString(),
    }
  },
  getSatelliteMeasurements: (watershedId: string): Promise<SatelliteMeasurementRow[]> => {
    if (env.useMockApi) return Promise.resolve([])
    return apiRequest<SatelliteMeasurementRow[]>(
      `/api/v1/watersheds/${encodeURIComponent(watershedId)}/satellite`,
    )
  },
  getAnalysisJob: (jobId: string): Promise<AnalysisJobStatusRow> =>
    env.useMockApi
      ? Promise.resolve().then(() => {
          const job = jobStore.find((item) => item.id === jobId)
          if (!job) throw new Error("Analysis job was not found.")
          const statusMap: Record<AnalysisJob["status"], AnalysisJobStatusRow["status"]> = {
            Queued: "queued",
            Processing: "running",
            Completed: "done",
            Failed: "failed",
          }
          const status = statusMap[job.status]
          return {
            id: job.id,
            watershedId: job.watershedId,
            assetId: null,
            status,
            attempts: 0,
            error: null,
            createdAt: job.createdAt,
            finishedAt: null,
            params: {},
          }
        })
      : apiRequest<AnalysisJobStatusRow>(`/api/v1/analytics/jobs/${encodeURIComponent(jobId)}`),
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
  generatePilotSummary: (analysis: PilotAnalysis): Promise<AiPilotSummary> =>
    runPilotSummary(analysis),
  getInterventions: async () => {
    if (!env.useMockApi) return apiRequest<Intervention[]>("/api/v1/interventions")
    await delay()
    return interventionStore
  },
  createIntervention: async (input: InterventionInput): Promise<Intervention> => {
    if (!env.useMockApi) {
      return apiRequest<Intervention>("/api/v1/interventions", {
        method: "POST",
        body: JSON.stringify(input),
      })
    }
    const created: Intervention = {
      id: `int-${Date.now()}`,
      name: input.name,
      type: input.type,
      watershedId: input.watershedId,
      village: "",
      status: input.status,
      progress: input.status === "Completed" ? 100 : 0,
      budget: 0,
      dueDate: input.installedAt ?? new Date().toISOString().slice(0, 10),
      assetId: input.assetId ?? undefined,
      installedAt: input.installedAt,
    }
    interventionStore = [created, ...interventionStore]
    return created
  },
  updateIntervention: async (
    id: string,
    update: { status: Intervention["status"]; installedAt?: string; note?: string },
  ) => {
    if (!env.useMockApi) {
      return apiRequest<Intervention>(`/api/v1/interventions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      })
    }
    const current = interventionStore.find((item) => item.id === id)
    if (!current) throw new Error("Intervention was not found.")
    if (update.status === "Completed" && !update.installedAt && !current.installedAt) {
      throw new Error("installedAt is required when status is Completed.")
    }
    const updated = {
      ...current,
      ...update,
      progress: update.status === "Completed" ? 100 : current.progress,
    }
    interventionStore = interventionStore.map((item) => item.id === id ? updated : item)
    return updated
  },
  getReports: async () => {
    if (!env.useMockApi) return apiRequest<Report[]>("/api/v1/reports")
    await delay()
    return reportStore
  },
  generateWatershedReport: (
    watershedId: string,
    language: "en" | "hi" | "mr" = "en",
  ): Promise<SavedWatershedReport> => {
    if (env.useMockApi) {
      return Promise.reject(new Error("Server-side report generation is unavailable in mock mode."))
    }
    return apiRequest<SavedWatershedReport>(
      `/api/v1/watersheds/${encodeURIComponent(watershedId)}/report`,
      { method: "POST", body: JSON.stringify({ language }) },
    )
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
