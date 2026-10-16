import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react"
import type { AiAssessment, Asset, TrustAssessment } from "@/types/domain"

interface TrustPanelProps {
  trust?: TrustAssessment
  imageHash?: string
  snapDistanceMeters?: number
  streamName?: string
  aiAssessment?: AiAssessment
  aiCheckPending?: boolean
  declaredType?: Asset["type"]
  aiOverrideReason?: string
  onAiOverrideReasonChange?: (reason: string) => void
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
  aiAssessment,
  aiCheckPending = false,
  declaredType,
  aiOverrideReason = "",
  onAiOverrideReasonChange,
}: TrustPanelProps) {
  const predictedClass =
    aiAssessment?.status === "ok" ? aiAssessment.predictedClass : undefined
  const requiresOverrideReason =
    aiAssessment?.status === "ok" &&
    predictedClass !== undefined &&
    predictedClass !== "unclear" &&
    (predictedClass === "not-a-watershed-asset" ||
      predictedClass !== declaredType)

  return (
    <section className="panel hs-trust-panel">
      <div className="section-kicker">
        <span className="kicker-dot blue-dot" /> EVIDENCE CHECKS
      </div>
      <h3>Trust status</h3>
      <div className="hs-ai-assessment" aria-live="polite">
        <strong>AI photo check</strong>
        {aiCheckPending ? (
          <p>Checking a downscaled copy of the photo…</p>
        ) : aiAssessment?.status === "ok" ? (
          <>
            <p>
              Suggestion:{" "}
              <b>
                {predictedClass === "not-a-watershed-asset"
                  ? "Not a watershed asset"
                  : predictedClass}
              </b>{" "}
              · {Math.round((aiAssessment.confidence ?? 0) * 100)}% confidence
            </p>
            {aiAssessment.attributes?.evidence && (
              <small>{aiAssessment.attributes.evidence}</small>
            )}
            <small>
              Model {aiAssessment.modelName ?? "Gemini"} · AI suggestions are
              not verification.
            </small>
            <small>
              A downscaled copy is sent to Google Gemini; EXIF metadata is
              removed before analysis.
            </small>
            {requiresOverrideReason && (
              <label className="hs-ai-override">
                Officer override reason (required)
                <textarea
                  value={aiOverrideReason}
                  onChange={(event) =>
                    onAiOverrideReasonChange?.(event.target.value)
                  }
                  minLength={5}
                  maxLength={500}
                  rows={3}
                  placeholder={`AI suggested ${predictedClass}; explain why ${declaredType} is correct.`}
                  required
                />
              </label>
            )}
          </>
        ) : aiAssessment?.status === "unavailable" ? (
          <p>
            AI check unavailable. You can continue and submit the observation.
          </p>
        ) : (
          <p>Select a photo to run the advisory content check.</p>
        )}
      </div>
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
          {trust.engine === "ai-assisted" && (
            <p className="hs-muted">
              AI-assisted preview · the model suggestion is advisory only.
            </p>
          )}
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
        Rule checks run in the browser (preview). AI findings are warnings only;
        nothing is rejected automatically.
      </p>
    </section>
  )
}

export default TrustPanel
