import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudRain,
  GitCompare,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
  TrendingUp,
  X,
} from "lucide-react"

type Severity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "MODERATE"
  | "INFO"

type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED"
type Priority = "P1" | "P2" | "P3"

type ApiAlert = {
  id: number
  alert_key: string
  asset_id: number | null
  risk_zone_id: number | null
  asset_code: string | null
  asset_name: string | null
  alert_type: string
  severity: Severity
  title: string
  message: string
  risk_level: string
  probability: number
  probability_percent: number
  rainfall_trigger: string
  confidence: string
  source: string
  priority: Priority
  recommended_action: string
  status: AlertStatus
  created_at: string | null
  updated_at: string | null
}

type FusionSignal = {
  probability?: number
  probability_percent?: number
  risk?: string
  confidence?: string
}

type RiskFusion = {
  zone?: {
    id?: number
    name?: string
    district?: string
  }
  status: string
  final_probability: number
  final_probability_percent: number
  final_risk: string
  confidence: string
  operational_assessment: string
  ml?: FusionSignal
  rule_engine?: FusionSignal
  rainfall_trigger?: {
    level?: string
    confidence?: string
  }
  fusion_weights?: {
    ml?: number
    rule_engine?: number
  }
  signals_agree?: boolean
  signal_disagreement?: boolean
  evidence?: Array<{
    type?: string
    severity?: string
    feature?: string
    value?: string | number
    description?: string
  }>
  database_write?: boolean
  warnings?: string[]
}

type RiskFusionApiResponse = {
  zone?: RiskFusion["zone"]
  risk_fusion?: {
    status: string
    final_probability: number
    final_probability_percent: number
    final_risk_level: string
    final_confidence: string
    operational_assessment: string
    signals?: {
      ml?: {
        probability: number
        probability_percent: number
        risk_level: string
        confidence: string
      }
      rule_engine?: {
        probability: number
        probability_percent: number
        risk_level: string
        confidence: string
        rainfall_trigger?: string
      }
    }
    fusion?: {
      method?: string
      ml_weight?: number
      rule_engine_weight?: number
    }
    agreement?: {
      signals_agree?: boolean
      signal_disagreement?: boolean
    }
    evidence?: Array<{
      type?: string
      severity?: string
      feature?: string
      value?: string | number
      description?: string
    }>
    database_write?: boolean
    warnings?: string[]
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

const severityConfig: Record<
  Severity,
  {
    color: string
    bg: string
    border: string
  }
> = {
  CRITICAL: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  HIGH: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  MEDIUM: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  MODERATE: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  INFO: {
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
  },
}

const statusConfig: Record<
  AlertStatus,
  {
    color: string
    bg: string
  }
> = {
  ACTIVE: {
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  ACKNOWLEDGED: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  RESOLVED: {
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "Unknown"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))

  if (diffMinutes < 1) return "Just now"

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  const hours = Math.floor(diffMinutes / 60)

  if (hours < 24) {
    return `${hours} hr ago`
  }

  const days = Math.floor(hours / 24)

  if (days === 1) {
    return "1 day ago"
  }

  return `${days} days ago`
}

function formatDateTime(value: string | null): string {
  if (!value) return "Unknown"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function getLocation(alert: ApiAlert): string {
  if (alert.asset_name) {
    return alert.asset_name
  }

  if (alert.asset_code) {
    return alert.asset_code
  }

  if (alert.risk_zone_id !== null) {
    return `Risk Zone ${alert.risk_zone_id}`
  }

  return "Unknown location"
}

function getSeverityIcon(severity: Severity) {
  if (severity === "CRITICAL") {
    return <Siren size={17} />
  }

  if (severity === "HIGH") {
    return <AlertTriangle size={17} />
  }

  return <ShieldAlert size={17} />
}

function formatPercent(
  value: number | undefined | null,
): string {
  if (
    value === undefined ||
    value === null ||
    Number.isNaN(value)
  ) {
    return "—"
  }

  return `${(value * 100).toFixed(1)}%`
}

function getFusionRiskClass(
  risk: string | undefined,
): string {
  const normalized = (risk ?? "").toUpperCase()

  if (normalized === "CRITICAL") {
    return "text-red-400"
  }

  if (normalized === "HIGH") {
    return "text-orange-400"
  }

  if (normalized === "MODERATE") {
    return "text-yellow-400"
  }

  if (normalized === "LOW") {
    return "text-emerald-400"
  }

  return "text-slate-300"
}

function getAssessmentClass(
  assessment: string | undefined,
): string {
  const value = (assessment ?? "").toUpperCase()

  if (
    value.includes("REVIEW") ||
    value.includes("ELEVATED")
  ) {
    return "text-yellow-300"
  }

  if (value.includes("LOW")) {
    return "text-emerald-400"
  }

  return "text-slate-300"
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<ApiAlert[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(
    null,
  )

  const [severityFilter, setSeverityFilter] = useState<
    Severity | "ALL"
  >("ALL")

  const [statusFilter, setStatusFilter] = useState<
    AlertStatus | "ALL"
  >("ALL")

  const [search, setSearch] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null)

  const [fusion, setFusion] = useState<RiskFusion | null>(
    null,
  )

  const [fusionLoading, setFusionLoading] = useState(false)
  const [fusionError, setFusionError] = useState<string | null>(
    null,
  )

  const loadAlerts = useCallback(async () => {
    try {
      setError(null)

      const response = await fetch(
        `${API_BASE_URL}/api/alerts`,
      )

      if (!response.ok) {
        throw new Error(
          `Unable to load alerts (${response.status})`,
        )
      }

      const payload: {
        count: number
        data: ApiAlert[]
      } = await response.json()

      setAlerts(payload.data)

      setSelectedId((current) => {
        if (
          current !== null &&
          payload.data.some(
            (alert) => alert.id === current,
          )
        ) {
          return current
        }

        return payload.data[0]?.id ?? null
      })
    } catch (requestError) {
      console.error("Failed to load alerts:", requestError)

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load alerts.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts])

  const handleRefresh = async () => {
    setRefreshing(true)
    setSuccessMessage(null)
    await loadAlerts()
  }

  const handleGenerateAlerts = async () => {
    try {
      setGenerating(true)
      setError(null)
      setSuccessMessage(null)

      const response = await fetch(
        `${API_BASE_URL}/api/alerts/generate`,
        {
          method: "POST",
        },
      )

      if (!response.ok) {
        throw new Error(
          `Alert generation failed (${response.status})`,
        )
      }

      const payload = await response.json()

      await loadAlerts()

      if (payload.created_count > 0) {
        setSuccessMessage(
          `${payload.created_count} new alert${
            payload.created_count === 1 ? "" : "s"
          } generated successfully.`,
        )
      } else if (payload.existing_active_count > 0) {
        setSuccessMessage(
          `No duplicate alerts created. ${payload.existing_active_count} active alert${
            payload.existing_active_count === 1
              ? ""
              : "s"
          } already exist.`,
        )
      } else {
        setSuccessMessage(
          "Alert engine completed. No new operational alerts generated.",
        )
      }
    } catch (requestError) {
      console.error(
        "Failed to generate alerts:",
        requestError,
      )

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to generate alerts.",
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleStatusChange = async (
    alertId: number,
    status: AlertStatus,
  ) => {
    try {
      setActionLoading(true)
      setError(null)
      setSuccessMessage(null)

      const response = await fetch(
        `${API_BASE_URL}/api/alerts/${alertId}/status?status=${status}`,
        {
          method: "PATCH",
        },
      )

      if (!response.ok) {
        throw new Error(
          `Unable to update alert status (${response.status})`,
        )
      }

      const payload = await response.json()

      if (payload.data) {
        setAlerts((current) =>
          current.map((alert) =>
            alert.id === alertId
              ? payload.data
              : alert,
          ),
        )
      }

      setSuccessMessage(
        status === "ACKNOWLEDGED"
          ? "Alert acknowledged successfully."
          : "Alert resolved successfully.",
      )
    } catch (requestError) {
      console.error(
        "Failed to update alert:",
        requestError,
      )

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update alert.",
      )
    } finally {
      setActionLoading(false)
    }
  }

  const filteredAlerts = useMemo(() => {
    const searchText = search.toLowerCase().trim()

    return alerts.filter((alert) => {
      const matchesSeverity =
        severityFilter === "ALL" ||
        alert.severity === severityFilter

      const matchesStatus =
        statusFilter === "ALL" ||
        alert.status === statusFilter

      const location = getLocation(alert).toLowerCase()

      const matchesSearch =
        !searchText ||
        alert.title.toLowerCase().includes(searchText) ||
        location.includes(searchText) ||
        (alert.asset_code ?? "")
          .toLowerCase()
          .includes(searchText) ||
        alert.source.toLowerCase().includes(searchText) ||
        alert.priority
          .toLowerCase()
          .includes(searchText) ||
        alert.alert_type
          .toLowerCase()
          .includes(searchText)

      return (
        matchesSeverity &&
        matchesStatus &&
        matchesSearch
      )
    })
  }, [
    alerts,
    search,
    severityFilter,
    statusFilter,
  ])

  const selected =
    alerts.find((alert) => alert.id === selectedId) ??
    filteredAlerts[0] ??
    null

  useEffect(() => {
    let cancelled = false

    const loadFusion = async () => {
      if (
        selected?.risk_zone_id === null ||
        selected?.risk_zone_id === undefined
      ) {
        setFusion(null)
        setFusionError(null)
        setFusionLoading(false)
        return
      }

      try {
        setFusionLoading(true)
        setFusionError(null)

        const response = await fetch(
          `${API_BASE_URL}/api/risk/fusion/zone/${selected.risk_zone_id}`,
        )

        if (!response.ok) {
          throw new Error(
            `Fusion unavailable (${response.status})`,
          )
        }

        const payload: RiskFusionApiResponse =
          await response.json()

        const backendFusion = payload.risk_fusion

        if (!backendFusion) {
          throw new Error(
            "Fusion response did not contain risk_fusion data.",
          )
        }

        const normalizedFusion: RiskFusion = {
          zone: payload.zone,

          status: backendFusion.status,

          final_probability:
            backendFusion.final_probability,

          final_probability_percent:
            backendFusion.final_probability_percent,

          final_risk:
            backendFusion.final_risk_level,

          confidence:
            backendFusion.final_confidence,

          operational_assessment:
            backendFusion.operational_assessment,

          ml: backendFusion.signals?.ml
            ? {
                probability:
                  backendFusion.signals.ml.probability,
                probability_percent:
                  backendFusion.signals.ml
                    .probability_percent,
                risk:
                  backendFusion.signals.ml.risk_level,
                confidence:
                  backendFusion.signals.ml.confidence,
              }
            : undefined,

          rule_engine:
            backendFusion.signals?.rule_engine
              ? {
                  probability:
                    backendFusion.signals.rule_engine
                      .probability,
                  probability_percent:
                    backendFusion.signals.rule_engine
                      .probability_percent,
                  risk:
                    backendFusion.signals.rule_engine
                      .risk_level,
                  confidence:
                    backendFusion.signals.rule_engine
                      .confidence,
                }
              : undefined,

          rainfall_trigger:
            backendFusion.signals?.rule_engine
              ? {
                  level:
                    backendFusion.signals.rule_engine
                      .rainfall_trigger,
                  confidence:
                    backendFusion.signals.rule_engine
                      .confidence,
                }
              : undefined,

          fusion_weights:
            backendFusion.fusion
              ? {
                  ml:
                    backendFusion.fusion.ml_weight,
                  rule_engine:
                    backendFusion.fusion
                      .rule_engine_weight,
                }
              : undefined,

          signals_agree:
            backendFusion.agreement?.signals_agree,

          signal_disagreement:
            backendFusion.agreement
              ?.signal_disagreement,

          evidence:
            backendFusion.evidence,

          database_write:
            backendFusion.database_write,

          warnings:
            backendFusion.warnings,
        }

        if (!cancelled) {
          setFusion(normalizedFusion)
        }
      } catch (requestError) {
        console.error(
          "Failed to load risk fusion:",
          requestError,
        )

        if (!cancelled) {
          setFusion(null)
          setFusionError(
            requestError instanceof Error
              ? requestError.message
              : "Risk fusion unavailable.",
          )
        }
      } finally {
        if (!cancelled) {
          setFusionLoading(false)
        }
      }
    }

    void loadFusion()

    return () => {
      cancelled = true
    }
  }, [selected?.risk_zone_id])

  const activeCount = alerts.filter(
    (alert) => alert.status === "ACTIVE",
  ).length

  const criticalCount = alerts.filter(
    (alert) => alert.severity === "CRITICAL",
  ).length

  const highCount = alerts.filter(
    (alert) => alert.severity === "HIGH",
  ).length

  const acknowledgedCount = alerts.filter(
    (alert) => alert.status === "ACKNOWLEDGED",
  ).length

  const resolvedCount = alerts.filter(
    (alert) => alert.status === "RESOLVED",
  ).length

  const fusionProbability =
    fusion?.final_probability_percent ??
    (fusion?.final_probability !== undefined
      ? fusion.final_probability * 100
      : null)

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] text-slate-100">
      <div className="border-b border-white/5 bg-[#081522] px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Bell size={14} />
              Operations Center
              <span>/</span>
              Alerts & Warnings
            </div>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Alerts & Warnings
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Monitor, acknowledge and manage landslide
              risk alerts across Northeast India.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Live Monitoring
            </div>

            <button
              onClick={() => void handleGenerateAlerts()}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={
                  generating ? "animate-spin" : ""
                }
              />

              {generating
                ? "Generating..."
                : "Generate Alerts"}
            </button>

            <button
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />
              Refresh
            </button>

            <button
              onClick={() =>
                setShowFilters((value) => !value)
              }
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <ChevronDown
                size={15}
                className={
                  showFilters
                    ? "rotate-180 transition"
                    : "transition"
                }
              />
              Filters
            </button>
          </div>
        </div>
      </div>

      {(error || successMessage) && (
        <div className="border-b border-white/5 bg-[#07131f] px-6 py-3">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {!error && successMessage && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              {successMessage}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-b border-white/5 bg-[#07131f] px-6 py-4 lg:grid-cols-5">
        <SummaryCard
          label="Active Alerts"
          value={activeCount}
          icon={<Radio size={17} />}
          className="text-red-400"
        />

        <SummaryCard
          label="Critical"
          value={criticalCount}
          icon={<Siren size={17} />}
          className="text-orange-400"
        />

        <SummaryCard
          label="High"
          value={highCount}
          icon={<AlertTriangle size={17} />}
          className="text-yellow-400"
        />

        <SummaryCard
          label="Acknowledged"
          value={acknowledgedCount}
          icon={<CheckCircle2 size={17} />}
          className="text-blue-400"
        />

        <SummaryCard
          label="Resolved"
          value={resolvedCount}
          icon={<TrendingUp size={17} />}
          className="text-emerald-400"
        />
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-[#081522] px-6 py-3">
          <FilterSelect
            value={severityFilter}
            onChange={(value) =>
              setSeverityFilter(
                value as Severity | "ALL",
              )
            }
            options={[
              "ALL",
              "CRITICAL",
              "HIGH",
              "MEDIUM",
              "MODERATE",
            ]}
          />

          <FilterSelect
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(
                value as AlertStatus | "ALL",
              )
            }
            options={[
              "ALL",
              "ACTIVE",
              "ACKNOWLEDGED",
              "RESOLVED",
            ]}
          />

          {(severityFilter !== "ALL" ||
            statusFilter !== "ALL") && (
            <button
              onClick={() => {
                setSeverityFilter("ALL")
                setStatusFilter("ALL")
              }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
            >
              <X size={13} />
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="grid min-h-[calc(100vh-300px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="border-r border-white/5">
          <div className="border-b border-white/5 bg-[#081522] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  Alert Feed
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {filteredAlerts.length} alerts matching
                  current view
                </p>
              </div>

              <div className="relative w-full md:w-64">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search alerts..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/30"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw
                  size={16}
                  className="animate-spin"
                />
                Loading alerts...
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredAlerts.map((alert) => {
                const config =
                  severityConfig[alert.severity]

                return (
                  <button
                    key={alert.id}
                    onClick={() =>
                      setSelectedId(alert.id)
                    }
                    className={`w-full px-5 py-4 text-left transition hover:bg-white/[0.025] ${
                      selected?.id === alert.id
                        ? "border-l-2 border-emerald-500 bg-emerald-500/[0.04]"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 rounded-lg p-2 ${config.bg} ${config.color}`}
                      >
                        {getSeverityIcon(
                          alert.severity,
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[9px] font-bold ${config.bg} ${config.color}`}
                          >
                            {alert.severity}
                          </span>

                          <span
                            className={`rounded px-2 py-0.5 text-[9px] font-bold ${statusConfig[alert.status].bg} ${statusConfig[alert.status].color}`}
                          >
                            {alert.status}
                          </span>

                          <span className="text-[10px] text-slate-600">
                            ALT-
                            {String(alert.id).padStart(
                              3,
                              "0",
                            )}
                          </span>

                          {alert.risk_zone_id !== null && (
                            <span className="rounded border border-emerald-500/10 bg-emerald-500/[0.04] px-2 py-0.5 text-[9px] font-medium text-emerald-500/70">
                              FUSION
                            </span>
                          )}
                        </div>

                        <h3 className="mt-2 truncate text-sm font-semibold text-slate-200">
                          {alert.title}
                        </h3>

                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin size={12} />
                          {getLocation(alert)}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                          <span>
                            Probability{" "}
                            <strong className="text-slate-300">
                              {alert.probability_percent}%
                            </strong>
                          </span>

                          <span>
                            Priority{" "}
                            <strong className="text-slate-300">
                              {alert.priority}
                            </strong>
                          </span>

                          <span>
                            Trigger{" "}
                            <strong className="text-slate-300">
                              {alert.rainfall_trigger}
                            </strong>
                          </span>

                          <span className="flex items-center gap-1">
                            <Clock3 size={11} />
                            {formatRelativeTime(
                              alert.created_at,
                            )}
                          </span>
                        </div>
                      </div>

                      <ChevronDown
                        size={15}
                        className="-rotate-90 shrink-0 text-slate-700"
                      />
                    </div>
                  </button>
                )
              })}

              {filteredAlerts.length === 0 && (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <Search
                    size={28}
                    className="text-slate-700"
                  />

                  <p className="mt-3 text-sm text-slate-500">
                    No alerts found
                  </p>

                  <p className="mt-1 text-xs text-slate-600">
                    Try changing the filters or search
                    query.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="bg-[#081522]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  Alert Intelligence
                </div>

                <div className="mt-1 text-lg font-semibold">
                  Alert Details
                </div>
              </div>

              <div
                className={`rounded-lg p-2 ${
                  selected
                    ? severityConfig[
                        selected.severity
                      ].bg
                    : "bg-slate-500/10"
                } ${
                  selected
                    ? severityConfig[
                        selected.severity
                      ].color
                    : "text-slate-500"
                }`}
              >
                <ShieldAlert size={18} />
              </div>
            </div>
          </div>

          {!selected ? (
            <div className="flex min-h-96 flex-col items-center justify-center px-6 text-center">
              <ShieldAlert
                size={30}
                className="text-slate-700"
              />

              <p className="mt-3 text-sm text-slate-500">
                No alert selected
              </p>

              <p className="mt-1 text-xs text-slate-600">
                Select an alert from the feed to inspect
                its intelligence.
              </p>
            </div>
          ) : (
            <div className="p-5">
              <div
                className={`rounded-xl border p-4 ${severityConfig[selected.severity].border} ${severityConfig[selected.severity].bg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className={`text-[10px] font-bold tracking-widest ${severityConfig[selected.severity].color}`}
                    >
                      {selected.severity} ALERT
                    </div>

                    <h2 className="mt-2 text-lg font-semibold">
                      {selected.title}
                    </h2>

                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin size={12} />
                      {getLocation(selected)}
                    </div>

                    {selected.asset_code && (
                      <div className="mt-1 text-[10px] text-slate-600">
                        Asset {selected.asset_code}
                      </div>
                    )}
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${statusConfig[selected.status].bg} ${statusConfig[selected.status].color}`}
                  >
                    {selected.status}
                  </span>
                </div>

                <p className="mt-4 text-xs leading-5 text-slate-400">
                  {selected.message}
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Alert Probability
                    </div>

                    <div className="mt-1 text-3xl font-bold">
                      {selected.probability_percent}%
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Confidence
                    </div>

                    <div className="mt-1 text-sm font-semibold text-emerald-400">
                      {selected.confidence}
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          selected.probability_percent,
                        ),
                      )}%`,
                      backgroundColor:
                        selected.severity ===
                        "CRITICAL"
                          ? "#ef4444"
                          : selected.severity ===
                              "HIGH"
                            ? "#f97316"
                            : "#eab308",
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <GitCompare
                        size={15}
                        className="text-emerald-400"
                      />

                      <h3 className="text-sm font-semibold">
                        Risk Fusion
                      </h3>
                    </div>

                    <p className="mt-1 text-[10px] text-slate-500">
                      ML risk + rule engine + operational
                      signals
                    </p>
                  </div>

                  <span className="rounded border border-emerald-500/15 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold tracking-wider text-emerald-400">
                    READ ONLY
                  </span>
                </div>

                {fusionLoading ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 text-xs text-slate-500">
                    <RefreshCw
                      size={13}
                      className="animate-spin"
                    />
                    Loading fusion assessment...
                  </div>
                ) : fusion ? (
                  <>
                    <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.025] p-3">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-slate-600">
                            Final Fused Probability
                          </div>

                          <div className="mt-1 text-2xl font-bold text-slate-100">
                            {fusionProbability !== null
                              ? `${fusionProbability.toFixed(
                                  1,
                                )}%`
                              : "—"}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[9px] uppercase tracking-wider text-slate-600">
                            Final Risk
                          </div>

                          <div
                            className={`mt-1 text-sm font-bold ${getFusionRiskClass(
                              fusion.final_risk,
                            )}`}
                          >
                            {fusion.final_risk}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                fusionProbability ?? 0,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <FusionSignalBox
                        label="ML Signal"
                        probability={
                          fusion.ml?.probability
                        }
                        risk={fusion.ml?.risk}
                        confidence={
                          fusion.ml?.confidence
                        }
                      />

                      <FusionSignalBox
                        label="Rule Engine"
                        probability={
                          fusion.rule_engine
                            ?.probability
                        }
                        risk={
                          fusion.rule_engine?.risk
                        }
                        confidence={
                          fusion.rule_engine
                            ?.confidence
                        }
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <DetailBox
                        label="Operational Assessment"
                        value={
                          fusion.operational_assessment ??
                          "—"
                        }
                        valueClass={getAssessmentClass(
                          fusion.operational_assessment,
                        )}
                      />

                      <DetailBox
                        label="Fusion Confidence"
                        value={
                          fusion.confidence ?? "—"
                        }
                      />

                      <DetailBox
                        label="Rainfall Signal"
                        value={
                          fusion.rainfall_trigger
                            ?.level ?? "—"
                        }
                      />

                      <DetailBox
                        label="Signal Agreement"
                        value={
                          fusion.signals_agree
                            ? "AGREE"
                            : fusion.signal_disagreement
                              ? "DISAGREE"
                              : "—"
                        }
                        valueClass={
                          fusion.signal_disagreement
                            ? "text-yellow-300"
                            : "text-slate-300"
                        }
                      />
                    </div>

                    {fusion.fusion_weights && (
                      <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">
                          Fusion Weights
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">
                            ML Model
                          </span>

                          <strong className="text-slate-300">
                            {fusion.fusion_weights.ml !==
                            undefined
                              ? `${Math.round(
                                  fusion.fusion_weights
                                    .ml * 100,
                                )}%`
                              : "—"}
                          </strong>
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">
                            Rule Engine
                          </span>

                          <strong className="text-slate-300">
                            {fusion.fusion_weights
                              .rule_engine !==
                            undefined
                              ? `${Math.round(
                                  fusion.fusion_weights
                                    .rule_engine * 100,
                                )}%`
                              : "—"}
                          </strong>
                        </div>
                      </div>
                    )}

                    {fusion.evidence &&
                      fusion.evidence.length > 0 && (
                        <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                          <div className="text-[9px] uppercase tracking-wider text-slate-600">
                            Fusion Evidence
                          </div>

                          <div className="mt-2 space-y-2">
                            {fusion.evidence
                              .slice(0, 5)
                              .map((item, index) => (
                                <div
                                  key={`${item.type ?? "evidence"}-${index}`}
                                  className="rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[9px] font-semibold uppercase text-slate-500">
                                      {item.type ??
                                        item.feature ??
                                        "Signal"}
                                    </span>

                                    {item.severity && (
                                      <span className="text-[9px] font-bold text-slate-400">
                                        {item.severity}
                                      </span>
                                    )}
                                  </div>

                                  {item.description && (
                                    <div className="mt-1 text-[10px] leading-4 text-slate-500">
                                      {item.description}
                                    </div>
                                  )}

                                  {item.value !==
                                    undefined && (
                                    <div className="mt-1 text-[9px] text-slate-400">
                                      Value:{" "}
                                      {String(
                                        item.value,
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                    <div className="mt-3 flex items-center justify-between text-[9px] text-slate-600">
                      <span>
                        Fusion status:{" "}
                        <strong className="text-slate-400">
                          {fusion.status}
                        </strong>
                      </span>

                      <span>
                        DB write:{" "}
                        <strong className="text-slate-400">
                          {fusion.database_write
                            ? "YES"
                            : "NO"}
                        </strong>
                      </span>
                    </div>

                    {fusion.signal_disagreement && (
                      <div className="mt-3 rounded-lg border border-yellow-500/15 bg-yellow-500/[0.05] px-3 py-2 text-[10px] leading-4 text-yellow-300">
                        ML and rule-engine signals
                        disagree. Operational review is
                        recommended rather than treating the
                        fused score as a guaranteed forecast.
                      </div>
                    )}

                    {fusion.warnings &&
                      fusion.warnings.length > 0 && (
                        <div className="mt-3 rounded-lg border border-orange-500/10 bg-orange-500/[0.04] px-3 py-2">
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-orange-400">
                            Model Notes
                          </div>

                          <div className="mt-1 space-y-1">
                            {fusion.warnings
                              .slice(0, 3)
                              .map((warning, index) => (
                                <div
                                  key={`${warning}-${index}`}
                                  className="text-[9px] leading-4 text-orange-300/70"
                                >
                                  • {warning}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                  </>
                ) : (
                  <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 text-xs text-slate-500">
                    {fusionError ??
                      (selected.risk_zone_id !== null
                        ? "Fusion assessment unavailable."
                        : "No risk zone is associated with this alert.")}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <DetailBox
                  label="Risk Level"
                  value={selected.risk_level}
                />

                <DetailBox
                  label="Priority"
                  value={selected.priority}
                />

                <DetailBox
                  label="Trigger"
                  value={selected.rainfall_trigger}
                />

                <DetailBox
                  label="Alert Type"
                  value={selected.alert_type}
                />

                <DetailBox
                  label="Source"
                  value={selected.source}
                />

                <DetailBox
                  label="Last Updated"
                  value={formatDateTime(
                    selected.updated_at,
                  )}
                />
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold">
                  Recommended Action
                </h3>

                <div className="mt-3 rounded-xl border border-orange-500/10 bg-orange-500/[0.04] p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-orange-500/10 p-2 text-orange-400">
                      <ShieldAlert size={16} />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-300">
                        Operational Response
                      </div>

                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {selected.recommended_action}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold">
                  Trigger Evidence
                </h3>

                <div className="mt-3 space-y-2">
                  <Evidence
                    icon={<CloudRain size={14} />}
                    label="Rainfall Trigger"
                    value={
                      selected.rainfall_trigger
                    }
                  />

                  <Evidence
                    icon={<TrendingUp size={14} />}
                    label="Alert Probability"
                    value={`${selected.probability_percent}%`}
                  />

                  <Evidence
                    icon={<Radio size={14} />}
                    label="Model Confidence"
                    value={selected.confidence}
                  />

                  <Evidence
                    icon={<Bell size={14} />}
                    label="Data Source"
                    value={selected.source}
                  />

                  <Evidence
                    icon={<ShieldAlert size={14} />}
                    label="Priority"
                    value={selected.priority}
                  />

                  {fusion && (
                    <Evidence
                      icon={<GitCompare size={14} />}
                      label="Fused Risk"
                      value={`${formatPercent(
                        fusion.final_probability,
                      )} • ${fusion.final_risk}`}
                    />
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2">
                {selected.status === "ACTIVE" && (
                  <>
                    <button
                      disabled={actionLoading}
                      onClick={() =>
                        void handleStatusChange(
                          selected.id,
                          "ACKNOWLEDGED",
                        )
                      }
                      className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 text-xs font-semibold text-blue-400 transition hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionLoading
                        ? "Updating..."
                        : "Acknowledge"}
                    </button>

                    <button
                      disabled={actionLoading}
                      onClick={() =>
                        void handleStatusChange(
                          selected.id,
                          "RESOLVED",
                        )
                      }
                      className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  </>
                )}

                {selected.status ===
                  "ACKNOWLEDGED" && (
                  <button
                    disabled={actionLoading}
                    onClick={() =>
                      void handleStatusChange(
                        selected.id,
                        "RESOLVED",
                      )
                    }
                    className="col-span-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionLoading
                      ? "Resolving..."
                      : "Resolve Alert"}
                  </button>
                )}

                {selected.status === "RESOLVED" && (
                  <button
                    disabled
                    className="col-span-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-slate-500"
                  >
                    Alert Resolved
                  </button>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between text-[10px] text-slate-600">
                <span>
                  Issued{" "}
                  {formatRelativeTime(
                    selected.created_at,
                  )}
                </span>

                <span>
                  ALT-
                  {String(selected.id).padStart(
                    3,
                    "0",
                  )}
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  className,
}: {
  label: string
  value: number
  icon: React.ReactNode
  className: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
      <div>
        <div className="text-xs text-slate-500">
          {label}
        </div>

        <div
          className={`mt-1 text-xl font-bold ${className}`}
        >
          {value}
        </div>
      </div>

      <div className={`${className} opacity-80`}>
        {icon}
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="appearance-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-3 pr-9 text-xs text-slate-300 outline-none"
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
            className="bg-[#081522]"
          >
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  )
}

function DetailBox({
  label,
  value,
  valueClass = "text-slate-300",
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div
        className={`mt-1 truncate text-xs font-semibold ${valueClass}`}
      >
        {value}
      </div>
    </div>
  )
}

function FusionSignalBox({
  label,
  probability,
  risk,
  confidence,
}: {
  label: string
  probability?: number
  risk?: string
  confidence?: string
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-base font-bold text-slate-200">
          {probability !== undefined
            ? formatPercent(probability)
            : "—"}
        </span>

        <span
          className={`text-[9px] font-bold ${getFusionRiskClass(
            risk,
          )}`}
        >
          {risk ?? "—"}
        </span>
      </div>

      <div className="mt-1 text-[9px] text-slate-600">
        Confidence:{" "}
        <span className="text-slate-400">
          {confidence ?? "—"}
        </span>
      </div>
    </div>
  )
}

function Evidence({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="text-slate-600">
          {icon}
        </span>

        {label}
      </div>

      <span className="max-w-[55%] truncate text-right text-xs font-semibold text-slate-300">
        {value}
      </span>
    </div>
  )
}