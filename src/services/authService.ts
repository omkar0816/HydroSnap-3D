import type { AuthError } from "@supabase/supabase-js"
import { z } from "zod"
import type { User } from "@/types/domain"
import {
  isSupabaseConfigured,
  supabase,
  TABLES,
  type OfficerRow,
} from "@/lib/supabase"

export interface OfficerProfile {
  id: string
  officerCode: string
  name: string
  email: string
  department: string
  locationOperatingOn: string
  state: string
  district: string
  status: OfficerRow["status"]
}

export class AuthFlowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthFlowError"
  }
}

export class OfficerLookupError extends Error {
  constructor(
    message: string,
    public readonly kind: "not-officer" | "pending" | "suspended" | "unavailable",
  ) {
    super(message)
    this.name = "OfficerLookupError"
  }
}

export const INDIAN_STATES_AND_UTS = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const

const collapse = (value: string) => value.replace(/\s+/g, " ").trim()
const requiredText = (label: string, min: number, max: number) =>
  z.string()
    .transform(collapse)
    .pipe(
      z
        .string()
        .min(min, `${label} must be at least ${min} characters.`)
        .max(max, `${label} must be at most ${max} characters.`),
    )
const emailField = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email("Enter a valid email address."))
const personName = requiredText("Full name", 2, 100).pipe(
  z
    .string()
    .regex(
      /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u,
      "Use letters, spaces, dots, apostrophes or hyphens.",
    ),
)

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required."),
})

export const officerSignUpSchema = z
  .object({
    name: personName,
    department: requiredText("Department", 2, 120),
    email: emailField,
    state: z.enum(INDIAN_STATES_AND_UTS, "Select your state."),
    district: requiredText("District", 2, 60),
    locationOperatingOn: requiredText("Operating location", 2, 160),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Password must be at most 72 characters.")
      .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
        message: "Include at least one letter and one number.",
      }),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })

export type LoginInput = z.input<typeof loginSchema>
export type OfficerSignUpInput = z.input<typeof officerSignUpSchema>

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form")
    if (!(field in result)) result[field] = issue.message
  }
  return result
}

function requireSupabase(): void {
  if (!isSupabaseConfigured) {
    throw new AuthFlowError(
      "Login is not configured. Add the Supabase URL and public key to .env.local.",
    )
  }
}

function friendlyAuthError(error: AuthError): string {
  const message = error.message.toLowerCase()
  if (message.includes("invalid login credentials")) {
    return "Email or password is incorrect."
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email first, then try signing in again."
  }
  if (error.status === 429 || message.includes("rate limit")) {
    return "Too many attempts. Wait a minute and try again."
  }
  if (message.includes("fetch") || message.includes("network")) {
    return "Could not connect. Check your internet connection and try again."
  }
  return error.message
}

export async function signInWithEmail(input: LoginInput): Promise<void> {
  requireSupabase()
  const { email, password } = loginSchema.parse(input)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new AuthFlowError(friendlyAuthError(error))
}

export interface SignUpResult {
  needsEmailConfirmation: boolean
}

export async function signUpOfficer(
  input: OfficerSignUpInput,
): Promise<SignUpResult> {
  requireSupabase()
  const values = officerSignUpSchema.parse(input)
  const { data, error } = await supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      emailRedirectTo: `${window.location.origin}/login`,
      data: {
        role: "officer",
        name: values.name,
        department: values.department,
        location_operating_on: values.locationOperatingOn,
        state: values.state,
        district: values.district,
      },
    },
  })
  if (error) throw new AuthFlowError(friendlyAuthError(error))
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new AuthFlowError("An account with this email already exists.")
  }
  return { needsEmailConfirmation: !data.session }
}

export async function signOut(): Promise<void> {
  requireSupabase()
  const { error } = await supabase.auth.signOut({ scope: "local" })
  if (error) throw new AuthFlowError(friendlyAuthError(error))
}

export async function fetchOfficerProfile(
  userId: string,
): Promise<OfficerProfile> {
  const { data, error } = await supabase
    .from(TABLES.officers)
    .select("*")
    .eq("id", userId)
    .maybeSingle<OfficerRow>()

  if (error) {
    throw new OfficerLookupError(
      "Could not load your officer profile. Check your connection and try again.",
      "unavailable",
    )
  }
  if (!data) {
    throw new OfficerLookupError(
      "This account is not registered as a field officer.",
      "not-officer",
    )
  }
  const profile: OfficerProfile = {
    id: data.id,
    officerCode: data.officer_code,
    name: data.name,
    email: data.email,
    department: data.department,
    locationOperatingOn: data.location_operating_on,
    state: data.state,
    district: data.district,
    status: data.status,
  }
  if (profile.status === "pending") {
    throw new OfficerLookupError(
      "Your officer account is awaiting approval. Contact your department administrator.",
      "pending",
    )
  }
  if (profile.status === "suspended") {
    throw new OfficerLookupError(
      "This officer account has been suspended. Contact your department administrator.",
      "suspended",
    )
  }
  return profile
}

export function officerToUser(profile: OfficerProfile): User {
  const initials = profile.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: "Field Officer",
    initials: initials || "FO",
  }
}

export async function getCurrentOfficerUser(): Promise<User> {
  requireSupabase()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new AuthFlowError(friendlyAuthError(error))
  if (!data.session) throw new AuthFlowError("You are not signed in.")
  return officerToUser(await fetchOfficerProfile(data.session.user.id))
}
