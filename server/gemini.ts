import type { z } from "zod"

const defaultModel = "gemini-2.5-flash"
const requestTimeoutMs = 8_000

export class GeminiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GeminiError"
  }
}

export async function generateGeminiJson<T>(
  systemInstruction: string,
  prompt: string,
  schema: z.ZodType<T>,
  image?: { mimeType: "image/jpeg"; data: string },
): Promise<{ result: T; modelName: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiError("Gemini is not configured.")
  const modelName = process.env.GEMINI_MODEL || defaultModel
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...(image
                  ? [
                      {
                        inlineData: {
                          mimeType: image.mimeType,
                          data: image.data,
                        },
                      },
                    ]
                  : []),
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      throw new GeminiError(`Gemini request failed (HTTP ${response.status}).`)
    }
    const payload: unknown = await response.json()
    const candidateText = readCandidateText(payload)
    let decoded: unknown
    try {
      decoded = JSON.parse(candidateText)
    } catch {
      throw new GeminiError("Gemini returned invalid JSON.")
    }
    const parsed = schema.safeParse(decoded)
    if (!parsed.success) {
      throw new GeminiError("Gemini returned an invalid shape.")
    }
    return { result: parsed.data, modelName }
  } catch (error) {
    if (error instanceof GeminiError) throw error
    if (controller.signal.aborted) {
      throw new GeminiError("Gemini request timed out.")
    }
    throw new GeminiError("Gemini could not complete the request.")
  } finally {
    clearTimeout(timeout)
  }
}

function readCandidateText(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("candidates" in payload)
  ) {
    throw new GeminiError("Gemini returned no response.")
  }
  const candidates = payload.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new GeminiError("Gemini returned no response.")
  }
  const candidate = candidates[0]
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("content" in candidate)
  ) {
    throw new GeminiError("Gemini returned no response.")
  }
  const content = candidate.content
  if (
    typeof content !== "object" ||
    content === null ||
    !("parts" in content)
  ) {
    throw new GeminiError("Gemini returned no response.")
  }
  const parts = content.parts
  if (!Array.isArray(parts))
    throw new GeminiError("Gemini returned no response.")
  const text = parts.find(
    (part): part is { text: string } =>
      typeof part === "object" &&
      part !== null &&
      "text" in part &&
      typeof part.text === "string",
  )?.text
  if (!text) throw new GeminiError("Gemini returned no response.")
  return text
}
