import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { Session } from "@supabase/supabase-js"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import {
  fetchOfficerProfile,
  OfficerLookupError,
  signInWithEmail,
  signOut as signOutFromSupabase,
  signUpOfficer,
  type LoginInput,
  type OfficerProfile,
  type OfficerSignUpInput,
  type SignUpResult,
} from "@/services/authService"

export type AuthStatus = "initializing" | "signed-out" | "checking" | "ready" | "unavailable"

interface AuthContextValue {
  status: AuthStatus
  officer: OfficerProfile | null
  notice: string | null
  clearNotice: () => void
  retry: () => void
  signIn: (input: LoginInput) => Promise<void>
  signUp: (input: OfficerSignUpInput) => Promise<SignUpResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [officer, setOfficer] = useState<OfficerProfile | null>(null)
  const [profileFailed, setProfileFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const previousUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSessionLoaded(true)
      return
    }

    let active = true
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setSessionLoaded(true)
      setSessionError(null)
    })

    void supabase.auth
      .getSession()
      .then(({ data: response, error }) => {
        if (!active) return
        if (error) {
          setSessionError(error.message)
          setNotice(`Could not read your session: ${error.message}`)
          setSessionLoaded(true)
          return
        }
        setSessionError(null)
        setNotice(null)
        setSession(response.session)
        setSessionLoaded(true)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message =
          error instanceof Error
            ? error.message
            : "Could not read your session."
        setSessionError(message)
        setNotice(message)
        setSessionLoaded(true)
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [attempt])

  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!sessionLoaded) return

    if (previousUserId.current !== userId) {
      if (previousUserId.current !== null) queryClient.clear()
      previousUserId.current = userId
      setOfficer(null)
    }

    if (!userId) {
      setOfficer(null)
      setProfileFailed(false)
      return
    }

    let active = true
    setProfileFailed(false)
    fetchOfficerProfile(userId)
      .then((profile) => {
        if (!active) return
        setOfficer(profile)
        setNotice(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        setOfficer(null)
        if (
          error instanceof OfficerLookupError &&
          error.kind !== "unavailable"
        ) {
          setNotice(error.message)
          setProfileFailed(true)
          void signOutFromSupabase().catch((signOutError: unknown) => {
            setNotice(
              signOutError instanceof Error
                ? `${error.message} Sign-out failed: ${signOutError.message}`
                : `${error.message} Sign-out failed.`,
            )
          })
          return
        }
        setProfileFailed(true)
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not load your profile.",
        )
      })

    return () => {
      active = false
    }
  }, [sessionLoaded, userId, attempt, queryClient])

  const status: AuthStatus = !sessionLoaded
    ? "initializing"
    : sessionError
      ? "unavailable"
      : !userId
        ? "signed-out"
        : officer?.id === userId
          ? "ready"
          : profileFailed
            ? "unavailable"
            : "checking"

  const signIn = useCallback(async (input: LoginInput) => {
    setNotice(null)
    await signInWithEmail(input)
  }, [])
  const signUp = useCallback(async (input: OfficerSignUpInput) => {
    setNotice(null)
    return signUpOfficer(input)
  }, [])
  const signOut = useCallback(async () => {
    await signOutFromSupabase()
    setOfficer(null)
    setSession(null)
    setSessionError(null)
    setNotice(null)
    queryClient.clear()
  }, [queryClient])
  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  const clearNotice = useCallback(() => setNotice(null), [])

  const value = useMemo(
    () => ({
      status,
      officer: status === "ready" ? officer : null,
      notice,
      clearNotice,
      retry,
      signIn,
      signUp,
      signOut,
    }),
    [status, officer, notice, clearNotice, retry, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.")
  return context
}
