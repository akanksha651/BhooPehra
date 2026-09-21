import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import {
  useLocation,
  useNavigate,
} from "react-router"

import {
  ROLE_PROFILES,
  useRole,
  type UserRole,
} from "../../context/RoleContext"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

type BackendSearchResult = {
  id: number | string
  type: string
  name: string
  subtitle?: string
  district?: string
  state?: string
  risk?: string
}

type SearchResponse = {
  query?: string
  count?: number
  data?: BackendSearchResult[]
}

type ApiAlert = {
  id: number
  status?: string
  severity?: string
}

type AlertsResponse = {
  count?: number
  data?: ApiAlert[]
}

type HealthResponse = {
  status?: string
  service?: string
  environment?: string
}

function getResultTypeLabel(
  type: string,
): string {
  const normalized = type
    .trim()
    .toLowerCase()

  switch (normalized) {
    case "field_report":
      return "FIELD REPORT"

    case "risk_zone":
      return "RISK ZONE"

    case "district":
      return "DISTRICT"

    case "state":
      return "STATE"

    case "infrastructure":
      return "INFRASTRUCTURE"

    case "gsi_event":
      return "GSI EVENT"

    default:
      return normalized
        ? normalized
            .replace(/[_-]+/g, " ")
            .toUpperCase()
        : "LOCATION"
  }
}

function getPageTitle(
  pathname: string,
): string {
  if (pathname === "/") {
    return "Dashboard"
  }

  if (pathname.includes("risk-map")) {
    return "Risk Map"
  }

  if (pathname.includes("alerts")) {
    return "Alerts & Warnings"
  }

  if (pathname.includes("field-reports")) {
    return "Field Reports"
  }

  if (pathname.includes("infrastructure")) {
    return "Infrastructure"
  }

  if (pathname.includes("reports")) {
    return "Reports"
  }

  if (pathname.includes("weather")) {
    return "Weather & Forecast"
  }

  if (pathname.includes("analytics")) {
    return "Analytics"
  }

  if (pathname.includes("resources")) {
    return "Resources"
  }

  if (pathname.includes("settings")) {
    return "Settings"
  }

  return "BhooPehra"
}

function formatRoleLabel(
  role: UserRole,
): string {
  switch (role) {
    case "AUTHORITY":
      return "AUTHORITY"

    case "FIELD_TEAM":
      return "FIELD TEAM"

    case "COMMUNITY":
      return "COMMUNITY"

    default:
      return role
  }
}

export default function Topbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const {
    role,
    profile,
    setRole,
  } = useRole()

  const currentProfile =
    profile ?? (role ? ROLE_PROFILES[role] : ROLE_PROFILES.AUTHORITY)

  const [query, setQuery] =
    useState("")

  const [
    searchResults,
    setSearchResults,
  ] = useState<BackendSearchResult[]>([])

  const [
    showSearchResults,
    setShowSearchResults,
  ] = useState(false)

  const [
    searchLoading,
    setSearchLoading,
  ] = useState(false)

  const [
    searchError,
    setSearchError,
  ] = useState("")

  const [
    showProfile,
    setShowProfile,
  ] = useState(false)

  const [
    showRoleSwitcher,
    setShowRoleSwitcher,
  ] = useState(false)

  const [
    activeAlerts,
    setActiveAlerts,
  ] = useState(0)

  const [
    systemStatus,
    setSystemStatus,
  ] = useState<
    "LIVE" | "DEGRADED" | "OFFLINE"
  >("OFFLINE")

  const [
    lastSynced,
    setLastSynced,
  ] = useState<Date | null>(null)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const searchRef =
    useRef<HTMLDivElement | null>(null)

  const profileRef =
    useRef<HTMLDivElement | null>(null)

  const searchRequestId =
    useRef(0)

  /*
   * BACKEND/API STATUS
   *
   * The indicator reflects the health endpoint only.
   * It does not claim complete live monitoring coverage of NER.
   */
  const loadTopbarData =
    useCallback(async () => {
      try {
        setRefreshing(true)

        const [
          healthResponse,
          alertsResponse,
        ] = await Promise.allSettled([
          fetch(
            `${API_BASE_URL}/health`,
            {
              cache: "no-store",
            },
          ),

          fetch(
            `${API_BASE_URL}/api/alerts?status=ACTIVE`,
            {
              cache: "no-store",
            },
          ),
        ])

        let backendOnline = false

        if (
          healthResponse.status ===
            "fulfilled" &&
          healthResponse.value.ok
        ) {
          backendOnline = true

          const health =
            (await healthResponse.value
              .json()
              .catch(() => ({}))) as HealthResponse

          const healthStatus =
            String(
              health.status ?? "",
            ).toLowerCase()

          if (
            healthStatus === "ok" ||
            healthStatus === "healthy"
          ) {
            setSystemStatus("LIVE")
          } else {
            setSystemStatus("DEGRADED")
          }
        } else {
          setSystemStatus("OFFLINE")
        }

        if (
          alertsResponse.status ===
            "fulfilled" &&
          alertsResponse.value.ok
        ) {
          const payload =
            (await alertsResponse.value
              .json()
              .catch(() => ({
                count: 0,
                data: [],
              }))) as AlertsResponse

          const alerts =
            Array.isArray(payload.data)
              ? payload.data
              : []

          const activeCount =
            alerts.filter(
              (alert) =>
                String(
                  alert.status ?? "",
                ).toUpperCase() ===
                "ACTIVE",
            ).length

          setActiveAlerts(
            typeof payload.count ===
              "number"
              ? payload.count
              : activeCount,
          )

          if (!backendOnline) {
            setSystemStatus("DEGRADED")
          }
        }

        if (backendOnline) {
          setLastSynced(new Date())
        }
      } catch (error) {
        console.error(
          "Topbar sync failed:",
          error,
        )

        setSystemStatus("OFFLINE")
      } finally {
        setRefreshing(false)
      }
    }, [])

  useEffect(() => {
    void loadTopbarData()

    const interval =
      window.setInterval(
        () => {
          void loadTopbarData()
        },
        60000,
      )

    return () =>
      window.clearInterval(interval)
  }, [loadTopbarData])

  /*
   * CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
   */
  useEffect(() => {
    function handleOutsideClick(
      event: MouseEvent,
    ) {
      const target =
        event.target as Node

      if (
        searchRef.current &&
        !searchRef.current.contains(
          target,
        )
      ) {
        setShowSearchResults(false)
      }

      if (
        profileRef.current &&
        !profileRef.current.contains(
          target,
        )
      ) {
        setShowProfile(false)
        setShowRoleSwitcher(false)
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick,
    )

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutsideClick,
      )
  }, [])

  /*
   * LIVE DATABASE SEARCH
   */
  useEffect(() => {
    const trimmedQuery =
      query.trim()

    if (!trimmedQuery) {
      setSearchResults([])
      setSearchError("")
      setSearchLoading(false)
      return
    }

    const requestId =
      searchRequestId.current + 1

    searchRequestId.current =
      requestId

    const controller =
      new AbortController()

    const timer =
      window.setTimeout(
        async () => {
          try {
            setSearchLoading(true)
            setSearchError("")

            const response =
              await fetch(
                `/api/search?q=${encodeURIComponent(
                  trimmedQuery,
                )}`,
                {
                  method: "GET",
                  cache: "no-store",
                  signal:
                    controller.signal,
                },
              )

            if (!response.ok) {
              throw new Error(
                `Search request failed with HTTP ${response.status}`,
              )
            }

            const payload =
              (await response.json()) as SearchResponse

            if (
              requestId !==
              searchRequestId.current
            ) {
              return
            }

            const results =
              Array.isArray(payload.data)
                ? payload.data
                : []

            setSearchResults(
              results.slice(0, 8),
            )
          } catch (error) {
            if (
              controller.signal.aborted
            ) {
              return
            }

            console.error(
              "Global search failed:",
              error,
            )

            if (
              requestId ===
              searchRequestId.current
            ) {
              setSearchResults([])
              setSearchError(
                "Unable to search the BhooPehra database.",
              )
            }
          } finally {
            if (
              !controller.signal.aborted &&
              requestId ===
                searchRequestId.current
            ) {
              setSearchLoading(false)
            }
          }
        },
        250,
      )

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  /*
   * SEARCH NAVIGATION
   *
   * FIELD REPORT
   *   -> /field-reports?report_id=<database id>
   *
   * RISK ZONE
   *   -> /risk-map?location=<name>
   *
   * DISTRICT / STATE / INFRASTRUCTURE / GSI EVENT
   *   -> existing Risk Map behavior
   *
   * Unknown/direct search
   *   -> Risk Map
   */
  function openSearch(
    searchValue?: string,
    result?: BackendSearchResult,
  ) {
    const value =
      searchValue?.trim() ??
      query.trim()

    if (!value) {
      return
    }

    setShowSearchResults(false)
    setSearchError("")
    setQuery(value)

    const resultType =
      String(
        result?.type ?? "",
      )
        .trim()
        .toLowerCase()

    /*
     * Field report must open the
     * Field Reports page and identify
     * the exact database record.
     */
    if (
      resultType === "field_report"
    ) {
      navigate(
        `/field-reports?report_id=${encodeURIComponent(
          String(result?.id ?? ""),
        )}`,
      )
      return
    }

    /*
     * Everything else keeps the
     * existing Risk Map behavior.
     */
    navigate(
      `/risk-map?location=${encodeURIComponent(
        value,
      )}`,
    )
  }

  /*
   * ENTER KEY
   *
   * Uses the first live database result,
   * so pressing Enter on FR-0001 opens
   * the Field Report instead of Risk Map.
   */
  async function handleSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Enter") {
      event.preventDefault()

      const searchValue = query.trim()

      if (!searchValue) {
        return
      }

      setSearchLoading(true)
      setSearchError("")

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(
            searchValue,
          )}`,
          {
            method: "GET",
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error(
            `Search request failed with HTTP ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as SearchResponse

        const results =
          Array.isArray(payload.data)
            ? payload.data
            : []

        setSearchResults(
          results.slice(0, 8),
        )

        setShowSearchResults(false)

        const fieldReport =
          results.find(
            (result) =>
              String(result.type)
                .trim()
                .toLowerCase() ===
              "field_report",
          )

        if (fieldReport) {
          openSearch(
            fieldReport.name,
            fieldReport,
          )
          return
        }

        if (results.length > 0) {
          openSearch(
            results[0].name,
            results[0],
          )
          return
        }

        openSearch(searchValue)
      } catch (error) {
        console.error(
          "Global search failed:",
          error,
        )

        setSearchError(
          "Unable to search the BhooPehra database.",
        )
        setShowSearchResults(true)
      } finally {
        setSearchLoading(false)
      }
    }

    if (event.key === "Escape") {
      setShowSearchResults(false)
    }
  }

  function clearSearch() {
    setQuery("")
    setSearchResults([])
    setSearchError("")
    setShowSearchResults(false)
  }

  /*
   * ROLE SWITCH
   */
  function handleRoleChange(
    nextRole: UserRole,
  ) {
    setRole(nextRole)
    setShowRoleSwitcher(false)
    setShowProfile(false)

    /*
     * "/" is intentionally used because
     * App.tsx maps the root dashboard
     * according to the selected role.
     */
    navigate("/")
  }

  const statusLabel =
    systemStatus === "LIVE"
      ? "LIVE"
      : systemStatus === "DEGRADED"
        ? "DEGRADED"
        : "OFFLINE"

  const statusColor =
    systemStatus === "LIVE"
      ? "text-emerald-400"
      : systemStatus === "DEGRADED"
        ? "text-yellow-400"
        : "text-red-400"

  const statusDot =
    systemStatus === "LIVE"
      ? "bg-emerald-500"
      : systemStatus === "DEGRADED"
        ? "bg-yellow-500"
        : "bg-red-500"

  const updatedText =
    lastSynced
      ? lastSynced.toLocaleTimeString(
          "en-IN",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          },
        )
      : "--"

  return (
    <header className="fixed left-[250px] right-0 top-0 z-40 h-[72px] border-b border-slate-800 bg-[#07131f]/95 backdrop-blur-xl">
      <div className="flex h-full items-center gap-4 px-5">
        {/* Page context */}
        <div className="hidden min-w-[150px] lg:block">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
            BhooPehra
          </p>

          <p className="mt-0.5 text-sm font-semibold text-slate-200">
            {getPageTitle(
              location.pathname,
            )}
          </p>
        </div>

        {/* Global backend search */}
        <div
          ref={searchRef}
          className="relative flex-1"
        >
          <div className="flex h-10 items-center rounded-xl border border-slate-800 bg-[#0a1926] transition focus-within:border-emerald-500/30">
            <button
              type="button"
              onClick={() =>
                openSearch()
              }
              disabled={!query.trim()}
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-emerald-500/10 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Search BhooPehra database"
            >
              {searchLoading ? (
                <Loader2
                  size={17}
                  className="animate-spin text-emerald-400"
                />
              ) : (
                <Search size={17} />
              )}
            </button>

            <input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(
                  event.target.value,
                )
                setShowSearchResults(true)
              }}
              onFocus={() =>
                setShowSearchResults(true)
              }
              onKeyDown={
                handleSearchKeyDown
              }
              placeholder="Search district, state, or location..."
              className="h-full w-full bg-transparent px-3 text-xs text-slate-200 outline-none placeholder:text-slate-600"
              aria-label="Search district, state, or location"
            />

            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="mr-2 rounded-md p-1 text-slate-600 transition hover:bg-white/5 hover:text-slate-300"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search dropdown */}
          {showSearchResults &&
            query.trim() && (
              <div className="absolute left-0 right-0 top-[46px] overflow-hidden rounded-xl border border-slate-800 bg-[#0a1926] shadow-2xl shadow-black/40">
                {searchLoading && (
                  <div className="flex items-center gap-3 px-4 py-4">
                    <Loader2
                      size={16}
                      className="animate-spin text-emerald-400"
                    />

                    <div>
                      <p className="text-xs text-slate-300">
                        Searching BhooPehra database
                      </p>

                      <p className="mt-0.5 text-[10px] text-slate-600">
                        Finding verified locations and infrastructure
                      </p>
                    </div>
                  </div>
                )}

                {!searchLoading &&
                  searchError && (
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <WifiOff
                          size={16}
                          className="text-red-400"
                        />

                        <div>
                          <p className="text-xs text-slate-300">
                            Database search unavailable
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-600">
                            {searchError}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {!searchLoading &&
                  !searchError &&
                  searchResults.length > 0 && (
                    <div className="p-1.5">
                      <div className="px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        BhooPehra Database
                      </div>

                      {searchResults.map(
                        (result) => (
                          <button
                            key={`${result.type}-${result.id}`}
                            type="button"
                            onClick={() =>
                              openSearch(
                                result.name,
                                result,
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-500/[0.08]"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                              <MapPin
                                size={16}
                                className="text-emerald-400"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-200">
                                {result.name}
                              </p>

                              {result.subtitle && (
                                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                  {result.subtitle}
                                </p>
                              )}

                              <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">
                                {getResultTypeLabel(
                                  result.type,
                                )}

                                {result.district
                                  ? ` · ${result.district}`
                                  : ""}

                                {result.state
                                  ? ` · ${result.state}`
                                  : ""}
                              </p>
                            </div>

                            {result.risk && (
                              <span className="shrink-0 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-300">
                                {String(
                                  result.risk,
                                ).toUpperCase()}
                              </span>
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  )}

                {!searchLoading &&
                  !searchError &&
                  searchResults.length === 0 && (
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Search
                          size={16}
                          className="text-slate-600"
                        />

                        <div>
                          <p className="text-xs text-slate-400">
                            No matching database record
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-600">
                            "{query.trim()}" was not found in BhooPehra.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openSearch()
                        }
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-2 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/15"
                      >
                        <MapPin
                          size={13}
                        />
                        Open "{query.trim()}" on Risk Map
                      </button>
                    </div>
                  )}
              </div>
            )}
        </div>

        {/* Backend/API status */}
        <div className="hidden items-center gap-2 rounded-xl border border-slate-800 bg-[#0a1926] px-3 py-2 xl:flex">
          <div
            className={`h-2 w-2 rounded-full ${statusDot}`}
          />

          <div>
            <p
              className={`text-[10px] font-semibold tracking-wider ${statusColor}`}
            >
              {statusLabel}
            </p>

            <p className="text-[9px] text-slate-600">
              Backend API
            </p>
          </div>
        </div>

        {/* Sync */}
        <div className="hidden items-center gap-2 2xl:flex">
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-slate-600">
              Last synced
            </p>

            <p className="text-[10px] text-slate-500">
              {updatedText}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadTopbarData()
            }
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-[#0a1926] text-slate-500 transition hover:border-emerald-500/20 hover:text-emerald-400 disabled:opacity-50"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw
              size={14}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />
          </button>
        </div>

        {/* Alert bell */}
        <button
          type="button"
          onClick={() =>
            navigate("/alerts")
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-[#0a1926] text-slate-500 transition hover:text-white"
          aria-label="Open alerts"
        >
          <Bell size={17} />

          {activeAlerts > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[#07131f] bg-red-500 px-1 text-[8px] font-bold text-white">
              {activeAlerts > 99
                ? "99+"
                : activeAlerts}
            </span>
          )}
        </button>

        {/* Selected role + role switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowRoleSwitcher(
                (current) => !current,
              )
              setShowProfile(false)
            }}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-2.5 py-1.5 transition hover:border-emerald-500/30 hover:bg-emerald-500/[0.08]"
            aria-expanded={
              showRoleSwitcher
            }
            title="Switch operational role"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-[10px] font-bold text-emerald-400">
              {currentProfile.initials}
            </div>

            <div className="hidden text-left lg:block">
              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-emerald-500">
                Current Role
              </p>

              <p className="mt-0.5 max-w-[125px] truncate text-[11px] font-medium text-slate-300">
                {currentProfile.title}
              </p>
            </div>

            <ChevronDown
              size={13}
              className={`text-slate-600 transition ${
                showRoleSwitcher
                  ? "rotate-180 text-emerald-400"
                  : ""
              }`}
            />
          </button>

          {showRoleSwitcher && (
            <div className="absolute right-0 top-[48px] z-[1200] w-[280px] overflow-hidden rounded-2xl border border-slate-800 bg-[#0a1926] shadow-2xl shadow-black/50">
              <div className="border-b border-slate-800 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-500">
                  Operational Role
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Select the dashboard perspective
                </p>
              </div>

              <div className="p-2">
                {(
                  Object.keys(
                    ROLE_PROFILES,
                  ) as UserRole[]
                ).map(
                  (availableRole) => {
                    const availableProfile =
                      ROLE_PROFILES[
                        availableRole
                      ]

                    const isCurrent =
                      availableRole ===
                      role

                    return (
                      <button
                        key={availableRole}
                        type="button"
                        onPointerDown={(
                          event,
                        ) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleRoleChange(
                            availableRole,
                          )
                        }}
                        className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition last:mb-0 ${
                          isCurrent
                            ? "border border-emerald-500/20 bg-emerald-500/10"
                            : "border border-transparent hover:border-slate-800 hover:bg-white/[0.03]"
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold ${
                            isCurrent
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-white/[0.04] text-slate-500"
                          }`}
                        >
                          {
                            availableProfile.initials
                          }
                        </div>

                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-[11px] font-semibold ${
                              isCurrent
                                ? "text-emerald-300"
                                : "text-slate-300"
                            }`}
                          >
                            {
                              availableProfile.title
                            }
                          </div>

                          <div className="mt-0.5 truncate text-[9px] text-slate-600">
                            {
                              availableProfile.department
                            }
                          </div>

                          <div className="mt-1 truncate text-[8px] text-slate-700">
                            {formatRoleLabel(
                              availableRole,
                            )}
                          </div>
                        </div>

                        {isCurrent && (
                          <CheckCircle2
                            size={15}
                            className="shrink-0 text-emerald-400"
                          />
                        )}
                      </button>
                    )
                  },
                )}
              </div>

              <div className="border-t border-slate-800 px-4 py-2.5">
                <p className="text-[8px] leading-4 text-slate-700">
                  Demo role selection. Dashboard tools adapt
                  to the selected operational responsibility.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Profile / account menu */}
        <div
          ref={profileRef}
          className="relative"
        >
          <button
            type="button"
            onClick={() =>
              setShowProfile(
                (current) =>
                  !current,
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-[#0a1926] text-slate-500 transition hover:border-emerald-500/20 hover:text-white"
            aria-label="Open profile menu"
            title={currentProfile.title}
          >
            <ShieldCheck
              size={17}
              className="text-emerald-400"
            />
          </button>

          {showProfile && (
            <div className="absolute right-0 top-[46px] z-[1200] w-64 overflow-hidden rounded-2xl border border-slate-800 bg-[#0a1926] shadow-2xl shadow-black/40">
              {/* Current selected role */}
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-bold text-emerald-300">
                    {currentProfile.initials}
                  </div>

                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-500">
                      Selected Role
                    </p>

                    <p className="mt-1 truncate text-sm font-semibold text-slate-200">
                      {currentProfile.title}
                    </p>

                    <p className="mt-0.5 truncate text-[9px] text-slate-600">
                      {currentProfile.department}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfile(false)
                    navigate("/")
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  <LayoutDashboard
                    size={14}
                  />

                  Dashboard
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowProfile(false)
                    navigate("/reports")
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  <FileText
                    size={14}
                  />

                  Reports
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowProfile(false)
                    navigate("/settings")
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  <Settings
                    size={14}
                  />

                  Settings
                </button>

                <div className="my-1 border-t border-slate-800" />

                <div className="flex items-center gap-2 px-3 py-2">
                  {systemStatus ===
                  "LIVE" ? (
                    <Wifi
                      size={13}
                      className="text-emerald-400"
                    />
                  ) : (
                    <WifiOff
                      size={13}
                      className="text-slate-600"
                    />
                  )}

                  <span className="text-[10px] text-slate-600">
                    API{" "}
                    {systemStatus.toLowerCase()}
                  </span>
                </div>

                {activeAlerts > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <AlertTriangle
                      size={13}
                      className="text-orange-400"
                    />

                    <span className="text-[10px] text-slate-600">
                      {activeAlerts} active alert
                      {activeAlerts === 1
                        ? ""
                        : "s"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}