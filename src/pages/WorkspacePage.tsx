import { useContext, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileBarChart2,
  FileImage,
  Filter,
  Flag,
  Layers3,
  Leaf,
  MapPin as MapPinIcon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sprout,
  Waves,
  X,
} from "lucide-react"
import { AppContext } from "@/App"
import { useHydroSnap } from "@/hooks/useHydroSnap"
import { TrustPanel } from "@/components/evidence/TrustPanel"
import { downloadObservationAudit } from "@/utils/exporters"
import type {
  AnalysisJob,
  Asset,
  FieldObservation,
  Intervention,
  Report,
} from "@/types/domain"

type Section = "watersheds" | "watershed-detail" | "layers" | "analytics" | "evidence" | "interventions" | "reports" | "administration" | "settings"

const pageInfo: Record<Section, {
  title: string
  description: string
  kicker: string
}> = {
  watersheds: {
    title: "Watershed management",
    description:
      "Explore and manage watershed boundaries and monitoring coverage.",
    kicker: "SPATIAL INTELLIGENCE",
  },
  "watershed-detail": {
    title: "Watershed details",
    description: "Boundary, monitoring coverage and associated field activity.",
    kicker: "WATERSHED PROFILE",
  },
  layers: {
    title: "Thematic layers",
    description:
      "Review available spatial layers and satellite analysis overlays.",
    kicker: "SPATIAL INTELLIGENCE",
  },
  analytics: {
    title: "Change detection & analytics",
    description: "Run and review watershed environmental analysis jobs.",
    kicker: "SATELLITE INSIGHTS",
  },
  evidence: {
    title: "Field evidence",
    description: "Search, inspect and verify geo-coded field observations.",
    kicker: "FIELD OPERATIONS",
  },
  interventions: {
    title: "Interventions",
    description: "Monitor planned and active watershed development work.",
    kicker: "FIELD OPERATIONS",
  },
  reports: {
    title: "Reports",
    description: "Configure watershed, field inspection and analysis reports.",
    kicker: "OUTPUTS",
  },
  administration: {
    title: "Administration",
    description: "Manage roles, field teams and access-ready settings.",
    kicker: "SYSTEM",
  },
  settings: {
    title: "Settings",
    description:
      "Configure your workspace preferences and offline data settings.",
    kicker: "SYSTEM",
  },
}

const layerPresentation = {
  boundary: { icon: Waves, tint: "green" },
  streams: { icon: Waves, tint: "blue" },
  ndvi: { icon: Leaf, tint: "green" },
  ndwi: { icon: Layers3, tint: "cyan" },
}
const mapLayerKeys = ["boundary", "streams", "assets", "ndvi", "ndwi"] as const
type MapLayerKey = typeof mapLayerKeys[number]

export function WorkspacePage({ section }: { section: Section }) {
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const location = useLocation()
  const params = useParams()
  const [query, setQuery] = useState(
    new URLSearchParams(location.search).get("search") ?? "",
  )
  const [statusFilter, setStatusFilter] = useState("All statuses")
  const [assetTypeFilter, setAssetTypeFilter] = useState("All types")
  const [busy, setBusy] = useState(false)
  const [selectedLayer, setSelectedLayer] = useState<string>()
  const watersheds = data.watersheds.data ?? []
  const allAssets = data.assets.data ?? []
  const thematicLayers = data.layers.data ?? []
  const analysisResults = data.results.data ?? []
  const latestIndex = (metric: "NDVI" | "NDWI") =>
    analysisResults.filter((result) => result.metric === metric).at(-1)
  const activeWatershed =
    watersheds.find(
      ({ id }) =>
        id ===
        (section === "watershed-detail"
          ? params.watershedId
          : context?.watershedId),
    ) ?? watersheds[0]
  const assets = allAssets.filter(
    (asset) => asset.watershedId === activeWatershed?.id,
  )
  const filteredAssets = useMemo(
    () =>
      allAssets.filter((asset) => {
        const matchesText =
          `${asset.name} ${asset.village} ${asset.type} ${asset.description}`
            .toLowerCase()
            .includes(query.toLowerCase())
        const matchesStatus =
          statusFilter === "All statuses" || asset.status === statusFilter
        const matchesType =
          assetTypeFilter === "All types" || asset.type === assetTypeFilter
        const matchesWatershed =
          section === "evidence" || asset.watershedId === activeWatershed?.id
        return matchesText && matchesStatus && matchesType && matchesWatershed
      }),
    [
      activeWatershed?.id,
      allAssets,
      assetTypeFilter,
      query,
      section,
      statusFilter,
    ],
  )
  const filteredWatersheds = watersheds.filter((watershed) =>
    `${watershed.name} ${watershed.code} ${watershed.district}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const searchParameter =
    new URLSearchParams(location.search).get("search") ?? ""

  useEffect(() => {
    setQuery(searchParameter)
  }, [searchParameter])

  async function makeAnalysis(type: AnalysisJob["type"]) {
    if (!activeWatershed) return
    setBusy(true)
    try {
      const job = await data.createAnalysis.mutateAsync({
        watershedId: activeWatershed.id,
        type,
      })
      context?.notify(`${type} demo analysis queued · ${job.id}`)
    } catch (error) {
      context?.notify(
        error instanceof Error ? error.message : "Could not start analysis.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function makeReport(type: Report["type"]) {
    if (!activeWatershed) return
    setBusy(true)
    try {
      await data.createReport.mutateAsync({
        name: `${activeWatershed.name} ${type.toLowerCase()}`,
        type,
        watershedId: activeWatershed.id,
      })
      context?.notify("Demo report created and added to your report list.")
    } catch (error) {
      context?.notify(
        error instanceof Error ? error.message : "Could not create report.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function verifyAsset(asset: Asset) {
    try {
      await data.verifyObservation.mutateAsync(asset.id)
      context?.notify(`${asset.name} marked verified.`)
    } catch (error) {
      context?.notify(
        error instanceof Error
          ? error.message
          : "Could not verify field observation.",
      )
    }
  }

  return (
    <div className="page-stack workspace-page">
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-mark" /> {pageInfo[section].kicker}
          </div>
          <h1>{pageInfo[section].title}</h1>
          <p>{pageInfo[section].description}</p>
        </div>
        {section === "evidence" ? (
          <Link to="/upload" className="button button-primary">
            <Plus size={16} /> Add observation
          </Link>
        ) : section === "watersheds" ? (
          <button
            className="button button-primary"
            onClick={() =>
              context?.notify(
                "Watershed creation is ready for the future FastAPI integration.",
              )
            }
          >
            <Plus size={16} /> Add watershed
          </button>
        ) : null}
      </div>

      {section === "watersheds" && (
        <section className="panel workspace-table-panel">
          <div className="table-toolbar">
            <label className="table-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search watershed or code..."
              />
            </label>
            <span className="table-result-count">
              {filteredWatersheds.length} watersheds
            </span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>WATERSHED</th>
                  <th>CODE</th>
                  <th>LOCATION</th>
                  <th>AREA</th>
                  <th>VILLAGES</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredWatersheds.map((watershed) => (
                  <tr key={watershed.id}>
                    <td>
                      <Link
                        className="table-primary-link"
                        to={`/watersheds/${watershed.id}`}
                      >
                        {watershed.name}
                        <small>Watershed boundary available</small>
                      </Link>
                    </td>
                    <td>
                      <span className="code-chip">{watershed.code}</span>
                    </td>
                    <td>
                      {watershed.district}, {watershed.state}
                    </td>
                    <td>{watershed.areaSqKm} km²</td>
                    <td>{watershed.villages}</td>
                    <td>
                      <span className="status-pill status-green">
                        {watershed.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        to={`/watersheds/${watershed.id}`}
                        className="icon-button small-icon"
                        aria-label={`Open ${watershed.name}`}
                      >
                        <ArrowRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footnote">
            Demo boundary data shown in GeoJSON-compatible WGS84 coordinates.
          </div>
        </section>
      )}

      {section === "watershed-detail" && activeWatershed && (
        <>
          <section className="detail-hero panel">
            <div className="detail-hero-icon">
              <Waves size={23} />
            </div>
            <div className="detail-hero-copy">
              <span className="code-chip">{activeWatershed.code}</span>
              <h2>{activeWatershed.name}</h2>
              <p>
                {activeWatershed.district}, {activeWatershed.state} ·{" "}
                {activeWatershed.villages} villages
              </p>
            </div>
            <span className="status-pill status-green">
              {activeWatershed.status}
            </span>
            <Link to="/map" className="button button-primary">
              View on map <ArrowRight size={15} />
            </Link>
          </section>
          <div className="metric-grid detail-metrics">
            <Metric
              label="Catchment area"
              value={`${activeWatershed.areaSqKm} km²`}
              icon={Waves}
            />
            <Metric
              label="Mapped assets"
              value={String(assets.length)}
              icon={Layers3}
            />
            <Metric
              label="Verified assets"
              value={String(
                assets.filter((asset) => asset.status === "Verified").length,
              )}
              icon={ShieldCheck}
            />
            <Metric
              label="Villages covered"
              value={String(activeWatershed.villages)}
              icon={MapPinIcon}
            />
          </div>
          <AssetTable
            assets={assets}
            observations={data.observations.data ?? []}
            canVerify={
              data.currentUser.data?.role === "GIS Analyst" ||
              data.currentUser.data?.role === "Administrator"
            }
            onVerify={verifyAsset}
          />
        </>
      )}

      {section === "evidence" && (
        <section className="panel workspace-table-panel">
          <div className="table-toolbar evidence-toolbar">
            <label className="table-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search assets, villages, notes..."
              />
            </label>
            <label className="table-select">
              <Filter size={14} />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All statuses</option>
                <option>Verified</option>
                <option>Pending review</option>
                <option>Flagged</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <label className="table-select">
              <Layers3 size={14} />
              <select
                value={assetTypeFilter}
                onChange={(event) => setAssetTypeFilter(event.target.value)}
              >
                <option>All types</option>
                <option>Check dam</option>
                <option>Farm pond</option>
                <option>Plantation</option>
                <option>Percolation tank</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
          <AssetTable
            assets={filteredAssets}
            observations={data.observations.data ?? []}
            canVerify={
              data.currentUser.data?.role === "GIS Analyst" ||
              data.currentUser.data?.role === "Administrator"
            }
            onVerify={verifyAsset}
          />
        </section>
      )}

      {section === "layers" && (
        <>
          <div className="layers-intro demo-banner">
            <span className="demo-symbol">i</span>
            <span>
              <strong>SIMULATED THEMATIC LAYERS</strong>
              <span>
                {" "}
                NDVI and NDWI overlays in this workspace are illustrative demo
                data, not environmental findings.
              </span>
            </span>
            <Link to="/map">
              Open map <ArrowRight size={14} />
            </Link>
          </div>
          <div className="thematic-grid">
            {thematicLayers.map((layer) => {
              const presentation = Object.entries(layerPresentation).find(
                ([id]) => id === layer.id,
              )?.[1] ?? { icon: Layers3, tint: "blue" }
              const Icon = presentation.icon
              const layerKey = getMapLayerKey(layer.id)
              const isVisible = layerKey
                ? (context?.visibleLayers[layerKey] ?? layer.visibleByDefault)
                : layer.visibleByDefault

              return (
                <article className="panel thematic-card" key={layer.id}>
                  <div className={`thematic-icon ${presentation.tint}`}>
                    <Icon size={20} />
                  </div>
                  <div className="thematic-card-head">
                    <span className="section-kicker">{layer.group}</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        disabled={!layerKey}
                        aria-label={`Toggle ${layer.name} on the map`}
                        onChange={() => {
                          if (layerKey) {
                            context?.setVisibleLayers((state) => ({
                              ...state,
                              [layerKey]: !state[layerKey],
                            }))
                          }
                        }}
                      />
                      <span />
                    </label>
                  </div>
                  <h3>{layer.name}</h3>
                  <p>{layer.description}</p>
                  <div className="thematic-card-foot">
                    <span>{layer.detail}</span>
                    <span>{layer.dateLabel}</span>
                  </div>
                  <button
                    className="thematic-details"
                    onClick={() =>
                      setSelectedLayer(
                        selectedLayer === layer.id ? undefined : layer.id,
                      )
                    }
                  >
                    {selectedLayer === layer.id
                      ? "Hide details"
                      : "Layer details"}{" "}
                    <ChevronDown size={14} />
                  </button>
                  {selectedLayer === layer.id && (
                    <div className="thematic-detail-box">
                      Layer ID: <code>{layer.id}</code>
                      <br />
                      Rendering: MapLibre spatial overlay
                      <br />
                      Source status:{" "}
                      {layer.demo ? "Simulated demo" : "API data"}
                    </div>
                  )}
                </article>
              )
            })}
            {!thematicLayers.length && (
              <div className="empty-state">
                <Layers3 size={22} />
                <strong>No thematic layers available</strong>
                <span>Layer data may still be loading or unavailable.</span>
              </div>
            )}
          </div>
        </>
      )}

      {section === "analytics" && (
        <>
          <div className="analysis-callout">
            <div className="analysis-callout-icon">
              <Activity size={20} />
            </div>
            <div>
              <strong>Demo analysis queue</strong>
              <p>
                Analysis jobs simulate a processing lifecycle. Connect a backend
                and satellite provider before using results operationally.
              </p>
            </div>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => void makeAnalysis("NDVI")}
            >
              <Leaf size={15} /> Run NDVI
            </button>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void makeAnalysis("NDWI")}
            >
              <Waves size={15} /> Run NDWI
            </button>
          </div>
          <div className="analysis-grid">
            <section className="panel analysis-summary">
              <div className="section-kicker">
                <span className="kicker-dot green-dot" /> LATEST DEMO INDICES
              </div>
              <h2>Environmental indicators</h2>
              <div className="index-reading">
                <span className="thematic-icon green">
                  <Leaf size={18} />
                </span>
                <div>
                  <strong>
                    {latestIndex("NDVI")?.value.toFixed(2) ?? "—"}{" "}
                    <small>NDVI</small>
                  </strong>
                  <span>Simulated Sep 2026 value</span>
                </div>
                <span className="index-range green-range">Illustrative</span>
              </div>
              <div className="index-reading">
                <span className="thematic-icon cyan">
                  <Waves size={18} />
                </span>
                <div>
                  <strong>
                    {latestIndex("NDWI")?.value.toFixed(2) ?? "—"}{" "}
                    <small>NDWI</small>
                  </strong>
                  <span>Simulated Sep 2026 value</span>
                </div>
                <span className="index-range blue-range">Illustrative</span>
              </div>
              <div className="index-disclaimer">
                These sample figures are not observations or environmental
                claims.
              </div>
            </section>
            <section className="panel jobs-table-panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">
                    <span className="kicker-dot purple-dot" /> JOB HISTORY
                  </div>
                  <h2>Analysis jobs</h2>
                </div>
                <button
                  className="icon-button small-icon"
                  onClick={() => void data.jobs.refetch()}
                  aria-label="Refresh analysis jobs"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="job-history-list">
                {(data.jobs.data ?? []).map((job) => (
                  <div className="job-history-row" key={job.id}>
                    <div className="job-history-icon">
                      <Activity size={16} />
                    </div>
                    <div>
                      <strong>{job.type} analysis</strong>
                      <small>
                        {job.id} · {job.createdAt}
                      </small>
                    </div>
                    <span
                      className={`status-pill ${
                        job.status === "Completed"
                          ? "status-green"
                          : "status-blue"
                      }`}
                    >
                      {job.status}
                    </span>
                    <div className="job-history-progress">
                      <i style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="panel analysis-note">
            <CircleHelp size={17} />
            <span>
              <strong>Future analysis pipeline</strong> · DEM hydrology,
              satellite time series, land cover, slope and change detection are
              planned for the FastAPI/Celery/Google Earth Engine integration.
            </span>
          </section>
        </>
      )}

      {section === "interventions" && (
        <section className="panel workspace-table-panel">
          <div className="table-toolbar">
            <div className="table-result-count">
              {(data.interventions.data ?? []).length} interventions ·{" "}
              {activeWatershed?.name}
            </div>
            <button
              className="button button-primary button-small"
              onClick={() =>
                context?.notify(
                  "Intervention creation is ready for the future API integration.",
                )
              }
            >
              <Plus size={15} /> Add intervention
            </button>
          </div>
          <div className="intervention-grid">
            {(data.interventions.data ?? [])
              .filter((item) => item.watershedId === activeWatershed?.id)
              .map((item) => (
                <InterventionCard key={item.id} item={item} />
              ))}
          </div>
        </section>
      )}

      {section === "reports" && (
        <section className="panel workspace-table-panel">
          <div className="table-toolbar">
            <div>
              <strong className="panel-toolbar-title">Report library</strong>
              <span className="table-result-count">
                {(data.reports.data ?? []).length} reports
              </span>
            </div>
            <button
              className="button button-primary button-small"
              disabled={busy}
              onClick={() => void makeReport("Watershed summary")}
            >
              <Plus size={15} /> Generate report
            </button>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>REPORT</th>
                  <th>TYPE</th>
                  <th>CREATED</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.reports.data ?? []).map((report) => (
                  <tr key={report.id}>
                    <td>
                      <span className="report-file-icon">
                        <FileBarChart2 size={17} />
                      </span>
                      <span className="report-name">{report.name}</span>
                    </td>
                    <td>{report.type}</td>
                    <td>{report.createdAt}</td>
                    <td>
                      <span className="status-pill status-green">
                        {report.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button small-icon"
                        aria-label={`Preview ${report.name}`}
                        onClick={() =>
                          context?.notify(
                            `Report preview: ${report.name} · PDF generation is simulated.`,
                          )
                        }
                      >
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-config">
            <div>
              <strong>Report configuration</strong>
              <small>Select a report type to create a sample preview.</small>
            </div>
            <div>
              {([
                "Field inspection",
                "Asset registry",
                "Analytics",
              ] as const).map((type) => (
                <button
                  key={type}
                  className="button button-secondary button-small"
                  disabled={busy}
                  onClick={() => void makeReport(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {section === "administration" && (
        <div className="settings-grid">
          <section className="panel settings-panel">
            <div className="section-kicker">
              <span className="kicker-dot blue-dot" /> WORKSPACE ACCESS
            </div>
            <h2>Field team</h2>
            <p>Demo roster and role-based access preview.</p>
            <div className="team-list">
              {(data.teamMembers.data ?? []).map((member) => (
                <div className="team-row" key={member.id}>
                  <span className="avatar">{member.initials}</span>
                  <span>
                    <strong>{member.name}</strong>
                    <small>
                      {member.role} · {member.area}
                    </small>
                  </span>
                  <span className="member-active">
                    <i /> {member.status}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="button button-secondary"
              onClick={() =>
                context?.notify(
                  "Invite flow is prepared for the future identity provider.",
                )
              }
            >
              <Plus size={15} /> Invite team member
            </button>
          </section>
          <section className="panel settings-panel">
            <div className="section-kicker">
              <span className="kicker-dot amber-dot" /> AUDIT READINESS
            </div>
            <h2>Verification controls</h2>
            <p>
              Field submissions are captured with verification state and audit
              history.
            </p>
            <div className="admin-check">
              <ShieldCheck size={17} />
              <div>
                <strong>Officer review enabled</strong>
                <small>New submissions start as pending review.</small>
              </div>
              <Check size={16} />
            </div>
            <div className="admin-check">
              <Flag size={17} />
              <div>
                <strong>Flagged evidence status</strong>
                <small>Flagged assets remain visible for follow-up.</small>
              </div>
              <Check size={16} />
            </div>
            <div className="admin-disclaimer">
              Authentication, staff management and audit persistence require
              backend integration.
            </div>
          </section>
        </div>
      )}

      {section === "settings" && (
        <div className="settings-grid">
          <section className="panel settings-panel">
            <div className="section-kicker">
              <span className="kicker-dot blue-dot" /> DATA CONNECTION
            </div>
            <h2>API configuration</h2>
            <p>Frontend connection status for future FastAPI services.</p>
            <div className="setting-line">
              <span>
                <strong>Mode</strong>
                <small>Data source for this workspace</small>
              </span>
              <span className="status-pill status-amber">DEMO · MOCK API</span>
            </div>
            <div className="setting-line">
              <span>
                <strong>API endpoint</strong>
                <small>VITE_API_BASE_URL</small>
              </span>
              <code>
                {import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"}
              </code>
            </div>
            <div className="setting-line">
              <span>
                <strong>Mock API</strong>
                <small>VITE_USE_MOCK_API</small>
              </span>
              <code>{import.meta.env.VITE_USE_MOCK_API ?? "true"}</code>
            </div>
            <button
              className="button button-secondary"
              onClick={() =>
                context?.notify(
                  "Configure VITE_API_BASE_URL and VITE_USE_MOCK_API in your local environment.",
                )
              }
            >
              <Settings2 size={15} /> Configure environment
            </button>
          </section>
          <section className="panel settings-panel">
            <div className="section-kicker">
              <span className="kicker-dot green-dot" /> OFFLINE FIELDWORK
            </div>
            <h2>Local data</h2>
            <p>
              Field evidence is stored in this browser while offline mode is
              being prepared.
            </p>
            <div className="offline-status-card">
              <div>
                <ArrowDownToLine size={18} />
              </div>
              <span>
                <strong>IndexedDB draft storage</strong>
                <small>
                  Field observation images and metadata can be stored on this
                  device.
                </small>
              </span>
              <span className="status-pill status-green">READY</span>
            </div>
            <div className="offline-status-card">
              <div>
                <RefreshCw size={18} />
              </div>
              <span>
                <strong>Background sync</strong>
                <small>
                  Automatic sync requires a configured API connection.
                </small>
              </span>
              <span className="status-pill status-amber">FUTURE</span>
            </div>
            <button
              className="button button-secondary"
              onClick={() =>
                context?.notify(
                  "Offline drafts are retained in this browser. Sync activates when the API is configured.",
                )
              }
            >
              <RefreshCw size={15} /> Check sync status
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

function AssetTable({
  assets,
  observations,
  canVerify,
  onVerify,
}: {
  assets: Asset[]
  observations: FieldObservation[]
  /** Only GIS Analysts and Administrators may verify (role preview). */
  canVerify: boolean
  onVerify: (asset: Asset) => void
}) {
  const [activeAsset, setActiveAsset] = useState<Asset>()
  const [flagged, setFlagged] = useState<string[]>([])
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>ASSET</th>
            <th>LOCATION</th>
            <th>COORDINATES</th>
            <th>LAST INSPECTED</th>
            <th>STATUS</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const isFlagged =
              flagged.includes(asset.id) || asset.status === "Flagged"
            return (
              <tr key={asset.id}>
                <td>
                  <button
                    className="table-asset-link"
                    onClick={() =>
                      setActiveAsset(
                        activeAsset?.id === asset.id ? undefined : asset,
                      )
                    }
                  >
                    <span className="table-asset-icon">
                      <FileImage size={16} />
                    </span>
                    <span>
                      <strong>{asset.name}</strong>
                      <small>{asset.type}</small>
                    </span>
                  </button>
                </td>
                <td>
                  {asset.village}
                  <small className="table-subline">{asset.description}</small>
                </td>
                <td className="coordinate-cell">
                  {asset.location.coordinates[1].toFixed(5)},{" "}
                  {asset.location.coordinates[0].toFixed(5)}
                </td>
                <td>{asset.lastInspected}</td>
                <td>
                  <span
                    className={`status-pill ${
                      isFlagged
                        ? "status-red"
                        : asset.status === "Verified"
                          ? "status-green"
                          : "status-amber"
                    }`}
                  >
                    {isFlagged ? "Flagged" : asset.status}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      title="View evidence"
                      onClick={() =>
                        setActiveAsset(
                          activeAsset?.id === asset.id ? undefined : asset,
                        )
                      }
                    >
                      <FileImage size={14} />
                    </button>
                    {canVerify && asset.status !== "Verified" && !isFlagged && (
                      <button
                        title="Verify submission"
                        onClick={() => onVerify(asset)}
                      >
                        <ShieldCheck size={14} />
                      </button>
                    )}
                    <button
                      title={isFlagged ? "Remove flag" : "Flag asset"}
                      onClick={() =>
                        setFlagged((previous) =>
                          isFlagged
                            ? previous.filter((id) => id !== asset.id)
                            : [...previous, asset.id],
                        )
                      }
                    >
                      <Flag size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {activeAsset && (
        <div className="asset-evidence-preview">
          <span className="asset-detail-icon">
            <FileImage size={17} />
          </span>
          <span>
            <strong>{activeAsset.name}</strong>
            <small>
              {activeAsset.description} · Location source:{" "}
              {activeAsset.location.source}
            </small>
          </span>
          <button
            className="icon-button small-icon"
            onClick={() => setActiveAsset(undefined)}
            aria-label="Close evidence preview"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {activeAsset &&
        (() => {
          const observation = observations.find(
            (item) => item.id === activeAsset.id,
          )
          if (!observation) return null
          return (
            <div className="hs-evidence-detail">
              {observation.imageDataUrl && (
                <img src={observation.imageDataUrl} alt="Field evidence" />
              )}
              <TrustPanel
                trust={observation.trust}
                imageHash={observation.imageSha256}
                snapDistanceMeters={observation.snapDistanceMeters}
              />
              <div className="hs-audit">
                <strong>Audit trail</strong>
                <ul>
                  {observation.auditHistory.map((entry, index) => (
                    <li key={index}>
                      <small>{entry.timestamp.slice(0, 19).replace("T", " ")}</small>{" "}
                      {entry.action} · {entry.actor}
                    </li>
                  ))}
                </ul>
                <button
                  className="button button-secondary button-small"
                  onClick={() => downloadObservationAudit(observation)}
                >
                  Download audit record (JSON)
                </button>
              </div>
            </div>
          )
        })()}
      {!assets.length && (
        <div className="empty-state">
          <FileImage size={22} />
          <strong>No field evidence matches</strong>
          <span>Try a different search or add a field observation.</span>
          <Link to="/upload" className="button button-primary button-small">
            Add observation
          </Link>
        </div>
      )}
      <div className="table-footnote">
        Coordinates are WGS84 longitude / latitude on the API and shown as
        latitude, longitude here. Sample assets are demo data.
      </div>
    </div>
  )
}

function InterventionCard({ item }: { item: Intervention }) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <article className="intervention-card">
      <div className="intervention-card-top">
        <span className="intervention-icon">
          <Sprout size={18} />
        </span>
        <span
          className={`status-pill ${
            item.status === "Completed"
              ? "status-green"
              : item.status === "In progress"
                ? "status-blue"
                : "status-amber"
          }`}
        >
          {item.status}
        </span>
        <button
          className="icon-button small-icon"
          aria-label="Intervention options"
          onClick={() => setShowDetails((value) => !value)}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
      <span className="section-kicker">{item.type}</span>
      <h3>{item.name}</h3>
      <p>
        {item.village} · Due {item.dueDate}
      </p>
      <div className="intervention-progress-label">
        <span>Progress</span>
        <strong>{item.progress}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${item.progress}%` }} />
      </div>
      <div className="intervention-card-foot">
        <span>Budget</span>
        <strong>₹{item.budget.toLocaleString("en-IN")}</strong>
        <button
          className="text-button"
          onClick={() => setShowDetails((value) => !value)}
        >
          {showDetails ? "Hide details" : "View details"}{" "}
          <ArrowRight size={13} />
        </button>
      </div>
      {showDetails && (
        <div className="intervention-details">
          <strong>Demo intervention details</strong>
          <span>
            {item.type} · {item.village}
          </span>
          <span>Budget and progress are sample planning data.</span>
        </div>
      )}
    </article>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Waves
}) {
  return (
    <div className="metric-card detail-metric">
      <div className="metric-card-top">
        <span>{label}</span>
        <span className="metric-icon blue">
          <Icon size={16} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-caption">Demo watershed data</div>
    </div>
  )
}

function getMapLayerKey(id: string): MapLayerKey | undefined {
  return mapLayerKeys.find((key) => key === id)
}
