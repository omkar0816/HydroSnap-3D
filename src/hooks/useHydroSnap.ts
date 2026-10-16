import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { hydrosnapService } from "@/services/hydrosnapService"
import type {
  AnalysisJob,
  FieldObservation,
  PilotAnalysis,
  Report,
} from "@/types/domain"

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

export function useHydroSnap() {
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
  })
  const observationsQuery = useQuery({
    queryKey: ["observations"],
    queryFn: hydrosnapService.getObservations,
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
    },
  })
  const verifyObservation = useMutation({
    mutationFn: hydrosnapService.verifyObservation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets"] })
      void queryClient.invalidateQueries({ queryKey: ["observations"] })
    },
  })
  const analyzePhoto = useMutation({
    mutationFn: ({
      image,
      imageSha256,
    }: {
      image: Blob
      imageSha256?: string
    }) => hydrosnapService.analyzePhoto(image, imageSha256),
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
  const createReport = useMutation({
    mutationFn: (report: Omit<Report, "id" | "createdAt" | "status">) =>
      hydrosnapService.createReport(report),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["reports"] }),
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
    analyzePhoto,
    createAnalysis,
    createReport,
  }
}
