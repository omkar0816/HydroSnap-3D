import { describe, expect, it, vi } from "vitest"
import handler from "../../api/pilot-summary"
import { LlmError } from "../../server/llm"

vi.mock("../../server/llm", () => ({
  generateJson: vi.fn(),
  LlmError: class extends Error {
    code: string
    status: number
    constructor(msg: string, code: string, status: number) {
      super(msg)
      this.code = code
      this.status = status
    }
  },
}))

import { generateJson } from "../../server/llm"

describe("api/pilot-summary status mapping", () => {
  const validPayload = {
    status: "pipeline-test",
    label: "Pipeline test, not a real result",
    interpretation: "Testing interpretation",
    metrics: [
      {
        name: "Metric 1",
        definition: "Def 1",
        before: { window: "W1", scenes: [], nearMean: 0.1, controlMean: 0.1, validNearPixels: 10, validControlPixels: 10 },
        after: { window: "W2", scenes: [], nearMean: 0.2, controlMean: 0.2, validNearPixels: 10, validControlPixels: 10 },
        nearChange: 0.1,
        controlChange: 0.1,
        differenceInDifferences: 0,
      },
      {
        name: "Metric 2",
        definition: "Def 2",
        before: { window: "W1", scenes: [], nearMean: 0.1, controlMean: 0.1, validNearPixels: 10, validControlPixels: 10 },
        after: { window: "W2", scenes: [], nearMean: 0.2, controlMean: 0.2, validNearPixels: 10, validControlPixels: 10 },
        nearChange: 0.1,
        controlChange: 0.1,
        differenceInDifferences: 0,
      },
    ],
  }

  const makeRequest = () =>
    new Request("https://app.example/api/pilot-summary", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "content-type": "application/json",
      },
      body: JSON.stringify(validPayload),
    })

  it("maps not-configured LlmError to 503", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(
      new LlmError("Config error", "not-configured", 503),
    )
    const res = await handler.fetch(makeRequest())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("AI pilot summary is unavailable.")
  })

  it("maps rate-limited LlmError to 429", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(
      new LlmError("Too many requests", "rate-limited", 429),
    )
    const res = await handler.fetch(makeRequest())
    expect(res.status).toBe(429)
  })

  it("maps timeout LlmError to 504", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(
      new LlmError("Timeout", "timeout", 504),
    )
    const res = await handler.fetch(makeRequest())
    expect(res.status).toBe(504)
  })

  it("maps upstream-error LlmError to 502", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(
      new LlmError("Upstream fail", "upstream-error", 500),
    )
    const res = await handler.fetch(makeRequest())
    expect(res.status).toBe(502)
  })

  it("maps invalid-response LlmError to 502", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(
      new LlmError("Bad response", "invalid-response", 502),
    )
    const res = await handler.fetch(makeRequest())
    expect(res.status).toBe(502)
  })
})
