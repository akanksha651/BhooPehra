import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  CloudOff,
  CloudRain,
  Flag,
  Map,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import { useNavigate } from "react-router"

import {
  useRole,
} from "../context/RoleContext"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

type Severity =
  | "CRITICAL"
  | "HIGH"
  | "MODERATE"
  | "LOW"

type ReportStatus =
  | "PENDING SYNC"
  | "SUBMITTED"
  | "VERIFIED"
  | "REJECTED"

type ResponseStatus =
  | "NOT_STARTED"
  | "ALERT_GENERATED"
  | "TEAM_ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"

type ApiFieldReport = {
  id: number
  report_code: string
  title: string
  reporter: string
  hazard: string
  severity: Severity
  status: ReportStatus
  response_status: ResponseStatus
  response_status_label: string
  assigned_team: string | null
  alert_generated_at: string | null
  assigned_at: string | null
  started_at: string | null
  resolved_at: string | null
  response_notes: string | null
  district_id: number | null
  district_name: string | null
  risk_zone_id: number | null
  location: string
  state: string
  latitude: number
  longitude: number
  description: string
  road_impact: string
  village_impact: string
  photo_count: number
  verification_notes: string | null
  submitted_at: string | null
  verified_at: string | null
  created_at: string | null
  updated_at: string | null
}

type FieldReportsResponse =
  | ApiFieldReport[]
  | {
      count?: number
      data?: ApiFieldReport[]
      reports?: ApiFieldReport[]
    }

type ApiAlert = {
  id?: number
  status?: string
  severity?: string
  title?: string
  message?: string
}

type AlertsResponse =
  | ApiAlert[]
  | {
      count?: number
      data?: ApiAlert[]
      alerts?: ApiAlert[]
    }

type ActionCardProps = {
  icon: React.ReactNode
  title: string
  description: string
  action: string
  onClick: () => void
}

function ActionCard({
  icon,
  title,
  description,
  action,
  onClick,
}: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-slate-800 bg-[#091827] p-4 text-left transition hover:border-emerald-500/20 hover:bg-[#0b1c2b]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          {icon}
        </div>

        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-slate-200">
            {title}
          </h3>

          <p className="mt-1 text-[9px] leading-4 text-slate-600">
            {description}
          </p>

          <div className="mt-3 text-[9px] font-semibold text-emerald-400">
            {action} →
          </div>
        </div>
      </div>
    </button>
  )
}

function StatCard({
  icon,
  label,
  value,
  description,
  tone = "emerald",
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  description: string
  tone?: "emerald" | "orange" | "blue" | "slate"
  onClick?: () => void
}) {
  const toneClasses = {
    emerald:
      "bg-emerald-500/10 text-emerald-400",
    orange:
      "bg-orange-500/10 text-orange-400",
    blue:
      "bg-blue-500/10 text-blue-400",
    slate:
      "bg-slate-500/10 text-slate-400",
  }

  const content = (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>

        <p className="mt-1 text-sm font-semibold text-slate-200">
          {value}
        </p>

        <p className="mt-1 text-[8px] leading-4 text-slate-600">
          {description}
        </p>
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-slate-800 bg-[#091827] p-4 text-left transition hover:border-emerald-500/20 hover:bg-[#0b1c2b]"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#091827] p-4">
      {content}
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) {
    return "Time unavailable"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable"
  }

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getSeverityClass(
  severity: Severity,
) {
  switch (severity) {
    case "CRITICAL":
      return "border-red-500/20 bg-red-500/10 text-red-300"

    case "HIGH":
      return "border-orange-500/20 bg-orange-500/10 text-orange-300"

    case "MODERATE":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300"

    default:
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  }
}

function getResponseClass(
  status: ResponseStatus,
) {
  switch (status) {
    case "IN_PROGRESS":
      return "text-blue-300"

    case "TEAM_ASSIGNED":
      return "text-orange-300"

    case "ALERT_GENERATED":
      return "text-yellow-300"

    case "RESOLVED":
      return "text-emerald-300"

    default:
      return "text-slate-400"
  }
}

function isActiveAssignment(
  report: ApiFieldReport,
) {
  return (
    report.status === "VERIFIED" &&
    Boolean(report.assigned_team) &&
    (
      report.response_status === "TEAM_ASSIGNED" ||
      report.response_status === "IN_PROGRESS"
    )
  )
}

function isActionableReport(
  report: ApiFieldReport,
) {
  return (
    report.status === "VERIFIED" &&
    (
      report.response_status === "TEAM_ASSIGNED" ||
      report.response_status === "IN_PROGRESS"
    )
  )
}

export default function FieldDashboard() {
  const navigate = useNavigate()

  const { profile } = useRole()

  const [reports, setReports] = useState<
    ApiFieldReport[]
  >([])

  const [activeAlerts, setActiveAlerts] =
    useState<ApiAlert[]>([])

  const [reportsLoading, setReportsLoading] =
    useState(true)

  const [alertsLoading, setAlertsLoading] =
    useState(true)

  const [reportsError, setReportsError] =
    useState(false)

  const [alertsError, setAlertsError] =
    useState(false)

  const [backendOnline, setBackendOnline] =
    useState(false)

  const [isOnline, setIsOnline] =
    useState(
      typeof navigator === "undefined"
        ? false
        : navigator.onLine,
    )

  const [gpsAvailable, setGpsAvailable] =
    useState<boolean | null>(null)

  const [lastSynced, setLastSynced] =
    useState<Date | null>(null)

  const loadDashboardData =
    useCallback(async () => {
      setReportsLoading(true)
      setAlertsLoading(true)

      const [
        healthResult,
        reportsResult,
        alertsResult,
      ] = await Promise.allSettled([
        fetch(
          `${API_BASE_URL}/health`,
          {
            cache: "no-store",
          },
        ),

        fetch(
          `${API_BASE_URL}/api/field-reports`,
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

      let healthy = false

      if (
        healthResult.status === "fulfilled" &&
        healthResult.value.ok
      ) {
        try {
          const health =
            await healthResult.value.json()

          healthy =
            String(
              health?.status ?? "",
            ).toLowerCase() === "healthy"
        } catch {
          healthy = false
        }
      }

      setBackendOnline(healthy)

      if (
        reportsResult.status === "fulfilled" &&
        reportsResult.value.ok
      ) {
        try {
          const payload =
            (await reportsResult.value.json()) as
              FieldReportsResponse

          const records =
            Array.isArray(payload)
              ? payload
              : payload.data ??
                payload.reports ??
                []

          setReports(
            Array.isArray(records)
              ? records
              : [],
          )

          setReportsError(false)
        } catch {
          setReports([])
          setReportsError(true)
        }
      } else {
        setReports([])
        setReportsError(true)
      }

      if (
        alertsResult.status === "fulfilled" &&
        alertsResult.value.ok
      ) {
        try {
          const payload =
            (await alertsResult.value.json()) as
              AlertsResponse

          const records =
            Array.isArray(payload)
              ? payload
              : payload.data ??
                payload.alerts ??
                []

          const verifiedActive =
            records.filter(
              (alert) => {
                const status =
                  String(
                    alert?.status ?? "",
                  ).toUpperCase()

                return (
                  status === "ACTIVE" ||
                  status === "OPEN" ||
                  status === "TRIGGERED"
                )
              },
            )

          setActiveAlerts(
            verifiedActive,
          )

          setAlertsError(false)
        } catch {
          setActiveAlerts([])
          setAlertsError(true)
        }
      } else {
        setActiveAlerts([])
        setAlertsError(true)
      }

      setReportsLoading(false)
      setAlertsLoading(false)
      setLastSynced(new Date())
    }, [])

  useEffect(() => {
    void loadDashboardData()

    const interval =
      window.setInterval(
        () => {
          void loadDashboardData()
        },
        60000,
      )

    return () => {
      window.clearInterval(interval)
    }
  }, [loadDashboardData])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener(
      "online",
      handleOnline,
    )

    window.addEventListener(
      "offline",
      handleOffline,
    )

    return () => {
      window.removeEventListener(
        "online",
        handleOnline,
      )

      window.removeEventListener(
        "offline",
        handleOffline,
      )
    }
  }, [])

  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      setGpsAvailable(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setGpsAvailable(true)
      },
      () => {
        setGpsAvailable(false)
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      },
    )
  }, [])

  const activeAssignments = useMemo(
    () =>
      reports.filter(
        isActiveAssignment,
      ),
    [reports],
  )

  const actionableReports = useMemo(
    () =>
      reports.filter(
        isActionableReport,
      ),
    [reports],
  )

  const responseCounts = useMemo(
    () => ({
      alertGenerated: reports.filter(
        (report) =>
          report.status === "VERIFIED" &&
          report.response_status ===
          "ALERT_GENERATED",
      ).length,

      teamAssigned: reports.filter(
        (report) =>
          report.status === "VERIFIED" &&
          report.response_status ===
          "TEAM_ASSIGNED",
      ).length,

      inProgress: reports.filter(
        (report) =>
          report.status === "VERIFIED" &&
          report.response_status ===
          "IN_PROGRESS",
      ).length,

      resolved: reports.filter(
        (report) =>
          report.status === "VERIFIED" &&
          report.response_status ===
          "RESOLVED",
      ).length,
    }),
    [reports],
  )

  const syncLabel =
    !isOnline
      ? "OFFLINE"
      : backendOnline
        ? "LIVE"
        : "BACKEND UNAVAILABLE"

  const syncDescription =
    !isOnline
      ? "Device connectivity is unavailable."
      : backendOnline
        ? lastSynced
          ? `Last checked ${formatDate(
              lastSynced.toISOString(),
            )}`
          : "Backend connection available."
        : "Live backend state could not be verified."

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] px-5 py-5 text-white">
      <div className="mx-auto max-w-[1500px]">

        {/* HEADER */}
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <Smartphone
              className="h-4 w-4 text-emerald-400"
            />

            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-500">
              Field Operations
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {profile?.dashboardTitle ??
              "Field Operations Center"}
          </h1>

          <p className="mt-1 text-xs text-slate-500">
            {profile?.dashboardSubtitle ??
              "Risk intelligence, field verification and response coordination"}
          </p>
        </div>

        {/* OPERATIONAL SUMMARY */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          <StatCard
            icon={<ClipboardCheck size={17} />}
            label="Active Field Assignments"
            value={
              reportsLoading
                ? "..."
                : reportsError
                  ? "Unavailable"
                  : String(
                      activeAssignments.length,
                    )
            }
            description={
              reportsError
                ? "Field-report data could not be verified."
                : activeAssignments.length > 0
                  ? "Verified assignments currently requiring field response."
                  : "No verified active assignments."
            }
            tone="emerald"
            onClick={() =>
              navigate(
                "/field-reports",
              )
            }
          />

          <StatCard
            icon={<Bell size={17} />}
            label="Active Alerts"
            value={
              alertsLoading
                ? "..."
                : alertsError
                  ? "Unavailable"
                  : String(
                      activeAlerts.length,
                    )
            }
            description={
              alertsError
                ? "Active-alert endpoint could not be verified."
                : activeAlerts.length > 0
                  ? "Verified active alert records available."
                  : "No verified active alerts."
            }
            tone="orange"
            onClick={() =>
              navigate("/alerts")
            }
          />

          <StatCard
            icon={<Flag size={17} />}
            label="Assigned Reports Requiring Action"
            value={
              reportsLoading
                ? "..."
                : reportsError
                  ? "Unavailable"
                  : String(
                      actionableReports.length,
                    )
            }
            description={
              reportsError
                ? "Field-report data could not be verified."
                : actionableReports.length > 0
                  ? "Verified assigned reports with an outstanding response state."
                  : "No verified reports currently require action."
            }
            tone="blue"
            onClick={() =>
              navigate(
                "/field-reports",
              )
            }
          />

          <StatCard
            icon={
              isOnline
                ? <Wifi size={17} />
                : <WifiOff size={17} />
            }
            label="System Status"
            value={syncLabel}
            description={syncDescription}
            tone={
              backendOnline && isOnline
                ? "emerald"
                : "slate"
            }
          />
        </div>

        {/* ACTIVE ASSIGNMENTS */}
        <section className="mt-5 rounded-xl border border-slate-800 bg-[#091827]">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck
                    size={15}
                    className="text-emerald-400"
                  />

                  <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                    Active Field Assignments
                  </h2>
                </div>

                <p className="mt-1 text-[9px] text-slate-600">
                  Verified report assignments currently in field response workflow.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/field-reports",
                  )
                }
                className="text-[9px] font-semibold text-emerald-400 transition hover:text-emerald-300"
              >
                Open Field Reports →
              </button>
            </div>
          </div>

          <div className="p-4">
            {reportsLoading ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-5">
                <p className="text-[10px] text-slate-500">
                  Loading verified field assignments...
                </p>
              </div>
            ) : reportsError ? (
              <div className="rounded-lg border border-orange-500/10 bg-orange-500/[0.035] p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    size={15}
                    className="mt-0.5 text-orange-400"
                  />

                  <div>
                    <p className="text-[10px] font-semibold text-orange-300">
                      Assignment data unavailable
                    </p>

                    <p className="mt-1 text-[9px] leading-4 text-slate-600">
                      The field-report backend could not be verified. No assignment count or assignment record is being fabricated.
                    </p>
                  </div>
                </div>
              </div>
            ) : activeAssignments.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    size={15}
                    className="mt-0.5 text-slate-500"
                  />

                  <div>
                    <p className="text-[10px] font-semibold text-slate-300">
                      No verified assignment data
                    </p>

                    <p className="mt-1 text-[9px] leading-4 text-slate-600">
                      No field-team assignment is shown until the backend provides a verified assignment record.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAssignments.map(
                  (report) => (
                    <div
                      key={report.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/30 p-4"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-200">
                              {report.report_code}
                            </span>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-[7px] font-semibold ${getSeverityClass(
                                report.severity,
                              )}`}
                            >
                              {report.severity}
                            </span>

                            <span
                              className={`text-[8px] font-semibold ${getResponseClass(
                                report.response_status,
                              )}`}
                            >
                              {report.response_status_label ||
                                report.response_status.replace(
                                  /_/g,
                                  " ",
                                )}
                            </span>
                          </div>

                          <p className="mt-2 text-[11px] font-semibold text-slate-200">
                            {report.title}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[8px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <MapPin
                                size={10}
                              />
                              {report.location}
                            </span>

                            <span>
                              {report.district_name ??
                                "District unavailable"}
                              {report.state
                                ? ` · ${report.state}`
                                : ""}
                            </span>

                            {report.risk_zone_id !==
                              null && (
                              <span>
                                Risk Zone #
                                {
                                  report.risk_zone_id
                                }
                              </span>
                            )}
                          </div>

                          <p className="mt-2 max-w-3xl text-[8px] leading-4 text-slate-600">
                            {report.description}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-4 text-[8px] text-slate-500">
                            <span>
                              Assigned team:{" "}
                              <span className="text-slate-300">
                                {report.assigned_team ??
                                  "Unavailable"}
                              </span>
                            </span>

                            <span>
                              Assigned:{" "}
                              <span className="text-slate-300">
                                {formatDate(
                                  report.assigned_at,
                                )}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/field-reports?report_id=${encodeURIComponent(
                                  String(
                                    report.id,
                                  ),
                                )}`,
                              )
                            }
                            className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-[8px] font-semibold text-slate-300 transition hover:border-emerald-500/30 hover:text-emerald-300"
                          >
                            Open Report
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/risk-map?report_id=${encodeURIComponent(
                                  String(
                                    report.id,
                                  ),
                                )}`,
                              )
                            }
                            className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[8px] font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
                          >
                            Risk Map
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </section>

        {/* QUICK ACTIONS + RESPONSE STATUS */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">

          <section className="rounded-xl border border-slate-800 bg-[#091827]">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2">
                <TriangleAlert
                  size={15}
                  className="text-orange-400"
                />

                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                  Field Actions
                </h2>
              </div>

              <p className="mt-1 text-[9px] text-slate-600">
                Operational actions available to field teams
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4">

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/risk-map",
                  )
                }
                className="rounded-lg bg-slate-950/40 p-3 text-left transition hover:bg-slate-950/70"
              >
                <Map
                  size={14}
                  className="text-emerald-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Inspect Risk
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Review available risk zones before field movement.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/field-reports",
                  )
                }
                className="rounded-lg bg-slate-950/40 p-3 text-left transition hover:bg-slate-950/70"
              >
                <Flag
                  size={14}
                  className="text-orange-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Report Evidence
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Capture GPS, observations and available field evidence.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/infrastructure",
                  )
                }
                className="rounded-lg bg-slate-950/40 p-3 text-left transition hover:bg-slate-950/70"
              >
                <Navigation
                  size={14}
                  className="text-blue-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Route & Shelter
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Inspect available road and infrastructure information.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/resources",
                  )
                }
                className="rounded-lg bg-slate-950/40 p-3 text-left transition hover:bg-slate-950/70"
              >
                <ShieldCheck
                  size={14}
                  className="text-emerald-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Field Guidance
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Open operational resources and field reporting guidance.
                </p>
              </button>

            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-[#091827]">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2">
                <RefreshCw
                  size={15}
                  className="text-emerald-400"
                />

                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                  Response Status
                </h2>
              </div>

              <p className="mt-1 text-[9px] text-slate-600">
                Operational response state from verified field reports
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4">

              <div className="rounded-lg bg-slate-950/40 p-3">
                <AlertTriangle
                  size={14}
                  className="text-yellow-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Alert Generated
                </p>

                <p className="mt-1 text-lg font-semibold text-slate-200">
                  {reportsLoading
                    ? "..."
                    : reportsError
                      ? "—"
                      : responseCounts.alertGenerated}
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Verified operational response state.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <ClipboardCheck
                  size={14}
                  className="text-orange-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Team Assigned
                </p>

                <p className="mt-1 text-lg font-semibold text-slate-200">
                  {reportsLoading
                    ? "..."
                    : reportsError
                      ? "—"
                      : responseCounts.teamAssigned}
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Assignment records with a verified team.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <Navigation
                  size={14}
                  className="text-blue-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  In Progress
                </p>

                <p className="mt-1 text-lg font-semibold text-slate-200">
                  {reportsLoading
                    ? "..."
                    : reportsError
                      ? "—"
                      : responseCounts.inProgress}
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Field response currently underway.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <CheckCircle2
                  size={14}
                  className="text-emerald-400"
                />

                <p className="mt-2 text-[10px] font-medium text-slate-300">
                  Resolved
                </p>

                <p className="mt-1 text-lg font-semibold text-slate-200">
                  {reportsLoading
                    ? "..."
                    : reportsError
                      ? "—"
                      : responseCounts.resolved}
                </p>

                <p className="mt-1 text-[8px] leading-4 text-slate-600">
                  Reports marked resolved by the response workflow.
                </p>
              </div>

            </div>
          </section>
        </div>

        {/* FIELD COMPANION */}
        <section className="mt-5 rounded-xl border border-slate-800 bg-[#091827]">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center gap-2">
              <Smartphone
                size={15}
                className="text-emerald-400"
              />

              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                Field Companion
              </h2>
            </div>

            <p className="mt-1 text-[9px] text-slate-600">
              Offline-first field reporting workflow
            </p>
          </div>

          <div className="p-4">
            <div className="grid gap-3 md:grid-cols-3">

              <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/[0.035] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                    {isOnline ? (
                      <Wifi
                        size={14}
                        className="text-emerald-400"
                      />
                    ) : (
                      <CloudOff
                        size={14}
                        className="text-orange-400"
                      />
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-emerald-300">
                      Connectivity
                    </p>

                    <p className="mt-1 text-[10px] font-semibold text-slate-300">
                      {isOnline
                        ? "ONLINE"
                        : "OFFLINE"}
                    </p>

                    <p className="mt-1 text-[8px] leading-4 text-slate-600">
                      Browser connectivity state. Offline reports remain a local store-and-forward workflow.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-500/10">
                    <MapPin
                      size={14}
                      className={
                        gpsAvailable
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }
                    />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-300">
                      GPS
                    </p>

                    <p className="mt-1 text-[10px] font-semibold text-slate-300">
                      {gpsAvailable ===
                      null
                        ? "CHECKING"
                        : gpsAvailable
                          ? "AVAILABLE"
                          : "UNAVAILABLE"}
                    </p>

                    <p className="mt-1 text-[8px] leading-4 text-slate-600">
                      Current browser location is never fabricated.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-500/10">
                    <RefreshCw
                      size={14}
                      className={
                        backendOnline
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }
                    />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-slate-300">
                      Backend Sync
                    </p>

                    <p className="mt-1 text-[10px] font-semibold text-slate-300">
                      {backendOnline
                        ? "AVAILABLE"
                        : "UNAVAILABLE"}
                    </p>

                    <p className="mt-1 text-[8px] leading-4 text-slate-600">
                      {lastSynced
                        ? `Last dashboard check: ${formatDate(
                            lastSynced.toISOString(),
                          )}`
                        : "No verified dashboard sync timestamp yet."}
                    </p>
                  </div>
                </div>
              </div>

            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/field-reports",
                  )
                }
                className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[8px] font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
              >
                Open Field Reports →
              </button>

              <button
                type="button"
                onClick={() =>
                  void loadDashboardData()
                }
                className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-[8px] font-semibold text-slate-300 transition hover:border-slate-600 hover:text-white"
              >
                Refresh Data
              </button>
            </div>
          </div>
        </section>

        {/* EMERGENCY INSTRUCTIONS */}
        <section className="mt-5 rounded-xl border border-orange-500/10 bg-[#091827]">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                <TriangleAlert
                  size={16}
                  className="text-orange-400"
                />
              </div>

              <div className="min-w-0">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-200">
                  Emergency Instructions
                </h2>

                <p className="mt-1 text-[9px] text-slate-600">
                  Quick field-safety reminders for ground verification.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-5">
              <div className="rounded-lg bg-slate-950/40 p-3">
                <p className="text-[9px] font-semibold text-orange-300">
                  01
                </p>

                <p className="mt-1 text-[9px] leading-4 text-slate-400">
                  Keep away from unstable slopes.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <p className="text-[9px] font-semibold text-orange-300">
                  02
                </p>

                <p className="mt-1 text-[9px] leading-4 text-slate-400">
                  Do not cross blocked roads.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <p className="text-[9px] font-semibold text-orange-300">
                  03
                </p>

                <p className="mt-1 text-[9px] leading-4 text-slate-400">
                  Capture GPS from a safe position.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <p className="text-[9px] font-semibold text-orange-300">
                  04
                </p>

                <p className="mt-1 text-[9px] leading-4 text-slate-400">
                  Capture evidence without entering unsafe areas.
                </p>
              </div>

              <div className="rounded-lg bg-slate-950/40 p-3">
                <p className="text-[9px] font-semibold text-orange-300">
                  05
                </p>

                <p className="mt-1 text-[9px] leading-4 text-slate-400">
                  Follow verified authority instructions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* WEATHER */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">

          <ActionCard
            icon={
              <CloudRain size={17} />
            }
            title="Weather"
            description="Check available weather and rainfall information with source and freshness context."
            action="Open Weather"
            onClick={() =>
              navigate("/weather")
            }
          />

          <ActionCard
            icon={
              <Navigation size={17} />
            }
            title="Route & Shelter"
            description="Inspect available operational route and shelter information. Unmapped locations are not fabricated."
            action="Open Operational Map"
            onClick={() =>
              navigate(
                "/risk-map",
              )
            }
          />

        </div>

      </div>
    </div>
  )
}