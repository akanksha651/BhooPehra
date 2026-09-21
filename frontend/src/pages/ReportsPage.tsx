import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudRain,
  Download,
  FileBarChart,
  FileText,
  MapPin,
  Printer,
  RefreshCw,
  Route,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

type ReportType =
  | "Situation Report"
  | "Risk Assessment"
  | "Infrastructure Exposure"
  | "Field Activity"

type Priority = "P1" | "P2" | "P3"

type RiskZone = {
  id: number
  name: string
  risk_level: string
  probability: number
  confidence?: string
  priority?: string
  rainfall_trigger?: string
  affected_villages?: number
  affected_roads?: number
  district?: {
    id?: number
    name?: string
    state?: string
  }
  risk_engine?: {
    rainfall_observation?: {
      rainfall_1h?: number
      rainfall_24h?: number
      rainfall_48h?: number
      rainfall_72h?: number
      antecedent_rainfall?: number
      soil_moisture?: number
      trigger_level?: string
      source?: string
      observed_at?: string
    }
  }
}

type InfrastructureSummary = {
  total_assets?: number
  geometry_available?: number
  spatially_verified?: number
  geometry_pending?: number
  outside_zone?: number
  synthetic_coordinates_created?: boolean
  known_affected_villages?: number
  known_affected_roads?: number
  spatial_affected_villages?: number
  spatial_affected_roads?: number
  spatial_assets?: number
  unverified_assets?: number
  outside_zone_assets?: number
  critical_assets?: number
  high_assets?: number
}

type FieldReport = {
  id: number
  report_code?: string
  title?: string
  reporter?: string
  location?: string
  district?: string
  state?: string
  district_id?: number | null
  severity?: string
  status?: string
  hazard?: string
  description?: string
  submitted_at?: string
  created_at?: string
  photo_count?: number
}

type ReportRecord = {
  id: string
  title: string
  type: ReportType
  region: string
  generated: string
  author: string
  status: "READY" | "DRAFT"
}

type IntelligenceData = {
  zones: RiskZone[]
  infrastructure: InfrastructureSummary
  fieldReports: FieldReport[]
  refreshedAt: string
}

const REPORT_TYPES: ReportType[] = [
  "Situation Report",
  "Risk Assessment",
  "Infrastructure Exposure",
  "Field Activity",
]

const REGIONS = [
  "Northeast India",
  "Sikkim",
  "Arunachal Pradesh",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
]

const REPORT_ARCHIVE: ReportRecord[] = [
  {
    id: "SIT-LIVE",
    title: "Northeast Landslide Situation Report",
    type: "Situation Report",
    region: "Northeast India",
    generated: "Live",
    author: "BhooPehra Intelligence Engine",
    status: "READY",
  },
  {
    id: "RSK-LIVE",
    title: "Regional Risk Assessment",
    type: "Risk Assessment",
    region: "Northeast India",
    generated: "Live",
    author: "Risk Intelligence",
    status: "READY",
  },
  {
    id: "INF-LIVE",
    title: "Critical Infrastructure Exposure",
    type: "Infrastructure Exposure",
    region: "Northeast India",
    generated: "Live",
    author: "Impact Engine",
    status: "READY",
  },
  {
    id: "FLD-LIVE",
    title: "Field Activity Summary",
    type: "Field Activity",
    region: "Northeast India",
    generated: "Live",
    author: "Ground Intelligence",
    status: "READY",
  },
]

const riskStyles: Record<
  string,
  {
    text: string
    bg: string
  }
> = {
  CRITICAL: {
    text: "text-red-400",
    bg: "bg-red-500/10",
  },
  HIGH: {
    text: "text-orange-400",
    bg: "bg-orange-500/10",
  },
  MODERATE: {
    text: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  LOW: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
}

function normalizeRiskLevel(value: unknown): string {
  return String(value ?? "LOW").toUpperCase()
}

function getRiskStyle(level: string) {
  return (
    riskStyles[normalizeRiskLevel(level)] ?? {
      text: "text-slate-400",
      bg: "bg-slate-500/10",
    }
  )
}

function getRiskRank(value: string): number {
  const ranks: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MODERATE: 2,
    LOW: 1,
  }

  return ranks[normalizeRiskLevel(value)] ?? 0
}

function getPriority(probability: number): Priority {
  const normalized =
    probability <= 1
      ? probability
      : probability / 100

  if (normalized >= 0.8) {
    return "P1"
  }

  if (normalized >= 0.6) {
    return "P2"
  }

  return "P3"
}

function formatProbability(probability: number): string {
  const value =
    probability <= 1
      ? probability * 100
      : probability

  return `${value.toFixed(1)}%`
}

function formatRelativeTime(value?: string): string {
  if (!value) {
    return "Unknown"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const minutes = Math.max(
    0,
    Math.floor(
      (Date.now() - date.getTime()) / 60000,
    ),
  )

  if (minutes < 1) {
    return "Just now"
  }

  if (minutes < 60) {
    return `${minutes} min ago`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours} hr ago`
  }

  const days = Math.floor(hours / 24)

  return `${days} day${days === 1 ? "" : "s"} ago`
}

function extractArray(
  payload: unknown,
  keys: string[],
): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return []
  }

  const object =
    payload as Record<string, unknown>

  for (const key of keys) {
    if (Array.isArray(object[key])) {
      return object[key] as unknown[]
    }
  }

  return []
}

function normalizeZones(
  payload: unknown,
): RiskZone[] {
  const rows = extractArray(payload, [
    "data",
    "zones",
    "items",
  ])

  return rows.filter(
    (row): row is RiskZone => {
      if (
        !row ||
        typeof row !== "object"
      ) {
        return false
      }

      return (
        "id" in row &&
        "name" in row
      )
    },
  )
}

function normalizeFieldReports(
  payload: unknown,
): FieldReport[] {
  const rows = extractArray(payload, [
    "data",
    "reports",
    "items",
  ])

  return rows.filter(
    (row): row is FieldReport => {
      if (
        !row ||
        typeof row !== "object"
      ) {
        return false
      }

      return "id" in row
    },
  )
}

function regionMatchesZone(
  zone: RiskZone,
  region: string,
): boolean {
  if (region === "Northeast India") {
    return true
  }

  const state =
    zone.district?.state
      ?.toLowerCase()
      .trim() ?? ""

  return (
    state === region
      .toLowerCase()
      .trim()
  )
}

function regionMatchesReport(
  report: FieldReport,
  region: string,
): boolean {
  if (region === "Northeast India") {
    return true
  }

  const state =
    report.state
      ?.toLowerCase()
      .trim() ?? ""

  return (
    state === region
      .toLowerCase()
      .trim()
  )
}

export default function ReportsPage() {
  const [reportType, setReportType] =
    useState<ReportType>(
      "Situation Report",
    )

  const [region, setRegion] =
    useState("Northeast India")

  const [selectedReport, setSelectedReport] =
    useState<ReportRecord>(
      REPORT_ARCHIVE[0],
    )

  const [data, setData] =
    useState<IntelligenceData>({
      zones: [],
      infrastructure: {},
      fieldReports: [],
      refreshedAt: "",
    })

  const [loading, setLoading] =
    useState(true)

  const [generating, setGenerating] =
    useState(false)

  const [error, setError] =
    useState("")

  const [success, setSuccess] =
    useState("")

  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
    ).format(new Date())
  }, [])

  const showMessage = useCallback(
    (
      message: string,
      isError = false,
    ) => {
      if (isError) {
        setError(message)
        setSuccess("")
      } else {
        setSuccess(message)
        setError("")
      }

      window.setTimeout(() => {
        if (isError) {
          setError("")
        } else {
          setSuccess("")
        }
      }, 3500)
    },
    [],
  )

  const loadIntelligence =
    useCallback(
      async (silent = false) => {
        if (!silent) {
          setLoading(true)
        }

        try {
          const [
            riskResponse,
            infrastructureResponse,
            fieldResponse,
          ] = await Promise.all([
            fetch(
              `${API_BASE_URL}/api/risk/zones`,
            ),
            fetch(
              `${API_BASE_URL}/api/infrastructure/exposure`,
            ),
            fetch(
              `${API_BASE_URL}/api/field-reports`,
            ),
          ])

          if (!riskResponse.ok) {
            throw new Error(
              `Risk API returned ${riskResponse.status}`,
            )
          }

          if (
            !infrastructureResponse.ok
          ) {
            throw new Error(
              `Infrastructure API returned ${infrastructureResponse.status}`,
            )
          }

          if (!fieldResponse.ok) {
            throw new Error(
              `Field Reports API returned ${fieldResponse.status}`,
            )
          }

          const riskPayload: unknown =
            await riskResponse.json()

          const infrastructurePayload: unknown =
            await infrastructureResponse.json()

          const fieldPayload: unknown =
            await fieldResponse.json()

          let infrastructureSummary: InfrastructureSummary =
            {}

          if (
            infrastructurePayload &&
            typeof infrastructurePayload ===
              "object"
          ) {
            const object =
              infrastructurePayload as Record<
                string,
                unknown
              >

            if (
              object.summary &&
              typeof object.summary ===
                "object"
            ) {
              infrastructureSummary =
                object.summary as InfrastructureSummary
            }
          }

          setData({
            zones:
              normalizeZones(
                riskPayload,
              ),
            infrastructure:
              infrastructureSummary,
            fieldReports:
              normalizeFieldReports(
                fieldPayload,
              ),
            refreshedAt:
              new Date().toISOString(),
          })

          return true
        } catch (requestError) {
          console.error(
            "BhooPehra reports intelligence refresh failed:",
            requestError,
          )

          showMessage(
            "Unable to refresh intelligence. Make sure the BhooPehra API is running.",
            true,
          )

          return false
        } finally {
          if (!silent) {
            setLoading(false)
          }
        }
      },
      [showMessage],
    )

  useEffect(() => {
    void loadIntelligence()
  }, [loadIntelligence])

  const filteredZones = useMemo(() => {
    return data.zones
      .filter((zone) =>
        regionMatchesZone(
          zone,
          region,
        ),
      )
      .sort((a, b) => {
        const riskDifference =
          getRiskRank(
            b.risk_level,
          ) -
          getRiskRank(
            a.risk_level,
          )

        if (riskDifference !== 0) {
          return riskDifference
        }

        return (
          b.probability -
          a.probability
        )
      })
  }, [data.zones, region])

  const filteredFieldReports =
    useMemo(() => {
      return data.fieldReports.filter(
        (report) =>
          regionMatchesReport(
            report,
            region,
          ),
      )
    }, [data.fieldReports, region])

  const criticalZones =
    filteredZones.filter(
      (zone) =>
        normalizeRiskLevel(
          zone.risk_level,
        ) === "CRITICAL",
    )

  const highZones =
    filteredZones.filter(
      (zone) =>
        normalizeRiskLevel(
          zone.risk_level,
        ) === "HIGH",
    )

  const moderateZones =
    filteredZones.filter(
      (zone) =>
        normalizeRiskLevel(
          zone.risk_level,
        ) === "MODERATE",
    )

  const highestRiskZone =
    filteredZones[0]

  const highestProbability =
    highestRiskZone?.probability ??
    0

  const highestRiskLevel =
    normalizeRiskLevel(
      highestRiskZone?.risk_level,
    )

  const highestRiskDistrict =
    highestRiskZone?.district?.name ??
    highestRiskZone?.name ??
    "No current priority location"

  const highestRiskState =
    highestRiskZone?.district?.state ??
    region

  const rainfallObservation =
    highestRiskZone?.risk_engine
      ?.rainfall_observation

  const rainfall24h =
    rainfallObservation?.rainfall_24h

  const rainfall72h =
    rainfallObservation?.rainfall_72h

  const soilMoisture =
    rainfallObservation?.soil_moisture

  const rainfallTrigger =
    highestRiskZone?.rainfall_trigger ??
    rainfallObservation?.trigger_level ??
    "UNKNOWN"

  const rainfallSource =
    rainfallObservation?.source ??
    "Current risk intelligence"

  const knownRoads =
    data.infrastructure
      .known_affected_roads ?? 0

  const knownVillages =
    data.infrastructure
      .known_affected_villages ?? 0

  const spatialRoads =
    data.infrastructure
      .spatial_affected_roads ?? 0

  const spatialVillages =
    data.infrastructure
      .spatial_affected_villages ?? 0

  const spatialAssets =
    data.infrastructure
      .spatial_assets ??
    data.infrastructure
      .spatially_verified ??
    0

  const unverifiedAssets =
    data.infrastructure
      .unverified_assets ??
    data.infrastructure
      .geometry_pending ??
    0

  const outsideZoneAssets =
    data.infrastructure
      .outside_zone_assets ??
    data.infrastructure
      .outside_zone ??
    0

  const criticalFieldReports =
    filteredFieldReports.filter(
      (report) =>
        normalizeRiskLevel(
          report.severity,
        ) === "CRITICAL",
    ).length

  const verifiedFieldReports =
    filteredFieldReports.filter(
      (report) =>
        normalizeRiskLevel(
          report.status,
        ) === "VERIFIED",
    ).length

  const pendingFieldReports =
    filteredFieldReports.filter(
      (report) => {
        const status =
          normalizeRiskLevel(
            report.status,
          )

        return (
          status === "SUBMITTED" ||
          status === "PENDING" ||
          status === "PENDING SYNC"
        )
      },
    ).length

  const reportTitle = useMemo(() => {
    switch (reportType) {
      case "Risk Assessment":
        return "Regional Landslide Risk Assessment"

      case "Infrastructure Exposure":
        return "Critical Infrastructure Exposure Report"

      case "Field Activity":
        return "Field Activity Summary"

      default:
        return "Northeast India Landslide Situation Report"
    }
  }, [reportType])

  const reportAuthor = useMemo(() => {
    switch (reportType) {
      case "Risk Assessment":
        return "Risk Intelligence"

      case "Infrastructure Exposure":
        return "Impact Engine"

      case "Field Activity":
        return "Ground Intelligence"

      default:
        return "BhooPehra Intelligence Engine"
    }
  }, [reportType])

  const priorityLocations =
    useMemo(() => {
      return filteredZones
        .slice(0, 8)
        .map((zone) => ({
          name: zone.name,
          location:
            [
              zone.district?.name,
              zone.district?.state,
            ]
              .filter(Boolean)
              .join(", ") ||
            "Northeast India",
          risk: normalizeRiskLevel(
            zone.risk_level,
          ),
          probability:
            zone.probability <= 1
              ? zone.probability * 100
              : zone.probability,
          priority:
            (zone.priority as
              | Priority
              | undefined) ??
            getPriority(
              zone.probability,
            ),
          reason:
            normalizeRiskLevel(
              zone.risk_level,
            ) === "CRITICAL"
              ? "Critical risk assessment requires immediate operational review"
              : normalizeRiskLevel(
                    zone.risk_level,
                  ) === "HIGH"
                ? "Elevated landslide risk requires enhanced monitoring"
                : "Continue monitoring current risk and trigger conditions",
        }))
    }, [filteredZones])

  const handleReportTypeChange =
    (value: string) => {
      const nextType =
        value as ReportType

      setReportType(nextType)

      const matchingReport =
        REPORT_ARCHIVE.find(
          (report) =>
            report.type === nextType,
        )

      if (matchingReport) {
        setSelectedReport({
          ...matchingReport,
          region,
          title:
            nextType ===
            "Situation Report"
              ? "Northeast India Landslide Situation Report"
              : nextType ===
                  "Risk Assessment"
                ? "Regional Landslide Risk Assessment"
                : nextType ===
                    "Infrastructure Exposure"
                  ? "Critical Infrastructure Exposure Report"
                  : "Field Activity Summary",
        })
      }
    }

  const handleRegionChange =
    (value: string) => {
      setRegion(value)

      setSelectedReport(
        (current) => ({
          ...current,
          region: value,
        }),
      )
    }

  const handleRefresh =
    async () => {
      const refreshed =
        await loadIntelligence()

      if (refreshed) {
        showMessage(
          `Intelligence refreshed at ${new Date().toLocaleTimeString(
            "en-IN",
            {
              hour: "2-digit",
              minute: "2-digit",
            },
          )}`,
        )
      }
    }

  const handleGenerate =
    async () => {
      setGenerating(true)

      try {
        const refreshed =
          await loadIntelligence()

        if (!refreshed) {
          return
        }

        const generatedReport:
          ReportRecord = {
          id: `${reportType
            .slice(0, 3)
            .toUpperCase()}-${new Date()
            .toISOString()
            .slice(0, 10)
            .replaceAll("-", "")}`,
          title: reportTitle,
          type: reportType,
          region,
          generated: "Just now",
          author: reportAuthor,
          status: "READY",
        }

        setSelectedReport(
          generatedReport,
        )

        showMessage(
          `${reportType} generated from current BhooPehra intelligence.`,
        )
      } finally {
        setGenerating(false)
      }
    }

  const buildReportText =
    useCallback(() => {
      const lines: string[] = [
        "BhooPehra",
        "LANDSLIDE INTELLIGENCE PLATFORM",
        "",
        reportTitle,
        "========================================",
        "",
        `Report Type: ${reportType}`,
        `Region: ${region}`,
        `Generated: ${currentDate}`,
        `Author: ${reportAuthor}`,
        "",
        "REGIONAL RISK OVERVIEW",
        "----------------------------------------",
        `Critical Zones: ${criticalZones.length}`,
        `High Risk Zones: ${highZones.length}`,
        `Moderate Zones: ${moderateZones.length}`,
        `Monitored Zones: ${filteredZones.length}`,
        "",
        "TOP PRIORITY LOCATION",
        "----------------------------------------",
        `Location: ${highestRiskZone?.name ?? "Unavailable"}`,
        `District: ${highestRiskDistrict}`,
        `State: ${highestRiskState}`,
        `Risk Level: ${highestRiskLevel}`,
        `Probability: ${formatProbability(highestProbability)}`,
        `Priority: ${
          highestRiskZone
            ? getPriority(
                highestProbability,
              )
            : "P3"
        }`,
        `Confidence: ${
          highestRiskZone?.confidence ??
          "Unavailable"
        }`,
        `Rainfall Trigger: ${rainfallTrigger}`,
        "",
        "WEATHER & TRIGGER CONDITIONS",
        "----------------------------------------",
        `Rainfall 24h: ${
          rainfall24h !== undefined
            ? `${rainfall24h} mm`
            : "Unavailable"
        }`,
        `Rainfall 72h: ${
          rainfall72h !== undefined
            ? `${rainfall72h} mm`
            : "Unavailable"
        }`,
        `Soil Moisture: ${
          soilMoisture !== undefined
            ? `${soilMoisture}%`
            : "Unavailable"
        }`,
        `Source: ${rainfallSource}`,
        "",
        "INFRASTRUCTURE EXPOSURE",
        "----------------------------------------",
        `Known affected roads: ${knownRoads}`,
        `Known affected villages: ${knownVillages}`,
        `Spatially verified roads: ${spatialRoads}`,
        `Spatially verified villages: ${spatialVillages}`,
        `Spatially verified assets: ${spatialAssets}`,
        `Unverified assets: ${unverifiedAssets}`,
        `Outside assigned zone: ${outsideZoneAssets}`,
        "",
        "FIELD INTELLIGENCE",
        "----------------------------------------",
        `Reports: ${filteredFieldReports.length}`,
        `Verified: ${verifiedFieldReports}`,
        `Pending: ${pendingFieldReports}`,
        `Critical: ${criticalFieldReports}`,
        "",
        "PRIORITY LOCATIONS",
        "----------------------------------------",
      ]

      for (
        const location of priorityLocations
      ) {
        lines.push(
          `${location.name} | ${location.risk} | ${location.probability.toFixed(
            1,
          )}% | ${location.priority}`,
        )
      }

      lines.push(
        "",
        "RECOMMENDED ACTIONS",
        "----------------------------------------",
        `Maintain enhanced monitoring of ${
          highestRiskZone?.name ??
          "highest-risk location"
        }.`,
        "Prepare traffic-control and response measures where operational priority is high.",
        "Inspect exposed roads, bridges and other critical infrastructure.",
        "Continue field verification and evidence collection for uncertain assessments.",
        "",
        "Data basis: BhooPehra structured risk, infrastructure and field intelligence APIs.",
        "This report supports, and does not replace, official disaster-management decisions.",
      )

      return lines.join("\n")
    }, [
      currentDate,
      criticalFieldReports,
      criticalZones.length,
      filteredFieldReports.length,
      filteredZones.length,
      highestProbability,
      highestRiskDistrict,
      highestRiskLevel,
      highestRiskState,
      highestRiskZone,
      highZones.length,
      knownRoads,
      knownVillages,
      moderateZones.length,
      priorityLocations,
      rainfall24h,
      rainfall72h,
      rainfallSource,
      rainfallTrigger,
      region,
      reportAuthor,
      reportTitle,
      reportType,
      soilMoisture,
      spatialAssets,
      spatialRoads,
      spatialVillages,
      unverifiedAssets,
      outsideZoneAssets,
      verifiedFieldReports,
      pendingFieldReports,
    ])

  const handleExport =
    useCallback(() => {
      const blob = new Blob(
        [buildReportText()],
        {
          type: "text/plain;charset=utf-8",
        },
      )

      const url =
        URL.createObjectURL(blob)

      const anchor =
        document.createElement("a")

      anchor.href = url

      anchor.download = `bhoopehra-${reportType
        .toLowerCase()
        .replaceAll(" ", "-")}-${new Date()
        .toISOString()
        .slice(0, 10)}.txt`

      document.body.appendChild(anchor)

      anchor.click()

      anchor.remove()

      URL.revokeObjectURL(url)

      showMessage(
        "Report exported successfully.",
      )
    }, [
      buildReportText,
      reportType,
      showMessage,
    ])

  const handlePrint = () => {
    window.print()
  }

  const handleExportSelected =
    () => {
      handleExport()
    }

  const selectArchiveReport = (
    report: ReportRecord,
  ) => {
    setSelectedReport({
      ...report,
      region,
    })

    setReportType(report.type)

    showMessage(
      `${report.type} selected.`,
    )
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] text-slate-100">
      {/* Header */}
      <div className="border-b border-white/5 bg-[#081522] px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <FileBarChart size={14} />
              Intelligence & Reporting
              <span>/</span>
              Reports
            </div>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Situation Reports
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Generate decision-ready
              reports from current risk,
              rainfall, infrastructure and
              field intelligence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={14} />

              {loading
                ? "Refreshing Data"
                : "Data Connected"}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#03130d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles
                size={15}
                className={
                  generating
                    ? "animate-pulse"
                    : ""
                }
              />

              {generating
                ? "Generating..."
                : "Generate Report"}
            </button>
          </div>
        </div>

        {(error || success) && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-xs ${
              error
                ? "border-red-500/20 bg-red-500/5 text-red-400"
                : "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
            }`}
          >
            {error || success}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="border-b border-white/5 bg-[#07131f] px-6 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          <ConfigSelect
            label="Report Type"
            value={reportType}
            onChange={
              handleReportTypeChange
            }
            options={REPORT_TYPES}
          />

          <ConfigSelect
            label="Region"
            value={region}
            onChange={
              handleRegionChange
            }
            options={REGIONS}
          />

          <div className="rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">
              Report Date
            </div>

            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <CalendarDays
                size={14}
                className="text-slate-500"
              />

              {currentDate}
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="grid min-h-[calc(100vh-300px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Report */}
        <main className="overflow-y-auto border-r border-white/5 p-6">
          {/* Report heading */}
          <div className="rounded-xl border border-white/5 bg-[#081522] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  <FileText size={13} />
                  {reportType}
                </div>

                <h2 className="mt-2 text-2xl font-semibold">
                  {reportTitle}
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Regional assessment for{" "}
                  {region} • Generated by{" "}
                  {reportAuthor}
                </p>
              </div>

              <div className="flex gap-2">
                <IconButton
                  icon={
                    <Printer size={15} />
                  }
                  label="Print"
                  onClick={handlePrint}
                />

                <IconButton
                  icon={
                    <Download size={15} />
                  }
                  label="Export"
                  onClick={handleExport}
                />
              </div>
            </div>
          </div>

          {/* Situation Report */}
          {reportType ===
            "Situation Report" && (
            <>
              <ReportSection
                title="Executive Summary"
                icon={
                  <Sparkles size={16} />
                }
              >
                <p className="text-sm leading-6 text-slate-400">
                  Current BhooPehra
                  intelligence is monitoring{" "}
                  <span className="font-semibold text-slate-300">
                    {filteredZones.length}
                  </span>{" "}
                  risk zones in the
                  selected region.{" "}
                  {criticalZones.length >
                  0
                    ? `${criticalZones.length} critical and `
                    : ""}
                  {highZones.length}{" "}
                  high-risk locations
                  require enhanced
                  operational attention.
                  The highest current risk
                  is{" "}
                  <span className="font-semibold text-slate-300">
                    {highestRiskZone?.name ??
                      "not currently available"}
                  </span>{" "}
                  with an assessed
                  probability of{" "}
                  <span className="font-semibold text-slate-300">
                    {formatProbability(
                      highestProbability,
                    )}
                  </span>
                  .
                </p>
              </ReportSection>

              <RiskOverview
                critical={
                  criticalZones.length
                }
                high={highZones.length}
                moderate={
                  moderateZones.length
                }
                monitored={
                  filteredZones.length
                }
              />

              <WeatherSection
                temperature="Live risk data"
                rainfallTrigger={
                  rainfallTrigger
                }
                rainfall24h={
                  rainfall24h
                }
                rainfall72h={
                  rainfall72h
                }
                soilMoisture={
                  soilMoisture
                }
                source={rainfallSource}
              />

              <PriorityLocations
                locations={
                  priorityLocations
                }
              />

              <InfrastructureSection
                knownRoads={knownRoads}
                knownVillages={
                  knownVillages
                }
                spatialRoads={
                  spatialRoads
                }
                spatialVillages={
                  spatialVillages
                }
                spatialAssets={
                  spatialAssets
                }
                unverifiedAssets={
                  unverifiedAssets
                }
              />

              <FieldSection
                total={
                  filteredFieldReports.length
                }
                verified={
                  verifiedFieldReports
                }
                pending={
                  pendingFieldReports
                }
                critical={
                  criticalFieldReports
                }
              />

              <RecommendedActions
                highestRiskName={
                  highestRiskZone?.name ??
                  "highest-risk location"
                }
              />
            </>
          )}

          {/* Risk Assessment */}
          {reportType ===
            "Risk Assessment" && (
            <>
              <ReportSection
                title="Risk Assessment Summary"
                icon={
                  <ShieldAlert size={16} />
                }
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Critical"
                    value={`${criticalZones.length}`}
                    className="text-red-400"
                  />

                  <Metric
                    label="High"
                    value={`${highZones.length}`}
                    className="text-orange-400"
                  />

                  <Metric
                    label="Moderate"
                    value={`${moderateZones.length}`}
                    className="text-yellow-400"
                  />

                  <Metric
                    label="Monitored"
                    value={`${filteredZones.length}`}
                    className="text-emerald-400"
                  />
                </div>
              </ReportSection>

              <ReportSection
                title="Highest Risk Assessment"
                icon={
                  <AlertTriangle size={16} />
                }
              >
                <div className="rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-lg font-semibold text-slate-200">
                        {highestRiskZone?.name ??
                          "No current priority zone"}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {
                          highestRiskDistrict
                        }
                        ,{" "}
                        {
                          highestRiskState
                        }
                      </div>
                    </div>

                    <div
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${
                        getRiskStyle(
                          highestRiskLevel,
                        ).bg
                      } ${
                        getRiskStyle(
                          highestRiskLevel,
                        ).text
                      }`}
                    >
                      {highestRiskLevel}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Metric
                      label="Probability"
                      value={formatProbability(
                        highestProbability,
                      )}
                      className={
                        getRiskStyle(
                          highestRiskLevel,
                        ).text
                      }
                    />

                    <Metric
                      label="Priority"
                      value={
                        highestRiskZone
                          ? getPriority(
                              highestProbability,
                            )
                          : "P3"
                      }
                      className="text-slate-200"
                    />

                    <Metric
                      label="Confidence"
                      value={
                        highestRiskZone?.confidence ??
                        "N/A"
                      }
                      className="text-blue-400"
                    />

                    <Metric
                      label="Trigger"
                      value={
                        rainfallTrigger
                      }
                      className="text-orange-400"
                    />
                  </div>
                </div>
              </ReportSection>

              <PriorityLocations
                locations={
                  priorityLocations
                }
              />

              <WeatherSection
                temperature="Live risk data"
                rainfallTrigger={
                  rainfallTrigger
                }
                rainfall24h={
                  rainfall24h
                }
                rainfall72h={
                  rainfall72h
                }
                soilMoisture={
                  soilMoisture
                }
                source={rainfallSource}
              />
            </>
          )}

          {/* Infrastructure Exposure */}
          {reportType ===
            "Infrastructure Exposure" && (
            <>
              <ReportSection
                title="Infrastructure Exposure Overview"
                icon={
                  <Route size={16} />
                }
              >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric
                    label="Known Roads"
                    value={`${knownRoads}`}
                    className="text-slate-200"
                  />

                  <Metric
                    label="Known Villages"
                    value={`${knownVillages}`}
                    className="text-blue-400"
                  />

                  <Metric
                    label="Spatially Verified"
                    value={`${spatialAssets}`}
                    className="text-emerald-400"
                  />

                  <Metric
                    label="Unverified"
                    value={`${unverifiedAssets}`}
                    className="text-yellow-400"
                  />
                </div>
              </ReportSection>

              <InfrastructureSection
                knownRoads={knownRoads}
                knownVillages={
                  knownVillages
                }
                spatialRoads={
                  spatialRoads
                }
                spatialVillages={
                  spatialVillages
                }
                spatialAssets={
                  spatialAssets
                }
                unverifiedAssets={
                  unverifiedAssets
                }
              />

              <ReportSection
                title="Spatial Verification"
                icon={
                  <MapPin size={16} />
                }
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <ExposureCard
                    icon={
                      <CheckCircle2
                        size={16}
                      />
                    }
                    title="Spatially Verified"
                    value={`${spatialAssets} assets`}
                    description="Geometry intersects an operational risk zone."
                    accent="emerald"
                  />

                  <ExposureCard
                    icon={
                      <Clock3 size={16} />
                    }
                    title="Unverified"
                    value={`${unverifiedAssets} assets`}
                    description="Geometry or zone intersection still requires verification."
                    accent="yellow"
                  />

                  <ExposureCard
                    icon={
                      <MapPin size={16} />
                    }
                    title="Outside Zone"
                    value={`${outsideZoneAssets} assets`}
                    description="Geometry exists but does not intersect the assigned risk-zone polygon."
                    accent="orange"
                  />
                </div>
              </ReportSection>
            </>
          )}

          {/* Field Activity */}
          {reportType ===
            "Field Activity" && (
            <>
              <ReportSection
                title="Field Activity Overview"
                icon={
                  <MapPin size={16} />
                }
              >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric
                    label="Reports"
                    value={`${filteredFieldReports.length}`}
                    className="text-slate-200"
                  />

                  <Metric
                    label="Verified"
                    value={`${verifiedFieldReports}`}
                    className="text-emerald-400"
                  />

                  <Metric
                    label="Pending"
                    value={`${pendingFieldReports}`}
                    className="text-yellow-400"
                  />

                  <Metric
                    label="Critical"
                    value={`${criticalFieldReports}`}
                    className="text-red-400"
                  />
                </div>
              </ReportSection>

              <ReportSection
                title="Ground Intelligence"
                icon={
                  <MapPin size={16} />
                }
              >
                {filteredFieldReports.length ===
                0 ? (
                  <EmptyState text="No field reports are currently available for the selected region." />
                ) : (
                  <div className="space-y-2">
                    {filteredFieldReports
                      .slice(0, 10)
                      .map((report) => (
                        <div
                          key={report.id}
                          className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-slate-300">
                                {report.title ??
                                  report.report_code ??
                                  `Field Report #${report.id}`}
                              </div>

                              <div className="mt-1 text-[10px] text-slate-600">
                                {report.location ??
                                  report.district ??
                                  "Location unavailable"}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <StatusBadge
                                value={
                                  report.severity ??
                                  "UNKNOWN"
                                }
                              />

                              <StatusBadge
                                value={
                                  report.status ??
                                  "UNKNOWN"
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-600">
                            <span>
                              {report.report_code ??
                                `FR-${String(
                                  report.id,
                                ).padStart(
                                  4,
                                  "0",
                                )}`}
                            </span>

                            <span>
                              {formatRelativeTime(
                                report.submitted_at ??
                                  report.created_at,
                              )}
                            </span>

                            {report.photo_count !==
                              undefined && (
                              <span>
                                {
                                  report.photo_count
                                }{" "}
                                photos
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </ReportSection>

              <PriorityLocations
                locations={
                  priorityLocations
                }
              />
            </>
          )}

          {/* Footer */}
          <div className="mt-6 flex flex-col gap-2 border-t border-white/5 pt-4 text-[10px] text-slate-600 md:flex-row md:items-center md:justify-between">
            <span>
              BhooPehra • Landslide
              Intelligence Platform
            </span>

            <span>
              Generated from currently
              available structured
              intelligence. Supports, not
              replaces, official
              disaster-management decisions.
            </span>
          </div>
        </main>

        {/* History sidebar */}
        <aside className="bg-[#081522]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  Report Archive
                </div>

                <div className="mt-1 text-lg font-semibold">
                  Recent Reports
                </div>
              </div>

              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <FileBarChart size={18} />
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] p-3">
              <div className="flex items-center gap-2">
                <Clock3
                  size={14}
                  className="text-slate-500"
                />

                <span className="text-xs text-slate-400">
                  Intelligence
                </span>
              </div>

              <span className="text-[10px] font-semibold text-emerald-400">
                Live
              </span>
            </div>

            <div className="space-y-2">
              {REPORT_ARCHIVE.map(
                (report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() =>
                      selectArchiveReport(
                        report,
                      )
                    }
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedReport.type ===
                      report.type
                        ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText
                            size={14}
                            className="shrink-0 text-slate-500"
                          />

                          <span className="truncate text-xs font-semibold text-slate-300">
                            {
                              report.title
                            }
                          </span>
                        </div>

                        <div className="mt-2 text-[10px] text-slate-600">
                          {report.id}
                        </div>
                      </div>

                      <span className="shrink-0 rounded bg-emerald-500/10 px-2 py-1 text-[8px] font-bold text-emerald-400">
                        READY
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600">
                      <span>
                        {report.type}
                      </span>

                      <span>Live</span>
                    </div>
                  </button>
                ),
              )}
            </div>

            {/* Selected report */}
            <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.025] p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                Selected Report
              </div>

              <div className="mt-2 text-sm font-semibold text-slate-300">
                {selectedReport.title}
              </div>

              <div className="mt-3 space-y-2">
                <MiniDetail
                  label="Type"
                  value={reportType}
                />

                <MiniDetail
                  label="Region"
                  value={region}
                />

                <MiniDetail
                  label="Author"
                  value={reportAuthor}
                />

                <MiniDetail
                  label="Updated"
                  value={
                    data.refreshedAt
                      ? formatRelativeTime(
                          data.refreshedAt,
                        )
                      : "Not refreshed"
                  }
                />
              </div>

              <button
                type="button"
                onClick={
                  handleExportSelected
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Download size={14} />
                Export Selected
              </button>
            </div>

            {/* Data integrity */}
            <div className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  size={15}
                  className="mt-0.5 shrink-0 text-emerald-400"
                />

                <div>
                  <div className="text-xs font-semibold text-slate-300">
                    Data Integrity
                  </div>

                  <p className="mt-1 text-[10px] leading-5 text-slate-600">
                    Report intelligence is
                    generated from the live
                    risk, infrastructure and
                    field report APIs. No
                    synthetic coordinates or
                    fabricated spatial
                    verification are used.
                  </p>
                </div>
              </div>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />

              {loading
                ? "Refreshing..."
                : "Refresh Intelligence"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ConfigSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div className="relative rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-1 w-full appearance-none bg-transparent pr-6 text-sm font-semibold text-slate-300 outline-none"
      >
        {options.map(
          (option) => (
            <option
              key={option}
              value={option}
              className="bg-[#081522]"
            >
              {option}
            </option>
          ),
        )}
      </select>

      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-4 bottom-4 text-slate-600"
      />
    </div>
  )
}

function ReportSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-5 rounded-xl border border-white/5 bg-[#081522] p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-emerald-400">
          {icon}
        </span>

        <h3 className="text-sm font-semibold">
          {title}
        </h3>
      </div>

      {children}
    </section>
  )
}

function RiskOverview({
  critical,
  high,
  moderate,
  monitored,
}: {
  critical: number
  high: number
  moderate: number
  monitored: number
}) {
  return (
    <ReportSection
      title="Regional Risk Overview"
      icon={
        <ShieldAlert size={16} />
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Critical Zones"
          value={`${critical}`}
          className="text-red-400"
        />

        <Metric
          label="High Risk"
          value={`${high}`}
          className="text-orange-400"
        />

        <Metric
          label="Moderate"
          value={`${moderate}`}
          className="text-yellow-400"
        />

        <Metric
          label="Monitored"
          value={`${monitored}`}
          className="text-emerald-400"
        />
      </div>
    </ReportSection>
  )
}

function WeatherSection({
  temperature,
  rainfallTrigger,
  rainfall24h,
  rainfall72h,
  soilMoisture,
  source,
}: {
  temperature: string
  rainfallTrigger: string
  rainfall24h?: number
  rainfall72h?: number
  soilMoisture?: number
  source: string
}) {
  const triggerStyle =
    rainfallTrigger ===
      "VERY_HIGH" ||
    rainfallTrigger === "HIGH"
      ? "text-orange-400"
      : rainfallTrigger ===
          "MODERATE"
        ? "text-yellow-400"
        : "text-emerald-400"

  return (
    <ReportSection
      title="Weather & Trigger Conditions"
      icon={
        <CloudRain size={16} />
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <Metric
          label="Temperature"
          value={temperature}
          className="text-slate-200"
        />

        <Metric
          label="Rainfall 24h"
          value={
            rainfall24h !==
            undefined
              ? `${rainfall24h} mm`
              : "N/A"
          }
          className="text-blue-400"
        />

        <Metric
          label="Rainfall 72h"
          value={
            rainfall72h !==
            undefined
              ? `${rainfall72h} mm`
              : "N/A"
          }
          className="text-blue-400"
        />

        <Metric
          label="Trigger"
          value={rainfallTrigger}
          className={
            triggerStyle
          }
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ExposureCard
          icon={
            <CloudRain size={16} />
          }
          title="Dynamic Trigger"
          value={
            rainfallTrigger
          }
          description={`Current trigger signal from ${source}.`}
          accent="orange"
        />

        <ExposureCard
          icon={<Users size={16} />}
          title="Soil Moisture"
          value={
            soilMoisture !==
            undefined
              ? `${soilMoisture}%`
              : "Unavailable"
          }
          description="Latest available risk-engine soil-moisture input."
          accent="blue"
        />
      </div>

      <div className="mt-4 rounded-lg border border-orange-500/10 bg-orange-500/[0.04] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-orange-400"
          />

          <p className="text-xs leading-5 text-slate-400">
            Dynamic trigger information
            is presented from the current
            risk-engine observation. It
            should be interpreted together
            with susceptibility, confidence
            and field evidence.
          </p>
        </div>
      </div>
    </ReportSection>
  )
}

function PriorityLocations({
  locations,
}: {
  locations: {
    name: string
    location: string
    risk: string
    probability: number
    priority: Priority
    reason: string
  }[]
}) {
  return (
    <ReportSection
      title="Priority Locations"
      icon={<MapPin size={16} />}
    >
      {locations.length === 0 ? (
        <EmptyState text="No risk zones are currently available for the selected region." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="grid grid-cols-[1fr_90px_90px_80px] gap-3 border-b border-white/5 bg-white/[0.025] px-4 py-3 text-[9px] font-bold uppercase tracking-wider text-slate-600">
            <span>Location</span>
            <span>Risk</span>
            <span>Probability</span>
            <span>Priority</span>
          </div>

          {locations.map(
            (location) => {
              const style =
                getRiskStyle(
                  location.risk,
                )

              return (
                <div
                  key={
                    location.name
                  }
                  className="grid grid-cols-[1fr_90px_90px_80px] gap-3 border-b border-white/5 px-4 py-3 last:border-0"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-300">
                      {
                        location.name
                      }
                    </div>

                    <div className="mt-1 text-[10px] text-slate-600">
                      {
                        location.location
                      }
                    </div>

                    <div className="mt-1 text-[10px] text-slate-700">
                      {
                        location.reason
                      }
                    </div>
                  </div>

                  <span
                    className={`self-center text-[10px] font-bold ${style.text}`}
                  >
                    {
                      location.risk
                    }
                  </span>

                  <span className="self-center text-xs font-semibold text-slate-300">
                    {location.probability.toFixed(
                      1,
                    )}
                    %
                  </span>

                  <span className="self-center text-xs font-bold text-slate-300">
                    {
                      location.priority
                    }
                  </span>
                </div>
              )
            },
          )}
        </div>
      )}
    </ReportSection>
  )
}

function InfrastructureSection({
  knownRoads,
  knownVillages,
  spatialRoads,
  spatialVillages,
  spatialAssets,
  unverifiedAssets,
}: {
  knownRoads: number
  knownVillages: number
  spatialRoads: number
  spatialVillages: number
  spatialAssets: number
  unverifiedAssets: number
}) {
  return (
    <ReportSection
      title="Infrastructure Exposure"
      icon={<Route size={16} />}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Known Roads"
          value={`${knownRoads}`}
          className="text-slate-200"
        />

        <Metric
          label="Known Villages"
          value={`${knownVillages}`}
          className="text-blue-400"
        />

        <Metric
          label="Spatial Roads"
          value={`${spatialRoads}`}
          className="text-emerald-400"
        />

        <Metric
          label="Spatial Villages"
          value={`${spatialVillages}`}
          className="text-yellow-400"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ExposureCard
          icon={<Route size={16} />}
          title="Operational Road Exposure"
          value={`${knownRoads} roads`}
          description="Known operational exposure linked to current risk zones."
          accent="orange"
        />

        <ExposureCard
          icon={<MapPin size={16} />}
          title="Spatial Verification"
          value={`${spatialAssets} assets`}
          description="Assets with geometry intersecting assigned risk zones."
          accent="emerald"
        />

        <ExposureCard
          icon={<Clock3 size={16} />}
          title="Verification Pending"
          value={`${unverifiedAssets} assets`}
          description="Geometry or spatial relationship requires verification."
          accent="yellow"
        />
      </div>
    </ReportSection>
  )
}

function FieldSection({
  total,
  verified,
  pending,
  critical,
}: {
  total: number
  verified: number
  pending: number
  critical: number
}) {
  return (
    <ReportSection
      title="Field Intelligence"
      icon={<MapPin size={16} />}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Reports"
          value={`${total}`}
          className="text-slate-200"
        />

        <Metric
          label="Verified"
          value={`${verified}`}
          className="text-emerald-400"
        />

        <Metric
          label="Pending"
          value={`${pending}`}
          className="text-yellow-400"
        />

        <Metric
          label="Critical"
          value={`${critical}`}
          className="text-red-400"
        />
      </div>
    </ReportSection>
  )
}

function RecommendedActions({
  highestRiskName,
}: {
  highestRiskName: string
}) {
  return (
    <ReportSection
      title="Recommended Actions"
      icon={
        <CheckCircle2 size={16} />
      }
    >
      <div className="space-y-2">
        <ActionRow
          priority="P1"
          text={`Maintain enhanced monitoring of ${highestRiskName}.`}
        />

        <ActionRow
          priority="P1"
          text="Prepare traffic-control and response measures where operational priority is high."
        />

        <ActionRow
          priority="P2"
          text="Inspect exposed roads, bridges and other critical infrastructure."
        />

        <ActionRow
          priority="P2"
          text="Continue field verification and evidence collection for uncertain assessments."
        />
      </div>
    </ReportSection>
  )
}

function Metric({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div
        className={`mt-1 text-xl font-bold ${className}`}
      >
        {value}
      </div>
    </div>
  )
}

function ExposureCard({
  icon,
  title,
  value,
  description,
  accent = "orange",
}: {
  icon: ReactNode
  title: string
  value: string
  description: string
  accent?:
    | "orange"
    | "emerald"
    | "yellow"
    | "blue"
}) {
  const accentClasses = {
    orange:
      "bg-orange-500/10 text-orange-400",
    emerald:
      "bg-emerald-500/10 text-emerald-400",
    yellow:
      "bg-yellow-500/10 text-yellow-400",
    blue:
      "bg-blue-500/10 text-blue-400",
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <div
          className={`rounded-lg p-2 ${accentClasses[accent]}`}
        >
          {icon}
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-300">
            {title}
          </div>

          <div className="mt-1 text-sm font-bold text-slate-200">
            {value}
          </div>

          <div className="mt-1 text-[10px] leading-4 text-slate-600">
            {description}
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionRow({
  priority,
  text,
}: {
  priority: Priority
  text: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <span
        className={`rounded px-2 py-1 text-[9px] font-bold ${
          priority === "P1"
            ? "bg-red-500/10 text-red-400"
            : "bg-yellow-500/10 text-yellow-400"
        }`}
      >
        {priority}
      </span>

      <p className="text-xs leading-5 text-slate-400">
        {text}
      </p>
    </div>
  )
}

function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
    >
      {icon}
    </button>
  )
}

function MiniDetail({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-[10px] text-slate-600">
        {label}
      </span>

      <span className="max-w-[65%] truncate text-right text-[10px] font-semibold text-slate-400">
        {value}
      </span>
    </div>
  )
}

function StatusBadge({
  value,
}: {
  value: string
}) {
  const normalized =
    value.toUpperCase()

  let classes =
    "bg-slate-500/10 text-slate-400"

  if (normalized === "CRITICAL") {
    classes =
      "bg-red-500/10 text-red-400"
  } else if (normalized === "HIGH") {
    classes =
      "bg-orange-500/10 text-orange-400"
  } else if (
    normalized === "MODERATE"
  ) {
    classes =
      "bg-yellow-500/10 text-yellow-400"
  } else if (
    normalized === "VERIFIED"
  ) {
    classes =
      "bg-emerald-500/10 text-emerald-400"
  } else if (
    normalized === "SUBMITTED"
  ) {
    classes =
      "bg-blue-500/10 text-blue-400"
  }

  return (
    <span
      className={`rounded px-2 py-1 text-[8px] font-bold ${classes}`}
    >
      {value}
    </span>
  )
}

function EmptyState({
  text,
}: {
  text: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.03] text-slate-600">
        <FileText size={17} />
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {text}
      </p>
    </div>
  )
}