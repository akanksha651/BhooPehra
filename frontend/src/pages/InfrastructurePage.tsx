import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Crosshair,
  Hospital,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  School,
  Users,
  XCircle,
} from "lucide-react"

type AssetType =
  | "ROAD"
  | "BRIDGE"
  | "SCHOOL"
  | "HOSPITAL"
  | "VILLAGE"

type RiskLevel =
  | "CRITICAL"
  | "HIGH"
  | "MODERATE"
  | "LOW"

type Priority =
  | "P1"
  | "P2"
  | "P3"

type AssetStatus =
  | "AT RISK"
  | "MONITORED"
  | "SAFE"

type VerificationStatus =
  | "VERIFIED"
  | "PARTIAL"
  | "UNVERIFIED"
  | "GEOMETRY_UNAVAILABLE"
  | "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
  | "NO_RISK_ZONE_ASSIGNMENT"
  | "RISK_ZONE_NOT_FOUND"
  | "RISK_ZONE_GEOMETRY_UNAVAILABLE"

type Coordinates = {
  longitude: number
  latitude: number
}

type RoutingStatus = {
  status: string
  routing_engine: string
  routing_graph: {
    edges: number
    vertices: number
    blocked_edges: number
    available_edges: number
  }
  road_network: {
    roads: number
    blocked_roads: number
  }
  source: string
  synthetic_geometry: boolean
}

type RouteResponse = {
  status: "route_found" | "route_unavailable"
  routing_engine?: string
  source?: string
  blocked_edges_excluded?: boolean
  matched_vertices?: {
    start: number
    end: number
  }
  snap_distances_m?: {
    start: number
    end: number
  }
  distance_m?: number
  distance_km?: number
  edge_count?: number
  eta_minutes?: number | null
  eta_status?: string
  geometry?: {
    type: "Feature"
    properties: Record<string, unknown>
    geometry: Record<string, unknown>
  }
  reason?: string
  message?: string
}

type BlockageSyncResponse = {
  status: string
  blockage_source: string
  spatial_method: string
  routing_sync_method: string
  synthetic_geometry_created: boolean
  match_tolerance_m: number
  verified_reports_seen: number
  eligible_road_impact_reports: number
  matched_reports: number
  unmatched_reports: number
  road_network_blocked: number
  routing_blocked_edges: number
  cleared_previous_field_report_blockages: {
    road_network_rows: number
    routing_edge_rows: number
  }
  matched: Array<{
    report_id: number
    report_code: string
    road_id: number
    osm_id: string
    road_class: string
    road_name: string
    road_ref: string
    match_distance_m: number
    match_tolerance_m: number
    road_network_rows_updated: number
    routing_edges_blocked: number
  }>
  unmatched: Array<{
    report_id: number
    report_code: string
    reason: string
    tolerance_m?: number
    road_id?: number
    osm_id?: string
  }>
}

type BackendAsset = {
  id: number
  asset_code: string
  name: string
  asset_type: AssetType
  district_id: number
  risk_zone_id: number | null
  risk_zone_name: string | null
  risk_level: RiskLevel
  probability: number
  probability_percent: number | null
  priority: Priority
  exposure_count: number
  status: string
  recommendation: string | null
  geometry: {
    available: boolean
    spatially_verified: boolean
    zone_intersection: boolean
    verification_status: VerificationStatus
    geometry_type: string | null
    wkt?: string | null
    coordinates: Coordinates | null
  }
  population_exposure: {
    count: number
    basis: string
    operational_known_count: number
  }
  operational_exposure: {
    basis: string
    known: boolean
    requires_spatial_verification: boolean
  }
  created_at: string | null
  updated_at: string | null
}

type ExposureResponse = {
  status: string
  exposure_basis: string
  spatial_method: string
  synthetic_coordinates_created: boolean
  summary: {
    risk_zones: number
    known_affected_villages: number
    known_affected_roads: number
    spatial_affected_villages: number
    spatial_affected_roads: number
    spatial_assets: number
    unverified_assets: number
    outside_zone_assets: number
  }
  data: unknown[]
}

type InfrastructureAsset = {
  id: string
  backendId: number
  name: string
  type: AssetType
  district: string
  state: string
  location: string
  risk: RiskLevel
  probability: number
  priority: Priority
  status: AssetStatus
  exposure: string
  description: string
  recommendation: string
  geometryAvailable: boolean
  geometryVerified: boolean
  outsideZone: boolean
  verificationStatus: VerificationStatus
  exposureCount: number
  spatialExposureCount: number
  exposureBasis: string
  riskZoneId: number | null
  riskZoneName: string
  coordinates: Coordinates | null
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000"

const DISTRICT_NAMES: Record<number, string> = {
  1: "Gangtok",
  2: "Tawang",
  3: "Dibang Valley",
  4: "East Khasi Hills",
  5: "Aizawl",
  6: "Kohima",
}

const DISTRICT_STATES: Record<number, string> = {
  1: "Sikkim",
  2: "Arunachal Pradesh",
  3: "Arunachal Pradesh",
  4: "Meghalaya",
  5: "Mizoram",
  6: "Nagaland",
}

const riskStyles: Record<
  RiskLevel,
  {
    text: string
    bg: string
    border: string
  }
> = {
  CRITICAL: {
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  HIGH: {
    text: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  MODERATE: {
    text: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  LOW: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
}

const typeLabels: Record<AssetType, string> = {
  ROAD: "Road",
  BRIDGE: "Bridge",
  SCHOOL: "School",
  HOSPITAL: "Hospital",
  VILLAGE: "Village",
}

function getDistrictName(
  districtId: number,
): string {
  return (
    DISTRICT_NAMES[districtId] ||
    `District ${districtId}`
  )
}

function getStateName(
  districtId: number,
): string {
  return (
    DISTRICT_STATES[districtId] ||
    "Northeast India"
  )
}

function normalizeStatus(
  status: string,
): AssetStatus {
  const value =
    status.toUpperCase()

  if (
    value === "AT_RISK" ||
    value === "AT RISK"
  ) {
    return "AT RISK"
  }

  if (
    value === "MONITORING" ||
    value === "MONITORED"
  ) {
    return "MONITORED"
  }

  return "SAFE"
}

function probabilityPercent(
  asset: BackendAsset,
): number {
  if (
    typeof asset.probability_percent ===
    "number"
  ) {
    return asset.probability_percent
  }

  return Number(
    (asset.probability * 100).toFixed(1),
  )
}

function buildDescription(
  asset: BackendAsset,
): string {
  const verification =
    asset.geometry?.verification_status

  if (
    verification ===
    "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
  ) {
    return (
      "Actual asset geometry is available, but it does not intersect the assigned risk-zone polygon. Spatial exposure is therefore not confirmed."
    )
  }

  if (
    verification ===
    "GEOMETRY_UNAVAILABLE"
  ) {
    return (
      "The asset is present in the operational infrastructure registry, but its GIS geometry is not yet available for spatial intersection verification."
    )
  }

  if (
    asset.geometry
      ?.spatially_verified
  ) {
    return (
      "Asset geometry has been spatially verified against the assigned landslide risk zone using PostGIS."
    )
  }

  return (
    "Current assessment combines the operational infrastructure registry with the available landslide risk information."
  )
}

function buildExposureText(
  asset: BackendAsset,
): string {
  const known =
    asset.exposure_count || 0

  if (
    asset.geometry
      ?.spatially_verified
  ) {
    return `${known.toLocaleString()} known exposure · ${asset.population_exposure.count.toLocaleString()} spatially verified`
  }

  if (
    asset.geometry?.available &&
    asset.geometry
      ?.verification_status ===
      "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"
  ) {
    return `${known.toLocaleString()} known operational exposure · outside assigned risk zone`
  }

  return `${known.toLocaleString()} known operational exposure · GIS geometry pending`
}

function mapBackendAsset(
  asset: BackendAsset,
): InfrastructureAsset {
  const probability =
    probabilityPercent(asset)

  return {
    id: asset.asset_code,
    backendId: asset.id,
    name: asset.name,
    type: asset.asset_type,
    district: getDistrictName(
      asset.district_id,
    ),
    state: getStateName(
      asset.district_id,
    ),
    location:
      asset.risk_zone_name ||
      "Unassigned",
    risk: asset.risk_level,
    probability,
    priority: asset.priority,
    status: normalizeStatus(
      asset.status,
    ),
    exposure:
      buildExposureText(asset),
    description:
      buildDescription(asset),
    recommendation:
      asset.recommendation ||
      "Continue monitoring and reassess if rainfall or field evidence increases.",
    geometryAvailable:
      asset.geometry?.available ===
      true,
    geometryVerified:
      asset.geometry
        ?.spatially_verified ===
      true,
    outsideZone:
      asset.geometry
        ?.verification_status ===
      "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION",
    verificationStatus:
      asset.geometry
        ?.verification_status ||
      "UNVERIFIED",
    exposureCount:
      asset.exposure_count || 0,
    spatialExposureCount:
      asset.population_exposure
        ?.count || 0,
    exposureBasis:
      asset.population_exposure
        ?.basis ||
      "UNKNOWN",
    riskZoneId:
      asset.risk_zone_id,
    riskZoneName:
      asset.risk_zone_name ||
      "Unassigned",
    coordinates:
      asset.geometry?.coordinates ||
      null,
  }
}

export default function InfrastructurePage() {
  const [assets, setAssets] =
    useState<InfrastructureAsset[]>([])

  const [exposureData, setExposureData] =
    useState<ExposureResponse | null>(
      null,
    )

  const [selectedId, setSelectedId] =
    useState<string | null>(null)

  const [typeFilter, setTypeFilter] =
    useState<AssetType | "ALL">("ALL")

  const [riskFilter, setRiskFilter] =
    useState<RiskLevel | "ALL">("ALL")

  const [search, setSearch] =
    useState("")

  const [showFilters, setShowFilters] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [refreshMessage, setRefreshMessage] =
    useState<string | null>(null)

  const [routingStatus, setRoutingStatus] =
    useState<RoutingStatus | null>(null)

  const [routingLoading, setRoutingLoading] =
    useState(false)

  const [routeError, setRouteError] =
    useState<string | null>(null)

  const [routeResult, setRouteResult] =
    useState<RouteResponse | null>(null)

  const [routeStart, setRouteStart] =
    useState<Coordinates | null>(null)

  const [routeDestination, setRouteDestination] =
    useState<Coordinates | null>(null)

  const [syncingBlockages, setSyncingBlockages] =
    useState(false)

  const [blockageSyncMessage, setBlockageSyncMessage] =
    useState<string | null>(null)

  async function fetchInfrastructureData() {
    const [
      assetsResponse,
      exposureResponse,
    ] = await Promise.all([
      fetch(
        `${API_BASE}/api/infrastructure/assets`,
      ),
      fetch(
        `${API_BASE}/api/infrastructure/exposure`,
      ),
    ])

    if (!assetsResponse.ok) {
      throw new Error(
        `Infrastructure API failed: ${assetsResponse.status}`,
      )
    }

    if (!exposureResponse.ok) {
      throw new Error(
        `Exposure API failed: ${exposureResponse.status}`,
      )
    }

    const assetsJson =
      await assetsResponse.json()

    const exposureJson =
      await exposureResponse.json()

    const backendAssets: BackendAsset[] =
      assetsJson.data || []

    const mappedAssets =
      backendAssets.map(
        mapBackendAsset,
      )

    setAssets(mappedAssets)
    setExposureData(
      exposureJson,
    )

    setSelectedId(
      (current) => {
        if (
          current &&
          mappedAssets.some(
            (asset) =>
              asset.id === current,
          )
        ) {
          return current
        }

        return mappedAssets.length > 0
          ? mappedAssets[0].id
          : null
      },
    )
  }

  async function loadInfrastructure(
    refresh = false,
  ) {
    if (refresh) {
      setRefreshing(true)
      setRefreshMessage(null)
    } else {
      setLoading(true)
    }

    setError(null)

    try {
      await fetchInfrastructureData()

      if (refresh) {
        setRefreshMessage(
          "Infrastructure data refreshed successfully.",
        )
      }
    } catch (err) {
      console.error(
        "Infrastructure loading error:",
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load infrastructure data.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function recalculateRisk() {
    setRefreshing(true)
    setError(null)
    setRefreshMessage(null)

    try {
      const response =
        await fetch(
          `${API_BASE}/api/infrastructure/recalculate`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
          },
        )

      if (!response.ok) {
        throw new Error(
          `Risk recalculation failed: ${response.status}`,
        )
      }

      await fetchInfrastructureData()

      setRefreshMessage(
        "Risk, impact and priority recalculated successfully.",
      )
    } catch (err) {
      console.error(
        "Risk recalculation error:",
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : "Risk recalculation failed.",
      )
    } finally {
      setRefreshing(false)
    }
  }

  async function fetchRoutingStatus() {
    try {
      const response = await fetch(
        `${API_BASE}/api/routing/status`,
      )

      if (!response.ok) {
        throw new Error(
          `Routing status failed: ${response.status}`,
        )
      }

      const data: RoutingStatus =
        await response.json()

      setRoutingStatus(data)
    } catch (err) {
      console.error(
        "Routing status error:",
        err,
      )
      setRoutingStatus(null)
    }
  }

  async function syncBlockages() {
    setSyncingBlockages(true)
    setRouteError(null)
    setBlockageSyncMessage(null)

    try {
      const response = await fetch(
        `${API_BASE}/api/routing/sync-blockages`,
        {
          method: "POST",
        },
      )

      if (!response.ok) {
        throw new Error(
          `Blockage synchronization failed: ${response.status}`,
        )
      }

      const data: BlockageSyncResponse =
        await response.json()

      setBlockageSyncMessage(
        `${data.routing_blocked_edges} routing edge${
          data.routing_blocked_edges === 1
            ? ""
            : "s"
        } blocked from ${
          data.matched_reports
        } verified field report${
          data.matched_reports === 1
            ? ""
            : "s"
        }.`,
      )

      await fetchRoutingStatus()
    } catch (err) {
      console.error(
        "Blockage synchronization error:",
        err,
      )

      setBlockageSyncMessage(null)
      setRouteError(
        err instanceof Error
          ? err.message
          : "Unable to synchronize road blockages.",
      )
    } finally {
      setSyncingBlockages(false)
    }
  }

  async function calculateRoute() {
    if (!routeStart || !routeDestination) {
      setRouteError(
        "Enter both start and destination coordinates.",
      )
      return
    }

    setRoutingLoading(true)
    setRouteError(null)
    setRouteResult(null)

    try {
      const params = new URLSearchParams({
        start_latitude: String(
          routeStart.latitude,
        ),
        start_longitude: String(
          routeStart.longitude,
        ),
        end_latitude: String(
          routeDestination.latitude,
        ),
        end_longitude: String(
          routeDestination.longitude,
        ),
      })

      const response = await fetch(
        `${API_BASE}/api/routing/route?${params.toString()}`,
      )

      if (!response.ok) {
        throw new Error(
          `Route calculation failed: ${response.status}`,
        )
      }

      const data: RouteResponse =
        await response.json()

      setRouteResult(data)

      if (data.status === "route_unavailable") {
        setRouteError(
          "No route was found while avoiding currently blocked roads.",
        )
      }
    } catch (err) {
      console.error(
        "Route calculation error:",
        err,
      )

      setRouteError(
        err instanceof Error
          ? err.message
          : "Unable to calculate alternate route.",
      )
    } finally {
      setRoutingLoading(false)
    }
  }

  function useSelectedAsDestination() {
    if (!selected?.coordinates) {
      setRouteError(
        "Selected asset does not have verified coordinates.",
      )
      return
    }

    setRouteDestination({
      latitude:
        selected.coordinates.latitude,
      longitude:
        selected.coordinates.longitude,
    })

    setRouteError(null)
    setRouteResult(null)
  }

  function useSelectedAsStart() {
    if (!selected?.coordinates) {
      setRouteError(
        "Selected asset does not have verified coordinates.",
      )
      return
    }

    setRouteStart({
      latitude:
        selected.coordinates.latitude,
      longitude:
        selected.coordinates.longitude,
    })

    setRouteError(null)
    setRouteResult(null)
  }

  function locateOnMap(
    asset: InfrastructureAsset,
  ) {
    if (!asset.coordinates) {
      return
    }

    const {
      latitude,
      longitude,
    } = asset.coordinates

    const osmUrl =
      `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`

    window.open(
      osmUrl,
      "_blank",
      "noopener,noreferrer",
    )
  }

  useEffect(() => {
    void loadInfrastructure()
    void fetchRoutingStatus()
  }, [])

  const filteredAssets = useMemo(() => {
    const normalizedQuery = search
      .normalize("NFKC")
      .trim()
      .toLowerCase()

    const queryTerms = normalizedQuery
      .split(/\s+/)
      .filter(Boolean)

    const normalizeSearchValue = (
      value: unknown,
    ) =>
      String(value ?? "")
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()

    return assets.filter((asset) => {
      const typeMatch =
        typeFilter === "ALL" ||
        asset.type === typeFilter

      const riskMatch =
        riskFilter === "ALL" ||
        asset.risk === riskFilter

      if (!normalizedQuery) {
        return typeMatch && riskMatch
      }

      const searchableText = [
        asset.name,
        asset.id,
        asset.district,
        asset.state,
        asset.location,
        typeLabels[asset.type],
        asset.type,
        asset.risk,
        asset.priority,
      ]
        .map(normalizeSearchValue)
        .filter(Boolean)
        .join(" ")

      const searchMatch = queryTerms.every(
        (term) =>
          searchableText.includes(term),
      )

      return (
        typeMatch &&
        riskMatch &&
        searchMatch
      )
    })
  }, [
    assets,
    typeFilter,
    riskFilter,
    search,
  ])

  useEffect(() => {
    if (
      filteredAssets.length === 1
    ) {
      setSelectedId(
        filteredAssets[0].id,
      )
    }
  }, [filteredAssets])

  const selected =
    assets.find(
      (asset) =>
        asset.id === selectedId,
    ) ||
    assets[0] ||
    null

  const roadCount =
    assets.filter(
      (asset) =>
        asset.type === "ROAD",
    ).length

  const bridgeCount =
    assets.filter(
      (asset) =>
        asset.type === "BRIDGE",
    ).length

  const highExposureCount =
    assets.filter(
      (asset) =>
        asset.risk === "CRITICAL" ||
        asset.risk === "HIGH",
    ).length

  const monitoredCount =
    assets.filter(
      (asset) =>
        asset.status === "MONITORED",
    ).length

  const verifiedCount =
    assets.filter(
      (asset) =>
        asset.geometryVerified,
    ).length

  const outsideZoneCount =
    assets.filter(
      (asset) =>
        asset.outsideZone,
    ).length

  const geometryPendingCount =
    assets.filter(
      (asset) =>
        !asset.geometryAvailable,
    ).length

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#06111c] text-slate-100">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <RefreshCw
            size={18}
            className="animate-spin text-emerald-400"
          />
          Loading infrastructure intelligence...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] text-slate-100">
      {/* HEADER */}
      <div className="border-b border-white/5 bg-[#081522] px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Building2 size={14} />
              Impact Intelligence
              <span>/</span>
              Infrastructure
            </div>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Infrastructure Exposure
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Monitor critical assets exposed to landslide risk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
              <ShieldAlert size={14} />
              Impact Engine Active
            </div>

            <button
              onClick={() =>
                void recalculateRisk()
              }
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              Refresh Risk
            </button>

            <button
              onClick={() =>
                setShowFilters(
                  (value) => !value,
                )
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

      {/* STATUS */}
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/[0.04] px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle size={14} />
            {error}
          </div>
        </div>
      )}

      {refreshMessage && (
        <div className="border-b border-emerald-500/20 bg-emerald-500/[0.04] px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 size={14} />
            {refreshMessage}
          </div>
        </div>
      )}

      {/* GIS STATUS */}
      <div className="border-b border-white/5 bg-[#07131f] px-6 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <MapPin
              size={14}
              className="text-emerald-400"
            />

            <span>
              GIS exposure verification uses actual asset geometry +
              PostGIS ST_Intersects.
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-600">
              Geometry Pending:{" "}
              {geometryPendingCount}
            </span>

            <span className="text-[10px] text-slate-600">
              Synthetic Coordinates: No
            </span>
          </div>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 gap-3 border-b border-white/5 bg-[#07131f] px-6 py-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Road Segments"
          value={roadCount}
          icon={<Route size={17} />}
          className="text-slate-200"
        />

        <SummaryCard
          label="Bridges"
          value={bridgeCount}
          icon={
            <Navigation size={17} />
          }
          className="text-blue-400"
        />

        <SummaryCard
          label="High Exposure"
          value={highExposureCount}
          icon={
            <AlertTriangle size={17} />
          }
          className="text-orange-400"
        />

        <SummaryCard
          label="Under Monitoring"
          value={monitoredCount}
          icon={
            <CheckCircle2 size={17} />
          }
          className="text-yellow-400"
        />

        <SummaryCard
          label="Spatially Verified"
          value={verifiedCount}
          icon={
            <CheckCircle2 size={17} />
          }
          className="text-emerald-400"
        />

        <SummaryCard
          label="Outside Zone"
          value={outsideZoneCount}
          icon={<XCircle size={17} />}
          className="text-orange-400"
        />
      </div>

      {/* EXPOSURE SUMMARY */}
      {exposureData && (
        <div className="border-b border-white/5 bg-[#081522] px-6 py-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <ExposureMetric
              label="Known Roads"
              value={
                exposureData.summary
                  .known_affected_roads
              }
              detail="Operational"
            />

            <ExposureMetric
              label="Known Villages"
              value={
                exposureData.summary
                  .known_affected_villages
              }
              detail="Operational"
            />

            <ExposureMetric
              label="Spatial Assets"
              value={
                exposureData.summary
                  .spatial_assets
              }
              detail="Verified"
            />

            <ExposureMetric
              label="Geometry Pending"
              value={
                exposureData.summary
                  .unverified_assets
              }
              detail="Needs verification"
            />

            <ExposureMetric
              label="Outside Zone"
              value={
                exposureData.summary
                  .outside_zone_assets
              }
              detail="No intersection"
            />
          </div>
        </div>
      )}

      {/* FILTERS */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-[#081522] px-6 py-3">
          <FilterSelect
            value={typeFilter}
            onChange={(value) =>
              setTypeFilter(
                value as
                  | AssetType
                  | "ALL",
              )
            }
            options={[
              "ALL",
              "ROAD",
              "BRIDGE",
              "SCHOOL",
              "HOSPITAL",
              "VILLAGE",
            ]}
          />

          <FilterSelect
            value={riskFilter}
            onChange={(value) =>
              setRiskFilter(
                value as
                  | RiskLevel
                  | "ALL",
              )
            }
            options={[
              "ALL",
              "CRITICAL",
              "HIGH",
              "MODERATE",
              "LOW",
            ]}
          />

          {(typeFilter !== "ALL" ||
            riskFilter !== "ALL") && (
            <button
              onClick={() => {
                setTypeFilter("ALL")
                setRiskFilter("ALL")
              }}
              className="text-xs text-slate-500 transition hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <div className="grid min-h-[calc(100vh-350px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_410px]">
        {/* ASSET REGISTRY */}
        <section className="border-r border-white/5">
          <div className="border-b border-white/5 bg-[#081522] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  Asset Registry
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {filteredAssets.length} assets in current view
                </p>
              </div>

              <div className="relative w-full md:w-72">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Search infrastructure..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/30"
                />
              </div>
            </div>
          </div>

          <div className="divide-y divide-white/5">
            {filteredAssets.map(
              (asset) => {
                const styles =
                  riskStyles[asset.risk]

                return (
                  <button
                    key={asset.id}
                    onClick={() =>
                      setSelectedId(
                        asset.id,
                      )
                    }
                    className={`w-full px-5 py-4 text-left transition hover:bg-white/[0.025] ${
                      selected?.id ===
                      asset.id
                        ? "border-l-2 border-emerald-500 bg-emerald-500/[0.04]"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-lg p-2 ${styles.bg} ${styles.text}`}
                      >
                        <AssetIcon
                          type={
                            asset.type
                          }
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[9px] font-bold ${styles.bg} ${styles.text}`}
                          >
                            {asset.risk}
                          </span>

                          <span className="rounded bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                            {asset.priority}
                          </span>

                          <span className="text-[10px] text-slate-600">
                            {asset.id}
                          </span>
                        </div>

                        <h3 className="mt-2 truncate text-sm font-semibold text-slate-200">
                          {asset.name}
                        </h3>

                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin size={12} />
                          {asset.location},{" "}
                          {asset.state}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-slate-500">
                          <span>
                            Probability{" "}
                            <strong className="text-slate-300">
                              {
                                asset.probability
                              }
                              %
                            </strong>
                          </span>

                          <span>
                            {
                              typeLabels[
                                asset.type
                              ]
                            }
                          </span>

                          <span
                            className={
                              asset.status ===
                              "AT RISK"
                                ? "text-red-400"
                                : asset.status ===
                                    "MONITORED"
                                  ? "text-yellow-400"
                                  : "text-emerald-400"
                            }
                          >
                            {asset.status}
                          </span>
                        </div>

                        <div className="mt-2">
                          <VerificationBadge
                            status={
                              asset.verificationStatus
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                )
              },
            )}

            {filteredAssets.length ===
              0 && (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Search
                  size={28}
                  className="text-slate-700"
                />

                <p className="mt-3 text-sm text-slate-500">
                  No assets found
                </p>

                <button
                  onClick={() =>
                    setSearch("")
                  }
                  className="mt-2 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </section>

        {/* DETAIL PANEL */}
        <aside className="bg-[#081522]">
          {!selected ? (
            <div className="flex min-h-[500px] items-center justify-center p-6 text-center">
              <div>
                <Building2
                  size={32}
                  className="mx-auto text-slate-700"
                />

                <p className="mt-3 text-sm text-slate-500">
                  No infrastructure asset available.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-white/5 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Asset Intelligence
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      Exposure Details
                    </div>
                  </div>

                  <div
                    className={`rounded-lg p-2 ${
                      riskStyles[
                        selected.risk
                      ].bg
                    } ${
                      riskStyles[
                        selected.risk
                      ].text
                    }`}
                  >
                    <AssetIcon
                      type={selected.type}
                    />
                  </div>
                </div>
              </div>

              <div className="p-5">
                {/* ASSET HEADING */}
                <div
                  className={`rounded-xl border p-4 ${
                    riskStyles[
                      selected.risk
                    ].border
                  } ${
                    riskStyles[
                      selected.risk
                    ].bg
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className={`text-[10px] font-bold tracking-widest ${
                          riskStyles[
                            selected.risk
                          ].text
                        }`}
                      >
                        {
                          selected.risk
                        }{" "}
                        EXPOSURE
                      </div>

                      <h2 className="mt-2 text-lg font-semibold">
                        {selected.name}
                      </h2>

                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <MapPin size={12} />
                        {selected.location}
                      </div>

                      <div className="mt-1 text-[10px] text-slate-600">
                        {selected.id} ·{" "}
                        {selected.district} ·{" "}
                        {selected.state}
                      </div>
                    </div>

                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-[9px] font-bold text-slate-400">
                      {selected.priority}
                    </span>
                  </div>
                </div>

                {/* GIS VERIFICATION */}
                <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        GIS Verification
                      </div>

                      <div className="mt-2">
                        <VerificationBadge
                          status={
                            selected.verificationStatus
                          }
                          large
                        />
                      </div>
                    </div>

                    {selected.geometryVerified ? (
                      <CheckCircle2
                        size={20}
                        className="text-emerald-400"
                      />
                    ) : selected.outsideZone ? (
                      <XCircle
                        size={20}
                        className="text-orange-400"
                      />
                    ) : (
                      <MapPin
                        size={20}
                        className="text-yellow-400"
                      />
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <InfoCard
                      label="Geometry"
                      value={
                        selected.geometryAvailable
                          ? "Available"
                          : "Pending"
                      }
                    />

                    <InfoCard
                      label="Spatial Status"
                      value={
                        selected.geometryVerified
                          ? "Verified"
                          : selected.outsideZone
                            ? "Outside Zone"
                            : "Unverified"
                      }
                    />
                  </div>

                  {selected.coordinates && (
                    <div className="mt-3 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] p-3">
                      <div className="text-[9px] uppercase tracking-wider text-slate-600">
                        Actual Coordinates
                      </div>

                      <div className="mt-1 font-mono text-[10px] text-emerald-400">
                        {selected.coordinates.latitude.toFixed(
                          6,
                        )}
                        ,{" "}
                        {selected.coordinates.longitude.toFixed(
                          6,
                        )}
                      </div>
                    </div>
                  )}

                  <p className="mt-3 text-[10px] leading-4 text-slate-600">
                    Actual asset geometry is used for spatial
                    verification. Synthetic coordinates are never created.
                  </p>
                </div>

                {/* ROAD BLOCKAGE + ALTERNATE ROUTING */}
                <div className="mt-4 rounded-xl border border-orange-500/10 bg-orange-500/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                        <Route
                          size={13}
                          className="text-orange-400"
                        />
                        Road Blockage &amp; Alternate Route
                      </div>

                      <p className="mt-2 text-[10px] leading-4 text-slate-500">
                        Verified field reports are matched to real OSM roads using PostGIS. Blocked routing edges are excluded from pgRouting Dijkstra.
                      </p>
                    </div>

                    <div
                      className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold ${
                        routingStatus?.routing_graph.blocked_edges
                          ? "border-orange-500/20 bg-orange-500/10 text-orange-400"
                          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      }`}
                    >
                      {routingStatus?.routing_graph.blocked_edges ??
                        "--"}{" "}
                      blocked
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <InfoCard
                      label="Routing Engine"
                      value={
                        routingStatus
                          ? "pgRouting Dijkstra"
                          : "Unavailable"
                      }
                    />

                    <InfoCard
                      label="Available Edges"
                      value={
                        routingStatus
                          ? routingStatus.routing_graph.available_edges.toLocaleString()
                          : "--"
                      }
                    />
                  </div>

                  <div className="mt-3">
                    <button
                      onClick={() =>
                        void syncBlockages()
                      }
                      disabled={
                        syncingBlockages
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw
                        size={13}
                        className={
                          syncingBlockages
                            ? "animate-spin"
                            : ""
                        }
                      />
                      {syncingBlockages
                        ? "Syncing Verified Blockages..."
                        : "Sync Verified Blockages"}
                    </button>
                  </div>

                  {blockageSyncMessage && (
                    <div className="mt-3 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] p-3 text-[10px] leading-4 text-emerald-400">
                      {blockageSyncMessage}
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="text-[9px] uppercase tracking-wider text-slate-600">
                      Route Start
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="any"
                        value={
                          routeStart?.latitude ??
                          ""
                        }
                        onChange={(event) => {
                          const value =
                            event.target.value

                          setRouteStart(
                            value === ""
                              ? null
                              : {
                                  latitude:
                                    Number(
                                      value,
                                    ),
                                  longitude:
                                    routeStart?.longitude ??
                                    0,
                                },
                          )

                          setRouteResult(null)
                          setRouteError(null)
                        }}
                        placeholder="Latitude"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-300 outline-none placeholder:text-slate-600 focus:border-orange-500/30"
                      />

                      <input
                        type="number"
                        step="any"
                        value={
                          routeStart?.longitude ??
                          ""
                        }
                        onChange={(event) => {
                          const value =
                            event.target.value

                          setRouteStart(
                            value === ""
                              ? null
                              : {
                                  latitude:
                                    routeStart?.latitude ??
                                    0,
                                  longitude:
                                    Number(
                                      value,
                                    ),
                                },
                          )

                          setRouteResult(null)
                          setRouteError(null)
                        }}
                        placeholder="Longitude"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-300 outline-none placeholder:text-slate-600 focus:border-orange-500/30"
                      />
                    </div>

                    <button
                      onClick={
                        useSelectedAsStart
                      }
                      disabled={
                        !selected.coordinates
                      }
                      className="mt-2 text-[10px] font-semibold text-emerald-400 transition hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Use selected asset as start
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-[9px] uppercase tracking-wider text-slate-600">
                      Route Destination
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="any"
                        value={
                          routeDestination?.latitude ??
                          ""
                        }
                        onChange={(event) => {
                          const value =
                            event.target.value

                          setRouteDestination(
                            value === ""
                              ? null
                              : {
                                  latitude:
                                    Number(
                                      value,
                                    ),
                                  longitude:
                                    routeDestination?.longitude ??
                                    0,
                                },
                          )

                          setRouteResult(null)
                          setRouteError(null)
                        }}
                        placeholder="Latitude"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-300 outline-none placeholder:text-slate-600 focus:border-orange-500/30"
                      />

                      <input
                        type="number"
                        step="any"
                        value={
                          routeDestination?.longitude ??
                          ""
                        }
                        onChange={(event) => {
                          const value =
                            event.target.value

                          setRouteDestination(
                            value === ""
                              ? null
                              : {
                                  latitude:
                                    routeDestination?.latitude ??
                                    0,
                                  longitude:
                                    Number(
                                      value,
                                    ),
                                },
                          )

                          setRouteResult(null)
                          setRouteError(null)
                        }}
                        placeholder="Longitude"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-300 outline-none placeholder:text-slate-600 focus:border-orange-500/30"
                      />
                    </div>

                    <button
                      onClick={
                        useSelectedAsDestination
                      }
                      disabled={
                        !selected.coordinates
                      }
                      className="mt-2 text-[10px] font-semibold text-emerald-400 transition hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Use selected asset as destination
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      void calculateRoute()
                    }
                    disabled={
                      routingLoading ||
                      !routeStart ||
                      !routeDestination
                    }
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-xs font-semibold text-[#1b0d02] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Navigation
                      size={14}
                      className={
                        routingLoading
                          ? "animate-pulse"
                          : ""
                      }
                    />
                    {routingLoading
                      ? "Calculating Alternate Route..."
                      : "Calculate Alternate Route"}
                  </button>

                  {routeError && (
                    <div className="mt-3 rounded-lg border border-red-500/10 bg-red-500/[0.03] p-3 text-[10px] leading-4 text-red-400">
                      {routeError}
                    </div>
                  )}

                  {routeResult?.status ===
                    "route_found" &&
                    typeof routeResult.distance_km === "number" && (
                      <div className="mt-3 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-emerald-500/70">
                              Alternate Route Found
                            </div>

                            <div className="mt-1 text-sm font-semibold text-emerald-300">
                              {routeResult.distance_km}{" "}
                              km
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[9px] uppercase tracking-wider text-slate-600">
                              Edges
                            </div>

                            <div className="mt-1 text-xs font-semibold text-slate-300">
                              {routeResult.edge_count ?? "--"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <InfoCard
                            label="Blocked Edges"
                            value="Excluded"
                          />

                          <InfoCard
                            label="ETA"
                            value="Unavailable"
                          />
                        </div>

                        <p className="mt-3 text-[9px] leading-4 text-slate-600">
                          Route generated from the real OSM road graph. ETA is withheld because no verified route-speed data is available.
                        </p>
                      </div>
                    )}
                </div>

                {/* RISK PROBABILITY */}
                <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Risk Probability
                      </div>

                      <div className="mt-1 text-3xl font-bold">
                        {selected.probability}
                        %
                      </div>
                    </div>

                    <div
                      className={`text-xs font-semibold ${
                        riskStyles[
                          selected.risk
                        ].text
                      }`}
                    >
                      {selected.status}
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          Math.max(
                            selected.probability,
                            0,
                          ),
                          100,
                        )}%`,
                        backgroundColor:
                          selected.risk ===
                          "CRITICAL"
                            ? "#ef4444"
                            : selected.risk ===
                                "HIGH"
                              ? "#f97316"
                              : selected.risk ===
                                  "MODERATE"
                                ? "#eab308"
                                : "#22c55e",
                      }}
                    />
                  </div>
                </div>

                {/* ASSET INFO */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InfoCard
                    label="Asset Type"
                    value={
                      typeLabels[
                        selected.type
                      ]
                    }
                  />

                  <InfoCard
                    label="Priority"
                    value={
                      selected.priority
                    }
                  />

                  <InfoCard
                    label="District"
                    value={
                      selected.district
                    }
                  />

                  <InfoCard
                    label="Risk Zone"
                    value={
                      selected.riskZoneName
                    }
                  />
                </div>

                {/* EXPOSURE */}
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">
                    Exposure
                  </h3>

                  <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-orange-500/10 p-2 text-orange-400">
                        <Users size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-300">
                          Operational / Population Exposure
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {
                            selected.exposure
                          }
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <InfoCard
                            label="Known Exposure"
                            value={selected.exposureCount.toLocaleString()}
                          />

                          <InfoCard
                            label="Spatially Verified"
                            value={selected.spatialExposureCount.toLocaleString()}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ASSESSMENT */}
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">
                    Assessment
                  </h3>

                  <p className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-4 text-xs leading-5 text-slate-400">
                    {
                      selected.description
                    }
                  </p>
                </div>

                {/* RECOMMENDATION */}
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">
                    Recommended Action
                  </h3>

                  <div className="mt-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-400"
                      />

                      <p className="text-xs leading-5 text-slate-400">
                        {
                          selected.recommendation
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* PROVENANCE */}
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">
                    Data Provenance
                  </h3>

                  <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                    <div className="space-y-3">
                      <ProvenanceRow
                        label="Source"
                        value="BhooPehra Infrastructure API"
                      />

                      <ProvenanceRow
                        label="Spatial Method"
                        value="PostGIS ST_Intersects"
                      />

                      <ProvenanceRow
                        label="Exposure Basis"
                        value={
                          selected.exposureBasis
                        }
                      />

                      <ProvenanceRow
                        label="Coordinates"
                        value={
                          selected.geometryAvailable
                            ? "Actual geometry"
                            : "Not available"
                        }
                      />

                      <ProvenanceRow
                        label="Synthetic Coordinates"
                        value="None"
                      />
                    </div>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      locateOnMap(selected)
                    }
                    disabled={
                      !selected.coordinates
                    }
                    className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    title={
                      selected.coordinates
                        ? "Open verified coordinates on map"
                        : "Geometry is not available"
                    }
                  >
                    <Crosshair size={14} />
                    Locate on Map
                  </button>

                  <button
                    onClick={() =>
                      void recalculateRisk()
                    }
                    disabled={refreshing}
                    className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2.5 text-xs font-semibold text-[#03130d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={
                        refreshing
                          ? "animate-spin"
                          : ""
                      }
                    />
                    Refresh Risk
                  </button>
                </div>
              </div>
            </>
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
  icon: ReactNode
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

      <div
        className={`${className} opacity-80`}
      >
        {icon}
      </div>
    </div>
  )
}

function ExposureMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: number
  detail: string
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-lg font-bold text-slate-200">
          {value}
        </span>

        <span className="text-right text-[9px] text-slate-600">
          {detail}
        </span>
      </div>
    </div>
  )
}

function VerificationBadge({
  status,
  large = false,
}: {
  status: VerificationStatus
  large?: boolean
}) {
  const verified =
    status === "VERIFIED"

  const outside =
    status ===
    "GEOMETRY_AVAILABLE_NO_ZONE_INTERSECTION"

  const partial =
    status === "PARTIAL"

  const label = verified
    ? "Spatially Verified"
    : outside
      ? "Outside Risk Zone"
      : partial
        ? "Partially Verified"
        : status ===
            "RISK_ZONE_GEOMETRY_UNAVAILABLE"
          ? "Zone Geometry Pending"
          : status ===
              "NO_RISK_ZONE_ASSIGNMENT"
            ? "No Risk Zone"
            : "Geometry Pending"

  const classes = verified
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    : outside
      ? "border-orange-500/20 bg-orange-500/10 text-orange-400"
      : partial
        ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
        : "border-slate-500/20 bg-slate-500/10 text-slate-400"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${
        large
          ? "px-2.5 py-1.5 text-[10px]"
          : "px-2 py-1 text-[9px]"
      } font-semibold ${classes}`}
    >
      {verified ? (
        <CheckCircle2
          size={large ? 13 : 11}
        />
      ) : outside ? (
        <XCircle
          size={large ? 13 : 11}
        />
      ) : (
        <MapPin
          size={large ? 13 : 11}
        />
      )}

      {label}
    </span>
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
          onChange(
            event.target.value,
          )
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

function InfoCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-1 truncate text-xs font-semibold text-slate-300">
        {value}
      </div>
    </div>
  )
}

function ProvenanceRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </span>

      <span className="max-w-[230px] text-right text-[10px] font-medium text-slate-400">
        {value}
      </span>
    </div>
  )
}

function AssetIcon({
  type,
}: {
  type: AssetType
}) {
  switch (type) {
    case "ROAD":
      return <Route size={17} />

    case "BRIDGE":
      return <Navigation size={17} />

    case "SCHOOL":
      return <School size={17} />

    case "HOSPITAL":
      return <Hospital size={17} />

    case "VILLAGE":
      return <Users size={17} />

    default:
      return <CircleDot size={17} />
  }
}