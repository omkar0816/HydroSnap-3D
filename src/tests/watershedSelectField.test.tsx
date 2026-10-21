import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { UseFormRegisterReturn } from "react-hook-form"
import { WatershedSelectField } from "@/components/evidence/WatershedSelectField"
import { watersheds } from "@/services/mock/mockData"

const registration = {
  name: "watershedId",
  onChange: vi.fn(),
  onBlur: vi.fn(),
  ref: vi.fn(),
} as unknown as UseFormRegisterReturn<"watershedId">

function renderSelect(options: {
  watersheds: typeof watersheds
  isLoading?: boolean
  errorMessage?: string
}) {
  return renderToStaticMarkup(
    createElement(WatershedSelectField, {
      watersheds: options.watersheds,
      registration,
      isLoading: options.isLoading ?? false,
      errorMessage: options.errorMessage,
      onRetry: vi.fn(),
    }),
  )
}

describe("WatershedSelectField", () => {
  it("shows the placeholder and setup message for an empty list", () => {
    const markup = renderSelect({ watersheds: [] })
    expect(markup).toContain("Select watershed...")
    expect(markup).toContain("No watersheds available")
  })

  it("shows the API error and retry action for a failed query", () => {
    const markup = renderSelect({ watersheds: [], errorMessage: "Session expired." })
    expect(markup).toContain("Session expired.")
    expect(markup).toContain("Retry")
    expect(markup).not.toContain("No watersheds available")
  })

  it("renders loaded watershed options", () => {
    const markup = renderSelect({ watersheds: [watersheds[0]] })
    expect(markup).toContain(watersheds[0].name)
    expect(markup).toContain(watersheds[0].code)
    expect(markup).not.toContain("No watersheds available")
  })
})