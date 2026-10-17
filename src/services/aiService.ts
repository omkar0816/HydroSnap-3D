import type {
  AiPilotSummary,
  PilotAnalysis,
} from "@/types/domain"
import { z } from "zod"
import {
  aiPilotSummaryTextSchema,
  pilotSummaryFactsSchema,
} from "@/services/aiSchemas"

interface PilotSummaryResponse {
  english: string
  hindi: string
  marathi: string
  modelName: string
}

export async function generatePilotSummary(
  analysis: PilotAnalysis,
): Promise<AiPilotSummary> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("AI summary is unavailable while offline.")
  }
  const facts = pilotSummaryFactsSchema.parse({
    status: analysis.status,
    label: analysis.label,
    interpretation: analysis.interpretation,
    metrics: [analysis.indices.ndvi, analysis.indices.ndwi],
  })
  const response = await fetch("/api/pilot-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facts),
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) {
    const code = await readApiErrorCode(response)
    throw new Error(
      `AI summary returned HTTP ${response.status}${code ? ` (${code})` : ""}.`,
    )
  }
  const body: unknown = await response.json()
  const parsed = zSummaryResponse(body)
  if (!parsed) throw new Error("AI summary response was invalid.")
  if (facts.status === "pipeline-test") {
    parsed.english = prefixIfMissing(
      parsed.english,
      "Pipeline test, not a real-asset result.",
    )
    parsed.hindi = prefixIfMissing(
      parsed.hindi,
      "यह वास्तविक संपत्ति का परिणाम नहीं, बल्कि पाइपलाइन परीक्षण है।",
    )
    parsed.marathi = prefixIfMissing(
      parsed.marathi,
      "हा वास्तविक मालमत्तेचा निकाल नसून पाइपलाइन चाचणी आहे.",
    )
  }
  if (isWeakSignal(facts)) {
    parsed.english = prefixIfMissing(parsed.english, "No clear signal.")
    parsed.hindi = prefixIfMissing(parsed.hindi, "कोई स्पष्ट संकेत नहीं है।")
    parsed.marathi = prefixIfMissing(parsed.marathi, "कोणताही स्पष्ट संकेत नाही.")
  }
  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
    languageReview: "unreviewed",
  }
}

function isWeakSignal(
  facts: ReturnType<typeof pilotSummaryFactsSchema.parse>,
): boolean {
  return (
    facts.status !== "pipeline-test" ||
    /no real-asset signal|no clear signal|no data/i.test(
      facts.interpretation,
    ) ||
    facts.metrics.some(
      (metric) =>
        metric.differenceInDifferences === null ||
        metric.before.scenes.length === 0 ||
        metric.after.scenes.length === 0 ||
        metric.before.validNearPixels === 0 ||
        metric.before.validControlPixels === 0 ||
        metric.after.validNearPixels === 0 ||
        metric.after.validControlPixels === 0,
    )
  )
}

function prefixIfMissing(text: string, prefix: string): string {
  return text.toLocaleLowerCase().includes(prefix.toLocaleLowerCase())
    ? text
    : `${prefix} ${text}`
}

async function readApiErrorCode(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof body.code === "string"
    ) {
      return body.code
    }
  } catch (error) {
    console.warn("Could not read the AI endpoint error response.", error)
  }
  return undefined
}

function zSummaryResponse(value: unknown): PilotSummaryResponse | undefined {
  if (typeof value !== "object" || value === null || !("modelName" in value)) {
    return undefined
  }
  const content = aiPilotSummaryTextSchema.safeParse({
    english: "english" in value ? value.english : undefined,
    hindi: "hindi" in value ? value.hindi : undefined,
    marathi: "marathi" in value ? value.marathi : undefined,
  })
  if (!content.success || typeof value.modelName !== "string") return undefined
  return { ...content.data, modelName: value.modelName }
}
