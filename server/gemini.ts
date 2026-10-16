import type { z } from "zod"

const defaultModel = "gemini-3.8-flash"
const requestTimeoutMs = 20_000

export type GeminiErrorCode =
  | "not-configured"
  | "credential-rejected"
  | "quota-exceeded"
  | "model-unavailable"
  | "timed-out"
  | "invalid-response"
  | "upstream-unavailable"

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly code: GeminiErrorCode,
    readonly status: number,
  ) {
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
  if (!apiKey) {
    throw new GeminiError("Gemini is not configured.", "not-configured", 503)
  }
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
      let code: GeminiErrorCode = "upstream-unavailable"
      let status = 502
      if (response.status === 401 || response.status === 403) {
        code = "credential-rejected"
        status = 503
      } else if (response.status === 404) {
        code = "model-unavailable"
        status = 503
      } else if (response.status === 429) {
        code = "quota-exceeded"
        status = 429
      } else if (response.status === 503) {
        status = 503
      }
      throw new GeminiError(
        `Gemini request failed (HTTP ${response.status}).`,
        code,
        status,
      )
    }
    const payload: unknown = await response.json()
    const candidateText = readCandidateText(payload)
    let decoded: unknown
    try {
      decoded = JSON.parse(candidateText)
    } catch {
      throw new GeminiError(
        "Gemini returned invalid JSON.",
        "invalid-response",
        502,
      )
    }
    const parsed = schema.safeParse(decoded)
    if (!parsed.success) {
      throw new GeminiError(
        "Gemini returned an invalid shape.",
        "invalid-response",
        502,
      )
    }
    return { result: parsed.data, modelName }
  } catch (error) {
    if (error instanceof GeminiError) throw error
    if (controller.signal.aborted) {
      throw new GeminiError("Gemini request timed out.", "timed-out", 504)
    }
    throw new GeminiError(
      "Gemini could not complete the request.",
      "upstream-unavailable",
      502,
    )
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
    throw new GeminiError(
      "Gemini returned no response.",
      "invalid-response",
      502,
    )
  }
  const candidates = payload.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new GeminiError(
      "Gemini returned no response.",
      "invalid-response",
      502,
    )
  }
  const candidate = candidates[0]
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("content" in candidate)
  ) {
    throw new GeminiError(
      "Gemini returned no response.",
      "invalid-response",
      502,
    )
  }
  const content = candidate.content
  if (
    typeof content !== "object" ||
    content === null ||
    !("parts" in content)
  ) {
    throw new GeminiError(
      "Gemini returned no response.",
      "invalid-response",
      502,
    )
  }
  const parts = content.parts
  if (!Array.isArray(parts)) {
    throw new GeminiError(
      "Gemini returned no response.",
      "invalid-response",
      502,
    )
  }
  const text = parts.find(
    (part): part is { text: string } =>
      typeof part === "object" &&
      part !== null &&
      "text" in part &&
      typeof part.text === "string",
  )?.text
  if (!text) {
    throw new GeminiError(
      "Gemini returned no response.",
      "invalid-response",
      502,
    )
  }
  return text
}
