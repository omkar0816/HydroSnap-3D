import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react"
import type { GeoLocation, TrustAssessment } from "@/types/domain"
import { distanceMeters } from "@/utils/geo"

interface TrustPanelProps {
  trust?: TrustAssessment
  imageHash?: string
  snapDistanceMeters?: number
  streamName?: string
  location?: GeoLocation
  exifLocation?: GeoLocation
  watershedName?: string
  watershedIsDemo?: boolean
  photoContentConfirmed?: boolean
}

const statusClass = {
  Consistent: "status-green",
  "Needs review": "status-amber",
  Flagged: "status-red",
} as const

export function TrustPanel({
  trust,
  imageHash,
  snapDistanceMeters,
  streamName,
  location,
  exifLocation,
  watershedName,
  watershedIsDemo = false,
  photoContentConfirmed = false,
}: TrustPanelProps) {
  const passedChecks = trust?.reasons.filter(
    ({ severity }) => severity === "info",
  )
  const attentionChecks = trust?.reasons.filter(
    ({ severity }) => severity !== "info",
  )

  return (
    <section className="panel hs-trust-panel">
      <div className="section-kicker">
        <span className="kicker-dot blue-dot" />
        {trust?.engine === "server" ? "SERVER VERIFICATION" : "PRELIMINARY FIELD CHECKS"}
      </div>
      <h3>Location and evidence review</h3>
      <div className="hs-content-check" aria-live="polite">
        <strong>Photo content</strong>
        <p>
          {photoContentConfirmed
            ? "The submitting officer confirmed that the photo shows the selected watershed asset."
            : "Not automatically classified. An officer must inspect the photo and confirm what it shows."}
        </p>
        <small>
          This app does not use a vision model. GPS and map checks cannot prove
          that the image depicts a real watershed asset.
        </small>
      </div>
      {!trust ? (
        <p className="hs-muted">
          Confirm a location to check the photo GPS, watershed boundary, capture
          date, duplicate hash, GPS accuracy, and nearby mapped stream.
        </p>
      ) : (
        <>
          <span className={`status-pill ${statusClass[trust.status]}`}>
            Data checks: {trust.status}
          </span>
          {location && (
            <div className="hs-location-check">
              <strong>Confirmed location</strong>
              <span>
                {location.coordinates[1].toFixed(6)},{" "}
                {location.coordinates[0].toFixed(6)} · {location.source}
                {location.accuracyMeters !== undefined
                  ? ` · ±${Math.round(location.accuracyMeters)} m`
                  : ""}
              </span>
              {exifLocation && (
                <span>
                  Photo GPS difference:{" "}
                  {Math.round(
                    distanceMeters(
                      location.coordinates,
                      exifLocation.coordinates,
                    ),
                  )}{" "}
                  m
                </span>
              )}
              {watershedName && (
                <span>
                  Boundary match: {watershedName}
                  {watershedIsDemo ? " · illustrative boundary" : ""}
                </span>
              )}
            </div>
          )}
          <div className="hs-check-group">
            <strong>Checks passed</strong>
            {passedChecks?.length ? (
              <ul className="hs-trust-reasons">
                {passedChecks.map((reason) => (
                  <li key={reason.code} className="hs-reason-info">
                    <CheckCircle2 size={14} />
                    <span>{reason.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hs-muted">No positive checks to report yet.</p>
            )}
          </div>
          <div className="hs-check-group">
            <strong>Needs attention</strong>
            {attentionChecks?.length ? (
              <ul className="hs-trust-reasons">
                {attentionChecks.map((reason) => (
                  <li
                    key={reason.code}
                    className={`hs-reason-${reason.severity}`}
                  >
                    {reason.severity === "critical" ? (
                      <ShieldAlert size={14} />
                    ) : reason.severity === "warning" ? (
                      <AlertTriangle size={14} />
                    ) : (
                      <Info size={14} />
                    )}
                    <span>{reason.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hs-muted">No data-check warnings.</p>
            )}
          </div>
          {snapDistanceMeters !== undefined && (
            <p className="hs-muted">
              Nearest mapped stream{streamName ? ` (${streamName})` : ""}:{" "}
              {Math.round(snapDistanceMeters)} m. The observation stays at the
              confirmed point; the snapped point is stored separately.
            </p>
          )}
          <p className="hs-muted">
            {trust.engine === "server"
              ? "Server-derived rules are stored with this record. Human officer verification remains a separate decision."
              : "These browser checks are preliminary only. The server recomputes verification after sync; no record is automatically verified."}
          </p>
        </>
      )}
      {imageHash && (
        <p className="hs-hash" title={imageHash}>
          SHA-256 {imageHash.slice(0, 16)}…
        </p>
      )}
    </section>
  )
}

export default TrustPanel
