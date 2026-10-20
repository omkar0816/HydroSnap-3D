import { useQuery } from "@tanstack/react-query"
import { hydrosnapService } from "@/services/hydrosnapService"
import { env } from "@/config/env"

export function useWatershedSatellite(watershedId?: string) {
  return useQuery({
    queryKey: ["watershed-satellite", watershedId],
    queryFn: () => {
      if (!watershedId) throw new Error("A watershed is required.")
      return hydrosnapService.getSatelliteMeasurements(watershedId)
    },
    enabled: Boolean(watershedId),
    staleTime: 30_000,
  })
}

export function useAnalysisJob(jobId?: string) {
  return useQuery({
    queryKey: ["analysis-job", jobId],
    queryFn: () => {
      if (!jobId) throw new Error("An analysis job is required.")
      return hydrosnapService.getAnalysisJob(jobId)
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      if (env.useMockApi) return false
      const status = query.state.data?.status
      return status === "queued" || status === "running" ? 2_000 : false
    },
    retry: false,
  })
}
