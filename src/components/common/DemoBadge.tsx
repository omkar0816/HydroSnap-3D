import { FlaskConical } from "lucide-react"

/** Visible marker for anything simulated or illustrative. Never remove it
 *  from a view until the data behind that view is real. */
export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return (
    <span className="hs-demo-badge" title="Simulated or illustrative data">
      <FlaskConical size={13} /> {label}
    </span>
  )
}

export default DemoBadge
