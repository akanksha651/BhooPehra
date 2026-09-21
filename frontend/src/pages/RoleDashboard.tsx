import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Map,
  MapPin,
  RadioTower,
  RefreshCw,
  Route,
  ShieldCheck,
  TriangleAlert,
  Users,
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
  ROLE_PROFILES,
  useRole,
  type UserRole,
} from "../context/RoleContext"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

type RiskLevel =
  | "CRITICAL"
  | "HIGH"
  | "MODERATE"
  | "LOW"
  | "UNKNOWN"

type ApiZone = {
  id: number
  name: string
  district?: {
    id: number
    name: string
    state: string
    code: string
  }
  risk_level?: string
  probability?: number
  confidence?: string
  rainfall_trigger?: string
  priority?: string
  affected_villages?: number
  affected_roads?: number
  geometry?: unknown
  created_at?: string
  updated_at?: string
  risk_engine?: {
    probability?: number
    risk_level?: string
    confidence?: string
    rainfall_trigger?: string
  }
}

type RiskResponse = {
  count?: number
  zones?: ApiZone[]
  data?: ApiZone[]
}

type AlertItem = {
  id: number
  status?: string
  severity?: string
  title?: string
  message?: string
  description?: string
  risk_zone_id?: number | null
  asset_name?: string | null
  probability?: number
  probability_percent?: number
  priority?: string
  created_at?: string
  updated_at?: string
}

type AlertsResponse = {
  count?: number
  data?: AlertItem[]
}

type FieldReport = {
  id: number
  title?: string
  description?: string
  hazard_type?: string
  hazard?: string
  severity?: string
  status?: string
  verification_status?: string
  district?: string
  state?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  reporter?: string
  created_at?: string
  updated_at?: string
  photo_url?: string | null
}

type FieldReportsResponse = {
  count?: number
  data?: FieldReport[]
}

type InfrastructureAsset = {
  id: number
  asset_code?: string
  name?: string
  asset_type?: string
  district_id?: number
  risk_zone_id?: number | null
  risk_level?: string
  probability?: number
  priority?: string
  exposure_count?: number
  status?: string
  recommendation?: string | null
  geometry?: unknown
  spatially_verified?: boolean
  geometry_available?: boolean
}

type InfrastructureResponse = {
  count?: number
  data?: InfrastructureAsset[]
}

const ROLE_ORDER: UserRole[] = [
  "AUTHORITY",
  "FIELD_TEAM",
  "COMMUNITY",
]

function normalizeRisk(value?: string): RiskLevel {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()

  if (
    normalized === "CRITICAL" ||
    normalized === "HIGH" ||
    normalized === "MODERATE" ||
    normalized === "LOW"
  ) {
    return normalized
  }

  return "UNKNOWN"
}

function riskText(level: RiskLevel): string {
  switch (level) {
    case "CRITICAL":
      return "text-red-400"
    case "HIGH":
      return "text-orange-400"
    case "MODERATE":
      return "text-yellow-400"
    case "LOW":
      return "text-emerald-400"
    default:
      return "text-slate-400"
  }
}

function riskBadge(level: RiskLevel): string {
  switch (level) {
    case "CRITICAL":
      return "border-red-500/20 bg-red-500/10 text-red-300"
    case "HIGH":
      return "border-orange-500/20 bg-orange-500/10 text-orange-300"
    case "MODERATE":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300"
    case "LOW":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    default:
      return "border-slate-700 bg-slate-800/30 text-slate-400"
  }
}

function priorityRank(value?: string): number {
  const normalized = String(value ?? "").toUpperCase()

  if (normalized === "P1") return 1
  if (normalized === "P2") return 2
  if (normalized === "P3") return 3

  return 99
}

function probabilityPercent(
  value?: number,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null
  }

  return value <= 1 ? value * 100 : value
}

function formatTime(value?: string): string {
  if (!value) {
    return "Time unavailable"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable"
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function locationText(
  district?: string,
  state?: string,
  fallback = "Location unavailable",
): string {
  if (district && state) {
    return `${district}, ${state}`
  }

  if (district) {
    return district
  }

  if (state) {
    return state
  }

  return fallback
}

function hasGeometry(
  geometry: unknown,
): boolean {
  if (!geometry) {
    return false
  }

  if (
    typeof geometry === "string" &&
    geometry.trim().length > 0
  ) {
    return true
  }

  if (typeof geometry === "object") {
    return (
      Object.keys(
        geometry as Record<string, unknown>,
      ).length > 0
    )
  }

  return false
}

function StatCard({
  label,
  value,
  description,
  icon,
  valueClass = "text-white",
}: {
  label: string
  value: string | number
  description: string
  icon: React.ReactNode
  valueClass?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#081522] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            {label}
          </p>

          <p
            className={`mt-2 text-2xl font-bold tracking-tight ${valueClass}`}
          >
            {value}
          </p>

          <p className="mt-1 text-[10px] leading-4 text-slate-600">
            {description}
          </p>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/[0.025] text-emerald-400">
          {icon}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-500">
          {eyebrow}
        </p>

        <h2 className="mt-1 text-base font-semibold text-slate-100">
          {title}
        </h2>
      </div>

      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0a1926] px-3 py-2 text-[10px] font-medium text-slate-400 transition hover:border-emerald-500/20 hover:text-emerald-400"
        >
          {action}
          <ArrowRight size={12} />
        </button>
      ) : null}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-white/[0.015] p-5 text-center">
      <div>
        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.025] text-slate-700">
          {icon}
        </div>

        <p className="mt-2 text-xs font-medium text-slate-500">
          {title}
        </p>

        <p className="mt-1 text-[10px] leading-4 text-slate-700">
          {description}
        </p>
      </div>
    </div>
  )
}

function RoleCard({
  role,
  active,
  onClick,
}: {
  role: UserRole
  active: boolean
  onClick: () => void
}) {
  const profile = ROLE_PROFILES[role]

  const Icon =
    role === "AUTHORITY"
      ? ShieldCheck
      : role === "FIELD_TEAM"
        ? RadioTower
        : Users

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-2xl border p-4 text-left transition ${
        active
          ? "border-emerald-500/30 bg-emerald-500/[0.07]"
          : "border-slate-800 bg-[#081522] hover:border-emerald-500/20 hover:bg-[#0a1926]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              active
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-white/[0.03] text-slate-500"
            }`}
          >
            <Icon size={18} />
          </div>

          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-500">
              {profile.shortName}
            </p>

            <h3 className="mt-0.5 text-sm font-semibold text-slate-200">
              {profile.title}
            </h3>
          </div>
        </div>

        {active ? (
          <CheckCircle2
            size={17}
            className="text-emerald-400"
          />
        ) : (
          <ChevronRight
            size={17}
            className="text-slate-700 transition group-hover:text-emerald-400"
          />
        )}
      </div>

      <p className="mt-3 text-[10px] leading-4 text-slate-500">
        {profile.description}
      </p>

      <div className="mt-3 border-t border-white/5 pt-3">
        <p className="text-[9px] uppercase tracking-wider text-slate-700">
          Dashboard
        </p>

        <p className="mt-1 text-[10px] font-medium text-slate-400">
          {profile.dashboardTitle}
        </p>
      </div>
    </button>
  )
}

export default function RoleDashboard() {
  const navigate = useNavigate()
  const { role, profile, setRole } = useRole()

  const activeRole = role ?? "AUTHORITY"

  const activeProfile =
    profile ?? ROLE_PROFILES.AUTHORITY

  const [zones, setZones] = useState<ApiZone[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [reports, setReports] = useState<FieldReport[]>([])
  const [assets, setAssets] = useState<
    InfrastructureAsset[]
  >([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError(null)

        const [
          zonesResult,
          alertsResult,
          reportsResult,
          assetsResult,
        ] = await Promise.allSettled([
          fetch(
            `${API_BASE_URL}/api/risk/zones`,
            { cache: "no-store" },
          ),
          fetch(
            `${API_BASE_URL}/api/alerts`,
            { cache: "no-store" },
          ),
          fetch(
            `${API_BASE_URL}/api/field-reports`,
            { cache: "no-store" },
          ),
          fetch(
            `${API_BASE_URL}/api/infrastructure/assets`,
            { cache: "no-store" },
          ),
        ])

        const failures: string[] = []

        if (
          zonesResult.status === "fulfilled" &&
          zonesResult.value.ok
        ) {
          const payload =
            (await zonesResult.value.json()) as RiskResponse

          const data =
            payload.zones ??
            payload.data ??
            []

          setZones(
            Array.isArray(data) ? data : [],
          )
        } else {
          failures.push("Risk service unavailable")
          setZones([])
        }

        if (
          alertsResult.status === "fulfilled" &&
          alertsResult.value.ok
        ) {
          const payload =
            (await alertsResult.value.json()) as AlertsResponse

          setAlerts(
            Array.isArray(payload.data)
              ? payload.data
              : [],
          )
        } else {
          failures.push("Alert service unavailable")
          setAlerts([])
        }

        if (
          reportsResult.status === "fulfilled" &&
          reportsResult.value.ok
        ) {
          const payload =
            (await reportsResult.value.json()) as FieldReportsResponse

          setReports(
            Array.isArray(payload.data)
              ? payload.data
              : [],
          )
        } else {
          failures.push(
            "Field-report service unavailable",
          )
          setReports([])
        }

        if (
          assetsResult.status === "fulfilled" &&
          assetsResult.value.ok
        ) {
          const payload =
            (await assetsResult.value.json()) as InfrastructureResponse

          setAssets(
            Array.isArray(payload.data)
              ? payload.data
              : [],
          )
        } else {
          failures.push(
            "Infrastructure service unavailable",
          )
          setAssets([])
        }

        if (failures.length > 0) {
          setError(failures.join(" · "))
        }
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load operational data.",
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    void loadData()

    const interval = window.setInterval(
      () => {
        void loadData(true)
      },
      60000,
    )

    return () => {
      window.clearInterval(interval)
    }
  }, [loadData])

  const riskStats = useMemo(() => {
    const stats = {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    }

    for (const zone of zones) {
      const risk = normalizeRisk(
        zone.risk_level ??
          zone.risk_engine?.risk_level,
      )

      if (risk === "CRITICAL") {
        stats.critical += 1
      }

      if (risk === "HIGH") {
        stats.high += 1
      }

      if (risk === "MODERATE") {
        stats.moderate += 1
      }

      if (risk === "LOW") {
        stats.low += 1
      }
    }

    return stats
  }, [zones])

  const highestRiskZone = useMemo(() => {
    return [...zones].sort((a, b) => {
      const aProbability =
        probabilityPercent(
          a.risk_engine?.probability ??
            a.probability,
        ) ?? -1

      const bProbability =
        probabilityPercent(
          b.risk_engine?.probability ??
            b.probability,
        ) ?? -1

      return bProbability - aProbability
    })[0] ?? null
  }, [zones])

  const activeAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const status = String(
          alert.status ?? "",
        ).toUpperCase()

        return (
          status === "ACTIVE" ||
          status === "OPEN" ||
          status === "ISSUED"
        )
      }),
    [alerts],
  )

  const pendingReports = useMemo(
    () =>
      reports.filter((report) => {
        const status = String(
          report.status ??
            report.verification_status ??
            "",
        ).toUpperCase()

        return (
          status.includes("PENDING") ||
          status === "SUBMITTED" ||
          status === "UNVERIFIED"
        )
      }),
    [reports],
  )

  const criticalReports = useMemo(
    () =>
      reports.filter(
        (report) =>
          String(
            report.severity ?? "",
          ).toUpperCase() === "CRITICAL",
      ),
    [reports],
  )

  const mappedAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.spatially_verified === true ||
          asset.geometry_available === true ||
          hasGeometry(asset.geometry),
      ).length,
    [assets],
  )

  const recentAlerts = useMemo(
    () =>
      [...alerts]
        .sort(
          (a, b) =>
            new Date(
              b.created_at ?? 0,
            ).getTime() -
            new Date(
              a.created_at ?? 0,
            ).getTime(),
        )
        .slice(0, 5),
    [alerts],
  )

  const recentReports = useMemo(
    () =>
      [...reports]
        .sort(
          (a, b) =>
            new Date(
              b.created_at ?? 0,
            ).getTime() -
            new Date(
              a.created_at ?? 0,
            ).getTime(),
        )
        .slice(0, 5),
    [reports],
  )

  function switchRole(nextRole: UserRole) {
    setRole(nextRole)
    navigate("/")
  }

  function openRiskMap() {
    navigate("/risk-map")
  }

  function openAlerts() {
    navigate("/alerts")
  }

  function openReports() {
    navigate("/field-reports")
  }

  function openInfrastructure() {
    navigate("/infrastructure")
  }

  function renderAuthority() {
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Risk Zones"
            value={zones.length}
            description="Records from risk service"
            icon={<Map size={17} />}
          />

          <StatCard
            label="Critical / High"
            value={
              riskStats.critical +
              riskStats.high
            }
            description="Current baseline classifications"
            icon={
              <TriangleAlert size={17} />
            }
            valueClass={
              riskStats.critical +
                riskStats.high >
              0
                ? "text-red-400"
                : "text-white"
            }
          />

          <StatCard
            label="Active Alerts"
            value={activeAlerts.length}
            description="Active, open or issued"
            icon={<Bell size={17} />}
            valueClass={
              activeAlerts.length > 0
                ? "text-red-400"
                : "text-white"
            }
          />

          <StatCard
            label="Field Reports"
            value={reports.length}
            description="Ground evidence records"
            icon={<FileText size={17} />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="GIS Operations"
              title="Regional Risk Intelligence"
              action="Open Risk Map"
              onAction={openRiskMap}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  Highest Baseline Probability
                </p>

                <p className="mt-2 text-2xl font-bold text-emerald-400">
                  {highestRiskZone
                    ? `${
                        probabilityPercent(
                          highestRiskZone
                            .risk_engine
                            ?.probability ??
                            highestRiskZone.probability,
                        )?.toFixed(1) ?? "--"
                      }%`
                    : "--"}
                </p>

                <p className="mt-1 text-[10px] text-slate-600">
                  {highestRiskZone?.name ??
                    "No risk-zone record available"}
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  Risk Distribution
                </p>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[
                    [
                      "CRITICAL",
                      riskStats.critical,
                    ],
                    [
                      "HIGH",
                      riskStats.high,
                    ],
                    [
                      "MODERATE",
                      riskStats.moderate,
                    ],
                    [
                      "LOW",
                      riskStats.low,
                    ],
                  ].map(([label, count]) => (
                    <div key={label}>
                      <p
                        className={`text-sm font-bold ${riskText(
                          label as RiskLevel,
                        )}`}
                      >
                        {count}
                      </p>

                      <p className="mt-0.5 text-[8px] uppercase tracking-wider text-slate-700">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {zones
                .slice()
                .sort((a, b) => {
                  const ap =
                    probabilityPercent(
                      a.risk_engine
                        ?.probability ??
                        a.probability,
                    ) ?? -1

                  const bp =
                    probabilityPercent(
                      b.risk_engine
                        ?.probability ??
                        b.probability,
                    ) ?? -1

                  return bp - ap
                })
                .slice(0, 6)
                .map((zone) => {
                  const risk =
                    normalizeRisk(
                      zone.risk_level ??
                        zone.risk_engine
                          ?.risk_level,
                    )

                  const probability =
                    probabilityPercent(
                      zone.risk_engine
                        ?.probability ??
                        zone.probability,
                    )

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={openRiskMap}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left transition hover:border-emerald-500/20"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md border px-2 py-1 text-[8px] font-bold ${riskBadge(
                              risk,
                            )}`}
                          >
                            {risk}
                          </span>

                          <p className="truncate text-xs font-semibold text-slate-300">
                            {zone.name}
                          </p>
                        </div>

                        <p className="mt-1 text-[9px] text-slate-600">
                          {locationText(
                            zone.district?.name,
                            zone.district?.state,
                          )}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-slate-300">
                          {probability !==
                          null
                            ? `${probability.toFixed(
                                1,
                              )}%`
                            : "--"}
                        </p>

                        <p className="text-[8px] text-slate-700">
                          baseline
                        </p>
                      </div>
                    </button>
                  )
                })}

              {zones.length === 0 ? (
                <EmptyState
                  icon={<Map size={16} />}
                  title="No risk-zone data"
                  description="No monitored risk zones were returned."
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Command Status"
              title="Operational Priorities"
            />

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={openAlerts}
                className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-red-500/20"
              >
                <div className="flex items-center gap-3">
                  <Bell
                    size={16}
                    className="text-red-400"
                  />

                  <div>
                    <p className="text-xs text-slate-300">
                      Active warnings
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Backend alert status
                    </p>
                  </div>
                </div>

                <span className="text-sm font-bold text-slate-200">
                  {activeAlerts.length}
                </span>
              </button>

              <button
                type="button"
                onClick={openReports}
                className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-amber-500/20"
              >
                <div className="flex items-center gap-3">
                  <ClipboardCheck
                    size={16}
                    className="text-amber-400"
                  />

                  <div>
                    <p className="text-xs text-slate-300">
                      Reports requiring review
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Pending / submitted / unverified
                    </p>
                  </div>
                </div>

                <span className="text-sm font-bold text-slate-200">
                  {pendingReports.length}
                </span>
              </button>

              <button
                type="button"
                onClick={openInfrastructure}
                className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-emerald-500/20"
              >
                <div className="flex items-center gap-3">
                  <Building2
                    size={16}
                    className="text-emerald-400"
                  />

                  <div>
                    <p className="text-xs text-slate-300">
                      Infrastructure records
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Current backend records
                    </p>
                  </div>
                </div>

                <span className="text-sm font-bold text-slate-200">
                  {assets.length}
                </span>
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={15}
                  className="text-emerald-400"
                />

                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  Live data policy
                </p>
              </div>

              <p className="mt-2 text-[10px] leading-4 text-slate-600">
                Missing backend records are shown as unavailable.
                No operational metric, alert, assignment or location
                is fabricated.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Alerts"
              title="Recent Alerts"
              action="View Alerts"
              onAction={openAlerts}
            />

            <div className="mt-4 space-y-2">
              {recentAlerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={openAlerts}
                  className="w-full rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-emerald-500/20"
                >
                  <div className="flex gap-3">
                    <AlertTriangle
                      size={15}
                      className="mt-0.5 text-amber-400"
                    />

                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-300">
                        {alert.title ??
                          "Alert title unavailable"}
                      </p>

                      <p className="mt-1 text-[9px] text-slate-600">
                        {alert.asset_name ??
                          "Location unavailable"}{" "}
                        ·{" "}
                        {formatTime(
                          alert.created_at,
                        )}
                      </p>

                      <span className="mt-2 inline-block rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-[8px] text-slate-500">
                        {String(
                          alert.status ??
                            "UNKNOWN",
                        ).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {recentAlerts.length === 0 ? (
                <EmptyState
                  icon={<Bell size={16} />}
                  title="No alert records"
                  description="No alert records were returned by the backend."
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Ground Intelligence"
              title="Recent Field Evidence"
              action="Open Field Reports"
              onAction={openReports}
            />

            <div className="mt-4 space-y-2">
              {recentReports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={openReports}
                  className="w-full rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-emerald-500/20"
                >
                  <div className="flex gap-3">
                    <FileText
                      size={15}
                      className="mt-0.5 text-emerald-400"
                    />

                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-300">
                        {report.title ??
                          report.hazard_type ??
                          report.hazard ??
                          "Field report"}
                      </p>

                      <p className="mt-1 truncate text-[9px] text-slate-600">
                        {locationText(
                          report.district,
                          report.state,
                          report.location,
                        )}
                      </p>

                      <span className="mt-2 inline-block rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-[8px] text-slate-500">
                        {String(
                          report.status ??
                            report.verification_status ??
                            "UNKNOWN",
                        ).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {recentReports.length === 0 ? (
                <EmptyState
                  icon={<FileText size={16} />}
                  title="No field reports"
                  description="No field-report records were returned."
                />
              ) : null}
            </div>
          </div>
        </div>
      </>
    )
  }

  function renderFieldTeam() {
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Risk Zones"
            value={zones.length}
            description="Available for field inspection"
            icon={<Map size={17} />}
          />

          <StatCard
            label="Field Reports"
            value={reports.length}
            description="Ground evidence records"
            icon={<FileText size={17} />}
          />

          <StatCard
            label="Verification Queue"
            value={pendingReports.length}
            description="Reports requiring review"
            icon={<ClipboardCheck size={17} />}
            valueClass={
              pendingReports.length > 0
                ? "text-amber-400"
                : "text-white"
            }
          />

          <StatCard
            label="Mapped Assets"
            value={mappedAssets}
            description="Assets with available geometry"
            icon={<Route size={17} />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Field Operations"
              title="Risk Locations"
              action="Open Risk Map"
              onAction={openRiskMap}
            />

            <div className="mt-4 space-y-2">
              {zones
                .slice()
                .sort(
                  (a, b) =>
                    priorityRank(
                      a.priority,
                    ) -
                    priorityRank(
                      b.priority,
                    ),
                )
                .slice(0, 7)
                .map((zone) => {
                  const risk =
                    normalizeRisk(
                      zone.risk_level ??
                        zone.risk_engine
                          ?.risk_level,
                    )

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={openRiskMap}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-emerald-500/20"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md border px-2 py-1 text-[8px] font-bold ${riskBadge(
                              risk,
                            )}`}
                          >
                            {risk}
                          </span>

                          <p className="truncate text-xs font-semibold text-slate-300">
                            {zone.name}
                          </p>
                        </div>

                        <p className="mt-1 text-[9px] text-slate-600">
                          {locationText(
                            zone.district?.name,
                            zone.district?.state,
                          )}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[8px] uppercase tracking-wider text-slate-700">
                          Priority
                        </p>

                        <p className="text-xs font-semibold text-slate-300">
                          {zone.priority ??
                            "UNAVAILABLE"}
                        </p>
                      </div>
                    </button>
                  )
                })}

              {zones.length === 0 ? (
                <EmptyState
                  icon={<Map size={16} />}
                  title="No risk locations"
                  description="No risk-zone records are currently available."
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Field Actions"
              title="Operational Tools"
            />

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={openReports}
                className="flex w-full items-center justify-between rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3 text-left hover:bg-emerald-500/[0.07]"
              >
                <div className="flex items-center gap-3">
                  <ClipboardCheck
                    size={17}
                    className="text-emerald-400"
                  />

                  <div>
                    <p className="text-xs font-semibold text-slate-300">
                      Field Reporting
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Submit and verify ground observations
                    </p>
                  </div>
                </div>

                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={openRiskMap}
                className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-emerald-500/20"
              >
                <div className="flex items-center gap-3">
                  <MapPin
                    size={17}
                    className="text-emerald-400"
                  />

                  <div>
                    <p className="text-xs font-semibold text-slate-300">
                      Inspect Risk Locations
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Use available GIS risk information
                    </p>
                  </div>
                </div>

                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={openInfrastructure}
                className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-emerald-500/20"
              >
                <div className="flex items-center gap-3">
                  <Building2
                    size={17}
                    className="text-emerald-400"
                  />

                  <div>
                    <p className="text-xs font-semibold text-slate-300">
                      Infrastructure
                    </p>

                    <p className="text-[9px] text-slate-600">
                      Review available asset exposure
                    </p>
                  </div>
                </div>

                <ArrowRight size={14} />
              </button>

              <button
                type="button"
                onClick={openAlerts}
                className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-red-500/20"
              >
                <div className="flex items-center gap-3">
                  <Bell
                    size={17}
                    className="text-red-400"
                  />

                  <div>
                    <p className="text-xs font-semibold text-slate-300">
                      Operational Alerts
                    </p>

                    <p className="text-[9px] text-slate-600">
                      {activeAlerts.length} active/open records
                    </p>
                  </div>
                </div>

                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Verification"
              title="Reports Requiring Attention"
              action="Open Reports"
              onAction={openReports}
            />

            <div className="mt-4 space-y-2">
              {pendingReports
                .slice(0, 6)
                .map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={openReports}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-left hover:border-amber-500/20"
                  >
                    <ClipboardCheck
                      size={15}
                      className="mt-0.5 text-amber-400"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-300">
                        {report.title ??
                          report.hazard_type ??
                          report.hazard ??
                          "Field report"}
                      </p>

                      <p className="mt-1 truncate text-[9px] text-slate-600">
                        {locationText(
                          report.district,
                          report.state,
                          report.location,
                        )}
                      </p>
                    </div>

                    <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[8px] font-bold text-amber-300">
                      {String(
                        report.status ??
                          report.verification_status ??
                          "PENDING",
                      ).toUpperCase()}
                    </span>
                  </button>
                ))}

              {pendingReports.length === 0 ? (
                <EmptyState
                  icon={
                    <CheckCircle2 size={16} />
                  }
                  title="No pending reports"
                  description="No pending, submitted or unverified reports were returned."
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Critical Evidence"
              title="Critical Field Reports"
              action="Open Reports"
              onAction={openReports}
            />

            <div className="mt-4 space-y-2">
              {criticalReports
                .slice(0, 6)
                .map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={openReports}
                    className="flex w-full items-start gap-3 rounded-xl border border-red-500/10 bg-red-500/[0.025] p-3 text-left hover:border-red-500/20"
                  >
                    <TriangleAlert
                      size={15}
                      className="mt-0.5 text-red-400"
                    />

                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-300">
                        {report.title ??
                          report.hazard_type ??
                          report.hazard ??
                          "Critical field report"}
                      </p>

                      <p className="mt-1 text-[9px] text-slate-600">
                        {locationText(
                          report.district,
                          report.state,
                          report.location,
                        )}
                      </p>
                    </div>
                  </button>
                ))}

              {criticalReports.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck size={16} />}
                  title="No critical field reports"
                  description="No field report currently has CRITICAL severity."
                />
              ) : null}
            </div>
          </div>
        </div>
      </>
    )
  }

  function renderCommunity() {
    const highestRisk =
      highestRiskZone
        ? normalizeRisk(
            highestRiskZone.risk_level ??
              highestRiskZone.risk_engine
                ?.risk_level,
          )
        : "UNKNOWN"

    const probability =
      highestRiskZone
        ? probabilityPercent(
            highestRiskZone.risk_engine
              ?.probability ??
              highestRiskZone.probability,
          )
        : null

    return (
      <>
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={17}
                  className="text-emerald-400"
                />

                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-500">
                  Community Safety
                </p>
              </div>

              <h2 className="mt-2 text-xl font-semibold text-slate-100">
                Stay informed and report hazards.
              </h2>

              <p className="mt-2 max-w-2xl text-[11px] leading-5 text-slate-500">
                BhooPehra displays available verified risk and
                warning information. Missing assessments are not
                replaced with fabricated estimates.
              </p>
            </div>

            <button
              type="button"
              onClick={openReports}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-semibold text-[#03130d] hover:bg-emerald-400"
            >
              <FileText size={15} />
              Report a Hazard
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Monitored Zones"
            value={zones.length}
            description="Backend risk-zone records"
            icon={<Map size={17} />}
          />

          <StatCard
            label="Active Warnings"
            value={activeAlerts.length}
            description="Active/open/issued alerts"
            icon={<Bell size={17} />}
            valueClass={
              activeAlerts.length > 0
                ? "text-red-400"
                : "text-white"
            }
          />

          <StatCard
            label="Highest Available Risk"
            value={highestRisk}
            description="Available risk-zone classification"
            icon={<Activity size={17} />}
            valueClass={riskText(
              highestRisk,
            )}
          />

          <StatCard
            label="Field Evidence"
            value={reports.length}
            description="Ground reports in system"
            icon={<Users size={17} />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Available Risk"
              title="Highest Available Risk Record"
              action="Open Risk Map"
              onAction={openRiskMap}
            />

            {highestRiskZone ? (
              <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <span
                      className={`rounded-md border px-2 py-1 text-[8px] font-bold ${riskBadge(
                        highestRisk,
                      )}`}
                    >
                      {highestRisk}
                    </span>

                    <h3 className="mt-3 text-lg font-semibold text-slate-200">
                      {highestRiskZone.name}
                    </h3>

                    <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-600">
                      <MapPin size={11} />
                      {locationText(
                        highestRiskZone
                          .district?.name,
                        highestRiskZone
                          .district?.state,
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-[#06111c] px-4 py-3">
                    <p className="text-[8px] uppercase tracking-wider text-slate-700">
                      Baseline Probability
                    </p>

                    <p className="mt-1 text-xl font-bold text-emerald-400">
                      {probability !==
                      null
                        ? `${probability.toFixed(
                            1,
                          )}%`
                        : "--"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <p className="text-[8px] uppercase tracking-wider text-slate-700">
                      Priority
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      {highestRiskZone.priority ??
                        "UNAVAILABLE"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <p className="text-[8px] uppercase tracking-wider text-slate-700">
                      Confidence
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      {highestRiskZone.confidence ??
                        "UNAVAILABLE"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <p className="text-[8px] uppercase tracking-wider text-slate-700">
                      Roads
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      {typeof highestRiskZone.affected_roads ===
                      "number"
                        ? highestRiskZone.affected_roads
                        : "--"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <p className="text-[8px] uppercase tracking-wider text-slate-700">
                      Villages
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      {typeof highestRiskZone.affected_villages ===
                      "number"
                        ? highestRiskZone.affected_villages
                        : "--"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-amber-500/10 bg-amber-500/[0.025] p-3">
                  <div className="flex items-center gap-2">
                    <TriangleAlert
                      size={13}
                      className="text-amber-400"
                    />

                    <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-400">
                      Safety Note
                    </p>
                  </div>

                  <p className="mt-1 text-[10px] leading-4 text-slate-600">
                    A baseline risk classification is not itself an
                    evacuation instruction. Follow verified warnings
                    and instructions from authorized agencies.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={<Map size={16} />}
                  title="No risk assessment available"
                  description="No monitored risk-zone record is currently available."
                />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
            <SectionHeader
              eyebrow="Warnings"
              title="Active Safety Alerts"
              action="View Warnings"
              onAction={openAlerts}
            />

            <div className="mt-4 space-y-2">
              {activeAlerts
                .slice(0, 6)
                .map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={openAlerts}
                    className="w-full rounded-xl border border-red-500/10 bg-red-500/[0.025] p-3 text-left hover:border-red-500/20"
                  >
                    <div className="flex gap-3">
                      <AlertTriangle
                        size={15}
                        className="mt-0.5 shrink-0 text-red-400"
                      />

                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-300">
                          {alert.title ??
                            "Warning title unavailable"}
                        </p>

                        <p className="mt-1 text-[9px] leading-4 text-slate-600">
                          {alert.message ??
                            alert.description ??
                            "Warning details unavailable."}
                        </p>

                        <p className="mt-2 text-[8px] text-slate-700">
                          {formatTime(
                            alert.created_at,
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

              {activeAlerts.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck size={16} />}
                  title="No active warnings"
                  description="No alert is currently marked ACTIVE, OPEN or ISSUED."
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <button
            type="button"
            onClick={openRiskMap}
            className="rounded-2xl border border-slate-800 bg-[#081522] p-5 text-left hover:border-emerald-500/20"
          >
            <Map
              size={19}
              className="text-emerald-400"
            />

            <h3 className="mt-4 text-sm font-semibold text-slate-200">
              Check Local Risk
            </h3>

            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              View available risk zones and spatial information.
            </p>

            <div className="mt-4 flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
              Open Risk Map
              <ArrowRight size={11} />
            </div>
          </button>

          <button
            type="button"
            onClick={openReports}
            className="rounded-2xl border border-slate-800 bg-[#081522] p-5 text-left hover:border-emerald-500/20"
          >
            <FileText
              size={19}
              className="text-emerald-400"
            />

            <h3 className="mt-4 text-sm font-semibold text-slate-200">
              Report a Hazard
            </h3>

            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              Submit a ground observation using the existing reporting workflow.
            </p>

            <div className="mt-4 flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
              Open Reporting
              <ArrowRight size={11} />
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              navigate("/resources")
            }
            className="rounded-2xl border border-slate-800 bg-[#081522] p-5 text-left hover:border-emerald-500/20"
          >
            <ShieldCheck
              size={19}
              className="text-emerald-400"
            />

            <h3 className="mt-4 text-sm font-semibold text-slate-200">
              Safety Resources
            </h3>

            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              Open verified BhooPehra resources and emergency guidance.
            </p>

            <div className="mt-4 flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
              Open Resources
              <ArrowRight size={11} />
            </div>
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-500">
                <Activity size={12} />
                BhooPehra · Role-Based Operations
              </div>

              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {activeProfile.dashboardTitle}
              </h1>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                {activeProfile.dashboardSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  error
                    ? "border-amber-500/15 bg-amber-500/[0.04]"
                    : "border-emerald-500/15 bg-emerald-500/[0.04]"
                }`}
              >
                {error ? (
                  <WifiOff
                    size={13}
                    className="text-amber-400"
                  />
                ) : (
                  <Wifi
                    size={13}
                    className="text-emerald-400"
                  />
                )}

                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    Backend
                  </p>

                  <p
                    className={`text-[8px] ${
                      error
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {error
                      ? "PARTIAL DATA"
                      : "CONNECTED"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadData(true)
                }
                disabled={refreshing}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-[#081522] text-slate-500 hover:border-emerald-500/20 hover:text-emerald-400 disabled:opacity-50"
                aria-label="Refresh operational data"
              >
                <RefreshCw
                  size={15}
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Operational Role
              </p>

              <p className="mt-1 text-[10px] text-slate-700">
                Click any role to immediately switch to its actual dashboard.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {ROLE_ORDER.map(
                (item) => (
                  <RoleCard
                    key={item}
                    role={item}
                    active={
                      item === activeRole
                    }
                    onClick={() =>
                      switchRole(item)
                    }
                  />
                ),
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.035] px-4 py-3">
              <div className="flex items-start gap-2">
                <TriangleAlert
                  size={14}
                  className="mt-0.5 text-amber-400"
                />

                <div>
                  <p className="text-[10px] font-semibold text-amber-400">
                    Some operational services are unavailable
                  </p>

                  <p className="mt-1 text-[9px] leading-4 text-slate-600">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({
                length: 4,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-[#081522]"
                />
              ))}
            </div>
          ) : activeRole ===
            "AUTHORITY" ? (
            renderAuthority()
          ) : activeRole ===
            "FIELD_TEAM" ? (
            renderFieldTeam()
          ) : (
            renderCommunity()
          )}
        </div>
      </div>
    </div>
  )
}