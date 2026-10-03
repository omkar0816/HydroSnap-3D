import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react"
import type { TrustAssessment } from "@/types/domain"

interface TrustPanelProps {
  trust?: TrustAssessment
  imageHash?: string
  snapDistanceMeters?: number
  streamName?: string
}

const statusClass = {
  Consistent: "status-green",
  "Needs review": "status-amber",
  Flagged: "status-red",
} as const

/** Explains the rule-based evidence checks. Nothing here auto-rejects. */
export function TrustPanel({
  trust,
  imageHash,
  snapDistanceMeters,
  streamName,
}: TrustPanelProps) {
  return (
    <section className="panel hs-trust-panel">
      <div className="section-kicker">
        <span className="kicker-dot blue-dot" /> EVIDENCE CHECKS
      </div>
      <h3>Trust status</h3>
      {!trust ? (
        <p className="hs-muted">
          Confirm a location to run the checks (EXIF, time, GPS accuracy,
          duplicate image, watershed, stream distance).
        </p>
      ) : (
        <>
          <span className={`status-pill ${statusClass[trust.status]}`}>
            {trust.status}
          </span>
          <ul className="hs-trust-reasons">
            {trust.reasons.map((reason) => (
              <li key={reason.code} className={`hs-reason-${reason.severity}`}>
                {reason.severity === "critical" ? (
                  <ShieldAlert size={14} />
                ) : reason.severity === "warning" ? (
                  <AlertTriangle size={14} />
                ) : reason.code.endsWith("present") ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Info size={14} />
                )}
                <span>{reason.message}</span>
              </li>
            ))}
          </ul>
          {snapDistanceMeters !== undefined && (
            <p className="hs-muted">
              Nearest mapped stream{streamName ? ` (${streamName})` : ""}:{" "}
              {Math.round(snapDistanceMeters)} m. The original point is kept;
              the snapped point is stored separately.
            </p>
          )}
        </>
      )}
      {imageHash && (
        <p className="hs-hash" title={imageHash}>
          SHA-256 {imageHash.slice(0, 16)}…
        </p>
      )}
      <p className="hs-footnote">
        Rule checks run in the browser (preview). Flags send the record to a
        reviewer; nothing is rejected automatically.
      </p>
    </section>
  )
}

export default TrustPanel
