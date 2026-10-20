import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Activity, Play } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { hydrosnapService } from "@/services/hydrosnapService"
import { useAnalysisJob, useWatershedSatellite } from "@/hooks/useWatershedSatellite"
import type { AnalysisJob } from "@/types/domain"
import type { SatelliteMeasurementRow } from "@/types/evidence"

function windowDifference(rows: SatelliteMeasurementRow[], index: "NDVI" | "NDWI") {
  const baseline = rows.filter((row) => row.indexType === index && row.windowRole === "baseline").at(-1)
  const current = rows.filter((row) => row.indexType === index && row.windowRole === "current").at(-1)
  if (!baseline || !current || baseline.status !== "measured" || current.status !== "measured" ||
      baseline.validPixelPct === null || current.validPixelPct === null ||
      baseline.validPixelPct < 60 || current.validPixelPct < 60 ||
      baseline.mean === null || current.mean === null) return null
  return current.mean - baseline.mean
}

export function WatershedSatellitePanel({ watershedId }: { watershedId: string }) {
  const queryClient = useQueryClient()
  const satelliteQuery = useWatershedSatellite(watershedId)
  const [jobId, setJobId] = useState<string>()
  const [indexType, setIndexType] = useState<"NDVI" | "NDWI">("NDVI")
  const jobQuery = useAnalysisJob(jobId)
  const createJob = useMutation({
    mutationFn: (type: AnalysisJob["type"]) => hydrosnapService.createAnalysis(watershedId, type),
    onSuccess: (job) => setJobId(job.id),
  })

  useEffect(() => {
    if (jobQuery.data?.status === "done") {
      void queryClient.invalidateQueries({ queryKey: ["watershed-satellite", watershedId] })
    }
  }, [jobQuery.data?.status, queryClient, watershedId])

  const rows = satelliteQuery.data ?? []
  const chartData = rows
    .filter((row) => row.indexType === indexType && row.status === "measured" && row.mean !== null)
    .map((row) => ({
      date: row.windowEnd,
      mean: row.mean,
      role: row.windowRole,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const difference = windowDifference(rows, indexType)
  const jobStatus = jobQuery.data?.status ?? (createJob.isPending ? "submitting" : null)
  const coverageRows = rows.filter((row) => row.indexType === indexType)

  return (
    <section className="panel satellite-analysis-panel">
      <div className="table-toolbar">
        <div>
          <div className="section-kicker"><span className="kicker-dot blue-dot" /> SATELLITE INTELLIGENCE</div>
          <h2>Seasonal index comparison</h2>
          <p>Window differences are descriptive only; they are not an impact estimate.</p>
        </div>
        <div className="satellite-actions">
          <label className="table-select">
            <Activity size={14} />
            <select value={indexType} onChange={(event) => setIndexType(event.target.value as "NDVI" | "NDWI")}>
              <option value="NDVI">NDVI</option>
              <option value="NDWI">NDWI</option>
            </select>
          </label>
          <button
            className="button button-primary button-small"
            disabled={createJob.isPending || jobStatus === "queued" || jobStatus === "running"}
            onClick={() => createJob.mutate(indexType)}
          >
            <Play size={14} /> Run analysis
          </button>
        </div>
      </div>

      {jobStatus && (
        <div className={`satellite-job-status ${jobStatus === "failed" ? "status-red" : "status-blue"}`} role="status">
          {jobStatus === "submitting" ? "Submitting analysis job…" : `Job ${jobStatus}`}
          {jobQuery.data?.error ? ` · ${jobQuery.data.error}` : ""}
          {jobQuery.data?.attempts ? ` · attempt ${jobQuery.data.attempts}` : ""}
        </div>
      )}

      {chartData.length ? (
        <div className="satellite-chart" role="img" aria-label={`${indexType} mean by satellite window`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="date" tickLine={false} />
              <YAxis domain={[-1, 1]} tickLine={false} />
              <Tooltip formatter={(value) => [Number(value).toFixed(3), `${indexType} mean`]} />
              <Line type="monotone" dataKey="mean" stroke="#2f8d6e" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="satellite-empty-state">
          <Activity size={19} />
          <span>No measured {indexType} windows are available.</span>
        </div>
      )}

      <div className="satellite-comparison-summary">
        <strong>
          {difference === null
            ? "Difference between windows unavailable"
            : `Difference between windows: ${difference.toFixed(3)} ${indexType}`}
        </strong>
        <span>Computed from measured, season-matched baseline/current rows only.</span>
      </div>

      <div className="satellite-window-list">
        {coverageRows.map((row) => (
          <div className="satellite-window-row" key={row.id}>
            <strong>{row.windowRole}: {row.windowStart} to {row.windowEnd}</strong>
            <span>{row.status === "measured" ? `Mean ${row.mean?.toFixed(3)}` : "Insufficient data; no value reported"}</span>
            <span>Valid pixels {row.validPixelPct === null ? "not recorded" : `${row.validPixelPct.toFixed(1)}%`} · {row.sceneCount ?? "not recorded"} scenes</span>
            {row.demo && <span className="status-pill status-amber">DEMO</span>}
            {row.attribution && <small>{row.attribution}</small>}
          </div>
        ))}
      </div>
      {satelliteQuery.error && <p role="alert">{satelliteQuery.error.message}</p>}
    </section>
  )
}
