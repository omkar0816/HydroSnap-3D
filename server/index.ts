import { serverEnv } from "./env.ts"
import app from "./api.ts"
import { pool } from "./database.ts"

const server = app.listen(serverEnv.port, () => {
  console.info(`HydroSnap API listening on port ${serverEnv.port}.`)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("HTTP server failed to close cleanly.", error)
        process.exitCode = 1
      }
      void pool.end()
    })
  })
}
