import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Download, MapPin, ShieldCheck } from "lucide-react"
import { Link, useLocation, useParams } from "react-router-dom"
import type { Map as MapLibreMap } from "maplibre-gl"
import { AppContext } from "@/App"
import { DemoBadge } from "@/components/common/DemoBadge"
import { WatershedMap } from "@/components/maps/WatershedMap"
import { useHydroSnap } from "@/hooks/useHydroSnap"
import { captureMapSnapshot, createAssetInspectionPdf } from "@/utils/reportPdf"
import type { FieldObservation, PilotMetricSummary } from "@/types/domain"

const passportLayers = {
  boundary: true,
  streams: true,
  assets: true,
  ndvi: false,
  ndwi: false,
}

export function AssetPassportPage() {
  const { assetId } = useParams()
  const location = useLocation()
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const mapRef = useRef<MapLibreMap | null>(null)
  const autoDownloadStarted = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [photoSlider, setPhotoSlider] = useState(50)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState("")
  const assets = data.assets.data ?? []
  const asset = assets.find((item) => item.id === assetId)
  const watershed = (data.watersheds.data ?? []).find(
    (item) => item.id === asset?.watershedId,
  )
  const observations = useMemo(
    () =>
      (data.observations.data ?? [])
        .filter(
          (item) =>
            item.assetId === assetId ||
            (!item.assetId && item.id === assetId),
        )
        .sort(
          (a, b) =>
            a.inspectionDate.localeCompare(b.inspectionDate) ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    [assetId, data.observations.data],
  )
  const firstPhoto = observations.find(({ imageDataUrl }) => imageDataUrl)
  const latestPhoto = [...observations]
    .reverse()
    .find(({ imageDataUrl }) => imageDataUrl)
  const pilotAnalysis =
    data.pilotAnalysis.data?.fixtureAssetId === assetId
      ? data.pilotAnalysis.data
      : undefined
  const handleMapReady = useCallback((map: MapLibreMap | null) => {
    mapRef.current = map
    setMapReady(Boolean(map))
  }, [])

  const downloadReport = useCallback(async () => {
    if (!asset) return
    const map = mapRef.current
    if (!map) {
      setDownloadError("The map is still loading. Try the download again.")
      return
    }
    setDownloading(true)
    setDownloadError("")
    try {
      const mapSnapshot = await captureMapSnapshot(map)
      const pdf = await createAssetInspectionPdf({
        asset,
        watershed,
        observations,
        pilotAnalysis,
        mapSnapshot,
      })
      pdf.save(`hydrosnap-${asset.id}-field-inspection.pdf`)
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Could not create the audited PDF.",
      )
    } finally {
      setDownloading(false)
    }
  }, [asset, observations, pilotAnalysis, watershed])

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("download")
    if (
      requested !== "pdf" ||
      !mapReady ||
      !asset ||
      !data.assets.isFetched ||
      !data.observations.isFetched ||
      !data.watersheds.isFetched ||
      !data.pilotAnalysis.isFetched ||
      autoDownloadStarted.current
    ) {
      return
    }
    autoDownloadStarted.current = true
    void downloadReport()
  }, [
    asset,
    data.assets.isFetched,
    data.observations.isFetched,
    data.pilotAnalysis.isFetched,
    data.watersheds.isFetched,
    downloadReport,
    location.search,
    mapReady,
  ])

  if (!asset && data.assets.isFetched) {
    return (
      <div className="page-stack">
        <Link to="/map" className="button button-secondary">
          <ArrowLeft size={15} /> Back to map
        </Link>
        <section className="panel">
          <h1>Asset not found</h1>
          <p>This asset is not available in the current workspace.</p>
        </section>
      </div>
    )
  }
  if (!asset) {
    return <div className="page-loading">Loading asset passport…</div>
  }

  const visibleLayers = context?.visibleLayers ?? passportLayers
  const currentPhotoIsDemo = asset.location.source === "demo"

  return (
    <div className="page-stack asset-passport-page">
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-mark" /> FIELD OPERATIONS
          </div>
          <h1>Asset Passport</h1>
          <p>Linked field observations and available satellite context.</p>
        </div>
        <div className="heading-actions">
          {currentPhotoIsDemo && <DemoBadge label="Demo asset" />}
          <button
            className="button button-primary"
            type="button"
            disabled={downloading || !mapReady}
            onClick={() => void downloadReport()}
          >
            <Download size={16} />
            {downloading ? "Preparing PDF…" : "Download field inspection PDF"}
          </button>
        </div>
      </div>
      {downloadError && (
        <div className="form-error-banner" role="alert">
          {downloadError}
        </div>
      )}

      <section className="panel passport-asset-summary">
        <div className="passport-asset-icon">
          <MapPin size={20} />
        </div>
        <div>
          <div className="passport-title-row">
            <h2>{asset.name}</h2>
            <span
              className={`status-pill ${
                asset.status === "Verified" ? "status-green" : "status-amber"
              }`}
            >
              {asset.status}
            </span>
          </div>
          <p>
            {asset.type} · {asset.village} · {watershed?.name ?? "Watershed unavailable"}
          </p>
          <small>
            {asset.location.coordinates[1].toFixed(6)}° N,{" "}
            {asset.location.coordinates[0].toFixed(6)}° E · Last inspected{" "}
            {asset.lastInspected}
          </small>
        </div>
      </section>

      <div className="passport-grid">
        <section className="panel passport-map-panel">
          <div className="panel-header">
            <div>
              <div className="section-kicker">
                <span className="kicker-dot blue-dot" /> ASSET LOCATION
              </div>
              <h2>Map context</h2>
            </div>
            {currentPhotoIsDemo && <DemoBadge label="Demo location" />}
          </div>
          <div className="passport-map-holder">
            <WatershedMap
              assets={[asset]}
              watershed={watershed}
              watersheds={watershed ? [watershed] : []}
              basemap="satellite"
              visibleLayers={visibleLayers}
              measure={false}
              focusPosition={asset.location.coordinates}
              pilotAnalysis={pilotAnalysis}
              onMapReady={handleMapReady}
              onSelectAsset={() => undefined}
            />
          </div>
        </section>

        <section className="panel passport-photo-panel">
          <div className="section-kicker">
            <span className="kicker-dot green-dot" /> PHOTO TIMELINE
          </div>
          <h2>Field evidence</h2>
          {observations.length ? (
            <>
              {firstPhoto &&
                latestPhoto &&
                firstPhoto.id !== latestPhoto.id && (
                  <div className="photo-comparison">
                    <div className="photo-comparison-images">
                      <img
                        src={firstPhoto.imageDataUrl}
                        alt={`First photo, ${firstPhoto.inspectionDate}`}
                      />
                      <img
                        className="photo-comparison-after"
                        src={latestPhoto.imageDataUrl}
                        alt={`Latest photo, ${latestPhoto.inspectionDate}`}
                        style={{
                          clipPath: `inset(0 ${100 - photoSlider}% 0 0)`,
                        }}
                      />
                      <span
                        className="photo-comparison-divider"
                        style={{ left: `${photoSlider}%` }}
                      />
                    </div>
                    <label>
                      <span>First photo</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={photoSlider}
                        onChange={(event) =>
                          setPhotoSlider(Number(event.target.value))
                        }
                        aria-label="Compare first and latest field photos"
                      />
                      <span>Latest photo</span>
                    </label>
                    <p>
                      {firstPhoto.inspectionDate} → {latestPhoto.inspectionDate}
                    </p>
                  </div>
                )}
              <ol className="passport-timeline">
                {observations.map((observation) => (
                  <ObservationTimelineItem
                    key={observation.id}
                    observation={observation}
                  />
                ))}
              </ol>
            </>
          ) : (
            <p className="passport-empty">
              No field photos are linked to this asset yet. Photos are not
              generated or back-dated.
            </p>
          )}
        </section>
      </div>

      <section className="panel passport-satellite-panel">
        <div className="panel-header">
          <div>
            <div className="section-kicker">
              <span className="kicker-dot purple-dot" /> SATELLITE INDICATORS
            </div>
            <h2>Before / after comparison</h2>
          </div>
          {pilotAnalysis && (
            <DemoBadge label="Pipeline test, not a real result" />
          )}
        </div>
        {pilotAnalysis ? (
          <PilotComparison analysis={pilotAnalysis} />
        ) : (
          <p className="passport-empty">
            No location-matched satellite analysis is available for this asset.
            Demo satellite values elsewhere in the app are not used here.
          </p>
        )}
      </section>
      <div className="passport-footer">
        <ShieldCheck size={15} />
        <span>
          Client-side audit record. It is not a signed or server-verified
          certificate.
        </span>
        <Link to="/evidence">Review evidence registry</Link>
      </div>
    </div>
  )
}

function ObservationTimelineItem({
  observation,
}: {
  observation: FieldObservation
}) {
  return (
    <li className="passport-timeline-item">
      {observation.imageDataUrl ? (
        <img src={observation.imageDataUrl} alt="" />
      ) : (
        <span className="passport-no-photo">No image</span>
      )}
      <div>
        <strong>{observation.inspectionDate}</strong>
        <span>{observation.imageName}</span>
        <small>
          {observation.officerName} · {observation.verificationStatus}
        </small>
        <small>{observation.description}</small>
      </div>
    </li>
  )
}

function PilotComparison({
  analysis,
}: {
  analysis: NonNullable<
    ReturnType<typeof useHydroSnap>["pilotAnalysis"]["data"]
  >
}) {
  return (
    <div className="pilot-comparison">
      <p className="pilot-warning">
        {analysis.interpretation} This analysis uses the illustrative location
        of {analysis.fixtureAssetId}, not a verified field asset.
      </p>
      <div className="pilot-index-grid">
        <PilotIndexComparison
          metric={analysis.indices.ndvi}
          beforeImage={analysis.images.ndviBefore}
          afterImage={analysis.images.ndviAfter}
        />
        <PilotIndexComparison
          metric={analysis.indices.ndwi}
          beforeImage={analysis.images.ndwiBefore}
          afterImage={analysis.images.ndwiAfter}
        />
      </div>
      <div className="pilot-scene-details">
        <strong>Scene metadata</strong>
        <span>{analysis.source}</span>
        <span>{analysis.attribution}</span>
        <ul>
          {analysis.indices.ndvi.before.scenes.map((scene) => (
            <li key={scene.id}>
              Before · {scene.id} · {scene.date} · cloud{" "}
              {scene.cloudCover === null
                ? "unknown"
                : `${scene.cloudCover.toFixed(1)}%`}
            </li>
          ))}
          {analysis.indices.ndvi.after.scenes.map((scene) => (
            <li key={scene.id}>
              After · {scene.id} · {scene.date} · cloud{" "}
              {scene.cloudCover === null
                ? "unknown"
                : `${scene.cloudCover.toFixed(1)}%`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function PilotIndexComparison({
  metric,
  beforeImage,
  afterImage,
}: {
  metric: PilotMetricSummary
  beforeImage?: string
  afterImage?: string
}) {
  return (
    <article className="pilot-index-card">
      <h3>{metric.name}</h3>
      <p>{metric.definition}</p>
      {beforeImage && afterImage ? (
        <div className="pilot-image-pair">
          <figure>
            <img src={beforeImage} alt={`${metric.name} before`} />
            <figcaption>Before · {metric.before.window}</figcaption>
          </figure>
          <figure>
            <img src={afterImage} alt={`${metric.name} after`} />
            <figcaption>After · {metric.after.window}</figcaption>
          </figure>
        </div>
      ) : (
        <p>No valid scenes available for both time windows.</p>
      )}
      <dl>
        <div>
          <dt>Before near / control</dt>
          <dd>
            {formatMetric(metric.before.nearMean)} /{" "}
            {formatMetric(metric.before.controlMean)}
          </dd>
        </div>
        <div>
          <dt>After near / control</dt>
          <dd>
            {formatMetric(metric.after.nearMean)} /{" "}
            {formatMetric(metric.after.controlMean)}
          </dd>
        </div>
        <div>
          <dt>Near − control change</dt>
          <dd>{formatMetric(metric.differenceInDifferences)}</dd>
        </div>
      </dl>
    </article>
  )
}

function formatMetric(value: number | null): string {
  return value === null ? "—" : value.toFixed(3)
}
