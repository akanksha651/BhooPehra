import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"

type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "UNKNOWN"
type Priority = "P1" | "P2" | "P3" | "UNKNOWN"

type AssetData = {
  id?: number
  asset_id?: number
  asset_code?: string
  name?: string
  asset_name?: string
  asset_type?: string
  district_id?: number
  risk_zone_id?: number
  risk_zone_name?: string
  risk_level?: string
  probability?: number
  probability_percent?: number
  priority?: string
  exposure_count?: number
  status?: string
  recommendation?: string
}

type EngineAsset = {
  asset_id?: number
  asset_code?: string
  asset_name?: string
  asset_type?: string
  risk_level?: string
  probability?: number
  confidence?: string
  rainfall_trigger?: string
  priority?: string
  base_priority?: string
  impact_score?: number
  field_evidence_score?: number
  exposure_level?: string
  field_evidence_scope?: string
  field_reports?: number
  verified_reports?: number
  critical_reports?: number
  high_reports?: number
  photo_reports?: number
}

type InfrastructureResponse = {
  data?: AssetData[]
  engine_result?: {
    updated?: EngineAsset[]
  }
}

type PriorityLocation = {
  rank: string
  name: string
  district: string
  risk: RiskLevel
  priority: Priority
  impactScore: number | null
}

const riskStyles: Record<RiskLevel, string> = {
  CRITICAL: "text-red-400 bg-red-500/10",
  HIGH: "text-orange-400 bg-orange-500/10",
  MODERATE: "text-yellow-400 bg-yellow-500/10",
  LOW: "text-green-400 bg-green-500/10",
  UNKNOWN: "text-slate-400 bg-slate-500/10",
}

const priorityRank: Record<Priority, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  UNKNOWN: 99,
}

const riskRank: Record<RiskLevel, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MODERATE: 3,
  LOW: 4,
  UNKNOWN: 99,
}

function normalizeRisk(value?: string): RiskLevel {
  const risk = value?.toUpperCase()

  if (
    risk === "CRITICAL" ||
    risk === "HIGH" ||
    risk === "MODERATE" ||
    risk === "LOW"
  ) {
    return risk
  }

  return "UNKNOWN"
}

function normalizePriority(value?: string): Priority {
  const priority = value?.toUpperCase()

  if (priority === "P1" || priority === "P2" || priority === "P3") {
    return priority
  }

  return "UNKNOWN"
}

function isValidImpactScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function mergeAssets(
  data: AssetData[] = [],
  engineUpdated: EngineAsset[] = [],
): Array<AssetData & EngineAsset> {
  const engineByCode = new Map<string, EngineAsset>()
  const engineById = new Map<number, EngineAsset>()

  for (const item of engineUpdated) {
    if (item.asset_code) {
      engineByCode.set(item.asset_code, item)
    }

    if (typeof item.asset_id === "number") {
      engineById.set(item.asset_id, item)
    }
  }

  return data.map((asset) => {
    const engineMatch =
      (asset.asset_code
        ? engineByCode.get(asset.asset_code)
        : undefined) ??
      (typeof asset.id === "number"
        ? engineById.get(asset.id)
        : undefined) ??
      (typeof asset.asset_id === "number"
        ? engineById.get(asset.asset_id)
        : undefined)

    return {
      ...asset,
      ...(engineMatch ?? {}),
    }
  })
}

function toPriorityLocations(
  assets: Array<AssetData & EngineAsset>,
): PriorityLocation[] {
  return assets
    .map((asset) => {
      const risk = normalizeRisk(asset.risk_level)
      const priority = normalizePriority(
        asset.priority ?? asset.base_priority,
      )

      const impactScore = isValidImpactScore(asset.impact_score)
        ? asset.impact_score
        : null

      return {
        rank: "",
        name: asset.asset_name ?? asset.name ?? asset.asset_code ?? "Unknown",
        district:
          asset.risk_zone_name ??
          (asset.district_id
            ? `District ${asset.district_id}`
            : "District unavailable"),
        risk,
        priority,
        impactScore,
      }
    })
    .sort((a, b) => {
      const priorityDifference =
        priorityRank[a.priority] - priorityRank[b.priority]

      if (priorityDifference !== 0) {
        return priorityDifference
      }

      if (a.impactScore !== null && b.impactScore !== null) {
        return b.impactScore - a.impactScore
      }

      if (a.impactScore !== null) {
        return -1
      }

      if (b.impactScore !== null) {
        return 1
      }

      return riskRank[a.risk] - riskRank[b.risk]
    })
    .slice(0, 4)
    .map((location, index) => ({
      ...location,
      rank: String(index + 1).padStart(2, "0"),
    }))
}

export default function PriorityList() {
  const [locations, setLocations] = useState<PriorityLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPriorityData() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch("/api/infrastructure/recalculate", {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        })

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const payload =
          (await response.json()) as InfrastructureResponse

        if (cancelled) {
          return
        }

        /*
         * IMPORTANT:
         * /recalculate returns the normal asset records in `data`,
         * while the fresh impact/priority engine values are inside
         * `engine_result.updated`.
         *
         * Merge both using asset_code / asset_id so impact_score
         * is not lost.
         */
        const mergedAssets = mergeAssets(
          payload.data ?? [],
          payload.engine_result?.updated ?? [],
        )

        setLocations(toPriorityLocations(mergedAssets))
      } catch (requestError) {
        if (cancelled) {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load priority locations.",
        )
        setLocations([])
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPriorityData()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0a1926]">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Top Risk Locations
          </h3>

          <p className="mt-1 text-xs text-slate-600">
            Locations requiring attention
          </p>
        </div>

        <button className="text-xs text-green-400 hover:text-green-300">
          View all
        </button>
      </div>

      <div className="divide-y divide-slate-800">
        {loading ? (
          <div className="px-5 py-6 text-xs text-slate-500">
            Loading priority locations...
          </div>
        ) : error ? (
          <div className="px-5 py-6 text-xs text-slate-500">
            Priority data unavailable.
          </div>
        ) : locations.length === 0 ? (
          <div className="px-5 py-6 text-xs text-slate-500">
            No verified priority locations available.
          </div>
        ) : (
          locations.map((location) => (
            <div
              key={`${location.rank}-${location.name}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-900/40"
            >
              <span className="w-6 text-xs font-semibold text-slate-600">
                {location.rank}
              </span>

              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">
                  {location.name}
                </p>

                <p className="mt-1 text-[11px] text-slate-600">
                  {location.district}
                </p>
              </div>

              <span
                className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                  riskStyles[location.risk]
                }`}
              >
                {location.risk}
              </span>

              <span className="rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400">
                {location.priority}
              </span>

              {location.impactScore !== null ? (
                <span className="hidden rounded-md bg-slate-500/10 px-2 py-1 text-[10px] font-medium text-slate-400 sm:inline-flex">
                  Impact {location.impactScore.toFixed(1)}
                </span>
              ) : (
                <span className="hidden rounded-md bg-slate-500/10 px-2 py-1 text-[10px] font-medium text-slate-600 sm:inline-flex">
                  Impact unavailable
                </span>
              )}

              <ChevronRight className="h-4 w-4 text-slate-700" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}