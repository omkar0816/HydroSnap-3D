import type {
  AiAssessment,
  AiAssessmentAttributes,
  AiPredictedClass,
  AiPilotSummary,
  PilotAnalysis,
} from "@/types/domain"
import { z } from "zod"
import {
  aiPilotSummaryTextSchema,
  aiPhotoResultSchema,
  cachedAiAssessmentSchema,
  pilotSummaryFactsSchema,
} from "@/services/aiSchemas"
import {
  cacheAiAssessment,
  getCachedAiAssessment,
} from "@/services/offlineStore"
import { blobToBase64, downscalePhoto } from "@/utils/photo"
import { sha256Hex } from "@/utils/trust"

interface PhotoAnalysisResponse {
  predictedClass: AiPredictedClass
  confidence: number
  attributes: AiAssessmentAttributes
  modelName: string
}

interface PilotSummaryResponse {
  english: string
  hindi: string
  marathi: string
  modelName: string
}

const assessmentMemoryCache = new Map<string, AiAssessment>()
const assessmentInFlight = new Map<string, Promise<AiAssessment>>()

export async function analyzePhoto(
  image: Blob,
  suppliedHash?: string,
): Promise<AiAssessment> {
  const imageSha256 = suppliedHash ?? (await sha256Hex(image))
  if (imageSha256) {
    const memoryCached = assessmentMemoryCache.get(imageSha256)
    if (memoryCached) return memoryCached
    const inFlight = assessmentInFlight.get(imageSha256)
    if (inFlight) return inFlight
    const pending = requestPhotoAssessment(image, imageSha256)
    assessmentInFlight.set(imageSha256, pending)
    try {
      return await pending
    } finally {
      if (assessmentInFlight.get(imageSha256) === pending) {
        assessmentInFlight.delete(imageSha256)
      }
    }
  }
  return requestPhotoAssessment(image, imageSha256)
}

async function requestPhotoAssessment(
  image: Blob,
  imageSha256: string | undefined,
): Promise<AiAssessment> {
  if (imageSha256) {
    try {
      const cached = await getCachedAiAssessment(imageSha256)
      const valid = cachedAiAssessmentSchema.safeParse(cached)
      if (valid.success && valid.data.status === "ok") {
        assessmentMemoryCache.set(imageSha256, valid.data)
        return valid.data
      }
      if (cached) console.warn("Ignoring an invalid cached AI assessment.")
    } catch (error) {
      console.warn("Could not read the AI assessment cache.", error)
    }
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return unavailableAssessment()
  }

  try {
    const compressed = await downscalePhoto(image)
    const imageBase64 = await blobToBase64(compressed)
    const response = await fetch("/api/photo-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) {
      throw new Error(`Photo assessment returned HTTP ${response.status}.`)
    }
    const body: unknown = await response.json()
    const parsed = zPhotoResponse(body)
    if (!parsed) throw new Error("Photo assessment response was invalid.")
    const assessment: AiAssessment = {
      status: "ok",
      ...parsed,
      checkedAt: new Date().toISOString(),
    }
    if (imageSha256) {
      assessmentMemoryCache.set(imageSha256, assessment)
      try {
        await cacheAiAssessment(imageSha256, assessment)
      } catch (error) {
        console.warn("Could not store the AI assessment cache.", error)
      }
    }
    return assessment
  } catch (error) {
    console.warn("AI photo assessment is unavailable.", error)
    return unavailableAssessment()
  }
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
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`AI summary returned HTTP ${response.status}.`)
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

function zPhotoResponse(value: unknown): PhotoAnalysisResponse | undefined {
  if (typeof value !== "object" || value === null || !("modelName" in value)) {
    return undefined
  }
  const content = aiPhotoResultSchema.safeParse({
    predictedClass:
      "predictedClass" in value ? value.predictedClass : undefined,
    confidence: "confidence" in value ? value.confidence : undefined,
    attributes: "attributes" in value ? value.attributes : undefined,
  })
  if (!content.success || typeof value.modelName !== "string") return undefined
  return { ...content.data, modelName: value.modelName }
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

function unavailableAssessment(): AiAssessment {
  return {
    status: "unavailable",
    modelName: "Gemini",
    checkedAt: new Date().toISOString(),
  }
}
