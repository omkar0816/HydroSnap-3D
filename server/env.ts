
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `${name} must be set. Configure it in Vercel Project Settings > Environment Variables for deployments.`,
    );
  }
  return value;
}

function positiveInteger(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}.`)
  }
  return value
}

function dicraBaseUrl(): string {
  const value = process.env.DICRA_STAC_BASE_URL ?? "https://dicra.nabard.org/api-stac"
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("DICRA_STAC_BASE_URL must be a valid absolute URL.")
  }
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "DICRA_STAC_BASE_URL must use HTTPS and must not contain credentials or query parameters.",
    )
  }
  return url.toString().replace(/\/+$/, "")
}

export const serverEnv = {
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://hydrosnap:hydrosnap@localhost:5432/hydrosnap"
  ),

  // No placeholder fallbacks: a missing value must fail loudly instead of
  // silently verifying tokens against example.supabase.co.
  supabaseUrl: required("SUPABASE_URL").replace(/\/+$/, ""),

  supabaseAnonKey: required("SUPABASE_ANON_KEY"),

  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET,

  port: Number(process.env.API_PORT ?? 8000),

  publicUrl: process.env.API_PUBLIC_URL?.replace(/\/+$/, ""),

  corsOrigins: (
    process.env.CORS_ORIGINS ??
    "http://localhost:8443,http://localhost:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  uploadDirectory: process.env.UPLOAD_DIRECTORY ?? "storage/uploads",

  dicra: {
    baseUrl: dicraBaseUrl(),
    timeoutMs: positiveInteger("DICRA_REQUEST_TIMEOUT_MS", 20_000, 120_000),
    collectionsCacheTtlSeconds: Number(
      process.env.DICRA_COLLECTIONS_CACHE_TTL_SECONDS ?? 300,
    ),
    maxSearchLimit: positiveInteger("DICRA_MAX_SEARCH_LIMIT", 100, 1000),
  },
};

if (
  !Number.isSafeInteger(serverEnv.dicra.collectionsCacheTtlSeconds) ||
  serverEnv.dicra.collectionsCacheTtlSeconds < 0 ||
  serverEnv.dicra.collectionsCacheTtlSeconds > 86_400
) {
  throw new Error(
    "DICRA_COLLECTIONS_CACHE_TTL_SECONDS must be an integer between 0 and 86400.",
  )
}

if (
  !Number.isSafeInteger(serverEnv.port) ||
  serverEnv.port < 1 ||
  serverEnv.port > 65535
) {
  throw new Error("API_PORT must be a valid TCP port.");
}
