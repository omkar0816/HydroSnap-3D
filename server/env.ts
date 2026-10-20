
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} must be set.`);
  }
  return value;
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
};

if (
  !Number.isSafeInteger(serverEnv.port) ||
  serverEnv.port < 1 ||
  serverEnv.port > 65535
) {
  throw new Error("API_PORT must be a valid TCP port.");
}
