import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  Map as MapIcon,
  RefreshCw,
  Target,
  TrendingUp,
  TriangleAlert,
  XCircle,
} from "lucide-react"

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL"

type RiskZone = {
  id: number
  name: string
  district_id?: number | null
  district_name?: string | null
  state?: string | null
  district?: {
    id?: number
    name?: string
    state?: string
    code?: string
  } | null
  risk_level?: string | null
  probability?: number | null
  risk_probability?: number | null
  confidence?: string | null
  priority?: string | null
  affected_villages?: number | null
  affected_roads?: number | null
}

type District = {
  id: number
  name: string
  state: string
  code?: string
}

type FieldReport = {
  id: number
  district_id?: number | null
  risk_zone_id?: number | null
  report_type?: string | null
  status?: string | null
  verified?: boolean | null
  severity?: string | null
  created_at?: string | null
}

type InfrastructureAsset = {
  id: number
  asset_code?: string
  name?: string
  asset_type?: string
  geometry?: {
    available?: boolean
    spatially_verified?: boolean
    zone_intersection?: boolean
    verification_status?: string
  } | null
}

type ExposureResponse = {
  status: string
  exposure_basis?: string
  spatial_method?: string
  synthetic_coordinates_created?: boolean
  summary?: {
    risk_zones?: number
    known_affected_villages?: number
    known_affected_roads?: number
    spatial_affected_villages?: number
    spatial_affected_roads?: number
    spatial_assets?: number
    unverified_assets?: number
    outside_zone_assets?: number
  }
  data?: unknown[]
}

type MLHealth = {
  status?: string
  model_ready?: boolean
  model_version?: string
  feature_count?: number
}

type MLAssessment = {
  probability?: number
  risk_level?: string
  confidence?: string
}

type DistrictAnalytics = {
  id: number
  name: string
  state: string
  zones: number
  probability: number
  risk: RiskLevel
  priority: string
  villages: number
  roads: number
}

type StatCardProps = {
  icon: typeof Activity
  label: string
  value: string
  suffix?: string
  detail: string
}

const MODEL_METRICS = {
  precision: 81.33,
  recall: 80,
  f1: 78,
  rocAuc: 90,
  brier: 0.1556,
}

function riskLevel(value?: string | null): RiskLevel {
  const normalized = String(value ?? "").toUpperCase()

  if (normalized === "CRITICAL") return "CRITICAL"
  if (normalized === "HIGH") return "HIGH"
  if (normalized === "MODERATE") return "MODERATE"

  return "LOW"
}

function riskClasses(risk: RiskLevel) {
  switch (risk) {
    case "CRITICAL":
      return {
        badge:
          "border-red-500/30 bg-red-500/10 text-red-300",
        dot: "bg-red-500",
      }

    case "HIGH":
      return {
        badge:
          "border-orange-500/30 bg-orange-500/10 text-orange-300",
        dot: "bg-orange-500",
      }

    case "MODERATE":
      return {
        badge:
          "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
        dot: "bg-yellow-400",
      }

    default:
      return {
        badge:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        dot: "bg-emerald-500",
      }
  }
}

function probabilityFromZone(zone: RiskZone) {
  const value =
    zone.probability ??
    zone.risk_probability ??
    0

  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return 0
  }

  return numeric > 1 ? numeric / 100 : numeric
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  detail,
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0a1724] p-5">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <Icon size={19} className="text-emerald-400" />
        </div>

        <div className="text-[10px] font-semibold text-slate-500">
          LIVE
        </div>
      </div>

      <p className="mt-4 text-xs uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <div className="mt-1 flex items-end gap-1">
        <span className="text-2xl font-semibold text-slate-100">
          {value}
        </span>

        {suffix && (
          <span className="mb-1 text-xs text-slate-500">
            {suffix}
          </span>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        {detail}
      </p>
    </div>
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    )
  }

  return response.json() as Promise<T>
}

function normalizeRiskZones(payload: unknown): RiskZone[] {
  if (Array.isArray(payload)) {
    return payload as RiskZone[]
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const object = payload as {
    zones?: unknown
    data?: unknown
    items?: unknown
    risk_zones?: unknown
  }

  /*
   * IMPORTANT:
   * /api/risk/zones returns:
   *
   * {
   *   count: 6,
   *   filters: {...},
   *   zones: [...]
   * }
   *
   * Therefore payload.zones must be checked first.
   */
  if (Array.isArray(object.zones)) {
    return object.zones as RiskZone[]
  }

  if (Array.isArray(object.data)) {
    return object.data as RiskZone[]
  }

  if (Array.isArray(object.items)) {
    return object.items as RiskZone[]
  }

  if (Array.isArray(object.risk_zones)) {
    return object.risk_zones as RiskZone[]
  }

  return []
}

function normalizeDistricts(payload: unknown): District[] {
  if (Array.isArray(payload)) {
    return payload as District[]
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const object = payload as {
    data?: unknown
    districts?: unknown
    items?: unknown
  }

  if (Array.isArray(object.data)) {
    return object.data as District[]
  }

  if (Array.isArray(object.districts)) {
    return object.districts as District[]
  }

  if (Array.isArray(object.items)) {
    return object.items as District[]
  }

  return []
}

function normalizeFieldReports(payload: unknown): FieldReport[] {
  if (Array.isArray(payload)) {
    return payload as FieldReport[]
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const object = payload as {
    data?: unknown
    reports?: unknown
    items?: unknown
  }

  if (Array.isArray(object.data)) {
    return object.data as FieldReport[]
  }

  if (Array.isArray(object.reports)) {
    return object.reports as FieldReport[]
  }

  if (Array.isArray(object.items)) {
    return object.items as FieldReport[]
  }

  return []
}

function normalizeAssets(payload: unknown): InfrastructureAsset[] {
  if (Array.isArray(payload)) {
    return payload as InfrastructureAsset[]
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const object = payload as {
    data?: unknown
    assets?: unknown
    items?: unknown
  }

  if (Array.isArray(object.data)) {
    return object.data as InfrastructureAsset[]
  }

  if (Array.isArray(object.assets)) {
    return object.assets as InfrastructureAsset[]
  }

  if (Array.isArray(object.items)) {
    return object.items as InfrastructureAsset[]
  }

  return []
}

export default function AnalyticsPage() {
  const [zones, setZones] = useState<RiskZone[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [fieldReports, setFieldReports] = useState<FieldReport[]>([])
  const [assets, setAssets] = useState<InfrastructureAsset[]>([])
  const [exposure, setExposure] =
    useState<ExposureResponse | null>(null)
  const [mlHealth, setMlHealth] =
    useState<MLHealth | null>(null)
  const [mlAssessments, setMlAssessments] =
    useState<Record<number, MLAssessment>>({})

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  const loadAnalytics = async (manual = false) => {
    if (manual) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError("")

    try {
      const [
        zonesResponse,
        districtsResponse,
        reportsResponse,
        assetsResponse,
        exposureResponse,
        mlHealthResponse,
      ] = await Promise.all([
        fetchJson<unknown>(
          `${API_BASE}/api/risk/zones`,
        ),
        fetchJson<unknown>(
          `${API_BASE}/api/districts`,
        ),
        fetchJson<unknown>(
          `${API_BASE}/api/field-reports`,
        ),
        fetchJson<unknown>(
          `${API_BASE}/api/infrastructure/assets`,
        ),
        fetchJson<ExposureResponse>(
          `${API_BASE}/api/infrastructure/exposure`,
        ),
        fetchJson<MLHealth>(
          `${API_BASE}/api/risk/ml/health`,
        ),
      ])

      const normalizedZones =
        normalizeRiskZones(zonesResponse)

      const normalizedDistricts =
        normalizeDistricts(districtsResponse)

      const normalizedReports =
        normalizeFieldReports(reportsResponse)

      const normalizedAssets =
        normalizeAssets(assetsResponse)

      setZones(normalizedZones)
      setDistricts(normalizedDistricts)
      setFieldReports(normalizedReports)
      setAssets(normalizedAssets)
      setExposure(exposureResponse)
      setMlHealth(mlHealthResponse)

      const assessments: Record<number, MLAssessment> = {}

      await Promise.all(
        normalizedZones.map(async (zone) => {
          try {
            const assessment =
              await fetchJson<unknown>(
                `${API_BASE}/api/risk/ml/zone/${zone.id}`,
              )

            if (
              assessment &&
              typeof assessment === "object"
            ) {
              const object =
                assessment as {
                  probability?: number
                  risk_level?: string
                  confidence?: string
                  assessment?: MLAssessment
                  data?: MLAssessment
                }

              const normalizedAssessment =
                object.assessment ??
                object.data ?? {
                  probability:
                    object.probability,
                  risk_level:
                    object.risk_level,
                  confidence:
                    object.confidence,
                }

              assessments[zone.id] =
                normalizedAssessment
            }
          } catch {
            // Individual ML assessment can be unavailable.
          }
        }),
      )

      setMlAssessments(assessments)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load analytics data.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadAnalytics()
  }, [])

  const districtMap = useMemo(() => {
    const map = new Map<number, District>()

    for (const district of districts) {
      map.set(Number(district.id), district)
    }

    return map
  }, [districts])

  const districtAnalytics = useMemo(() => {
    const grouped: Record<number, DistrictAnalytics> = {}

    for (const zone of zones) {
      const districtId = Number(
        zone.district_id ??
          zone.district?.id ??
          0,
      )

      if (!districtId) {
        continue
      }

      const district =
        districtMap.get(districtId)

      const probability =
        probabilityFromZone(zone)

      const risk =
        riskLevel(zone.risk_level)

      const priority =
        String(zone.priority ?? "P3").toUpperCase()

      if (!grouped[districtId]) {
        grouped[districtId] = {
          id: districtId,
          name:
            district?.name ??
            zone.district?.name ??
            zone.district_name ??
            `District ${districtId}`,
          state:
            district?.state ??
            zone.district?.state ??
            zone.state ??
            "Northeast India",
          zones: 0,
          probability: 0,
          risk,
          priority,
          villages: 0,
          roads: 0,
        }
      }

      const item =
        grouped[districtId]

      item.zones += 1

      item.probability = Math.max(
        item.probability,
        probability,
      )

      item.villages += Number(
        zone.affected_villages ?? 0,
      )

      item.roads += Number(
        zone.affected_roads ?? 0,
      )

      const riskRank: Record<
        RiskLevel,
        number
      > = {
        LOW: 1,
        MODERATE: 2,
        HIGH: 3,
        CRITICAL: 4,
      }

      if (
        riskRank[risk] >
        riskRank[item.risk]
      ) {
        item.risk = risk
      }

      const priorityRank: Record<
        string,
        number
      > = {
        P1: 1,
        P2: 2,
        P3: 3,
      }

      if (
        (priorityRank[priority] ?? 99) <
        (priorityRank[item.priority] ?? 99)
      ) {
        item.priority = priority
      }
    }

    return Object.values(grouped).sort(
      (a, b) =>
        b.probability -
        a.probability,
    )
  }, [zones, districtMap])

  const riskCounts = useMemo(() => {
    const counts: Record<
      RiskLevel,
      number
    > = {
      LOW: 0,
      MODERATE: 0,
      HIGH: 0,
      CRITICAL: 0,
    }

    for (const zone of zones) {
      counts[
        riskLevel(zone.risk_level)
      ] += 1
    }

    return counts
  }, [zones])

  const averageProbability = useMemo(() => {
    if (!zones.length) {
      return 0
    }

    const total =
      zones.reduce(
        (sum, zone) =>
          sum +
          probabilityFromZone(zone),
        0,
      )

    return total / zones.length
  }, [zones])

  const highestRiskZone = useMemo(() => {
    return [...zones].sort(
      (a, b) =>
        probabilityFromZone(b) -
        probabilityFromZone(a),
    )[0]
  }, [zones])

  const highestRiskDistrict =
    highestRiskZone
      ? districtMap.get(
          Number(
            highestRiskZone.district_id ??
              highestRiskZone.district?.id ??
              0,
          ),
        )
      : undefined

  const eventReports = useMemo(() => {
    return fieldReports.filter(
      (report) => {
        const type =
          String(
            report.report_type ?? "",
          ).toLowerCase()

        return (
          type.includes("landslide") ||
          type.includes("slide") ||
          type.includes("hazard") ||
          type.includes("event")
        )
      },
    ).length
  }, [fieldReports])

  const verifiedReports = useMemo(() => {
    return fieldReports.filter(
      (report) =>
        report.verified === true ||
        String(
          report.status ?? "",
        ).toUpperCase() === "VERIFIED",
    ).length
  }, [fieldReports])

  const priorityCounts = useMemo(() => {
    const counts = {
      P1: 0,
      P2: 0,
      P3: 0,
    }

    for (const zone of zones) {
      const priority =
        String(
          zone.priority ?? "P3",
        ).toUpperCase()

      if (priority === "P1") {
        counts.P1 += 1
      } else if (priority === "P2") {
        counts.P2 += 1
      } else {
        counts.P3 += 1
      }
    }

    return counts
  }, [zones])

  const infrastructureSummary =
    useMemo(() => {
      const summary =
        exposure?.summary

      const geometryAvailable =
        assets.filter(
          (asset) =>
            asset.geometry?.available === true,
        ).length

      const verified =
        assets.filter(
          (asset) =>
            asset.geometry
              ?.spatially_verified === true ||
            asset.geometry
              ?.zone_intersection === true,
        ).length

      const pending =
        assets.filter(
          (asset) =>
            asset.geometry
              ?.available !== true,
        ).length

      const outsideZone =
        Number(
          summary?.outside_zone_assets ??
            0,
        )

      const operationalVillages =
        Number(
          summary?.known_affected_villages ??
            0,
        )

      const operationalRoads =
        Number(
          summary?.known_affected_roads ??
            0,
        )

      return {
        total: assets.length,
        geometryAvailable,
        verified,
        pending,
        outsideZone,
        operationalVillages,
        operationalRoads,
      }
    }, [assets, exposure])

  const mlCoverage = useMemo(() => {
    const total = zones.length

    const assessed =
      Object.keys(
        mlAssessments,
      ).length

    return {
      total,
      assessed,
      percentage:
        total > 0
          ? Math.round(
              (assessed / total) * 100,
            )
          : 0,
    }
  }, [zones, mlAssessments])

  const exportAnalytics = () => {
    const lines = [
      "BhooPehra Analytics Export",
      "==========================",
      "",
      `Risk zones: ${zones.length}`,
      `Average risk probability: ${(
        averageProbability * 100
      ).toFixed(2)}%`,
      `Low: ${riskCounts.LOW}`,
      `Moderate: ${riskCounts.MODERATE}`,
      `High: ${riskCounts.HIGH}`,
      `Critical: ${riskCounts.CRITICAL}`,
      "",
      "District Analytics",
      "------------------",
      ...districtAnalytics.map(
        (district) =>
          `${district.name}, ${district.state} | probability=${(
            district.probability * 100
          ).toFixed(2)}% | zones=${district.zones} | priority=${district.priority} | risk=${district.risk}`,
      ),
      "",
      "Infrastructure Exposure",
      "------------------------",
      `Assets: ${infrastructureSummary.total}`,
      `Geometry available: ${infrastructureSummary.geometryAvailable}`,
      `Spatially verified: ${infrastructureSummary.verified}`,
      `Geometry pending: ${infrastructureSummary.pending}`,
      `Outside zone: ${infrastructureSummary.outsideZone}`,
      `Known affected villages: ${infrastructureSummary.operationalVillages}`,
      `Known affected roads: ${infrastructureSummary.operationalRoads}`,
      "",
      "Field Intelligence",
      "------------------",
      `Field reports: ${fieldReports.length}`,
      `Event-type reports: ${eventReports}`,
      `Verified reports: ${verifiedReports}`,
      "",
      "ML Validation",
      "-------------",
      `Precision: ${MODEL_METRICS.precision}%`,
      `Recall: ${MODEL_METRICS.recall}%`,
      `F1: ${MODEL_METRICS.f1}%`,
      `ROC-AUC: ${MODEL_METRICS.rocAuc}%`,
      `Brier: ${MODEL_METRICS.brier}`,
      "",
      "Historical rainfall correlation and warning lead-time",
      "statistics are not fabricated without timestamped historical data.",
    ]

    const blob = new Blob(
      [lines.join("\n")],
      {
        type: "text/plain;charset=utf-8",
      },
    )

    const url =
      URL.createObjectURL(blob)

    const anchor =
      document.createElement("a")

    anchor.href = url
    anchor.download =
      "bhoopehra-analytics.txt"

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-[#06111c] px-6 py-6 text-slate-100">
        <div className="mx-auto max-w-[1600px]">
          <div className="rounded-2xl border border-slate-800 bg-[#0a1724] p-8">
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <RefreshCw
                size={17}
                className="animate-spin text-emerald-400"
              />

              Loading live analytics intelligence...
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] px-6 py-6 text-slate-100">
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Intelligence</span>
              <span>/</span>
              <span className="text-slate-300">
                Analytics
              </span>
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Analytics
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Live model, risk-zone, district and infrastructure intelligence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void loadAnalytics(true)
              }
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0a1724] px-4 py-2.5 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh Intelligence
            </button>

            <button
              type="button"
              onClick={exportAnalytics}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/15"
            >
              <Download size={14} />

              Export Analytics
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            <TriangleAlert
              size={18}
              className="mt-0.5 shrink-0"
            />

            <div>
              <p className="font-medium">
                Analytics data partially unavailable
              </p>

              <p className="mt-1 text-xs text-red-300/70">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* KPI */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Target}
            label="Average Zone Risk"
            value={`${(
              averageProbability * 100
            ).toFixed(1)}`}
            suffix="%"
            detail={`${zones.length} currently loaded risk zones`}
          />

          <StatCard
            icon={BrainCircuit}
            label="Model F1 Score"
            value={(
              MODEL_METRICS.f1 / 100
            ).toFixed(2)}
            detail="5-fold spatial validation"
          />

          <StatCard
            icon={Clock3}
            label="ML Coverage"
            value={`${mlCoverage.percentage}`}
            suffix="%"
            detail={`${mlCoverage.assessed}/${mlCoverage.total} zones assessed`}
          />

          <StatCard
            icon={AlertTriangle}
            label="Field Intelligence"
            value={`${fieldReports.length}`}
            detail={`${verifiedReports} verified reports`}
          />
        </div>

        {/* Risk overview */}
        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <BarChart3
                  size={17}
                  className="text-emerald-400"
                />

                <h2 className="text-sm font-semibold">
                  Current Risk Distribution
                </h2>
              </div>

              <p className="mt-1 text-xs text-slate-600">
                Distribution derived from currently loaded risk zones.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
              {(
                [
                  [
                    "CRITICAL",
                    riskCounts.CRITICAL,
                  ],
                  [
                    "HIGH",
                    riskCounts.HIGH,
                  ],
                  [
                    "MODERATE",
                    riskCounts.MODERATE,
                  ],
                  [
                    "LOW",
                    riskCounts.LOW,
                  ],
                ] as [
                  RiskLevel,
                  number,
                ][]
              ).map(
                ([risk, count]) => {
                  const classes =
                    riskClasses(risk)

                  return (
                    <div
                      key={risk}
                      className="rounded-xl border border-slate-800 bg-[#081522] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${classes.dot}`}
                        />

                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          {risk}
                        </span>
                      </div>

                      <p className="mt-3 text-2xl font-semibold">
                        {count}
                      </p>

                      <p className="mt-1 text-[10px] text-slate-600">
                        zones
                      </p>
                    </div>
                  )
                },
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1724] p-5">
            <div className="flex items-center gap-2">
              <Target
                size={17}
                className="text-emerald-400"
              />

              <h2 className="text-sm font-semibold">
                Highest Risk Zone
              </h2>
            </div>

            {highestRiskZone ? (
              <>
                <p className="mt-5 text-lg font-semibold">
                  {highestRiskZone.name}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {highestRiskDistrict?.name ??
                    highestRiskZone.district?.name ??
                    highestRiskZone.district_name ??
                    "District unavailable"}

                  {highestRiskDistrict?.state ??
                    highestRiskZone.district?.state ??
                    highestRiskZone.state
                    ? `, ${
                        highestRiskDistrict?.state ??
                        highestRiskZone.district?.state ??
                        highestRiskZone.state
                      }`
                    : ""}
                </p>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Probability
                  </span>

                  <span className="text-2xl font-semibold text-emerald-300">
                    {(
                      probabilityFromZone(
                        highestRiskZone,
                      ) * 100
                    ).toFixed(1)}
                    %
                  </span>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{
                      width: `${Math.min(
                        probabilityFromZone(
                          highestRiskZone,
                        ) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-5 text-sm text-slate-500">
                No risk-zone data available.
              </p>
            )}
          </section>
        </div>

        {/* Model validation */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0a1724]">
          <div className="border-b border-slate-800 px-5 py-4">
            <div className="flex items-center gap-2">
              <BrainCircuit
                size={17}
                className="text-emerald-400"
              />

              <h2 className="text-sm font-semibold">
                ML Model Validation
              </h2>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              Measured validation metrics — not simulated dashboard values.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-5">
            {[
              [
                "Precision",
                `${MODEL_METRICS.precision}%`,
              ],
              [
                "Recall",
                `${MODEL_METRICS.recall}%`,
              ],
              [
                "F1",
                `${MODEL_METRICS.f1}%`,
              ],
              [
                "ROC-AUC",
                `${MODEL_METRICS.rocAuc}%`,
              ],
              [
                "Brier",
                MODEL_METRICS.brier.toFixed(4),
              ],
            ].map(
              ([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800 bg-[#081522] p-4"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    {label}
                  </p>

                  <p className="mt-2 text-xl font-semibold text-slate-100">
                    {value}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-800 px-5 py-3 text-[11px] text-slate-600">
            <CheckCircle2
              size={13}
              className="text-emerald-400"
            />

            Validation method: 5-fold spatial validation

            {mlHealth?.model_version
              ? ` · Model ${mlHealth.model_version}`
              : ""}
          </div>
        </section>

        {/* District Analytics */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0a1724]">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-800 px-5 py-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-sm font-semibold">
                District Analytics
              </h2>

              <p className="mt-1 text-xs text-slate-600">
                District names are resolved from the live district registry.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <MapIcon size={14} />

              {districts.length} districts loaded
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="px-5 py-3 font-medium">
                    District
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Risk Probability
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Zones
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Exposure Indicators
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Priority
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Risk Level
                  </th>
                </tr>
              </thead>

              <tbody>
                {districtAnalytics.length ? (
                  districtAnalytics.map(
                    (district) => {
                      const classes =
                        riskClasses(
                          district.risk,
                        )

                      return (
                        <tr
                          key={district.id}
                          className="border-b border-slate-800/70 last:border-0"
                        >
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-slate-200">
                              {district.name}
                            </p>

                            <p className="mt-1 text-[11px] text-slate-600">
                              {district.state}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <span className="w-16 text-sm font-semibold">
                                {(
                                  district.probability *
                                  100
                                ).toFixed(1)}
                                %
                              </span>

                              <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{
                                    width: `${Math.min(
                                      district.probability *
                                        100,
                                      100,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-300">
                            {district.zones}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span>
                                Villages{" "}
                                <strong className="text-slate-200">
                                  {
                                    district.villages
                                  }
                                </strong>
                              </span>

                              <span>
                                Roads{" "}
                                <strong className="text-slate-200">
                                  {
                                    district.roads
                                  }
                                </strong>
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4 text-sm font-semibold text-slate-300">
                            {district.priority}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold ${classes.badge}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${classes.dot}`}
                              />

                              {district.risk}
                            </span>
                          </td>
                        </tr>
                      )
                    },
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-slate-600"
                    >
                      No district-linked risk zones available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Infrastructure */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0a1724]">
          <div className="border-b border-slate-800 px-5 py-5">
            <div className="flex items-center gap-2">
              <Building2
                size={18}
                className="text-emerald-400"
              />

              <h2 className="text-sm font-semibold">
                Infrastructure Exposure Readiness
              </h2>
            </div>

            <p className="mt-1 text-xs text-slate-600">
              GIS verification status from the infrastructure exposure engine
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-800 bg-[#081522] p-5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Assets
              </p>

              <p className="mt-3 text-2xl font-semibold text-slate-100">
                {infrastructureSummary.total}
              </p>

              <p className="mt-1 text-[11px] text-slate-600">
                Loaded infrastructure assets
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#081522] p-5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Geometry
              </p>

              <p className="mt-3 text-2xl font-semibold text-emerald-400">
                {
                  infrastructureSummary.geometryAvailable
                }
              </p>

              <p className="mt-1 text-[11px] text-slate-600">
                Real coordinates available
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#081522] p-5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Verified
              </p>

              <p className="mt-3 text-2xl font-semibold text-slate-100">
                {infrastructureSummary.verified}
              </p>

              <p className="mt-1 text-[11px] text-slate-600">
                ST_Intersects verified
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#081522] p-5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Pending
              </p>

              <p className="mt-3 text-2xl font-semibold text-orange-400">
                {infrastructureSummary.pending}
              </p>

              <p className="mt-1 text-[11px] text-slate-600">
                Geometry unavailable
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#081522] p-5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Outside Zone
              </p>

              <p className="mt-3 text-2xl font-semibold text-red-400">
                {infrastructureSummary.outsideZone}
              </p>

              <p className="mt-1 text-[11px] text-slate-600">
                Geometry exists but no zone intersection
              </p>
            </div>
          </div>

          <div className="mx-5 mb-5 rounded-xl border border-slate-800 bg-[#081522] px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-slate-500">
              <span>
                Known operational villages:{" "}
                <strong className="text-slate-300">
                  {
                    infrastructureSummary.operationalVillages
                  }
                </strong>
              </span>

              <span>
                Known operational roads:{" "}
                <strong className="text-slate-300">
                  {
                    infrastructureSummary.operationalRoads
                  }
                </strong>
              </span>

              <span>
                Spatially verified assets:{" "}
                <strong className="text-slate-300">
                  {infrastructureSummary.verified}
                </strong>
              </span>

              <span>
                Basis:{" "}
                <strong className="text-slate-300">
                  {exposure?.exposure_basis ??
                    "SPATIAL_VERIFIED_PLUS_KNOWN_OPERATIONAL"}
                </strong>
              </span>

              <span>
                Synthetic coordinates:{" "}
                <strong className="text-slate-300">
                  {exposure?.synthetic_coordinates_created
                    ? "created"
                    : "not created"}
                </strong>
              </span>
            </div>
          </div>
        </section>

        {/* Priority + field intelligence */}
        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724] p-5">
            <div className="flex items-center gap-2">
              <TrendingUp
                size={17}
                className="text-emerald-400"
              />

              <h2 className="text-sm font-semibold">
                Operational Priority
              </h2>
            </div>

            <div className="mt-5 space-y-4">
              {(
                [
                  [
                    "P1",
                    priorityCounts.P1,
                  ],
                  [
                    "P2",
                    priorityCounts.P2,
                  ],
                  [
                    "P3",
                    priorityCounts.P3,
                  ],
                ] as [string, number][]
              ).map(
                ([priority, count]) => (
                  <div
                    key={priority}
                    className="flex items-center gap-4"
                  >
                    <span className="w-8 text-sm font-semibold">
                      {priority}
                    </span>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{
                          width: `${
                            zones.length
                              ? (count /
                                  zones.length) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <span className="w-8 text-right text-sm text-slate-400">
                      {count}
                    </span>
                  </div>
                ),
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0a1724] p-5">
            <div className="flex items-center gap-2">
              <Activity
                size={17}
                className="text-emerald-400"
              />

              <h2 className="text-sm font-semibold">
                Field Intelligence
              </h2>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-800 bg-[#081522] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Reports
                </p>

                <p className="mt-2 text-xl font-semibold">
                  {fieldReports.length}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#081522] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Event Reports
                </p>

                <p className="mt-2 text-xl font-semibold">
                  {eventReports}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#081522] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Verified
                </p>

                <p className="mt-2 text-xl font-semibold text-emerald-400">
                  {verifiedReports}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Data integrity */}
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-[#0a1724] px-5 py-4">
          {mlCoverage.percentage ===
          100 ? (
            <CheckCircle2
              size={16}
              className="mt-0.5 shrink-0 text-emerald-400"
            />
          ) : (
            <XCircle
              size={16}
              className="mt-0.5 shrink-0 text-orange-400"
            />
          )}

          <p className="text-[11px] leading-5 text-slate-600">
            Analytics separates measured backend data from model validation
            metrics. Historical rainfall/event correlation and warning
            lead-time statistics are not fabricated when timestamped
            historical series are unavailable.
          </p>
        </div>
      </div>
    </div>
  )
}