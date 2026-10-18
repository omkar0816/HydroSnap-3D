import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import pilotSummary from "./api/pilot-summary.ts"
import { defineConfig, loadEnv } from "vite"
import { fileURLToPath } from "node:url"

const aiRoutes = new Map([
  ["/api/pilot-summary", pilotSummary],
])

function localAiApi() {
  return {
    name: "hydrosnap-local-ai-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`,
        )
        const handler = aiRoutes.get(requestUrl.pathname)
        if (!handler) {
          next()
          return
        }

        void (async () => {
          const contentLength = Number(req.headers["content-length"])
          if (Number.isFinite(contentLength) && contentLength > 3_900_000) {
            res.statusCode = 413
            res.end(JSON.stringify({ error: "Request body is too large." }))
            return
          }
          const chunks: Buffer[] = []
          let bytes = 0
          for await (const chunk of req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            bytes += buffer.byteLength
            if (bytes > 3_900_000) {
              res.statusCode = 413
              res.end(JSON.stringify({ error: "Request body is too large." }))
              return
            }
            chunks.push(buffer)
          }

          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(name, value)
            else if (Array.isArray(value)) headers.set(name, value.join(", "))
          }
          const method = req.method ?? "GET"
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const request = new Request(requestUrl, {
            method,
            headers,
            ...(body && method !== "GET" && method !== "HEAD" ? { body } : {}),
          })
          const response = await handler.fetch(request)
          res.statusCode = response.status
          response.headers.forEach((value, name) => res.setHeader(name, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        })().catch((error: unknown) => {
          console.error("Local AI API request failed.", error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: "AI endpoint failed." }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "")
  for (const name of [
    "OMNIROUTE_BASE_URL",
    "OMNIROUTE_API_KEY",
    "OMNIROUTE_MODEL",
    "OMNIROUTE_VISION_MODEL",
    "PILOT_SUMMARY_ALLOWED_ORIGINS",
    "BHUVAN_PROXY_TARGET",
  ]) {
    if (!process.env[name] && localEnv[name]) process.env[name] = localEnv[name]
  }

  return {
    plugins: [react(), tailwindcss(), localAiApi()],
    server: {
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 8443),
      strictPort: true,
      proxy: {
        // Bhuvan does not advertise CORS support for browsers, so the app calls
        // this same-origin path and Vite forwards it. Production equivalent: the rewrite in vercel.json.
        "/bhuvan-wms": {
          target:
            process.env.BHUVAN_PROXY_TARGET ??
            "https://bhuvan-vec2.nrsc.gov.in",
          changeOrigin: true,
          // Some Indian government hosts ship incomplete TLS chains; dev only.
          secure: false,
          rewrite: (path: string) => path.replace(/^\/bhuvan-wms/, "/bhuvan"),
        },
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  }
})
