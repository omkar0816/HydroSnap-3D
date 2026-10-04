import { useEffect, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  History,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react"
import type { Asset } from "@/types/domain"
import type {
  TimelineInterval,
  TimelineStep,
  TimelineSummary,
} from "@/utils/timeline"
import "@/styles/map-timeline.css"

interface MapTimelineProps {
  steps: TimelineStep[]
  index: number
  onIndexChange: (index: number) => void
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  interval: TimelineInterval
  onIntervalChange: (interval: TimelineInterval) => void
  newOnly: boolean
  onNewOnlyChange: (value: boolean) => void
  summary: TimelineSummary
  onFocusAsset: (asset: Asset) => void
}

const PLAY_INTERVAL_MS = 1600

export function MapTimeline({
  steps,
  index,
  onIndexChange,
  enabled,
  onEnabledChange,
  interval,
  onIntervalChange,
  newOnly,
  onNewOnlyChange,
  summary,
  onFocusAsset,
}: MapTimelineProps) {
  const [open, setOpen] = useState(true)
  const [playing, setPlaying] = useState(false)
  const last = steps.length - 1

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(
      () => onIndexChange(index + 1),
      PLAY_INTERVAL_MS,
    )
    return () => window.clearTimeout(timer)
  }, [playing, index, last, onIndexChange])

  useEffect(() => {
    if (!enabled) setPlaying(false)
  }, [enabled])

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (index >= last) onIndexChange(0)
    setPlaying(true)
  }

  function go(next: number) {
    setPlaying(false)
    onIndexChange(Math.min(last, Math.max(0, next)))
  }

  if (!open) {
    return (
      <div className="hs-timeline hs-timeline-collapsed">
        <button type="button" onClick={() => setOpen(true)}>
          <History size={15} />
          Timeline
          {enabled && <strong>{summary.step.label}</strong>}
          <ChevronUp size={14} />
        </button>
      </div>
    )
  }

  const { step } = summary
  return (
    <div className="hs-timeline" role="group" aria-label="Map timeline">
      <div className="hs-timeline-head">
        <span className="hs-timeline-title">
          <History size={15} /> Historical map timeline
        </span>
        <label className="hs-timeline-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span>Time filter</span>
        </label>
        <button
          type="button"
          className="hs-timeline-icon"
          onClick={() => setOpen(false)}
          aria-label="Collapse timeline"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className={`hs-timeline-body ${enabled ? "" : "is-off"}`}>
        <div className="hs-timeline-intervals" aria-label="Timeline interval">
          <span>Interval</span>
          <button
            type="button"
            aria-pressed={interval === 6}
            className={interval === 6 ? "active" : ""}
            onClick={() => onIntervalChange(6)}
          >
            6 months
          </button>
          <button
            type="button"
            aria-pressed={interval === 12}
            className={interval === 12 ? "active" : ""}
            onClick={() => onIntervalChange(12)}
          >
            1 year
          </button>
        </div>
        <div className="hs-timeline-controls">
          <button
            type="button"
            className="hs-timeline-icon"
            onClick={() => go(index - 1)}
            disabled={!enabled || index === 0}
            aria-label="Previous period"
          >
            <SkipBack size={15} />
          </button>
          <button
            type="button"
            className="hs-timeline-play"
            onClick={togglePlay}
            disabled={!enabled}
            aria-label={playing ? "Pause playback" : "Play timeline"}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            className="hs-timeline-icon"
            onClick={() => go(index + 1)}
            disabled={!enabled || index === last}
            aria-label="Next period"
          >
            <SkipForward size={15} />
          </button>
          <div className="hs-timeline-track">
            <input
              type="range"
              min={0}
              max={last}
              step={1}
              value={index}
              disabled={!enabled}
              onChange={(event) => go(Number(event.target.value))}
              aria-label="Timeline period"
              aria-valuetext={`${step.label}, ${step.range}`}
            />
            <div className="hs-timeline-ticks">
              {steps.map((item, itemIndex) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={!enabled}
                  className={itemIndex === index ? "active" : ""}
                  onClick={() => go(itemIndex)}
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hs-timeline-summary">
          <div className="hs-timeline-period">
            <strong>{step.label}</strong>
            <small>{step.range}</small>
          </div>
          <div className="hs-timeline-stat">
            <b>{summary.cumulative.length}</b>
            <span>in place</span>
          </div>
          <div className="hs-timeline-stat added">
            <b>+{summary.added.length}</b>
            <span>this period</span>
          </div>
          <div className="hs-timeline-stat">
            <b>{summary.verified}</b>
            <span>verified now</span>
          </div>
          <label className="hs-timeline-switch compact">
            <input
              type="checkbox"
              checked={newOnly}
              disabled={!enabled}
              onChange={(event) => onNewOnlyChange(event.target.checked)}
            />
            <span>Only new</span>
          </label>
        </div>

        {summary.added.length > 0 ? (
          <div className="hs-timeline-added" aria-label="Added this period">
            {summary.added.map((asset) => (
              <button
                type="button"
                key={asset.id}
                onClick={() => onFocusAsset(asset)}
                disabled={!enabled}
              >
                {asset.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="hs-timeline-empty">
            Nothing new was added in this period.
          </div>
        )}
        <div className="hs-timeline-note">
          Satellite mode shows date-matched NASA VIIRS true-color imagery
          (approximately 500 m resolution; no API key required). Imagery is
          available only for dates covered by the satellite archive.
        </div>
      </div>
    </div>
  )
}
