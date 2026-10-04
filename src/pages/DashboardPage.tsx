import { useContext } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  Droplets,
  Leaf,
  MapPin,
  Plus,
  Waves,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AppContext } from "@/App"
import { DemoBadge } from "@/components/common/DemoBadge"
import { useHydroSnap } from "@/hooks/useHydroSnap"
import type {
  Asset,
  ThematicLayer,
  Watershed,
  WGS84Position,
} from "@/types/domain"
import type { FeatureCollection, LineStringGeometry } from "@/types/geojson"

const iconFor = {
  "Check dam": Waves,
  "Farm pond": Droplets,
  Plantation: Leaf,
  "Percolation tank": Droplets,
}

export function DashboardPage() {
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const currentUser = data.currentUser.data
  const watersheds = data.watersheds.data ?? []
  const activeWatershed =
    watersheds.find(({ id }) => id === context?.watershedId) ?? watersheds[0]
  const assets = (data.assets.data ?? []).filter(
    (asset) => asset.watershedId === activeWatershed?.id,
  )
  const reports = data.reports.data ?? []
  const observations = data.observations.data ?? []
  const thematicLayers = data.layers.data ?? []
  const analysisResults = data.results.data ?? []
  const ndviResults = analysisResults.filter((item) => item.metric === "NDVI")
  const ndwiResults = analysisResults.filter((item) => item.metric === "NDWI")
  const chartData = ndviResults.map(({ date, value }) => ({
    date: date.slice(5),
    value,
  }))
  const ndviValue = ndviResults.at(-1)?.value
  const ndwiValue = ndwiResults.at(-1)?.value
  const percentChange = (current?: number, previous?: number) =>
    current === undefined || previous === undefined || previous === 0
      ? undefined
      : ((current - previous) / previous) * 100
  const previousMonthLabel = (date?: string) =>
    date
      ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        })
      : undefined
  const previousNdvi = ndviResults.at(-2)
  const previousNdwi = ndwiResults.at(-2)
  const ndviChange = percentChange(ndviValue, previousNdvi?.value)
  const ndwiChange = percentChange(ndwiValue, previousNdwi?.value)
  const verified = assets.filter(({ status }) => status === "Verified").length
  const currentDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  const mapPreview = getMapPreview(activeWatershed, assets, thematicLayers)

  return (
    <div className="page-stack">
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-mark" /> WATERSHED MONITORING PLATFORM
          </div>
          <h1>
            Good morning, {currentUser?.name.split(" ")[0] ?? "there"}{" "}
            <span className="wave-emoji">✦</span>
          </h1>
          <p>Here’s what’s happening across your watershed today.</p>
        </div>
        <div className="heading-actions">
          <span className="date-pill">
            <Clock3 size={15} /> {currentDate}{" "}
            <span className="date-caret">⌄</span>
          </span>
          <Link to="/upload" className="button button-primary">
            <Plus size={17} /> Add field evidence
          </Link>
        </div>
      </div>

      <div className="demo-banner">
        <span className="demo-symbol">i</span>
        <span>
          <strong>DEMO ENVIRONMENT</strong>
          <span>
            {" "}
            Sample data and satellite analytics are simulated for demonstration
            only.
          </span>
        </span>
        <button
          onClick={() =>
            context?.notify(
              "This workspace is using sample demonstration data.",
            )
          }
        >
          Learn more <ArrowRight size={14} />
        </button>
      </div>

      <section className="metric-grid">
        <MetricCard
          label="Watershed area"
          value={activeWatershed ? `${activeWatershed.areaSqKm}` : "—"}
          unit="km²"
          icon={Waves}
          tint="blue"
          caption={`${activeWatershed?.villages ?? 0} villages monitored`}
          trend="Sample record"
        />
        <MetricCard
          label="Mapped assets"
          value={String(assets.length).padStart(2, "0")}
          unit=""
          icon={MapPin}
          tint="green"
          caption={`${verified} verified · ${assets.length - verified} need review`}
        />
        <MetricCard
          label="Vegetation index"
          value={ndviValue?.toFixed(2) ?? "—"}
          unit="NDVI"
          icon={Leaf}
          tint="mint"
          caption="Simulated Sep 2026 analysis"
          trend={
            ndviChange === undefined
              ? "—"
              : `${Math.abs(ndviChange).toFixed(1)}% vs ${previousMonthLabel(previousNdvi?.date)}`
          }
          up={ndviChange === undefined ? undefined : ndviChange >= 0}
        />
        <MetricCard
          label="Water index"
          value={ndwiValue?.toFixed(2) ?? "—"}
          unit="NDWI"
          icon={Droplets}
          tint="cyan"
          caption="Simulated Sep 2026 analysis"
          trend={
            ndwiChange === undefined
              ? "—"
              : `${Math.abs(ndwiChange).toFixed(1)}% vs ${previousMonthLabel(previousNdwi?.date)}`
          }
          up={ndwiChange === undefined ? undefined : ndwiChange >= 0}
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel vegetation-panel">
          <div className="panel-header">
            <div>
              <div className="section-kicker">
                <span className="kicker-dot green-dot" /> SATELLITE INSIGHTS
              </div>
              <h2>Vegetation health</h2>
              <p>Monthly NDVI trend · simulated sample data</p>
            </div>
            <button className="select-button">
              2026 <span>⌄</span>
            </button>
          </div>
          <div className="chart-summary">
            <strong>{ndviValue?.toFixed(2) ?? "—"}</strong>
            <span>Current NDVI</span>
            <span
              className={
                ndviChange !== undefined && ndviChange < 0
                  ? "trend-negative"
                  : "trend-positive"
              }
            >
              {ndviChange !== undefined && ndviChange < 0 ? (
                <ArrowDownRight size={14} />
              ) : (
                <ArrowUpRight size={14} />
              )}
              {ndviChange === undefined
                ? "—"
                : `${Math.abs(ndviChange).toFixed(1)}%`}
            </span>
            <small>compared to previous month · simulated</small>
          </div>
          <div className="chart-wrap">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 14, right: 12, left: -18, bottom: 0 }}
                >
                  <CartesianGrid stroke="#edf1f5" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#8b9aab", fontSize: 11 }}
                    dy={9}
                  />
                  <YAxis
                    domain={[0, 1]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9aa7b5", fontSize: 10 }}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                  />
                  <Tooltip
                    formatter={(value) => [
                      Number(value).toFixed(2),
                      "Simulated NDVI",
                    ]}
                    contentStyle={{
                      border: "1px solid #e4eaf0",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#29966b"
                    strokeWidth={2.5}
                    dot={{
                      r: 3.5,
                      fill: "#29966b",
                      strokeWidth: 2,
                      stroke: "#fff",
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : data.results.isLoading ? (
              <LoadingBlock />
            ) : (
              <div className="loading-block">
                No demo index results are available.
              </div>
            )}
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-line green-line" /> Vegetation health (NDVI)
            </span>
            <span>Source: simulated satellite data</span>
          </div>
        </section>

        <section className="panel watershed-card">
          <div className="panel-header">
            <div>
              <div className="section-kicker">
                <span className="kicker-dot blue-dot" /> ACTIVE WATERSHED
              </div>
              <h2>{activeWatershed?.name ?? "Loading watershed"}</h2>
              <p>
                {activeWatershed?.district}, {activeWatershed?.state}{" "}
                <span className="bullet-separator">·</span>{" "}
                {activeWatershed?.code}
              </p>
            </div>
            <button className="kebab" aria-label="Watershed options">
              ···
            </button>
          </div>
          <div className="mini-map-preview">
            <div className="mini-map-water" />
            <div className="mini-map-ridge ridge-one" />
            <div className="mini-map-ridge ridge-two" />
            <svg
              className="mini-map-boundary"
              viewBox="0 0 400 180"
              preserveAspectRatio="none"
            >
              {mapPreview.boundaryPaths.map((path, index) => (
                <path key={index} d={path} />
              ))}
            </svg>
            <svg
              className="mini-map-stream"
              viewBox="0 0 400 180"
              preserveAspectRatio="none"
            >
              {mapPreview.streamPaths.map((path, index) => (
                <path key={index} d={path} />
              ))}
            </svg>
            {mapPreview.assetPins.map((pin) => (
              <i
                key={pin.id}
                className="mini-map-pin"
                style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
              />
            ))}
            <span className="mini-map-label">
              {activeWatershed?.district ?? "Watershed"} district
            </span>
            <span className="mini-map-north">N ↑</span>
            <Link to="/map" className="mini-map-open">
              Open map <ArrowRight size={13} />
            </Link>
          </div>
          <div className="watershed-stats">
            <div>
              <strong>
                {activeWatershed?.areaSqKm ?? "—"} <small>km²</small>
              </strong>
              <span>Catchment area</span>
            </div>
            <div>
              <strong>{activeWatershed?.villages ?? "—"}</strong>
              <span>Villages</span>
            </div>
            <div>
              <strong>{assets.length}</strong>
              <span>Mapped assets</span>
            </div>
          </div>
        </section>
      </div>

      <div className="dashboard-grid lower-grid">
        <section className="panel activity-panel">
          <div className="panel-header">
            <div>
              <div className="section-kicker">
                <span className="kicker-dot amber-dot" /> FIELD OPERATIONS
              </div>
              <h2>Recent field activity</h2>
            </div>
            <Link className="panel-link" to="/evidence">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="activity-list">
            {observations.length ? observations.slice(0, 3).map((item) => (
                  <div className="activity-row" key={item.id}>
                    <div className="activity-icon">
                      <MapPin size={16} />
                    </div>
                    <div className="activity-copy">
                      <strong>
                        {item.assetType} · {item.village || "Field submission"}
                      </strong>
                      <span>
                        {item.officerName} · {item.inspectionDate}
                      </span>
                    </div>
                    <span
                      className={`status-pill ${
                        item.verificationStatus === "Verified"
                          ? "status-green"
                          : "status-amber"
                      }`}
                    >
                      {item.verificationStatus}
                    </span>
                  </div>
                )) : (data.assets.data ?? []).slice(0, 3).map((asset) => {
                  const Icon = iconFor[asset.type]
                  return (
                    <div className="activity-row" key={asset.id}>
                      <div className="activity-icon">
                        <Icon size={16} />
                      </div>
                      <div className="activity-copy">
                        <strong>{asset.name}</strong>
                        <span>
                          {asset.village} · {asset.lastInspected}
                        </span>
                      </div>
                      <span
                        className={`status-pill ${
                          asset.status === "Verified"
                            ? "status-green"
                            : asset.status === "Flagged"
                              ? "status-red"
                              : "status-amber"
                        }`}
                      >
                        {asset.status}
                      </span>
                    </div>
                  )
                })}
          </div>
          <Link to="/upload" className="activity-add">
            <Plus size={15} /> Add field observation
          </Link>
        </section>
        <section className="panel jobs-panel">
          <div className="panel-header">
            <div>
              <div className="section-kicker">
                <span className="kicker-dot purple-dot" /> ANALYSIS JOBS
              </div>
              <h2>Processing queue</h2>
              <DemoBadge label="Demo jobs" />
            </div>
            <Link className="panel-link" to="/analytics">
              All jobs <ArrowRight size={14} />
            </Link>
          </div>
          <div className="job-list">
            {(data.jobs.data ?? []).slice(0, 2).map((job) => (
              <div className="job-row" key={job.id}>
                <div
                  className={`job-icon ${
                    job.type === "NDVI" ? "job-green" : "job-purple"
                  }`}
                >
                  <Activity size={17} />
                </div>
                <div className="job-copy">
                  <div>
                    <strong>{job.type} analysis</strong>
                    <span
                      className={`status-pill ${
                        job.status === "Completed"
                          ? "status-green"
                          : "status-blue"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <small>
                    {job.id} <span>·</span> {job.createdAt}
                  </small>
                  {job.status === "Processing" && (
                    <div className="progress-track">
                      <span style={{ width: `${job.progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link to="/analytics" className="job-footer">
            <CircleDot size={14} /> {data.jobs.data?.length ?? 0} jobs in the
            last 30 days <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <div className="dashboard-footer">
        <span>
          <CheckCircle2 size={14} /> All systems operational
        </span>
        <span>
          Last synced just now <span className="bullet-separator">·</span>{" "}
          {reports.length} reports ready
        </span>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  tint,
  caption,
  trend,
  up,
}: {
  label: string
  value: string
  unit: string
  icon: typeof Waves
  tint: string
  caption: string
  trend?: string
  up?: boolean
}) {
  return (
    <div className="metric-card">
      <div className="metric-card-top">
        <span>{label}</span>
        <span className={`metric-icon ${tint}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-caption">{caption}</div>
      {trend && (
        <div
          className={`metric-trend ${
            up === undefined ? "neutral" : up ? "positive" : "negative"
          }`}
        >
          {up === undefined ? null : up ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
          {trend}
        </div>
      )}
    </div>
  )
}

function LoadingBlock() {
  return <div className="loading-block">Loading demo analysis…</div>
}

function getMapPreview(
  watershed: Watershed | undefined,
  assets: Asset[],
  layers: ThematicLayer[],
) {
  const geometry = watershed?.boundary.geometry
  const rings = !geometry
    ? []
    : geometry.type === "Polygon"
      ? geometry.coordinates.slice(0, 1)
      : geometry.coordinates.map((polygon) => polygon[0])
  const positions = rings.flat()
  if (!positions.length) {
    return { boundaryPaths: [], streamPaths: [], assetPins: [] }
  }

  const longitudes = positions.map(([longitude]) => longitude)
  const latitudes = positions.map(([, latitude]) => latitude)
  const minimumLongitude = Math.min(...longitudes)
  const maximumLongitude = Math.max(...longitudes)
  const minimumLatitude = Math.min(...latitudes)
  const maximumLatitude = Math.max(...latitudes)
  const longitudeSpan = maximumLongitude - minimumLongitude || 1
  const latitudeSpan = maximumLatitude - minimumLatitude || 1
  const project = ([longitude, latitude]: WGS84Position): [number, number] => [
    35 + ((longitude - minimumLongitude) / longitudeSpan) * 330,
    20 + (1 - (latitude - minimumLatitude) / latitudeSpan) * 140,
  ]
  const toSvgPath = (coordinates: WGS84Position[]) =>
    coordinates
      .map((position, index) => {
        const [x, y] = project(position)
        return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(" ")

  const streams = layers.find(({ id }) => id === "streams")?.geometry
  const streamFeatures: FeatureCollection<LineStringGeometry>["features"] =
    streams?.type === "FeatureCollection"
      ? streams.features.filter(
          (
            feature,
          ): feature is FeatureCollection<LineStringGeometry>["features"][number] =>
            feature.geometry.type === "LineString",
        )
      : []

  return {
    boundaryPaths: rings.map((ring) => `${toSvgPath(ring)} Z`),
    streamPaths: streamFeatures.map((feature) =>
      toSvgPath(feature.geometry.coordinates),
    ),
    assetPins: assets.map((asset) => {
      const [x, y] = project(asset.location.coordinates)
      return { id: asset.id, left: (x / 400) * 100, top: (y / 180) * 100 }
    }),
  }
}
