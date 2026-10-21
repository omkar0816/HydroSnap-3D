import type { UseFormRegisterReturn } from "react-hook-form"
import type { Watershed } from "@/types/domain"

interface WatershedSelectFieldProps {
  watersheds: Watershed[]
  registration: UseFormRegisterReturn<"watershedId">
  isLoading: boolean
  errorMessage?: string
  onRetry: () => void
}

export function WatershedSelectField({
  watersheds,
  registration,
  isLoading,
  errorMessage,
  onRetry,
}: WatershedSelectFieldProps) {
  return (
    <>
      <select aria-label="Watershed" disabled={isLoading} {...registration}>
        <option value="">Select watershed...</option>
        {watersheds.map((watershed) => (
          <option key={watershed.id} value={watershed.id}>
            {watershed.name} · {watershed.code}
          </option>
        ))}
      </select>
      {errorMessage && (
        <small className="field-error">
          {errorMessage}{" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </small>
      )}
      {!isLoading && !errorMessage && watersheds.length === 0 && (
        <small className="field-error">
          No watersheds available. Ask an administrator to run pnpm db:setup.
        </small>
      )}
    </>
  )
}