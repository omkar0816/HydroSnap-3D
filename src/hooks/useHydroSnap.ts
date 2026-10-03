import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { hydrosnapService } from "@/services/hydrosnapService"
import type { AnalysisJob, FieldObservation, Report } from "@/types/domain"

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
    interventions: interventionsQuery,
    reports: reportsQuery,
    saveObservation,
    verifyObservation,
    createAnalysis,
    createReport,
  }
}
