import { execFileSync } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import dotenv from "dotenv"

dotenv.config({ path: [".env.local", ".env"] })

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap"
const seedRequested = process.argv.slice(2).includes("--seed")
const pool = new pg.Pool({ connectionString: databaseUrl })

async function main() {
  if (seedRequested && process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data when NODE_ENV=production.")
  }

  const migrationDir = path.resolve("db/migrations")
  const migrationFiles = (await readdir(migrationDir))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    for (const migrationName of migrationFiles) {
      const migrationPath = path.resolve(migrationDir, migrationName)
      const migration = await readFile(migrationPath, "utf8")
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [migrationName],
      )
      if (!applied.rowCount) {
        await client.query(migration)
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [migrationName],
        )
      }
    }
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  console.info(
    `Database migration check complete; ${migrationFiles.length} migration file(s) processed.`,
  )
  if (seedRequested) {
    execFileSync("pnpm", ["db:seed:dev"], { stdio: "inherit" })
  }
}

main()
  .catch((error: unknown) => {
    console.error("Database setup failed.", error)
    process.exitCode = 1
  })
  .finally(() => pool.end())