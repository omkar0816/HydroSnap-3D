import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { hydrosnapService } from "@/services/hydrosnapService"
import type {
  AnalysisJob,
  FieldObservation,
  Intervention,
  PilotAnalysis,
  Report,
} from "@/types/domain"
import type { SavedWatershedReport } from "../../shared/reportFacts"

export function usePilotSummary(analysis?: PilotAnalysis) {
  return useQuery({
    queryKey: ["pilot-summary", analysis?.generatedAt],
    queryFn: () => {
      if (!analysis) throw new Error("Pilot analysis is not available.")
      return hydrosnapService.generatePilotSummary(analysis)
    },
    enabled: Boolean(analysis),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useHydroSnap(options: {
  loadAssets?: boolean
  loadObservations?: boolean
  loadInterventions?: boolean
} = {}) {
  const queryClient = useQueryClient()
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: hydrosnapService.getCurrentUser,
  })
  const teamMembersQuery = useQuery({
    queryKey: ["team-members"],
    queryFn: hydrosnapService.getTeamMembers,
  })
  const watershedsQuery = useQuery({
    queryKey: ["watersheds"],
    queryFn: hydrosnapService.getWatersheds,
  })
  const layersQuery = useQuery({
    queryKey: ["layers"],
    queryFn: hydrosnapService.getLayers,
  })
  const assetsQuery = useQuery({
    queryKey: ["assets"],
    queryFn: hydrosnapService.getAssets,
    enabled: options.loadAssets !== false,
  })
  const observationsQuery = useQuery({
    queryKey: ["observations"],
    queryFn: hydrosnapService.getObservations,
    enabled: options.loadObservations !== false,
  })
  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: hydrosnapService.getJobs,
  })
  const resultsQuery = useQuery({
    queryKey: ["results"],
    queryFn: hydrosnapService.getResults,
  })
  const pilotAnalysisQuery = useQuery({
    queryKey: ["pilot-analysis"],
    queryFn: hydrosnapService.getPilotAnalysis,
  })
  const interventionsQuery = useQuery({
    queryKey: ["interventions"],
    queryFn: hydrosnapService.getInterventions,
    enabled: options.loadInterventions !== false,
  })
  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: hydrosnapService.getReports,
  })

  const saveObservation = useMutation({
    mutationFn: (observation: FieldObservation) =>
      hydrosnapService.saveObservation(observation),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] })
      void queryClient.invalidateQueries({ queryKey: ["observations"] })
      // The Field evidence page and the map read the per-watershed evidence bundle.
      void queryClient.invalidateQueries({ queryKey: ["watershed-evidence"] })
    },
  })
  const verifyObservation = useMutation({
    mutationFn: hydrosnapService.verifyObservation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] })
      void queryClient.invalidateQueries({ queryKey: ["observations"] })
      void queryClient.invalidateQueries({ queryKey: ["watershed-evidence"] })
    },
  })
  const createAnalysis = useMutation({
    mutationFn: ({
      watershedId,
      type,
    }: {
      watershedId: string
      type: AnalysisJob["type"]
    }) => hydrosnapService.createAnalysis(watershedId, type),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  })
  const generateWatershedReport = useMutation({
    mutationFn: ({ watershedId, language }: { watershedId: string; language?: "en" | "hi" | "mr" }) =>
      hydrosnapService.generateWatershedReport(watershedId, language),
    onSuccess: (report: SavedWatershedReport) => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] })
      void queryClient.invalidateQueries({ queryKey: ["watershed-reports", report.watershedId] })
    },
  })
  const createIntervention = useMutation({
    mutationFn: hydrosnapService.createIntervention,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interventions"] })
      void queryClient.invalidateQueries({ queryKey: ["watershed-evidence"] })
    },
  })
  const updateIntervention = useMutation({
    mutationFn: ({ id, ...update }: {
      id: string
      status: Intervention["status"]
      installedAt?: string
      note?: string
    }) => hydrosnapService.updateIntervention(id, update),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interventions"] })
      void queryClient.invalidateQueries({ queryKey: ["watershed-evidence"] })
      void queryClient.invalidateQueries({ queryKey: ["jobs"] })
    },
  })
  const refreshInterventionIndices = useMutation({
    mutationFn: hydrosnapService.refreshInterventionIndices,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["watershed-evidence"] })
      void queryClient.invalidateQueries({ queryKey: ["jobs"] })
    },
  })

  return {
    currentUser: currentUserQuery,
    teamMembers: teamMembersQuery,
    watersheds: watershedsQuery,
    layers: layersQuery,
    assets: assetsQuery,
    observations: observationsQuery,
    jobs: jobsQuery,
    results: resultsQuery,
    pilotAnalysis: pilotAnalysisQuery,
    interventions: interventionsQuery,
    reports: reportsQuery,
    saveObservation,
    verifyObservation,
    createAnalysis,
    generateWatershedReport,
    createIntervention,
    updateIntervention,
    refreshInterventionIndices,
  }
}
