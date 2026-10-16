const requestCounts = new Map<string, { count: number; expiresAt: number }>()
const limit = 12
const windowMs = 60_000

export function validateOrigin(request: Request): Response | undefined {
  const origin = request.headers.get("origin")
  if (!origin) {
    return Response.json({ error: "Origin is required." }, { status: 403 })
  }
  const allowedOrigins = (process.env.PHOTO_AI_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  let requestOrigin: string
  try {
    requestOrigin = new URL(request.url).origin
  } catch {
    return Response.json({ error: "Invalid request origin." }, { status: 403 })
  }
  if (origin !== requestOrigin && !allowedOrigins.includes(origin)) {
    return Response.json({ error: "Origin is not allowed." }, { status: 403 })
  }
  return undefined
}

export function checkRateLimit(request: Request): Response | undefined {
  const forwarded = request.headers.get("x-forwarded-for")
  const clientKey = forwarded?.split(",")[0]?.trim() || "unknown"
  const now = Date.now()
  for (const [key, entry] of requestCounts) {
    if (entry.expiresAt <= now) requestCounts.delete(key)
  }
  const current = requestCounts.get(clientKey)
  if (current && current.count >= limit) {
    return Response.json({ error: "Request limit reached. Try again later." }, {
      status: 429,
      headers: { "Retry-After": "60" },
    })
  }
  requestCounts.set(clientKey, {
    count: (current?.count ?? 0) + 1,
    expiresAt: current?.expiresAt ?? now + windowMs,
  })
  return undefined
}

export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<unknown | Response> {
  const contentLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return Response.json({ error: "Request body is too large." }, {
      status: 413,
    })
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return Response.json({ error: "Request body is too large." }, {
      status: 413,
    })
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, {
      status: 400,
    })
  }
}
