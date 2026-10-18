import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generateJson, LlmError, stripCodeFences } from "../../server/llm"

describe("server/llm", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it("strips markdown code fences before JSON parsing", () => {
    expect(stripCodeFences("```json\n{\"foo\": 1}\n```")).toBe("{\"foo\": 1}")
    expect(stripCodeFences("```\n{\"foo\": 2}\n```")).toBe("{\"foo\": 2}")
    expect(stripCodeFences("{\"foo\": 3}")).toBe("{\"foo\": 3}")
  })

  it("throws not-configured if env vars are missing", async () => {
    delete process.env.OMNIROUTE_BASE_URL
    delete process.env.OMNIROUTE_API_KEY
    delete process.env.OMNIROUTE_MODEL

    await expect(generateJson("sys", "prompt")).rejects.toThrow(LlmError)
    try {
      await generateJson("sys", "prompt")
    } catch (err) {
      expect(err).toBeInstanceOf(LlmError)
      const llmErr = err as LlmError
      expect(llmErr.code).toBe("not-configured")
      expect(llmErr.status).toBe(503)
    }
  })

  it("handles successful response and returns modelUsed from response", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://llm.example/v1"
    process.env.OMNIROUTE_API_KEY = "test-key"
    process.env.OMNIROUTE_MODEL = "combo-default"

    const mockResponse = {
      model: "actual-gpt-4o",
      choices: [{ message: { content: "```json\n{\"answer\": 42}\n```" } }],
    }

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const res = await generateJson("sys", "prompt")
    expect(res).toEqual({
      result: { answer: 42 },
      modelUsed: "actual-gpt-4o",
    })
  })

  it("uses OMNIROUTE_VISION_MODEL when imageDataUrl is present", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://llm.example/v1"
    process.env.OMNIROUTE_API_KEY = "test-key"
    process.env.OMNIROUTE_MODEL = "text-model"
    process.env.OMNIROUTE_VISION_MODEL = "vision-model"

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"seen\": true}" } }],
        }),
        { status: 200 },
      ),
    )

    const res = await generateJson("sys", "prompt", {
      imageDataUrl: "data:image/jpeg;base64,123",
    })
    expect(res.modelUsed).toBe("vision-model")

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(callBody.model).toBe("vision-model")
    expect(callBody.messages[1].content).toEqual([
      { type: "text", text: "prompt" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,123" } },
    ])
  })

  it("maps 429 to rate-limited error", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://llm.example/v1"
    process.env.OMNIROUTE_API_KEY = "test-key"
    process.env.OMNIROUTE_MODEL = "model"

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Rate limit exceeded", { status: 429 }),
    )

    try {
      await generateJson("sys", "prompt")
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LlmError)
      const llmErr = err as LlmError
      expect(llmErr.code).toBe("rate-limited")
      expect(llmErr.status).toBe(429)
    }
  })

  it("maps 500 to upstream-error", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://llm.example/v1"
    process.env.OMNIROUTE_API_KEY = "test-key"
    process.env.OMNIROUTE_MODEL = "model"

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    )

    try {
      await generateJson("sys", "prompt")
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LlmError)
      const llmErr = err as LlmError
      expect(llmErr.code).toBe("upstream-error")
      expect(llmErr.status).toBe(500)
    }
  })

  it("maps malformed JSON content to invalid-response", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://llm.example/v1"
    process.env.OMNIROUTE_API_KEY = "test-key"
    process.env.OMNIROUTE_MODEL = "model"

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not valid json" } }],
        }),
        { status: 200 },
      ),
    )

    try {
      await generateJson("sys", "prompt")
      expect.fail("Should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(LlmError)
      const llmErr = err as LlmError
      expect(llmErr.code).toBe("invalid-response")
      expect(llmErr.status).toBe(502)
    }
  })
})
