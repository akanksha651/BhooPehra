import {
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

type RiskLevel =
  | "CRITICAL"
  | "HIGH"
  | "MODERATE"
  | "LOW"
  | "UNKNOWN"

type RiskZone = {
  id: number
  name: string
  district?: string
  state?: string
  risk_level?: string
  probability?: number
  confidence?: string
  rainfall_trigger?: string
  priority?: string
}

type RiskApiResponse = {
  count?: number
  data?: RiskZone[]
  zones?: RiskZone[]
}

function normalizeRiskLevel(
  value?: string,
): RiskLevel {
  const normalized = String(
    value ?? "",
  )
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

function probabilityPercent(
  probability?: number,
): number | null {
  if (
    typeof probability !== "number" ||
    !Number.isFinite(probability)
  ) {
    return null
  }

  return probability <= 1
    ? probability * 100
    : probability
}

function riskRank(
  level: RiskLevel,
): number {
  switch (level) {
    case "CRITICAL":
      return 4

    case "HIGH":
      return 3

    case "MODERATE":
      return 2

    case "LOW":
      return 1

    default:
      return 0
  }
}

function riskColor(
  level: RiskLevel,
): string {
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

function riskBackground(
  level: RiskLevel,
): string {
  switch (level) {
    case "CRITICAL":
      return "bg-red-500/10"

    case "HIGH":
      return "bg-orange-500/10"

    case "MODERATE":
      return "bg-yellow-500/10"

    case "LOW":
      return "bg-emerald-500/10"

    default:
      return "bg-slate-500/10"
  }
}

function riskBorder(
  level: RiskLevel,
): string {
  switch (level) {
    case "CRITICAL":
      return "border-red-500/20"

    case "HIGH":
      return "border-orange-500/20"

    case "MODERATE":
      return "border-yellow-500/20"

    case "LOW":
      return "border-emerald-500/20"

    default:
      return "border-slate-700"
  }
}

function getTrend(
  level: RiskLevel,
): {
  label: string
  className: string
} {
  if (
    level === "CRITICAL" ||
    level === "HIGH"
  ) {
    return {
      label: "Elevated",
      className:
        "bg-orange-500/10 text-orange-400",
    }
  }

  if (level === "MODERATE") {
    return {
      label: "Moderate",
      className:
        "bg-yellow-500/10 text-yellow-400",
    }
  }

  return {
    label: "Stable",
    className:
      "bg-emerald-500/10 text-emerald-400",
  }
}

export default function RiskStatusCard() {
  const [zones, setZones] =
    useState<RiskZone[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState("")

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null)

  const loadRiskStatus =
    useCallback(async () => {
      try {
        setLoading(true)
        setError("")

        const response = await fetch(
          `${API_BASE_URL}/api/risk/zones`,
          {
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error(
            `Risk API returned HTTP ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as RiskApiResponse

        const availableZones =
          payload.data ??
          payload.zones ??
          []

        setZones(
          Array.isArray(
            availableZones,
          )
            ? availableZones
            : [],
        )

        setLastUpdated(
          new Date(),
        )
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load risk status.",
        )
      } finally {
        setLoading(false)
      }
    }, [])

  useEffect(() => {
    void loadRiskStatus()

    const interval =
      window.setInterval(
        () => {
          void loadRiskStatus()
        },
        60000,
      )

    return () =>
      window.clearInterval(
        interval,
      )
  }, [loadRiskStatus])

  const riskSummary =
    useMemo(() => {
      let critical = 0
      let high = 0
      let moderate = 0
      let low = 0
      let unknown = 0

      for (const zone of zones) {
        const level =
          normalizeRiskLevel(
            zone.risk_level,
          )

        if (level === "CRITICAL") {
          critical += 1
        } else if (level === "HIGH") {
          high += 1
        } else if (
          level === "MODERATE"
        ) {
          moderate += 1
        } else if (level === "LOW") {
          low += 1
        } else {
          unknown += 1
        }
      }

      return {
        critical,
        high,
        moderate,
        low,
        unknown,
      }
    }, [zones])

  const overallRisk =
    useMemo<RiskLevel>(() => {
      if (zones.length === 0) {
        return "UNKNOWN"
      }

      return zones.reduce(
        (
          highest,
          zone,
        ) => {
          const current =
            normalizeRiskLevel(
              zone.risk_level,
            )

          if (
            riskRank(current) >
            riskRank(highest)
          ) {
            return current
          }

          return highest
        },
        "LOW" as RiskLevel,
      )
    }, [zones])

  const highestProbability =
    useMemo(() => {
      const values = zones
        .map((zone) => {
          const probability =
            probabilityPercent(
              zone.probability,
            )

          if (
            probability === null
          ) {
            return null
          }

          return {
            zone,
            probability,
          }
        })
        .filter(
          (
            item,
          ): item is {
            zone: RiskZone
            probability: number
          } => item !== null,
        )

      if (values.length === 0) {
        return null
      }

      return values.reduce(
        (
          highest,
          current,
        ) => {
          if (
            current.probability >
            highest.probability
          ) {
            return current
          }

          return highest
        },
      )
    }, [zones])

  const highRiskLocations =
    riskSummary.critical +
    riskSummary.high

  const trend =
    getTrend(overallRisk)

  const updatedText =
    lastUpdated
      ? lastUpdated.toLocaleTimeString(
          "en-IN",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        )
      : "--"

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0a1926] p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Overall Risk
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-500/10">
                <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
              </div>

              <div>
                <p className="text-xl font-bold text-slate-300">
                  Loading
                </p>

                <p className="text-xs text-slate-600">
                  Fetching live risk zones
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Activity size={13} />
            Connecting to BhooPehra risk engine...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-orange-500/20 bg-[#0a1926] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
            <AlertTriangle
              size={19}
              className="text-orange-400"
            />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Overall Risk
            </p>

            <p className="mt-2 text-lg font-bold text-orange-400">
              Data unavailable
            </p>

            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              {error}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadRiskStatus()
          }
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs text-slate-400 transition hover:text-white"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </div>
    )
  }

  if (zones.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0a1926] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10">
            <ShieldAlert
              size={19}
              className="text-slate-500"
            />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Overall Risk
            </p>

            <p className="mt-2 text-xl font-bold text-slate-400">
              No data
            </p>

            <p className="mt-1 text-xs text-slate-600">
              No monitored risk zones returned by the API.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadRiskStatus()
          }
          className="mt-4 flex items-center gap-2 text-xs text-slate-500 transition hover:text-white"
        >
          <RefreshCw size={12} />
          Refresh data
        </button>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border bg-[#0a1926] p-5 ${riskBorder(
        overallRisk,
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Overall Baseline Risk
          </p>

          <div className="mt-3 flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${riskBackground(
                overallRisk,
              )}`}
            >
              <AlertTriangle
                className={`h-6 w-6 ${riskColor(
                  overallRisk,
                )}`}
              />
            </div>

            <div>
              <p
                className={`text-2xl font-bold ${riskColor(
                  overallRisk,
                )}`}
              >
                {overallRisk}
              </p>

              <p className="text-xs text-slate-500">
                Highest monitored zone level
              </p>
            </div>
          </div>
        </div>

        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${trend.className}`}
        >
          <Activity className="h-3 w-3" />
          {trend.label}
        </span>
      </div>

      <div className="mt-5 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            High / critical zones
          </span>

          <span
            className={`text-sm font-semibold ${
              highRiskLocations > 0
                ? "text-orange-400"
                : "text-emerald-400"
            }`}
          >
            {highRiskLocations}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Monitored risk zones
          </span>

          <span className="text-sm font-semibold text-white">
            {zones.length}
          </span>
        </div>

        {highestProbability && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Highest baseline probability
            </span>

            <span
              className={`text-sm font-semibold ${riskColor(
                normalizeRiskLevel(
                  highestProbability
                    .zone
                    .risk_level,
                ),
              )}`}
            >
              {highestProbability.probability.toFixed(
                1,
              )}
              %
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-[9px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <Clock3 size={11} />
          Synced {updatedText}
        </span>

        <span className="font-medium text-emerald-500">
          LIVE API
        </span>
      </div>
    </div>
  )
}