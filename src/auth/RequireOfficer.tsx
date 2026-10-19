import type { ReactNode } from "react"
import { LoaderCircle, WifiOff } from "lucide-react"
import { useState } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/auth/AuthContext"
import { isSupabaseConfigured } from "@/lib/supabase"

export function RequireOfficer({ children }: { children: ReactNode }) {
  const { status, notice, retry, signOut } = useAuth()
  const location = useLocation()
  const [signOutError, setSignOutError] = useState("")

  if (!isSupabaseConfigured) return <>{children}</>

  if (status === "initializing" || status === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f2f7fc]">
        <div
          className="flex items-center gap-2.5 text-sm font-medium text-[#496175]"
          role="status"
        >
          <LoaderCircle className="spin" size={19} />
          Checking your session…
        </div>
      </div>
    )
  }

  if (status === "signed-out") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (status === "unavailable") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f2f7fc] p-6">
        <section
          className="w-full max-w-sm rounded-xl border border-[#e6ebf1] bg-white p-6 text-center shadow-sm"
          role="alert"
        >
          <WifiOff className="mx-auto mb-3 text-[#9a6b20]" size={26} />
          <h1 className="m-0 text-base font-bold text-[#153957]">
            Could not verify your officer account
          </h1>
          <p className="mt-2 text-sm text-[#607489]">
            {signOutError || notice || "Check your connection and try again."}
          </p>
          <div className="mt-5 flex justify-center gap-2.5">
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-[#237db5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1c6a9b]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                void signOut().catch((error: unknown) =>
                  setSignOutError(
                    error instanceof Error
                      ? error.message
                      : "Could not sign out.",
                  ),
                )
              }}
              className="rounded-lg border border-[#d9e3ec] px-4 py-2 text-sm font-semibold text-[#496175] hover:bg-[#f4f8fb]"
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    )
  }

  return <>{children}</>
}
