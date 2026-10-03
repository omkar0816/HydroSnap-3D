import { useContext, useEffect, useRef, useState, type ReactNode } from "react"
import {
  AlertCircle,
  Activity,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudSun,
  FileBarChart2,
  FileImage,
  Globe2,
  Layers3,
  Leaf,
  LifeBuoy,
  Map,
  Menu,
  PanelLeftClose,
  Search,
  Settings,
  ShieldCheck,
  Sprout,
  Waves,
  X,
} from "lucide-react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { AppContext } from "@/App"
import { DemoBadge } from "@/components/common/DemoBadge"
import { SyncIndicator } from "@/components/sync/SyncIndicator"
import { env } from "@/config/env"
import { useHydroSnap } from "@/hooks/useHydroSnap"

const navigation = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/", icon: Globe2 },
      { label: "Map analysis", to: "/map", icon: Map },
    ],
  },
  {
    label: "Field operations",
    items: [
      { label: "Geo-coded images", to: "/upload", icon: FileImage },
      { label: "Field evidence", to: "/evidence", icon: ClipboardList },
      { label: "Interventions", to: "/interventions", icon: Sprout },
    ],
  },
  {
    label: "Spatial intelligence",
    items: [
      { label: "Watersheds", to: "/watersheds", icon: Waves },
      { label: "Thematic layers", to: "/layers", icon: Layers3 },
      { label: "Change detection", to: "/analytics", icon: Activity },
    ],
  },
  {
    label: "Outputs",
    items: [{ label: "Reports", to: "/reports", icon: FileBarChart2 }],
  },
]

const titles: Record<string, string> = {
  "/": "Overview",
  "/map": "Map analysis",
  "/upload": "Geo-coded images",
  "/watersheds": "Watersheds",
  "/layers": "Thematic layers",
  "/analytics": "Change detection",
  "/evidence": "Field evidence",
  "/interventions": "Interventions",
  "/reports": "Reports",
  "/administration": "Administration",
  "/settings": "Settings",
}

interface AppLayoutProps {
  children: ReactNode
  notification: string
  clearNotification: () => void
}

export function AppLayout({
  children,
  notification,
  clearNotification,
}: AppLayoutProps) {
  const context = useContext(AppContext)
  const data = useHydroSnap()
  const watersheds = data.watersheds.data ?? []
  const currentUser = data.currentUser.data
  const pendingCount = (data.observations.data ?? []).filter(
    (item) => item.verificationStatus === "Pending review",
  ).length
  const runningCount = (data.jobs.data ?? []).filter(
    (job) => job.status === "Processing",
  ).length
  const queries = [
    data.currentUser,
    data.teamMembers,
    data.watersheds,
    data.layers,
    data.assets,
    data.observations,
    data.jobs,
    data.results,
    data.interventions,
    data.reports,
  ]
  const failedQuery = queries.find((query) => query.isError)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsRead, setNotificationsRead] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [search, setSearch] = useState("")
  const searchInput = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const title =
    titles[location.pathname] ??
    (location.pathname.startsWith("/watersheds/")
      ? "Watershed details"
      : "Overview")

  useEffect(() => {
    if (!context?.watershedId && watersheds[0]) {
      context?.setWatershedId(watersheds[0].id)
    }
  }, [context, watersheds])

  useEffect(() => {
    if (!notification) return
    const timeout = window.setTimeout(clearNotification, 3600)
    return () => window.clearTimeout(timeout)
  }, [notification, clearNotification])

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!search.trim()) return
    navigate(`/evidence?search=${encodeURIComponent(search.trim())}`)
    setSearch("")
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobileOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Link
          to="/"
          className="brand"
          aria-label="HydroSnap home"
          onClick={() => setMobileOpen(false)}
        >
          <span className="brand-mark">
            <Waves size={21} strokeWidth={2.4} />
          </span>
          <span className="brand-copy">
            <strong>
              hydrosnap<span>3D</span>
            </strong>
            <small>WATERSHED INTELLIGENCE</small>
          </span>
        </Link>
        <div className="workspace-selector">
          <span className="workspace-icon">
            <CloudSun size={16} />
          </span>
          <span>
            <strong>Watershed Mission</strong>
            <small>Field workspace</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-scroll">
          {navigation.map((group) => (
            <section className="nav-group" key={group.label}>
              <p className="nav-heading">{group.label}</p>
              {group.items.map(({ label, to, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{label}</span>
                  {to === "/evidence" && (
                    <i className="nav-count">{data.assets.data?.length ?? 0}</i>
                  )}
                </NavLink>
              ))}
            </section>
          ))}
          <section className="nav-group">
            <p className="nav-heading">System</p>
            <NavLink
              to="/administration"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <ShieldCheck size={18} strokeWidth={1.8} />
              <span>Administration</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Settings size={18} strokeWidth={1.8} />
              <span>Settings</span>
            </NavLink>
          </section>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-help">
            <span className="help-icon">
              <LifeBuoy size={17} />
            </span>
            <span>
              <strong>Need a hand?</strong>
              <small>View field guide</small>
            </span>
            <ChevronRight size={15} />
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <PanelLeftClose size={17} />
            ) : (
              <ChevronLeft size={17} />
            )}
            <span>Collapse sidebar</span>
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>{title}</strong>
            </div>
          </div>
          <form className="global-search" onSubmit={submitSearch}>
            <Search size={16} />
            <input
              ref={searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search assets, villages..."
              aria-label="Search assets and villages"
            />
            <kbd>⌘ K</kbd>
          </form>
          <div className="topbar-actions">
            {env.useMockApi && <DemoBadge label="Demo data" />}
            <SyncIndicator />
            <label className="watershed-select">
              <Waves size={16} />
              <select
                value={context?.watershedId ?? ""}
                onChange={(event) =>
                  context?.setWatershedId(event.target.value)
                }
                aria-label="Selected watershed"
              >
                {watersheds.map((watershed) => (
                  <option key={watershed.id} value={watershed.id}>
                    {watershed.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <span className="topbar-divider" />
            <div className="popover-anchor">
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((value) => !value)}
              >
                <Bell size={18} />
                <i />
              </button>
              {notificationsOpen && (
                <div className="popover notification-popover">
                  <div className="popover-title">
                    Notifications{" "}
                    <span>
                      {notificationsRead
                        ? "Read"
                        : `${pendingCount + runningCount} new`}
                    </span>
                  </div>
                  <p>
                    <i className="dot dot-amber" /> {pendingCount} observations
                    need verification
                  </p>
                  <p>
                    <i className="dot dot-blue" /> {runningCount} analysis jobs
                    running
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setNotificationsRead(true)
                      setNotificationsOpen(false)
                    }}
                  >
                    Mark all as read
                  </button>
                </div>
              )}
            </div>
            <div className="topbar-divider hide-mobile" />
            <div className="popover-anchor">
              <button
                className="profile-button"
                onClick={() => setProfileOpen((value) => !value)}
              >
                <span className="avatar">{currentUser?.initials ?? "--"}</span>
                <span className="profile-copy">
                  <strong>{currentUser?.name ?? "Loading profile"}</strong>
                  <small>{currentUser?.role ?? ""}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="popover profile-popover">
                  <strong>{currentUser?.name ?? "Loading profile"}</strong>
                  <small>{currentUser?.email ?? ""}</small>
                  <Link to="/settings" onClick={() => setProfileOpen(false)}>
                    Account settings
                  </Link>
                  <Link
                    to="/administration"
                    onClick={() => setProfileOpen(false)}
                  >
                    Administration
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-content">
          {failedQuery && (
            <div className="workspace-load-error" role="alert">
              <AlertCircle size={17} />
              <span>
                <strong>Could not load workspace data.</strong>
                <small>
                  {failedQuery.error instanceof Error
                    ? failedQuery.error.message
                    : "Check your connection and try again."}
                </small>
              </span>
              <button
                onClick={() => {
                  void Promise.all(queries.map((query) => query.refetch()))
                }}
              >
                Retry
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
      {notification && (
        <div className="toast" role="status">
          <span className="toast-check">✓</span>
          {notification}
          <button aria-label="Dismiss notification" onClick={clearNotification}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
