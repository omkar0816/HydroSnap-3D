export type LlmErrorCode =
  | "not-configured"
  | "upstream-error"
  | "timeout"
  | "invalid-response"
  | "rate-limited"

export class LlmError extends Error {
  readonly code: LlmErrorCode
  readonly status: number

  constructor(message: string, code: LlmErrorCode, status: number) {
    super(message)
    this.name = "LlmError"
    this.code = code
    this.status = status
  }
}

export interface GenerateJsonOptions {
  model?: string
  imageDataUrl?: string
}

export interface LlmResult {
  result: unknown
  modelUsed: string
}

export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }
  return trimmed
}

export async function generateJson(
  system: string,
  prompt: string,
  options?: GenerateJsonOptions,
): Promise<LlmResult> {
  const baseUrl = process.env.OMNIROUTE_BASE_URL
  const apiKey = process.env.OMNIROUTE_API_KEY
  const defaultModel = options?.imageDataUrl
    ? (process.env.OMNIROUTE_VISION_MODEL || process.env.OMNIROUTE_MODEL)
    : process.env.OMNIROUTE_MODEL

  const requestedModel = options?.model ?? defaultModel

  if (!baseUrl || !apiKey || !requestedModel) {
    throw new LlmError("LLM is not configured.", "not-configured", 503)
  }

  const userContent = options?.imageDataUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: options.imageDataUrl } },
      ]
    : prompt

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: requestedModel,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    })

    if (response.status === 429) {
      throw new LlmError("LLM rate limit reached.", "rate-limited", 429)
    }

    if (!response.ok) {
      throw new LlmError(
        `LLM request failed (HTTP ${response.status}).`,
        "upstream-error",
        response.status,
      )
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new LlmError("LLM returned an invalid response body.", "invalid-response", 502)
    }

    const payload = data as {
      model?: unknown
      choices?: Array<{ message?: { content?: unknown } }>
    }

    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== "string" || !content.trim()) {
      throw new LlmError("LLM returned no content.", "invalid-response", 502)
    }

    let result: unknown
    try {
      result = JSON.parse(stripCodeFences(content))
    } catch {
      throw new LlmError("LLM returned invalid JSON content.", "invalid-response", 502)
    }

    const responseModel = payload?.model
    const modelUsed =
      typeof responseModel === "string" && responseModel.trim()
        ? responseModel
        : requestedModel

    return { result, modelUsed }
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (controller.signal.aborted) {
      throw new LlmError("LLM request timed out.", "timeout", 504)
    }
    throw new LlmError("LLM network request failed.", "upstream-error", 502)
  } finally {
    clearTimeout(timeoutId)
  }
}

