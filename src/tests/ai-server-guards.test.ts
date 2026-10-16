import { describe, expect, it } from "vitest"
import { checkRateLimit, readJson, validateOrigin } from "../../server/request"

describe("AI endpoint request guards", () => {
  it("accepts same-origin requests and rejects other origins", () => {
    const sameOrigin = new Request("https://app.example/api/photo-analysis", {
      method: "POST",
      headers: { origin: "https://app.example" },
    })
    const foreignOrigin = new Request(
      "https://app.example/api/photo-analysis",
      {
        method: "POST",
        headers: { origin: "https://other.example" },
      },
    )

    expect(validateOrigin(sameOrigin)).toBeUndefined()
    expect(validateOrigin(foreignOrigin)?.status).toBe(403)
  })

  it("rejects oversized bodies before parsing", async () => {
    const request = new Request("https://app.example/api/photo-analysis", {
      method: "POST",
      body: "{}",
    })

    const result = await readJson(request, 1)
    expect(result).toBeInstanceOf(Response)
    if (result instanceof Response) expect(result.status).toBe(413)
  })

  it("limits repeated calls per client within the time window", () => {
    const makeRequest = () =>
      new Request("https://app.example/api/photo-analysis", {
        method: "POST",
        headers: { "x-forwarded-for": "198.51.100.240" },
      })

    for (let request = 0; request < 12; request++) {
      expect(checkRateLimit(makeRequest())).toBeUndefined()
    }
    expect(checkRateLimit(makeRequest())?.status).toBe(429)
  })
})
