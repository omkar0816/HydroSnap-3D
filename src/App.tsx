import { createContext, lazy, Suspense, useMemo, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { Navigate, Route, Routes } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
)
const MapAnalysisPage = lazy(() =>
  import("@/pages/MapAnalysisPage").then((module) => ({
    default: module.MapAnalysisPage,
  })),
)
const ImageUploadPage = lazy(() =>
  import("@/pages/ImageUploadPage").then((module) => ({
    default: module.ImageUploadPage,
  })),
)
const AssetPassportPage = lazy(() =>
  import("@/pages/AssetPassportPage").then((module) => ({
    default: module.AssetPassportPage,
  })),
)
const WorkspacePage = lazy(() =>
  import("@/pages/WorkspacePage").then((module) => ({
    default: module.WorkspacePage,
  })),
)

export interface AppContextValue {
  watershedId: string
  setWatershedId: (id: string) => void
  visibleLayers: {
    boundary: boolean
    streams: boolean
    assets: boolean
    ndvi: boolean
    ndwi: boolean
  }
  setVisibleLayers: (
    update: (
      layers: AppContextValue["visibleLayers"],
    ) => AppContextValue["visibleLayers"],
  ) => void
  notify: (message: string) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export default function App() {
  const [watershedId, setWatershedId] = useState("")
  const [visibleLayers, setVisibleLayers] = useState({
    boundary: true,
    streams: true,
    assets: true,
    ndvi: false,
    ndwi: false,
  })
  const [notification, setNotification] = useState("")
  const context = useMemo(
    () => ({
      watershedId,
      setWatershedId,
      visibleLayers,
      setVisibleLayers,
      notify: (message: string) => setNotification(message),
    }),
    [visibleLayers, watershedId],
  )

  return (
    <AppContext.Provider value={context}>
      <AppLayout
        notification={notification}
        clearNotification={() => setNotification("")}
      >
        <Suspense
          fallback={
            <div className="page-loading" role="status">
              <LoaderCircle className="spin" size={19} />
              Loading workspace…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/map" element={<MapAnalysisPage />} />
            <Route path="/upload" element={<ImageUploadPage />} />
            <Route
              path="/assets/:assetId"
              element={<AssetPassportPage />}
            />
            <Route
              path="/watersheds"
              element={<WorkspacePage section="watersheds" />}
            />
            <Route
              path="/watersheds/:watershedId"
              element={<WorkspacePage section="watershed-detail" />}
            />
            <Route
              path="/layers"
              element={<WorkspacePage section="layers" />}
            />
            <Route
              path="/analytics"
              element={<WorkspacePage section="analytics" />}
            />
            <Route
              path="/evidence"
              element={<WorkspacePage section="evidence" />}
            />
            <Route
              path="/interventions"
              element={<WorkspacePage section="interventions" />}
            />
            <Route
              path="/reports"
              element={<WorkspacePage section="reports" />}
            />
            <Route
              path="/administration"
              element={<WorkspacePage section="administration" />}
            />
            <Route
              path="/settings"
              element={<WorkspacePage section="settings" />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </AppContext.Provider>
  )
}
