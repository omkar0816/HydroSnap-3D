import pg from "pg"
import { serverEnv } from "./env.ts"

export const pool = new pg.Pool({
  connectionString: serverEnv.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error.", error)
})
