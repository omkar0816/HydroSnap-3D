import { createClient } from "@supabase/supabase-js"
import { env } from "@/config/env"

export interface OfficerRow {
  id: string
  officer_code: string
  name: string
  email: string
  department: string
  location_operating_on: string
  state: string
  district: string
  status: "pending" | "active" | "suspended"
}

export const TABLES = {
  officers: "officers",
} as const

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
)

export const supabase = createClient(
  env.supabaseUrl || "http://localhost:54321",
  env.supabaseAnonKey || "supabase-not-configured",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
