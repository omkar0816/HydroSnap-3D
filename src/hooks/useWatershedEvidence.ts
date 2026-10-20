import { useQuery } from "@tanstack/react-query"
import { hydrosnapService } from "@/services/hydrosnapService"

export function useWatershedEvidence(watershedId?: string) {
  return useQuery({
    queryKey: ["watershed-evidence", watershedId],
    queryFn: () => {
      if (!watershedId) throw new Error("A watershed is required.")
      return hydrosnapService.getWatershedEvidence(watershedId)
    },
    enabled: Boolean(watershedId),
    staleTime: 60_000,
  })
}
