import dotenv from "dotenv"
import pg from "pg"
import { randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

dotenv.config({ path: [".env.local", ".env"] })

export const testServerEnv = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap",
  supabaseUrl: process.env.SUPABASE_URL ?? "https://example.supabase.co",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "test-anon-key",
}

export async function createPostgisTestSchema() {
  const adminPool = new pg.Pool({ connectionString: testServerEnv.databaseUrl })
  const schema = `test_${randomUUID().replace(/-/g, "")}`
  await adminPool.query(`CREATE SCHEMA "${schema}"`)

  const databaseUrl = new URL(testServerEnv.databaseUrl)
  databaseUrl.searchParams.set("options", `-c search_path=${schema},public`)
  const testPool = new pg.Pool({ connectionString: databaseUrl.toString() })
  try {
    const migrationDir = path.resolve("db/migrations")
    const migrations = (await readdir(migrationDir))
      .filter((filename) => filename.endsWith(".sql"))
      .sort()
    for (const filename of migrations) {
      await testPool.query(await readFile(path.join(migrationDir, filename), "utf8"))
    }
  } catch (error) {
    await testPool.end()
    await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`)
    await adminPool.end()
    throw error
  }

  return {
    databaseUrl: databaseUrl.toString(),
    async close() {
      await testPool.end()
      await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`)
      await adminPool.end()
    },
  }
}

export async function withPostgres<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: testServerEnv.databaseUrl })
  const client = await pool.connect()
  try {
    return await callback(client)
  } finally {
    client.release()
    await pool.end()
  }
}
