import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import maplibregl from "maplibre-gl"
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Waves,
} from "lucide-react"
import { Link, Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/auth/AuthContext"
import { isSupabaseConfigured } from "@/lib/supabase"
import {
  AuthFlowError,
  fieldErrors,
  INDIAN_STATES_AND_UTS,
  loginSchema,
  officerSignUpSchema,
  type LoginInput,
  type OfficerSignUpInput,
} from "@/services/authService"

type Mode = "login" | "signup"
type Errors = Record<string, string>

const emptyLogin: LoginInput = { email: "", password: "" }
const emptySignUp: OfficerSignUpInput = {
  name: "",
  department: "",
  email: "",
  state: "" as OfficerSignUpInput["state"],
  district: "",
  locationOperatingOn: "",
  password: "",
  confirmPassword: "",
}

function safeRedirect(value: unknown): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login")
  ) {
    return value
  }
  return "/"
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#37526a]">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="m-0 text-xs text-[#c0392b]">
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-[#d9e3ec] bg-white px-3 text-sm text-[#18354f] outline-none transition placeholder:text-[#9aa8b6] focus:border-[#237db5] focus:ring-2 focus:ring-[#237db5]/20 aria-invalid:border-[#d9534f]"

export function LoginPage() {
  const { status, notice, clearNotice, retry, signIn, signUp } = useAuth()
  const location = useLocation()
  const redirectTo = safeRedirect(
    (location.state as { from?: string } | null)?.from,
  )
  const [mode, setMode] = useState<Mode>("login")
  const [login, setLogin] = useState<LoginInput>(emptyLogin)
  const [signup, setSignup] = useState<OfficerSignUpInput>(emptySignUp)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  )

  const mapContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri",
          },
        },
        layers: [
          {
            id: "satellite-imagery",
            type: "raster",
            source: "satellite",
            paint: {
              "raster-opacity": 1,
              "raster-saturation": -0.12,
              "raster-contrast": 0.08,
            },
          },
        ],
      },
      center: [73.7, 18.4],
      zoom: 10,
      minZoom: 8,
      maxZoom: 15,
      interactive: false,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
    })

    return () => map.remove()
  }, [status])

  if (status === "ready") return <Navigate to={redirectTo} replace />

  const busy = submitting || status === "checking"
  const message = formError ?? notice

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    setErrors({})
    setFormError(null)
    setConfirmationEmail(null)
    clearNotice()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !isSupabaseConfigured) return
    setFormError(null)
    clearNotice()
    const schema = mode === "login" ? loginSchema : officerSignUpSchema
    const result = schema.safeParse(mode === "login" ? login : signup)
    if (!result.success) {
      setErrors(fieldErrors(result.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      if (mode === "login") {
        await signIn(login)
      } else {
        const created = await signUp(signup)
        if (created.needsEmailConfirmation) {
          setConfirmationEmail(signup.email.trim())
        }
      }
    } catch (error) {
      setFormError(
        error instanceof AuthFlowError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  function setLoginField(field: keyof LoginInput, value: string) {
    setLogin((current) => ({ ...current, [field]: value }))
  }

  function setSignUpField(field: keyof OfficerSignUpInput, value: string) {
    setSignup((current) => ({ ...current, [field]: value }))
  }

  function describe(field: string) {
    return errors[field] ? `${field}-error` : undefined
  }

  if (status === "initializing") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f2f7fc]">
        <p
          className="flex items-center gap-2 text-sm text-[#496175]"
          role="status"
        >
          <LoaderCircle className="spin" size={18} /> Checking your session…
        </p>
      </main>
    )
  }

  return (
    <main className="login-page-background">
      <div
        ref={mapContainerRef}
        className="login-satellite-map"
        aria-hidden="true"
      />

      <div className="login-map-overlay" aria-hidden="true" />

      <div className="login-page-content w-full max-w-md">
        <Link
          to="/"
          className="mb-7 flex items-center justify-center gap-2.5"
          aria-label="HydroSnap 3D home"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#277fae] to-[#1c5d89] text-white shadow-sm">
            <Waves size={21} />
          </span>
          <span className="font-[Manrope,sans-serif] text-xl font-extrabold tracking-tight text-[#153957]">
            HydroSnap <span className="text-[#32926d]">3D</span>
          </span>
        </Link>

        <section className="rounded-2xl border border-[#e6ebf1] bg-white p-6 shadow-[0_12px_40px_rgba(21,57,87,0.08)] sm:p-8">
          <p className="m-0 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#8493a3]">
            Field officer access
          </p>
          <h1 className="mb-2 mt-2 text-center font-[Manrope,sans-serif] text-2xl font-extrabold text-[#153957]">
            {mode === "login" ? "Welcome back" : "Create officer account"}
          </h1>
          <p className="mb-6 mt-0 text-center text-sm text-[#718297]">
            {mode === "login"
              ? "Sign in to continue to your watershed workspace."
              : "Register your details for officer account approval."}
          </p>

          {!isSupabaseConfigured && (
            <div
              className="mb-5 flex gap-2.5 rounded-lg border border-[#f2dca8] bg-[#fff8e6] p-3 text-xs leading-relaxed text-[#7a5a14]"
              role="alert"
            >
              <AlertCircle className="mt-0.5 shrink-0" size={16} />
              <span>
                Supabase is not configured. Set <code>VITE_SUPABASE_URL</code>{" "}
                and <code>VITE_SUPABASE_ANON_KEY</code> in{" "}
                <code>.env.local</code> to enable account sign-in.
              </span>
            </div>
          )}

          {message && (
            <div
              className="mb-5 flex gap-2.5 rounded-lg border border-[#f3c6c2] bg-[#fdf0ef] p-3 text-sm leading-relaxed text-[#a1342b]"
              role="alert"
            >
              <AlertCircle className="mt-0.5 shrink-0" size={17} />
              <span>{message}</span>
              {status === "unavailable" && (
                <button
                  type="button"
                  onClick={retry}
                  className="ml-auto shrink-0 font-semibold underline underline-offset-2"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {confirmationEmail ? (
            <div className="text-center" role="status">
              <CheckCircle2 className="mx-auto mb-3 text-[#308661]" size={34} />
              <h2 className="m-0 text-lg font-bold text-[#153957]">
                Check your email
              </h2>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-[#607489]">
                We sent a confirmation link to{" "}
                <strong>{confirmationEmail}</strong>. After confirming, your
                officer account will need administrator approval before
                workspace access is enabled.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLogin((current) => ({
                    ...current,
                    email: confirmationEmail,
                  }))
                  switchMode("login")
                }}
                className="min-h-11 w-full rounded-lg bg-[#237db5] px-4 text-sm font-semibold text-white transition hover:bg-[#1c6a9b] disabled:opacity-60"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              {isSupabaseConfigured && (
                <div
                  className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[#eef3f8] p-1"
                  role="tablist"
                  aria-label="Sign in or create an account"
                >
                  {(["login", "signup"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={mode === tab}
                      onClick={() => switchMode(tab)}
                      className={`min-h-9 rounded-md text-sm font-semibold transition ${
                        mode === tab
                          ? "bg-white text-[#1f668f] shadow-sm"
                          : "text-[#718297] hover:text-[#153957]"
                      }`}
                    >
                      {tab === "login" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="grid gap-4">
                {mode === "signup" && (
                  <>
                    <Field id="name" label="Full name" error={errors.name}>
                      <input
                        id="name"
                        className={inputClass}
                        value={signup.name}
                        onChange={(event) =>
                          setSignUpField("name", event.target.value)
                        }
                        autoComplete="name"
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={describe("name")}
                        disabled={busy || !isSupabaseConfigured}
                      />
                    </Field>
                    <Field
                      id="department"
                      label="Department"
                      error={errors.department}
                    >
                      <input
                        id="department"
                        className={inputClass}
                        value={signup.department}
                        onChange={(event) =>
                          setSignUpField("department", event.target.value)
                        }
                        autoComplete="organization"
                        aria-invalid={Boolean(errors.department)}
                        aria-describedby={describe("department")}
                        disabled={busy || !isSupabaseConfigured}
                      />
                    </Field>
                  </>
                )}

                <Field id="email" label="Email address" error={errors.email}>
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    className={inputClass}
                    value={mode === "login" ? login.email : signup.email}
                    onChange={(event) =>
                      mode === "login"
                        ? setLoginField("email", event.target.value)
                        : setSignUpField("email", event.target.value)
                    }
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={describe("email")}
                    disabled={busy || !isSupabaseConfigured}
                  />
                </Field>

                {mode === "signup" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="state" label="State / UT" error={errors.state}>
                        <select
                          id="state"
                          className={inputClass}
                          value={signup.state}
                          onChange={(event) =>
                            setSignUpField("state", event.target.value)
                          }
                          aria-invalid={Boolean(errors.state)}
                          aria-describedby={describe("state")}
                          disabled={busy}
                        >
                          <option value="">Select state</option>
                          {INDIAN_STATES_AND_UTS.map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        id="district"
                        label="District"
                        error={errors.district}
                      >
                        <input
                          id="district"
                          className={inputClass}
                          value={signup.district}
                          onChange={(event) =>
                            setSignUpField("district", event.target.value)
                          }
                          aria-invalid={Boolean(errors.district)}
                          aria-describedby={describe("district")}
                          disabled={busy}
                        />
                      </Field>
                    </div>
                    <Field
                      id="locationOperatingOn"
                      label="Operating location"
                      error={errors.locationOperatingOn}
                    >
                      <input
                        id="locationOperatingOn"
                        className={inputClass}
                        value={signup.locationOperatingOn}
                        onChange={(event) =>
                          setSignUpField(
                            "locationOperatingOn",
                            event.target.value,
                          )
                        }
                        placeholder="Block, taluka or watershed cluster"
                        aria-invalid={Boolean(errors.locationOperatingOn)}
                        aria-describedby={describe("locationOperatingOn")}
                        disabled={busy}
                      />
                    </Field>
                  </>
                )}

                <Field id="password" label="Password" error={errors.password}>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className={`${inputClass} pr-11`}
                      value={
                        mode === "login" ? login.password : signup.password
                      }
                      onChange={(event) =>
                        mode === "login"
                          ? setLoginField("password", event.target.value)
                          : setSignUpField("password", event.target.value)
                      }
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={describe("password")}
                      disabled={busy || !isSupabaseConfigured}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#8493a3] hover:text-[#237db5]"
                      onClick={() => setShowPassword((show) => !show)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </Field>

                {mode === "signup" && (
                  <Field
                    id="confirmPassword"
                    label="Confirm password"
                    error={errors.confirmPassword}
                  >
                    <input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      className={inputClass}
                      value={signup.confirmPassword}
                      onChange={(event) =>
                        setSignUpField("confirmPassword", event.target.value)
                      }
                      autoComplete="new-password"
                      aria-invalid={Boolean(errors.confirmPassword)}
                      aria-describedby={describe("confirmPassword")}
                      disabled={busy}
                    />
                  </Field>
                )}

                {mode === "signup" && (
                  <p className="m-0 text-xs leading-relaxed text-[#718297]">
                    New accounts remain pending until approved by a department
                    administrator.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !isSupabaseConfigured}
                  className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#237db5] px-4 text-sm font-semibold text-white transition hover:bg-[#1c6a9b] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {busy && <LoaderCircle className="spin" size={17} />}
                  {submitting
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
            </>
          )}
        </section>

        <p className="mb-0 mt-5 text-center text-xs text-[#8493a3]">
          HydroSnap 3D  · Field evidence workspace
        </p>
      </div>
    </main>
  )
}
