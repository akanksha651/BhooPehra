import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Crosshair,
  Filter,
  Layers3,
  Map as MapIcon,
  MapPinned,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Waves,
  X,
  Info,
} from "lucide-react"
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"
import { LatLngBounds } from "leaflet"
import { useSearchParams } from "react-router"

type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW"
type Confidence = "HIGH" | "MODERATE" | "LOW"
type Priority = "P1" | "P2" | "P3"

type RiskLocation = {
  id: number
  name: string
  district: string
  state: string
  code: string
  lat: number | null
  lng: number | null
  risk: RiskLevel
  probability: number
  confidence: Confidence
  rainfall: string
  villages: number
  roads: number
  bridges: number
  priority: Priority
  trend: "Increasing" | "Stable" | "Decreasing"
  description: string
  geometry: unknown
  createdAt: string | null
  updatedAt: string | null
}

type RiskApiZone = {
  id: number
  name: string
  district: {
    id: number
    name: string
    state: string
    code: string
  }
  risk_level: RiskLevel
  probability: number
  confidence: Confidence
  rainfall_trigger: string
  priority: Priority
  affected_villages: number
  affected_roads: number
  geometry: unknown
  created_at: string | null
  updated_at: string | null
}

type RiskFusion = {
  status: string
  final_probability: number
  final_probability_percent: number
  final_risk_level: RiskLevel
  final_confidence: "HIGH" | "MEDIUM" | "LOW"
  operational_assessment: string
  signals: {
    ml: {
      probability: number
      probability_percent: number
      risk_level: RiskLevel
      confidence: string
    }
    rule_engine: {
      probability: number
      probability_percent: number
      risk_level: RiskLevel
      confidence: string
      rainfall_trigger: string
    }
  }
  fusion: {
    method: string
    ml_weight: number
    rule_engine_weight: number
  }
  agreement: {
    signals_agree: boolean
    signal_disagreement: boolean
  }
  database_write: boolean
  warnings?: string[]
}

type InfrastructureAsset = {
  id: number
  asset_code: string
  name: string
  asset_type: string
  district_id: number
  risk_zone_id: number | null
  risk_level: RiskLevel
  probability: number
  priority: Priority
  exposure_count: number
  capacity?: number | null
  status: string
  recommendation: string | null
  geometry: unknown
  spatially_verified?: boolean
  geometry_available?: boolean
}

type ShelterResult = {
  id: number
  asset_code: string
  name: string
  district_id: number
  capacity: number | null
  risk_zone_id: number | null
  safety_status: string
  distance_km?: number | null
  geometry_available?: boolean
}

type ShelterApiResponse = {
  status: string
  result_status: string
  shelter_registry: {
    registered_shelters: number
    mapped_shelters: number
    location_pending: number
  }
  shelters: ShelterResult[]
}

type RiskApiResponse = {
  count: number
  filters?: {
    district_id: number | null
    risk_level: RiskLevel | null
    priority: Priority | null
  }
  zones?: RiskApiZone[]
  data?: RiskApiZone[]
}

type GlobalSearchResult = {
  type: string
  id: number
  name: string
  subtitle?: string | null
  district?: string | null
  state?: string | null
  latitude?: number | null
  longitude?: number | null
  risk?: RiskLevel | null
  priority?: Priority | null
  source?: string | null
}

type DistrictBoundary = {
  id: number
  name: string
  state: string
  code: string
  srid: number | null
  geometry: unknown
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

const NER_BOUNDS: [[number, number], [number, number]] = [
  [21.3, 88.0],
  [29.9, 97.6],
]

// Keep the operational map centered on the Northeast India footprint.
// The viewport is intentionally tighter than the raw NER bounding box so
// adjacent countries/regions do not dominate the first screen.
const NER_CENTER: [number, number] = [25.8, 94.2]
const NER_OVERVIEW_ZOOM = 8.1

const riskStyles: Record<
  RiskLevel,
  {
    color: string
    bg: string
    text: string
    fillOpacity: number
  }
> = {
  CRITICAL: {
    color: "#ef4444",
    bg: "bg-red-500/10",
    text: "text-red-400",
    fillOpacity: 0.32,
  },
  HIGH: {
    color: "#f97316",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    fillOpacity: 0.28,
  },
  MODERATE: {
    color: "#eab308",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    fillOpacity: 0.24,
  },
  LOW: {
    color: "#22c55e",
    bg: "bg-green-500/10",
    text: "text-green-400",
    fillOpacity: 0.18,
  },
}

const assetColors: Record<string, string> = {
  ROAD: "#38bdf8",
  BRIDGE: "#a78bfa",
  VILLAGE: "#f59e0b",
  SCHOOL: "#fb7185",
  HOSPITAL: "#34d399",
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function getRiskPercent(value: number) {
  if (value <= 1) {
    return value * 100
  }

  return value
}

function getPolygonCoordinates(
  geometry: unknown,
): [number, number][][] {
  if (!geometry) {
    return []
  }

  let parsed: unknown = geometry

  if (typeof geometry === "string") {
    const trimmed = geometry.trim()

    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return []
    }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return []
  }

  const value = parsed as {
    type?: string
    coordinates?: unknown
    geometry?: unknown
    features?: unknown
  }

  if (value.type === "Feature") {
    return getPolygonCoordinates(value.geometry)
  }

  if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
    return value.features.flatMap((feature) =>
      getPolygonCoordinates(feature),
    )
  }

  if (!Array.isArray(value.coordinates)) {
    return []
  }

  if (value.type === "Polygon") {
    const polygons: [number, number][][] = []

    for (const rawRing of value.coordinates) {
      if (!Array.isArray(rawRing)) {
        continue
      }

      const ring: [number, number][] = []

      for (const rawPoint of rawRing) {
        if (
          Array.isArray(rawPoint) &&
          rawPoint.length >= 2 &&
          typeof rawPoint[0] === "number" &&
          typeof rawPoint[1] === "number"
        ) {
          ring.push([rawPoint[1], rawPoint[0]])
        }
      }

      if (ring.length >= 3) {
        polygons.push(ring)
      }
    }

    return polygons
  }

  if (value.type === "MultiPolygon") {
    const polygons: [number, number][][] = []

    for (const rawPolygon of value.coordinates) {
      if (!Array.isArray(rawPolygon)) {
        continue
      }

      const rawOuterRing = rawPolygon[0]

      if (!Array.isArray(rawOuterRing)) {
        continue
      }

      const ring: [number, number][] = []

      for (const rawPoint of rawOuterRing) {
        if (
          Array.isArray(rawPoint) &&
          rawPoint.length >= 2 &&
          typeof rawPoint[0] === "number" &&
          typeof rawPoint[1] === "number"
        ) {
          ring.push([rawPoint[1], rawPoint[0]])
        }
      }

      if (ring.length >= 3) {
        polygons.push(ring)
      }
    }

    return polygons
  }

  return []
}

function getPointFromGeometry(
  geometry: unknown,
): [number, number] | null {
  if (!geometry) {
    return null
  }

  if (typeof geometry === "string") {
    const trimmed = geometry.trim()

    const pointMatch = trimmed.match(
      /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i,
    )

    if (pointMatch) {
      const lng = Number(pointMatch[1])
      const lat = Number(pointMatch[2])

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng)
      ) {
        return [lat, lng]
      }
    }

    try {
      return getPointFromGeometry(
        JSON.parse(trimmed),
      )
    } catch {
      return null
    }
  }

  if (
    typeof geometry !== "object" ||
    geometry === null
  ) {
    return null
  }

  const value = geometry as {
    type?: string
    coordinates?: unknown
  }

  if (
    value.type === "Point" &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length >= 2 &&
    typeof value.coordinates[0] === "number" &&
    typeof value.coordinates[1] === "number"
  ) {
    return [
      value.coordinates[1],
      value.coordinates[0],
    ]
  }

  const backendGeometry = value as {
    available?: boolean
    coordinates?: {
      latitude?: unknown
      longitude?: unknown
    } | null
  }

  if (
    backendGeometry.available === true &&
    backendGeometry.coordinates !== null &&
    typeof backendGeometry.coordinates === "object" &&
    typeof backendGeometry.coordinates.latitude === "number" &&
    typeof backendGeometry.coordinates.longitude === "number"
  ) {
    return [
      backendGeometry.coordinates.latitude,
      backendGeometry.coordinates.longitude,
    ]
  }
  return null
}

function getPolygonBounds(
  polygons: [number, number][][],
) {
  const points = polygons.flat()

  if (points.length === 0) {
    return null
  }

  return new LatLngBounds(points)
}

function toRiskLocation(
  zone: RiskApiZone,
): RiskLocation {
  const polygons = getPolygonCoordinates(
    zone.geometry,
  )

  const bounds = getPolygonBounds(polygons)
  const center = bounds?.getCenter()

  const trend: RiskLocation["trend"] =
    zone.risk_level === "CRITICAL" ||
    zone.risk_level === "HIGH"
      ? "Increasing"
      : zone.risk_level === "LOW"
        ? "Decreasing"
        : "Stable"

  return {
    id: zone.id,
    name: zone.name,
    district: zone.district.name,
    state: zone.district.state,
    code: zone.district.code,
    lat: center?.lat ?? null,
    lng: center?.lng ?? null,
    risk: zone.risk_level,
    probability: zone.probability,
    confidence: zone.confidence,
    rainfall: zone.rainfall_trigger,
    villages: zone.affected_villages,
    roads: zone.affected_roads,
    bridges: 0,
    priority: zone.priority,
    trend,
    description:
      "Baseline risk assessment generated by the BhooPehra risk-zone engine. Dynamic ML + rainfall fusion is evaluated separately.",
    geometry: zone.geometry,
    createdAt: zone.created_at,
    updatedAt: zone.updated_at,
  }
}

function normalizeInfrastructurePayload(
  payload: unknown,
): InfrastructureAsset[] {
  if (Array.isArray(payload)) {
    return payload as InfrastructureAsset[]
  }

  if (
    typeof payload === "object" &&
    payload !== null
  ) {
    const value = payload as {
      data?: unknown
      assets?: unknown
    }

    if (Array.isArray(value.data)) {
      return value.data as InfrastructureAsset[]
    }

    if (Array.isArray(value.assets)) {
      return value.assets as InfrastructureAsset[]
    }
  }

  return []
}

function DistrictBoundaryLayer({
  districts,
  visible,
}: {
  districts: DistrictBoundary[]
  visible: boolean
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom())

    map.on("zoomend", handleZoom)

    return () => {
      map.off("zoomend", handleZoom)
    }
  }, [map])

  if (!visible) {
    return null
  }

  const showDistrictLabels = zoom >= 8.8

  return (
    <>
      {districts.map((district) => {
        const polygons = getPolygonCoordinates(
          district.geometry,
        )

        if (polygons.length === 0) {
          return null
        }

        return polygons.map((polygon, index) => (
          <Polygon
            key={`${district.id}-${index}`}
            positions={polygon}
            pathOptions={{
              color: "#94a3b8",
              weight: zoom >= 8.8 ? 1.15 : 0.8,
              opacity: 0.68,
              fill: false,
              fillOpacity: 0,
              interactive: false,
            }}
          >
            {showDistrictLabels && index === 0 && (
              <Tooltip
                permanent
                direction="center"
                opacity={0.9}
                className="bhoopehra-district-label"
              >
                <span className="text-[9px] font-medium">
                  {district.name}
                </span>
              </Tooltip>
            )}
          </Polygon>
        ))
      })}
    </>
  )
}

function StateBoundaryLabelLayer({
  districts,
  visible,
}: {
  districts: DistrictBoundary[]
  visible: boolean
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom())

    map.on("zoomend", handleZoom)

    return () => {
      map.off("zoomend", handleZoom)
    }
  }, [map])

  if (!visible || districts.length === 0 || zoom < 7.9) {
    return null
  }

  const stateBounds = new Map<string, LatLngBounds>()

  districts.forEach((district) => {
    const polygons = getPolygonCoordinates(district.geometry)

    if (polygons.length === 0) {
      return
    }

    let bounds = stateBounds.get(district.state)

    if (!bounds) {
      bounds = new LatLngBounds([])
      stateBounds.set(district.state, bounds)
    }

    polygons.forEach((polygon) => {
      polygon.forEach(([lat, lng]) => {
        bounds!.extend([lat, lng])
      })
    })
  })

  return (
    <>
      {Array.from(stateBounds.entries()).map(
        ([state, bounds]) => {
          if (!bounds.isValid()) {
            return null
          }

          const center = bounds.getCenter()

          return (
            <CircleMarker
              key={`state-label-${state}`}
              center={center}
              radius={1}
              pathOptions={{
                stroke: false,
                fillOpacity: 0,
                opacity: 0,
                interactive: false,
              }}
            >
              <Tooltip
                permanent
                direction="center"
                opacity={0.95}
                className="bhoopehra-state-label"
              >
                <span className="text-[12px] font-bold uppercase tracking-[0.08em]">
                  {state}
                </span>
              </Tooltip>
            </CircleMarker>
          )
        },
      )}
    </>
  )
}

function MapViewport({

  selected,
  locations,
  searchPoint,
}: {
  selected: RiskLocation | null
  locations: RiskLocation[]
  searchPoint: [number, number] | null
}) {
  const map = useMap()
  const initialViewDone = useRef(false)
  const previousSelectedId = useRef<number | null>(
    null,
  )
  const previousSearchPoint = useRef<string | null>(
    null,
  )

  useEffect(() => {
    if (locations.length === 0) {
      map.fitBounds(
        new LatLngBounds(NER_BOUNDS),
        {
          padding: [30, 30],
        },
      )
      return
    }

    /*
     * A selected risk zone always gets priority over
     * the NER overview. This prevents the map from
     * remaining zoomed out after a location is selected
     * or loaded from the backend.
     */
    if (selected && !searchPoint) {
      const selectionChanged =
        previousSelectedId.current !== selected.id

      if (selectionChanged || !initialViewDone.current) {
        const polygons =
          getPolygonCoordinates(
            selected.geometry,
          )

        const bounds =
          getPolygonBounds(polygons)

        if (bounds) {
          map.fitBounds(bounds, {
            padding: [90, 90],
            maxZoom: 12,
            duration: 0.8,
          })
        } else if (
          selected.lat !== null &&
          selected.lng !== null
        ) {
          map.flyTo(
            [selected.lat, selected.lng],
            11,
            {
              duration: 0.8,
            },
          )
        }

        previousSelectedId.current =
          selected.id
        initialViewDone.current = true
      }

      return
    }

    if (searchPoint) {
      const searchKey = `${searchPoint[0]},${searchPoint[1]}`

      if (
        previousSearchPoint.current !==
        searchKey
      ) {
        previousSearchPoint.current =
          searchKey

        map.flyTo(
          searchPoint,
          12,
          {
            duration: 0.9,
          },
        )
      }

      return
    }

    if (initialViewDone.current) {
      return
    }

    map.setView(
      NER_CENTER,
      NER_OVERVIEW_ZOOM,
      {
        animate: true,
        duration: 0.8,
      },
    )

    initialViewDone.current = true
  }, [locations, selected, searchPoint, map])

  return null
}

function MapActions({
  onNotice,
}: {
  onNotice: (message: string) => void
}) {
  const map = useMap()

  function showNerOverview() {
    map.setView(
      NER_CENTER,
      NER_OVERVIEW_ZOOM,
      {
        animate: true,
        duration: 0.8,
      },
    )

    onNotice(
      "Northeast India operational view restored.",
    )
  }

  function locateUser() {
    if (!navigator.geolocation) {
      onNotice(
        "Browser location services are not available.",
      )
      return
    }

    onNotice(
      "Requesting your current location...",
    )

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        const bounds = new LatLngBounds(
          NER_BOUNDS,
        )

        if (!bounds.contains([lat, lng])) {
          onNotice(
            "Your current location is outside the Northeast India operational region.",
          )
          return
        }

        map.flyTo(
          [lat, lng],
          10,
          {
            duration: 0.9,
          },
        )

        onNotice(
          "Showing your location within the NER operational region.",
        )
      },
      () => {
        onNotice(
          "Location permission was unavailable. Please allow browser location access.",
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    )
  }

  return (
    <div className="absolute bottom-5 right-5 z-[500] flex flex-col gap-2">
      <button
        type="button"
        title="My location"
        onClick={locateUser}
        className="rounded-xl border border-white/10 bg-[#081522]/95 p-3 text-slate-300 shadow-xl backdrop-blur transition hover:border-emerald-500/30 hover:text-emerald-400"
      >
        <Crosshair size={17} />
      </button>

      <button
        type="button"
        title="Northeast India overview"
        onClick={showNerOverview}
        className="rounded-xl border border-white/10 bg-[#081522]/95 p-3 text-slate-300 shadow-xl backdrop-blur transition hover:border-emerald-500/30 hover:text-emerald-400"
      >
        <Navigation size={17} />
      </button>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: number
  color: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
      <div>
        <div className="text-xs text-slate-500">
          {label}
        </div>

        <div
          className={`mt-1 text-xl font-bold ${color}`}
        >
          {value}
        </div>
      </div>

      <div className={`${color} opacity-80`}>
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
        className="appearance-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-3 pr-9 text-xs text-slate-300 outline-none focus:border-emerald-500/30"
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

function LayerToggle({
  label,
  active,
  onClick,
  icon,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon || <CircleDot size={13} />}

        <span className="truncate">
          {label}
        </span>

        {typeof count === "number" && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-600">
            {count}
          </span>
        )}
      </span>

      <span
        className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition ${
          active
            ? "bg-emerald-500"
            : "bg-white/10"
        }`}
      >
        <span
          className={`block h-3 w-3 rounded-full bg-white transition ${
            active
              ? "translate-x-3"
              : "translate-x-0"
          }`}
        />
      </span>
    </button>
  )
}

function LegendItem({
  label,
  color,
}: {
  label: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: color,
        }}
      />
      {label}
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
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-slate-200">
        {value}
      </div>
    </div>
  )
}

function ExposureRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span className="text-slate-500">
          {icon}
        </span>

        {label}
      </div>

      <span className="font-semibold text-slate-200">
        {value}
      </span>
    </div>
  )
}

function EvidenceRow({
  label,
  value,
  tone = "normal",
}: {
  label: string
  value: string
  tone?: "normal" | "warning" | "success"
}) {
  const valueClass =
    tone === "warning"
      ? "text-amber-400"
      : tone === "success"
        ? "text-emerald-400"
        : "text-slate-300"

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5 last:border-0">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span
        className={`text-right text-xs font-semibold ${valueClass}`}
      >
        {value}
      </span>
    </div>
  )
}

function assetTypeIcon(type: string) {
  const normalized =
    type.toUpperCase()

  if (normalized === "ROAD") {
    return <Route size={13} />
  }

  if (normalized === "BRIDGE") {
    return <Navigation size={13} />
  }

  if (normalized === "VILLAGE") {
    return <MapPinned size={13} />
  }

  return <CircleDot size={13} />
}


<style>{`
  .bhoopehra-state-label {
    background: rgba(5, 15, 25, 0.78) !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: 6px !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28) !important;
    color: #e5eef5 !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: 0.06em !important;
    padding: 3px 6px !important;
    white-space: nowrap !important;
  }

  .bhoopehra-state-label::before {
    display: none !important;
  }
`}</style>

function ActionRecommendation({
  selected,
  fusion,
  selectedAssets,
  shelterRegistry,
  shelterResultStatus,
  shelters,
}: {
  selected: RiskLocation
  fusion: RiskFusion | null
  selectedAssets: InfrastructureAsset[]
  shelterRegistry: {
    registered: number
    mapped: number
    pending: number
  }
  shelterResultStatus:
    | "MAPPED_SHELTERS_AVAILABLE"
    | "NO_MAPPED_SHELTERS_AVAILABLE"
    | ""
  shelters: ShelterResult[]
}) {
  const operationalRisk = fusion?.final_risk_level ?? selected.risk
  const signalDisagreement =
    fusion?.agreement.signal_disagreement ?? false

  const mappedAssets = selectedAssets.filter(
    (asset) => getPointFromGeometry(asset.geometry) !== null,
  )

  const highImpactAssets = selectedAssets.filter((asset) => {
    const type = asset.asset_type.toUpperCase()
    return (
      type === "BRIDGE" ||
      type === "HOSPITAL" ||
      type === "SCHOOL"
    )
  })

  const roadExposure = selected.roads > 0
  const villageExposure = selected.villages > 0
  const bridgeExposure =
    selected.bridges > 0 ||
    selectedAssets.some(
      (asset) => asset.asset_type.toUpperCase() === "BRIDGE",
    )

  let title = "Continue Monitoring"
  let priorityLabel = "ROUTINE REVIEW"
  let description =
    "Baseline risk is LOW and no stronger verified operational signal is available. Continue monitoring the location through the BhooPehra risk workflow."
  let tone =
    "border-emerald-500/20 bg-emerald-500/[0.045]"
  let titleTone = "text-emerald-300"
  let iconTone = "text-emerald-400"

  if (signalDisagreement) {
    title = "Manual Review Required"
    priorityLabel = "REVIEW BEFORE ACTION"
    description =
      "ML and rule-engine signals disagree. Review the available evidence and local conditions before taking a high-impact operational action."
    tone = "border-amber-500/20 bg-amber-500/[0.045]"
    titleTone = "text-amber-300"
    iconTone = "text-amber-400"
  } else if (operationalRisk === "CRITICAL") {
    title = "Immediate Authority Review"
    priorityLabel = "CRITICAL"
    description =
      "The current operational risk assessment is CRITICAL. Prioritize authority review and verified field evidence before issuing any evacuation or closure instruction."
    tone = "border-red-500/20 bg-red-500/[0.045]"
    titleTone = "text-red-300"
    iconTone = "text-red-400"
  } else if (operationalRisk === "HIGH") {
    title = "Prioritize Field Verification"
    priorityLabel = "HIGH PRIORITY"
    description =
      "The current operational risk assessment is HIGH. Prioritize field verification and inspection of exposed infrastructure before higher-impact action."
    tone = "border-orange-500/20 bg-orange-500/[0.045]"
    titleTone = "text-orange-300"
    iconTone = "text-orange-400"
  } else if (operationalRisk === "MODERATE") {
    title = "Field Inspection Recommended"
    priorityLabel = "MODERATE REVIEW"
    description =
      "The current operational risk assessment is MODERATE. Verify rainfall, local ground conditions and exposed assets before escalation."
    tone = "border-yellow-500/20 bg-yellow-500/[0.045]"
    titleTone = "text-yellow-300"
    iconTone = "text-yellow-400"
  } else if (
    roadExposure ||
    villageExposure ||
    bridgeExposure ||
    highImpactAssets.length > 0
  ) {
    title = "Monitor Exposed Assets"
    priorityLabel = "EXPOSURE-AWARE MONITORING"
    description =
      "Baseline risk is LOW, but the selected zone has recorded exposure. Keep the location under routine monitoring and verify any new field evidence."
    tone = "border-sky-500/20 bg-sky-500/[0.045]"
    titleTone = "text-sky-300"
    iconTone = "text-sky-400"
  }

  const actions: string[] = []

  if (
    operationalRisk === "CRITICAL" ||
    operationalRisk === "HIGH" ||
    operationalRisk === "MODERATE"
  ) {
    actions.push("Prioritize a field verification of the selected risk zone.")
  } else {
    actions.push("Continue monitoring the selected risk zone.")
  }

  if (roadExposure || bridgeExposure) {
    actions.push("Review road and bridge exposure before routing or closure decisions.")
  }

  if (villageExposure) {
    actions.push("Check verified community exposure and field reports before escalation.")
  }

  if (highImpactAssets.length > 0) {
    actions.push(
      `Inspect ${highImpactAssets.length} linked high-impact asset${
        highImpactAssets.length === 1 ? "" : "s"
      } where geometry/evidence is available.`,
    )
  }

  if (signalDisagreement) {
    actions.push("Resolve the ML/rule signal disagreement through manual review.")
  }

  if (shelterResultStatus === "NO_MAPPED_SHELTERS_AVAILABLE") {
    actions.push(
      `${shelterRegistry.pending} shelter location${
        shelterRegistry.pending === 1 ? "" : "s"
      } still require verified map geometry; do not infer a safe route from the registry alone.`,
    )
  } else if (shelters.length > 0) {
    actions.push("Use only verified shelter locations when planning a safe route.")
  }

  if (actions.length === 0) {
    actions.push("No additional action is supported by the currently available evidence.")
  }

  return (
    <div className={`mt-5 rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-white/10 bg-black/10 p-2">
            <CheckCircle2 size={16} className={iconTone} />
          </div>

          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Action Recommendation
            </div>

            <div className={`mt-1 text-base font-semibold ${titleTone}`}>
              {title}
            </div>

            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              {description}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wider ${titleTone}`}>
          {priorityLabel}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-white/5 bg-black/10 p-3">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
          Recommended next actions
        </div>

        <div className="space-y-2">
          {actions.map((action, index) => (
            <div
              key={`${selected.id}-${index}-${action}`}
              className="flex gap-2.5"
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[9px] font-bold ${titleTone}`}>
                {index + 1}
              </span>

              <p className="text-[10px] leading-4 text-slate-500">
                {action}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-slate-600">
            Risk basis
          </div>
          <div className="mt-1 text-[10px] font-semibold text-slate-300">
            {operationalRisk}
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-slate-600">
            Linked assets
          </div>
          <div className="mt-1 text-[10px] font-semibold text-slate-300">
            {selectedAssets.length}
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-slate-600">
            Mapped assets
          </div>
          <div className="mt-1 text-[10px] font-semibold text-slate-300">
            {mappedAssets.length}
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
          <div className="text-[8px] uppercase tracking-wider text-slate-600">
            Shelter status
          </div>
          <div className="mt-1 truncate text-[10px] font-semibold text-slate-300">
            {shelters.length > 0
              ? "VERIFIED LOCATIONS"
              : shelterRegistry.registered > 0
                ? "LOCATION PENDING"
                : "NOT AVAILABLE"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 border-t border-white/5 pt-3">
        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-slate-600" />
        <p className="text-[9px] leading-4 text-slate-600">
          Recommendation is explainable and read-only. It does not automatically
          issue evacuation, closure, or dispatch commands, and it does not
          replace local authority decisions.
        </p>
      </div>
    </div>
  )
}

export default function RiskMapPage() {
  const [searchParams] =
    useSearchParams()

  const locationQuery =
    searchParams.get("location") ?? ""

  const [mode, setMode] =
    useState<
      "Current" | "Forecast" | "History"
    >("Current")

  const [locations, setLocations] =
    useState<RiskLocation[]>([])

  const [selected, setSelected] =
    useState<RiskLocation | null>(null)

  const [riskFilter, setRiskFilter] =
    useState<RiskLevel | "ALL">("ALL")

  const [stateFilter, setStateFilter] =
    useState("ALL")

  const [showFilters, setShowFilters] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [error, setError] =
    useState("")

  const [searchMessage, setSearchMessage] =
    useState("")

  const [searchResult, setSearchResult] =
    useState<GlobalSearchResult | null>(null)

  const [searchLoading, setSearchLoading] =
    useState(false)

  const [fusion, setFusion] =
    useState<RiskFusion | null>(null)

  const [fusionLoading, setFusionLoading] =
    useState(false)

  const [fusionError, setFusionError] =
    useState("")

  const [assets, setAssets] =
    useState<InfrastructureAsset[]>([])

  const [assetsLoading, setAssetsLoading] =
    useState(false)

  const [assetsError, setAssetsError] =
    useState("")

  const [shelters, setShelters] =
    useState<ShelterResult[]>([])

  const [shelterRegistry, setShelterRegistry] =
    useState({ registered: 0, mapped: 0, pending: 0 })

  const [sheltersLoading, setSheltersLoading] =
    useState(false)

  const [sheltersError, setSheltersError] =
    useState("")

  const [shelterResultStatus, setShelterResultStatus] =
    useState<"MAPPED_SHELTERS_AVAILABLE" | "NO_MAPPED_SHELTERS_AVAILABLE" | "">("")

  const [mapNotice, setMapNotice] =
    useState("")

  const [showAssessment, setShowAssessment] =
    useState(false)

  const [layers, setLayers] =
    useState({
      risk: true,
      infrastructure: true,
      roads: true,
      villages: false,
      bridges: false,
      shelters: true,
      districts: true,
    })

  const [districts, setDistricts] =
    useState<DistrictBoundary[]>([])

  const [districtsLoading, setDistrictsLoading] =
    useState(false)

  const [districtsError, setDistrictsError] =
    useState("")

  const [showMapLayers, setShowMapLayers] =
    useState(true)

  const [basemap, setBasemap] =
    useState<"satellite" | "terrain" | "streets">("satellite")

  async function loadRiskZones(
    isRefresh = false,
  ) {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError("")

      const response = await fetch(
        `${API_BASE_URL}/api/risk/zones`,
      )

      if (!response.ok) {
        throw new Error(
          `Risk API returned HTTP ${response.status}`,
        )
      }

      const payload =
        (await response.json()) as RiskApiResponse

      const rawZones =
        payload.zones ??
        payload.data ??
        []

      const nextLocations =
        rawZones.map(toRiskLocation)

      setLocations(nextLocations)

      if (nextLocations.length === 0) {
        setSelected(null)
        return
      }

      if (selected) {
        const refreshedSelected =
          nextLocations.find(
            (item) =>
              item.id === selected.id,
          )

        setSelected(
          refreshedSelected ?? null,
        )
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load risk zones.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadDistrictBoundaries() {
    try {
      setDistrictsLoading(true)
      setDistrictsError("")

      const response = await fetch(
        `${API_BASE_URL}/api/districts/boundaries`,
      )

      if (!response.ok) {
        throw new Error(
          `District boundary API returned HTTP ${response.status}`,
        )
      }

      const payload =
        (await response.json()) as {
          data?: DistrictBoundary[]
        }

      const nextDistricts =
        Array.isArray(payload.data)
          ? payload.data.filter(
              (district) =>
                district &&
                district.geometry !== null &&
                district.geometry !== undefined,
            )
          : []

      setDistricts(nextDistricts)
    } catch (requestError) {
      setDistricts([])

      setDistrictsError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load district boundaries.",
      )
    } finally {
      setDistrictsLoading(false)
    }
  }

  async function loadSheltersForLocation(
    latitude: number | null,
    longitude: number | null,
  ) {
    if (latitude === null || longitude === null) {
      setShelters([])
      setShelterRegistry({ registered: 0, mapped: 0, pending: 0 })
      setShelterResultStatus("NO_MAPPED_SHELTERS_AVAILABLE")
      setSheltersError("The selected risk zone does not have a verified query coordinate, so nearest-shelter routing cannot be calculated yet.")
      return
    }

    try {
      setSheltersLoading(true)
      setSheltersError("")
      const response = await fetch(
        `${API_BASE_URL}/api/shelters/nearest?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
      )
      if (!response.ok) {
        throw new Error(`Shelter API returned HTTP ${response.status}`)
      }
      const payload = (await response.json()) as ShelterApiResponse
      setShelters(Array.isArray(payload.shelters) ? payload.shelters : [])
      setShelterRegistry({
        registered: payload.shelter_registry?.registered_shelters ?? 0,
        mapped: payload.shelter_registry?.mapped_shelters ?? 0,
        pending: payload.shelter_registry?.location_pending ?? 0,
      })
      setShelterResultStatus(
        payload.result_status === "NO_MAPPED_SHELTERS_AVAILABLE"
          ? "NO_MAPPED_SHELTERS_AVAILABLE"
          : "MAPPED_SHELTERS_AVAILABLE",
      )
      if (payload.result_status === "NO_MAPPED_SHELTERS_AVAILABLE") {
        // This is an expected data-availability state, not an API/routing failure.
        setSheltersError("")
      }
    } catch (requestError) {
      setShelters([])
      setShelterRegistry({ registered: 0, mapped: 0, pending: 0 })
      setShelterResultStatus("")
      setSheltersError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load nearest shelters.",
      )
    } finally {
      setSheltersLoading(false)
    }
  }

  async function loadInfrastructure() {
    try {
      setAssetsLoading(true)
      setAssetsError("")

      const response = await fetch(
        `${API_BASE_URL}/api/infrastructure/assets`,
      )

      if (!response.ok) {
        throw new Error(
          `Infrastructure API returned HTTP ${response.status}`,
        )
      }

      const payload =
        await response.json()

      setAssets(
        normalizeInfrastructurePayload(
          payload,
        ),
      )
    } catch (requestError) {
      setAssets([])

      setAssetsError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load infrastructure assets.",
      )
    } finally {
      setAssetsLoading(false)
    }
  }

  useEffect(() => {
    void loadRiskZones()
    void loadInfrastructure()
    void loadDistrictBoundaries()
  }, [])

  useEffect(() => {
    if (!selected) {
      setFusion(null)
      setFusionError("")
      return
    }

    const selectedZoneId =
      selected.id

    const controller =
      new AbortController()

    async function loadFusion() {
      try {
        setFusionLoading(true)
        setFusionError("")

        const response = await fetch(
          `${API_BASE_URL}/api/risk/fusion/zone/${selectedZoneId}`,
          {
            signal:
              controller.signal,
          },
        )

        if (!response.ok) {
          throw new Error(
            `Fusion API returned HTTP ${response.status}`,
          )
        }

        const payload =
          await response.json()

        setFusion(
          payload.risk_fusion ?? null,
        )
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name ===
            "AbortError"
        ) {
          return
        }

        setFusion(null)

        setFusionError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load risk fusion.",
        )
      } finally {
        setFusionLoading(false)
      }
    }

    void loadFusion()

    return () => {
      controller.abort()
    }
  }, [selected?.id])

  useEffect(() => {
    if (!selected) {
      setShelters([])
      setShelterRegistry({ registered: 0, mapped: 0, pending: 0 })
      setShelterResultStatus("")
      setSheltersError("")
      return
    }
    void loadSheltersForLocation(selected.lat, selected.lng)
  }, [selected?.id, selected?.lat, selected?.lng])

  const states = useMemo(() => {
    return [
      "ALL",
      ...Array.from(
        new Set(
          locations.map(
            (location) =>
              location.state,
          ),
        ),
      ).sort(),
    ]
  }, [locations])

  const filteredLocations =
    useMemo(() => {
      return locations.filter(
        (location) => {
          const riskMatch =
            riskFilter === "ALL" ||
            location.risk ===
              riskFilter

          const stateMatch =
            stateFilter === "ALL" ||
            location.state ===
              stateFilter

          return (
            riskMatch &&
            stateMatch
          )
        },
      )
    }, [
      locations,
      riskFilter,
      stateFilter,
    ])

  const stats = useMemo(
    () => ({
      critical:
        locations.filter(
          (x) =>
            x.risk ===
            "CRITICAL",
        ).length,

      high:
        locations.filter(
          (x) =>
            x.risk === "HIGH",
        ).length,

      moderate:
        locations.filter(
          (x) =>
            x.risk ===
            "MODERATE",
        ).length,

      low:
        locations.filter(
          (x) =>
            x.risk === "LOW",
        ).length,
    }),
    [locations],
  )

  const assetStats =
    useMemo(() => {
      const mappedAssets =
        assets.filter(
          (asset) =>
            getPointFromGeometry(
              asset.geometry,
            ) !== null,
        )

      return {
        total: assets.length,
        geometry:
          mappedAssets.length,
        roads:
          assets.filter(
            (asset) =>
              asset.asset_type.toUpperCase() ===
              "ROAD",
          ).length,
        villages:
          assets.filter(
            (asset) =>
              asset.asset_type.toUpperCase() ===
              "VILLAGE",
          ).length,
        bridges:
          assets.filter(
            (asset) =>
              asset.asset_type.toUpperCase() ===
              "BRIDGE",
          ).length,
        shelters:
          assets.filter(
            (asset) =>
              asset.asset_type.toUpperCase() ===
              "SHELTER",
          ).length,
      }
    }, [assets])

  const selectedAssets =
    useMemo(() => {
      if (!selected) {
        return []
      }

      return assets.filter(
        (asset) =>
          asset.risk_zone_id ===
          selected.id,
      )
    }, [assets, selected])

  const shelterRegistryAssets =
    useMemo(() => {
      return assets.filter(
        (asset) =>
          asset.asset_type.toUpperCase() === "SHELTER",
      )
    }, [assets])

  const visibleAssets =
    useMemo(() => {
      return assets.filter(
        (asset) => {
          const point =
            getPointFromGeometry(
              asset.geometry,
            )

          if (!point) {
            return false
          }

          const type =
            asset.asset_type.toUpperCase()

          if (type === "ROAD") {
            return (
              layers.infrastructure &&
              layers.roads
            )
          }

          if (
            type === "VILLAGE"
          ) {
            return (
              layers.infrastructure &&
              layers.villages
            )
          }

          if (
            type === "BRIDGE"
          ) {
            return (
              layers.infrastructure &&
              layers.bridges
            )
          }

          if (
            type === "SHELTER"
          ) {
            return (
              layers.infrastructure &&
              layers.shelters
            )
          }

          return layers.infrastructure
        },
      )
    }, [assets, layers])

  useEffect(() => {
    if (loading) {
      return
    }

    const query =
      normalize(locationQuery)

    if (!query) {
      setSearchResult(null)
      setSearchMessage("")

      return
    }

    const matched =
      locations.find(
        (location) => {
          const values = [
            location.name,
            location.district,
            `${location.name}, ${location.state}`,
            `${location.district}, ${location.state}`,
          ].map(normalize)

          return values.some(
            (value) =>
              value === query ||
              value.includes(query) ||
              query.includes(value),
          )
        },
      )

    if (matched) {
      setSearchResult(null)
      setSearchMessage("")
      setSelected(matched)
      return
    }

    const controller =
      new AbortController()

    async function resolveGlobalSearch() {
      try {
        setSearchLoading(true)
        setSearchResult(null)
        setSearchMessage("")

        const response = await fetch(
          `${API_BASE_URL}/api/search?q=${encodeURIComponent(
            locationQuery.trim(),
          )}`,
          {
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          throw new Error(
            `Search API returned HTTP ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as {
            count?: number
            data?: GlobalSearchResult[]
          }

        const results =
          Array.isArray(payload.data)
            ? payload.data
            : []

        const firstResult =
          results[0] ?? null

        if (!firstResult) {
          setSelected(null)
          setSearchMessage(
            `"${locationQuery}" was not found in the BhooPehra database.`,
          )
          return
        }

        setSelected(null)
        setSearchResult(firstResult)

        const hasCoordinates =
          typeof firstResult.latitude ===
            "number" &&
          Number.isFinite(
            firstResult.latitude,
          ) &&
          typeof firstResult.longitude ===
            "number" &&
          Number.isFinite(
            firstResult.longitude,
          )

        if (!hasCoordinates) {
          setSearchMessage(
            `"${firstResult.name}" was found in the BhooPehra database, but verified coordinates are not available yet.`,
          )
        }
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name ===
            "AbortError"
        ) {
          return
        }

        setSelected(null)
        setSearchResult(null)
        setSearchMessage(
          requestError instanceof Error
            ? `Unable to search "${locationQuery}": ${requestError.message}`
            : `Unable to search "${locationQuery}".`,
        )
      } finally {
        setSearchLoading(false)
      }
    }

    void resolveGlobalSearch()

    return () => {
      controller.abort()
    }
  }, [
    locationQuery,
    locations,
    loading,
  ])

  useEffect(() => {
    if (!mapNotice) {
      return
    }

    const timer =
      window.setTimeout(
        () => setMapNotice(""),
        3500,
      )

    return () =>
      window.clearTimeout(timer)
  }, [mapNotice])

  function toggleLayer(
    key: keyof typeof layers,
  ) {
    setLayers((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function selectLocation(
    location: RiskLocation,
  ) {
    setSelected(location)
    setSearchResult(null)
    setSearchMessage("")
    setShowAssessment(false)
  }

  const selectedRiskPercent =
    selected
      ? getRiskPercent(
          selected.probability,
        )
      : 0

  const selectedFusionPercent =
    fusion?.final_probability_percent ??
    null

  const searchPoint =
    searchResult &&
    typeof searchResult.latitude ===
      "number" &&
    Number.isFinite(
      searchResult.latitude,
    ) &&
    typeof searchResult.longitude ===
      "number" &&
    Number.isFinite(
      searchResult.longitude,
    )
      ? [
          searchResult.latitude,
          searchResult.longitude,
        ] as [number, number]
      : null

  return (
    <div className="flex min-h-[calc(100vh-72px)] flex-col bg-[#06111c] text-slate-100">
      <div className="border-b border-white/5 bg-[#081522] px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <MapIcon size={14} />
              Risk Intelligence
              <span>/</span>
              <span className="text-emerald-400">
                Northeast India
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Landslide Risk Map
              </h1>

              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                NER Operational View
              </span>
            </div>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400 sm:text-sm">
              Spatial risk intelligence for
              Arunachal Pradesh, Assam,
              Manipur, Meghalaya, Mizoram,
              Nagaland, Sikkim and Tripura.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                "Current",
                "Forecast",
                "History",
              ] as const
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() =>
                  setMode(item)
                }
                className={`rounded-lg px-3 py-2 text-xs font-medium transition sm:px-4 sm:text-sm ${
                  mode === item
                    ? "bg-emerald-500 text-[#03130d]"
                    : "border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item === "History"
                  ? "Historical"
                  : item}
              </button>
            ))}

            <button
              type="button"
              onClick={() =>
                setShowFilters(
                  (value) => !value,
                )
              }
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"
            >
              <Filter size={15} />
              Filters
            </button>

            <button
              type="button"
              onClick={() => {
                void loadRiskZones(true)
                void loadInfrastructure()
              }}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-white/5 bg-[#07131f] px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto grid max-w-[1800px] grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Critical"
            value={stats.critical}
            color="text-red-400"
            icon={
              <ShieldAlert
                size={17}
              />
            }
          />

          <StatCard
            label="High Risk"
            value={stats.high}
            color="text-orange-400"
            icon={
              <AlertTriangle
                size={17}
              />
            }
          />

          <StatCard
            label="Moderate"
            value={stats.moderate}
            color="text-yellow-400"
            icon={
              <CircleDot size={17} />
            }
          />

          <StatCard
            label="Low Risk"
            value={stats.low}
            color="text-emerald-400"
            icon={
              <BarChart3 size={17} />
            }
          />
        </div>
      </div>

      {showFilters && (
        <div className="border-b border-white/5 bg-[#081522] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Filter
            </div>

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

            <FilterSelect
              value={stateFilter}
              onChange={setStateFilter}
              options={states}
            />

            {(riskFilter !==
              "ALL" ||
              stateFilter !==
                "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setRiskFilter(
                    "ALL",
                  )
                  setStateFilter(
                    "ALL",
                  )
                }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              >
                <X size={13} />
                Clear
              </button>
            )}

            <div className="ml-auto text-[10px] text-slate-600">
              Showing{" "}
              <span className="text-slate-400">
                {
                  filteredLocations.length
                }
              </span>{" "}
              of{" "}
              {locations.length}{" "}
              risk zones
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative min-h-[560px] overflow-hidden border-b border-white/5 xl:min-h-[calc(100vh-205px)] xl:border-b-0 xl:border-r">
          {loading && (
            <div className="absolute left-4 right-4 top-14 z-[600] rounded-xl border border-emerald-500/20 bg-[#081522]/95 px-4 py-3 text-sm text-emerald-200 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2">
                <RefreshCw
                  size={14}
                  className="animate-spin"
                />
                Loading Northeast India risk intelligence...
              </div>
            </div>
          )}

          {error && (
            <div className="absolute left-4 right-4 top-14 z-[600] rounded-xl border border-red-500/20 bg-[#081522]/95 px-4 py-3 shadow-xl backdrop-blur">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={17}
                  className="mt-0.5 shrink-0 text-red-400"
                />

                <div>
                  <div className="font-semibold text-red-200">
                    Risk data unavailable
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(searchMessage ||
            searchLoading ||
            searchResult) &&
            !loading &&
            !error && (
              <div className="absolute left-4 right-4 top-14 z-[600] rounded-xl border border-emerald-500/20 bg-[#081522]/95 px-4 py-3 shadow-xl backdrop-blur">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 rounded-lg border border-emerald-500/15 bg-emerald-500/10 p-1.5 text-emerald-400">
                    {searchLoading ? (
                      <RefreshCw
                        size={14}
                        className="animate-spin"
                      />
                    ) : (
                      <Search size={14} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-200">
                      {searchLoading
                        ? "Searching BhooPehra database..."
                        : searchResult
                          ? "Database location found"
                          : "Search information"}
                    </div>

                    {searchResult && (
                      <div className="mt-1 text-xs font-medium text-emerald-300">
                        {searchResult.name}
                      </div>
                    )}

                    {searchResult?.subtitle && (
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {searchResult.subtitle}
                      </div>
                    )}

                    {searchMessage && (
                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        {searchMessage}
                      </div>
                    )}

                    {searchResult &&
                      !searchMessage && (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {searchResult.district &&
                            searchResult.state
                            ? `${searchResult.district}, ${searchResult.state}`
                            : searchResult.type}
                          {" · "}
                          {searchPoint
                            ? "verified coordinates available"
                            : "coordinates unavailable"}
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}

          {mapNotice && (
            <div className="absolute bottom-20 left-1/2 z-[600] max-w-[calc(100%-120px)] -translate-x-1/2 rounded-xl border border-emerald-500/20 bg-[#081522]/95 px-4 py-2.5 text-center text-xs text-emerald-200 shadow-xl backdrop-blur">
              {mapNotice}
            </div>
          )}

          <MapContainer
            center={NER_CENTER}
            zoom={NER_OVERVIEW_ZOOM}
            minZoom={7.9}
            maxZoom={14}
            maxBounds={NER_BOUNDS}
            maxBoundsViscosity={0.88}
            scrollWheelZoom
            zoomControl
            className="h-full min-h-[560px] w-full bg-[#dbe7d2] xl:min-h-[calc(100vh-205px)]"
          >
            <TileLayer
              attribution={
                basemap === "satellite"
                  ? "&copy; Esri, Maxar, Earthstar Geographics | OpenStreetMap contributors"
                  : basemap === "terrain"
                    ? "&copy; OpenStreetMap contributors, SRTM | OpenTopoMap"
                    : "&copy; OpenStreetMap contributors"
              }
              opacity={basemap === "satellite" ? 0.94 : 1}
              url={
                basemap === "satellite"
                  ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  : basemap === "terrain"
                    ? "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />

            <MapViewport
              selected={selected}
              locations={locations}
              searchPoint={searchPoint}
            />

            <DistrictBoundaryLayer
              districts={districts}
              visible={layers.districts}
            />

            <StateBoundaryLabelLayer
              districts={districts}
              visible={layers.districts}
            />

            {searchPoint && (
              <CircleMarker
                center={searchPoint}
                radius={9}
                pathOptions={{
                  color: "#10b981",
                  fillColor: "#10b981",
                  fillOpacity: 0.9,
                  weight: 3,
                }}
              >
                <Tooltip direction="top">
                  <div className="text-xs">
                    <strong>
                      {searchResult?.name ??
                        "Search result"}
                    </strong>
                    <div className="mt-0.5">
                      Database location
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            )}

            <MapActions
              onNotice={setMapNotice}
            />

            {layers.risk &&
              filteredLocations.map(
                (location) => {
                  const polygons =
                    getPolygonCoordinates(
                      location.geometry,
                    )

                  if (
                    polygons.length ===
                    0
                  ) {
                    return null
                  }

                  const style =
                    riskStyles[
                      location.risk
                    ]

                  const isSelected =
                    selected?.id ===
                    location.id

                  return polygons.map(
                    (
                      polygon,
                      index,
                    ) => (
                      <Polygon
                        key={`${location.id}-${index}`}
                        positions={
                          polygon
                        }
                        pathOptions={{
                          color:
                            style.color,
                          fillColor:
                            style.color,
                          fillOpacity:
                            isSelected
                              ? Math.min(
                                  style.fillOpacity +
                                    0.28,
                                  0.68,
                                )
                              : Math.min(
                                  style.fillOpacity + 0.10,
                                  0.30,
                                ),
                          weight:
                            isSelected
                              ? 5
                              : 2,
                          opacity:
                            isSelected
                              ? 1
                              : 0.88,
                        }}
                        eventHandlers={{
                          click: () =>
                            selectLocation(
                              location,
                            ),
                        }}
                      >
                        {isSelected && (
                          <Tooltip
                            permanent
                            direction="center"
                            opacity={0.95}
                          >
                            <div className="text-xs font-semibold">
                              {location.name}
                            </div>
                            <div className="text-[10px]">
                              {location.risk} risk · {location.district}
                            </div>
                          </Tooltip>
                        )}

                        <Tooltip
                          sticky
                          direction="top"
                        >
                          <div className="min-w-[180px]">
                            <div className="font-semibold">
                              {
                                location.name
                              }
                            </div>

                            <div className="mt-1 text-xs">
                              {
                                location.district
                              }
                              ,{" "}
                              {
                                location.state
                              }
                            </div>

                            <div className="mt-2 text-xs">
                              Baseline risk:{" "}
                              <strong>
                                {getRiskPercent(
                                  location.probability,
                                ).toFixed(
                                  1,
                                )}
                                %
                              </strong>
                            </div>
                          </div>
                        </Tooltip>

                        <Popup>
                          <div className="min-w-[230px]">
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <div>
                                <strong>
                                  {
                                    location.name
                                  }
                                </strong>

                                <div className="mt-0.5 text-xs text-gray-500">
                                  {
                                    location.district
                                  }
                                  ,{" "}
                                  {
                                    location.state
                                  }
                                </div>
                              </div>

                              <span
                                style={{
                                  color:
                                    style.color,
                                }}
                                className="text-xs font-bold"
                              >
                                {
                                  location.risk
                                }
                              </span>
                            </div>

                            <div className="space-y-1 text-xs">
                              <div>
                                Baseline risk:{" "}
                                <strong>
                                  {getRiskPercent(
                                    location.probability,
                                  ).toFixed(
                                    2,
                                  )}
                                  %
                                </strong>
                              </div>

                              <div>
                                Confidence:{" "}
                                <strong>
                                  {
                                    location.confidence
                                  }
                                </strong>
                              </div>

                              <div>
                                Rainfall trigger:{" "}
                                <strong>
                                  {
                                    location.rainfall
                                  }
                                </strong>
                              </div>

                              <div>
                                Priority:{" "}
                                <strong>
                                  {
                                    location.priority
                                  }
                                </strong>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Polygon>
                    ),
                  )
                },
              )}

            {visibleAssets.map(
              (asset) => {
                const point =
                  getPointFromGeometry(
                    asset.geometry,
                  )

                if (!point) {
                  return null
                }

                const type =
                  asset.asset_type.toUpperCase()

                const color =
                  assetColors[type] ??
                  "#94a3b8"

                const isSelected =
                  selected?.id ===
                  asset.risk_zone_id

                return (
                  <CircleMarker
                    key={`asset-${asset.id}`}
                    center={point}
                    radius={
                      isSelected
                        ? 8
                        : 6
                    }
                    pathOptions={{
                      color,
                      fillColor:
                        color,
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                  >
                    <Tooltip direction="top">
                      <div className="text-xs">
                        <strong>
                          {
                            asset.name
                          }
                        </strong>

                        <div className="mt-0.5">
                          {
                            asset.asset_type
                          }
                        </div>
                      </div>
                    </Tooltip>

                    <Popup>
                      <div className="min-w-[220px]">
                        <strong>
                          {
                            asset.name
                          }
                        </strong>

                        <div className="mt-2 space-y-1 text-xs">
                          <div>
                            Code:{" "}
                            <strong>
                              {
                                asset.asset_code
                              }
                            </strong>
                          </div>

                          <div>
                            Type:{" "}
                            <strong>
                              {
                                asset.asset_type
                              }
                            </strong>
                          </div>

                          <div>
                            Risk:{" "}
                            <strong>
                              {
                                asset.risk_level
                              }
                            </strong>
                          </div>

                          <div>
                            Priority:{" "}
                            <strong>
                              {
                                asset.priority
                              }
                            </strong>
                          </div>

                          <div>
                            Exposure:{" "}
                            <strong>
                              {asset.exposure_count.toLocaleString()}
                            </strong>
                          </div>

                          {type === "SHELTER" && (
                            <div>
                              Capacity:{" "}
                              <strong>
                                {asset.capacity ?? "NOT AVAILABLE"}
                              </strong>
                            </div>
                          )}
                        </div>

                        <div className="mt-2 text-[10px] text-emerald-600">
                          Backend geometry
                          available
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              },
            )}
          </MapContainer>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-[550]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#07131f]/95 px-4 py-2.5 shadow-lg backdrop-blur sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Radio size={13} className="shrink-0 text-emerald-400" />
                  <span className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300 sm:text-[11px]">
                    Operational Geospatial Hazard Domain
                  </span>
                </div>
                <div className="mt-0.5 hidden text-[9px] uppercase tracking-wider text-slate-600 sm:block">
                  GIS Ops: Synoptic Hazard Mapping · PostGIS geometry · real OSM road network
                </div>
              </div>

              <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => setBasemap("satellite")}
                  className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition ${
                    basemap === "satellite"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Satellite
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap("terrain")}
                  className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition ${
                    basemap === "terrain"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Terrain
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap("streets")}
                  className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition ${
                    basemap === "streets"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  Streets
                </button>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute left-4 top-14 z-[500]">
            <div className="rounded-xl border border-white/10 bg-[#081522]/95 px-4 py-3 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2">
                <Radio
                  size={15}
                  className="text-emerald-400"
                />

                <span className="text-sm font-semibold">
                  {selected
                    ? "Focused Risk Zone"
                    : mode === "History"
                      ? "Historical Risk Context"
                      : `${mode} Risk Layer`}
                </span>
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {selected
                  ? `${selected.name} · ${selected.risk}`
                  : `${filteredLocations.length} NER risk zones`}
                {" · "}
                {assetStats.geometry} mapped assets
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-14 z-[500] max-w-[calc(100%-32px)]">
            <button
              type="button"
              onClick={() =>
                setShowMapLayers(
                  (value) => !value,
                )
              }
              className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-[#081522]/95 px-3 py-2 text-xs font-semibold text-slate-300 shadow-xl backdrop-blur transition hover:border-emerald-500/20 hover:text-white"
              aria-label="Toggle map layers"
            >
              <Layers3
                size={15}
                className="text-emerald-400"
              />
              Layers
              <ChevronDown
                size={13}
                className={`transition ${
                  showMapLayers
                    ? "rotate-180"
                    : ""
                }`}
              />
            </button>

            {showMapLayers && (
              <div className="mt-2 w-[210px] rounded-xl border border-white/10 bg-[#081522]/95 p-3 shadow-xl backdrop-blur">
                <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Map Layers
                  </span>

                  <span className="text-[9px] text-slate-600">
                    LIVE
                  </span>
                </div>

                {districtsLoading && (
                  <div className="mb-2 text-[9px] text-slate-600">
                    Loading real district boundaries...
                  </div>
                )}

                {districtsError && (
                  <div className="mb-2 rounded-lg border border-amber-500/10 bg-amber-500/5 px-2 py-1.5 text-[9px] leading-4 text-amber-400">
                    District boundary layer unavailable: {districtsError}
                  </div>
                )}

                <LayerToggle
                  label="Risk Zones"
                  active={layers.risk}
                  onClick={() =>
                    toggleLayer("risk")
                  }
                  count={
                    filteredLocations.length
                  }
                />

                <LayerToggle
                  label="District Boundaries"
                  active={layers.districts}
                  onClick={() =>
                    toggleLayer("districts")
                  }
                  icon={
                    <MapIcon size={13} />
                  }
                  count={districts.length}
                />

                <LayerToggle
                  label="Road Assets"
                  active={
                    layers.infrastructure &&
                    layers.roads
                  }
                  onClick={() =>
                    toggleLayer("roads")
                  }
                  icon={
                    <Route size={13} />
                  }
                  count={
                    assetStats.roads
                  }
                />

                <LayerToggle
                  label="Village Assets"
                  active={
                    layers.infrastructure &&
                    layers.villages
                  }
                  onClick={() =>
                    toggleLayer("villages")
                  }
                  icon={
                    <MapPinned
                      size={13}
                    />
                  }
                  count={
                    assetStats.villages
                  }
                />

                <LayerToggle
                  label="Bridge Assets"
                  active={
                    layers.infrastructure &&
                    layers.bridges
                  }
                  onClick={() =>
                    toggleLayer("bridges")
                  }
                  icon={
                    <Navigation
                      size={13}
                    />
                  }
                  count={
                    assetStats.bridges
                  }
                />

                <LayerToggle
                  label="Shelter Assets"
                  active={
                    layers.infrastructure &&
                    layers.shelters
                  }
                  onClick={() =>
                    toggleLayer("shelters")
                  }
                  icon={
                    <ShieldCheck size={13} />
                  }
                  count={
                    assetStats.shelters
                  }
                />

                <div className="mt-3 border-t border-white/5 pt-3">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-600">
                    <span>
                      Infrastructure
                    </span>

                    <span>
                      {assetStats.geometry}
                      /
                      {assetStats.total}{" "}
                      mapped
                    </span>
                  </div>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width:
                          assetStats.total >
                          0
                            ? `${
                                (assetStats.geometry /
                                  assetStats.total) *
                                100
                              }%`
                            : "0%",
                      }}
                    />
                  </div>

                  <p className="mt-2 text-[9px] leading-4 text-slate-600">
                    Only backend-supplied
                    geometry is rendered.
                    Missing locations are
                    not fabricated.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-5 bottom-5 z-[500] flex items-end justify-between gap-3">
            <div className="pointer-events-auto rounded-xl border border-white/10 bg-[#081522]/95 px-3 py-2 shadow-xl backdrop-blur">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] uppercase tracking-wider text-slate-500">
                <span>Risk Zones <strong className="text-slate-300">{filteredLocations.length}</strong></span>
                <span>Mapped Infrastructure <strong className="text-slate-300">{assetStats.geometry}/{assetStats.total}</strong></span>
                <span>Source <strong className="text-emerald-300">Backend</strong></span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-5 left-5 z-[500] max-w-[calc(100%-90px)] rounded-xl border border-white/10 bg-[#081522]/95 p-3 shadow-xl backdrop-blur">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Risk Level
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-2">
              <LegendItem
                label="Critical"
                color="#ef4444"
              />

              <LegendItem
                label="High"
                color="#f97316"
              />

              <LegendItem
                label="Moderate"
                color="#eab308"
              />

              <LegendItem
                label="Low"
                color="#22c55e"
              />
            </div>

            <div className="mt-3 border-t border-white/5 pt-2 text-[9px] text-slate-600">
              <span className="mr-3">
                ● Infrastructure
              </span>

              <span>
                ■ Risk boundary
              </span>
            </div>
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto bg-[#081522] xl:max-h-[calc(100vh-230px)]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Location Intelligence
                </div>

                <div className="mt-1 text-lg font-semibold">
                  Selected Risk Zone
                </div>
              </div>

              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-400">
                <Waves size={18} />
              </div>
            </div>
          </div>

          {selected ? (
            <div className="p-4 sm:p-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">
                        {selected.name}
                      </h2>

                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-bold ${riskStyles[selected.risk].bg} ${riskStyles[selected.risk].text}`}
                      >
                        {selected.risk}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {
                        selected.district
                      }
                      ,{" "}
                      {
                        selected.state
                      }
                    </div>

                    <div className="mt-1 text-[10px] text-slate-600">
                      District code:{" "}
                      {selected.code}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-white/[0.025] p-2">
                    <MapPinned
                      size={16}
                      className="text-slate-500"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-600">
                        Baseline Risk Score
                      </div>

                      <div className="mt-1 text-4xl font-bold tracking-tight">
                        {
                          selectedRiskPercent.toFixed(
                            2,
                          )
                        }
                        %
                      </div>
                    </div>

                    <div
                      className={`text-xs font-semibold ${
                        selected.trend ===
                        "Increasing"
                          ? "text-red-400"
                          : selected.trend ===
                              "Decreasing"
                            ? "text-emerald-400"
                            : "text-slate-400"
                      }`}
                    >
                      {
                        selected.trend
                      }
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          selectedRiskPercent,
                          100,
                        )}%`,
                        backgroundColor:
                          riskStyles[
                            selected.risk
                          ].color,
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-start gap-2 text-[9px] leading-4 text-slate-600">
                    <Info
                      size={12}
                      className="mt-0.5 shrink-0"
                    />
                    This is the baseline risk
                    score, not a guaranteed event
                    forecast.
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">
                      Risk Fusion
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      ML + rule engine
                    </div>
                  </div>

                  {fusionLoading ? (
                    <RefreshCw
                      size={14}
                      className="animate-spin text-slate-500"
                    />
                  ) : fusion ? (
                    <div
                      className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                        fusion.final_risk_level ===
                        "CRITICAL"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : fusion.final_risk_level ===
                              "HIGH"
                            ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                            : fusion.final_risk_level ===
                                "MODERATE"
                              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      }`}
                    >
                      {
                        fusion.final_risk_level
                      }
                    </div>
                  ) : null}
                </div>

                {fusionError ? (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] leading-4 text-amber-400">
                    {fusionError}
                  </div>
                ) : fusion ? (
                  <>
                    <div className="mt-4 flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-600">
                          Operational Risk
                        </div>

                        <div className="mt-1 text-3xl font-bold text-white">
                          {fusion.final_probability_percent.toFixed(
                            1,
                          )}
                          %
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-slate-600">
                          Confidence
                        </div>

                        <div
                          className={`mt-1 text-sm font-semibold ${
                            fusion.final_confidence ===
                            "HIGH"
                              ? "text-emerald-400"
                              : fusion.final_confidence ===
                                  "MEDIUM"
                                ? "text-yellow-400"
                                : "text-orange-400"
                          }`}
                        >
                          {
                            fusion.final_confidence
                          }
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-violet-400 transition-all"
                        style={{
                          width: `${Math.min(
                            fusion.final_probability_percent,
                            100,
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">
                          ML Signal
                        </div>

                        <div className="mt-1 text-sm font-semibold text-orange-300">
                          {fusion.signals.ml.probability_percent.toFixed(
                            1,
                          )}
                          %
                        </div>

                        <div className="mt-0.5 text-[9px] text-slate-600">
                          {
                            fusion.signals.ml
                              .risk_level
                          }
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">
                          Rule Signal
                        </div>

                        <div className="mt-1 text-sm font-semibold text-emerald-300">
                          {fusion.signals.rule_engine.probability_percent.toFixed(
                            1,
                          )}
                          %
                        </div>

                        <div className="mt-0.5 text-[9px] text-slate-600">
                          {
                            fusion.signals
                              .rule_engine
                              .risk_level
                          }
                        </div>
                      </div>
                    </div>

                    <div
                      className={`mt-3 rounded-xl border px-3 py-3 ${
                        fusion.agreement
                          .signal_disagreement
                          ? "border-amber-500/20 bg-amber-500/5"
                          : "border-emerald-500/20 bg-emerald-500/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Assessment
                        </span>

                        <span
                          className={`text-[10px] font-bold ${
                            fusion.agreement
                              .signal_disagreement
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {fusion.operational_assessment.replaceAll(
                            "_",
                            " ",
                          )}
                        </span>
                      </div>

                      <p className="mt-1 text-[10px] leading-4 text-slate-500">
                        {fusion.agreement
                          .signal_disagreement
                          ? "ML and rule signals disagree. Manual review is recommended before high-impact operational action."
                          : "ML and rule signals are directionally aligned."}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[9px] text-slate-600">
                      <span>
                        ML{" "}
                        {Math.round(
                          fusion.fusion
                            .ml_weight *
                            100,
                        )}
                        % + Rule{" "}
                        {Math.round(
                          fusion.fusion
                            .rule_engine_weight *
                            100,
                        )}
                        %
                      </span>

                      <span className="text-emerald-500">
                        READ ONLY
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <InfoCard
                  label="Confidence"
                  value={
                    selected.confidence
                  }
                />

                <InfoCard
                  label="Priority"
                  value={
                    selected.priority
                  }
                />

                <InfoCard
                  label="Rainfall Trigger"
                  value={
                    selected.rainfall
                  }
                />

                <InfoCard
                  label="API Status"
                  value="LIVE"
                />
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Exposed Infrastructure
                    </h3>

                    <p className="mt-1 text-[10px] text-slate-600">
                      Operational exposure from
                      risk-zone data and verified
                      geometry where available.
                    </p>
                  </div>

                  <span className="rounded-md border border-white/5 bg-white/[0.025] px-2 py-1 text-[9px] text-slate-600">
                    LIVE API
                  </span>
                </div>

                <div className="space-y-2">
                  <ExposureRow
                    icon={
                      <Route size={15} />
                    }
                    label="Road Segments"
                    value={
                      selected.roads
                    }
                  />

                  <ExposureRow
                    icon={
                      <MapPinned
                        size={15}
                      />
                    }
                    label="Villages"
                    value={
                      selected.villages
                    }
                  />

                  <ExposureRow
                    icon={
                      <Navigation
                        size={15}
                      />
                    }
                    label="Bridges"
                    value={
                      selected.bridges
                    }
                  />
                </div>

                {selectedAssets.length >
                  0 && (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Linked Assets
                      </span>

                      <span className="text-[9px] text-slate-600">
                        {
                          selectedAssets.length
                        }
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {selectedAssets
                        .slice(0, 5)
                        .map(
                          (
                            asset,
                          ) => (
                            <div
                              key={
                                asset.id
                              }
                              className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-2.5 py-2"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="text-slate-500">
                                  {assetTypeIcon(
                                    asset.asset_type,
                                  )}
                                </span>

                                <span className="truncate text-[10px] text-slate-400">
                                  {
                                    asset.name
                                  }
                                </span>
                              </div>

                              <span className="shrink-0 text-[9px] text-slate-600">
                                {asset.geometry
                                  ? "MAPPED"
                                  : "PENDING"}
                              </span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

                {assetsLoading && (
                  <div className="mt-3 text-[10px] text-slate-600">
                    Loading infrastructure
                    geometry...
                  </div>
                )}

                {assetsError && (
                  <div className="mt-3 rounded-lg border border-amber-500/10 bg-amber-500/5 p-2.5 text-[10px] text-amber-400">
                    Infrastructure layer
                    unavailable:{" "}
                    {assetsError}
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-sky-500/15 bg-sky-500/[0.035] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-sky-400">
                      <ShieldCheck size={13} />
                      Nearest Safe Shelter
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Verified shelter registry + location-aware lookup
                    </div>
                  </div>
                  {sheltersLoading && (
                    <RefreshCw size={14} className="animate-spin text-slate-500" />
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoCard label="Registered" value={String(shelterRegistry.registered)} />
                  <InfoCard label="Mapped" value={String(shelterRegistry.mapped)} />
                  <InfoCard label="Location Pending" value={String(shelterRegistry.pending)} />
                </div>

                {sheltersError ? (
                  <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-400" />
                      <div>
                        <div className="text-[10px] font-semibold text-red-400">
                          Shelter lookup unavailable
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                          {sheltersError}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : shelterResultStatus === "NO_MAPPED_SHELTERS_AVAILABLE" ? (
                  <div className="mt-3 rounded-xl border border-sky-500/15 bg-sky-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <ShieldCheck size={13} className="mt-0.5 shrink-0 text-sky-400" />
                      <div>
                        <div className="text-[10px] font-semibold text-sky-300">
                          Shelter location pending verification
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                          {shelterRegistry.registered} registered shelters are available in the verified registry, but {shelterRegistry.pending} do not yet have verified map geometry. The routing engine is healthy; a road route will be calculated automatically after a shelter location is verified.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : shelters.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {shelters.slice(0, 5).map((shelter) => (
                      <div key={shelter.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-300">
                              {shelter.name}
                            </div>
                            <div className="mt-1 text-[9px] text-slate-600">
                              {shelter.asset_code} · Capacity {shelter.capacity ?? "N/A"}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                            {shelter.safety_status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[9px] text-slate-600">
                          <span>
                            Distance {typeof shelter.distance_km === "number" ? `${shelter.distance_km.toFixed(2)} km` : "UNAVAILABLE"}
                          </span>
                          <span>
                            {shelter.geometry_available ? "VERIFIED LOCATION" : "LOCATION PENDING"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                      Registered shelter records
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {shelterRegistryAssets.slice(0, 8).map((shelter) => (
                        <div
                          key={shelter.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[10px] text-slate-400">
                              {shelter.name}
                            </div>
                            <div className="mt-0.5 text-[8px] text-slate-600">
                              {shelter.asset_code}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[9px] font-semibold text-slate-400">
                              {shelter.capacity ?? "N/A"}
                            </div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-600">
                              Location pending
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 border-t border-white/5 pt-3 text-[9px] leading-4 text-slate-600">
                  Shelter safety is assessed from an assigned risk zone only. Distance and road routing are shown only when verified shelter geometry is available.
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Risk Evidence
                  </h3>

                  <ShieldCheck
                    size={15}
                    className="text-emerald-400"
                  />
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3">
                  <EvidenceRow
                    label="Baseline Risk"
                    value={`${selectedRiskPercent.toFixed(
                      2,
                    )}% · ${
                      selected.risk
                    }`}
                  />

                  <EvidenceRow
                    label="Rainfall Trigger"
                    value={
                      selected.rainfall
                    }
                    tone={
                      selected.rainfall ===
                        "VERY_HIGH" ||
                      selected.rainfall ===
                        "HIGH"
                        ? "warning"
                        : "normal"
                    }
                  />

                  <EvidenceRow
                    label="Model Confidence"
                    value={
                      selected.confidence
                    }
                  />

                  <EvidenceRow
                    label="Operational Priority"
                    value={
                      selected.priority
                    }
                  />

                  <EvidenceRow
                    label="Mapped Infrastructure"
                    value={`${selectedAssets.filter(
                      (asset) =>
                        getPointFromGeometry(
                          asset.geometry,
                        ) !== null,
                    ).length} with geometry`}
                    tone="success"
                  />
                </div>
              </div>

              {selected && (
                <ActionRecommendation
                  selected={selected}
                  fusion={fusion}
                  selectedAssets={selectedAssets}
                  shelterRegistry={shelterRegistry}
                  shelterResultStatus={shelterResultStatus}
                  shelters={shelters}
                />
              )}

              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Operational Assessment
                    </div>

                    <div className="mt-1 text-[10px] text-slate-600">
                      Explainable risk context
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowAssessment(
                        (value) =>
                          !value,
                      )
                    }
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:text-white"
                    aria-label="Toggle assessment details"
                  >
                    <ChevronDown
                      size={15}
                      className={`transition ${
                        showAssessment
                          ? "rotate-180"
                          : ""
                      }`}
                    />
                  </button>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {
                    selected.description
                  }
                </p>

                {showAssessment && (
                  <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                    <div className="rounded-lg border border-slate-700/50 bg-[#06111c] p-3">
                      <div className="text-[9px] uppercase tracking-wider text-slate-600">
                        Interpretation
                      </div>

                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        BhooPehra separates the
                        baseline spatial risk score
                        from the dynamic ML + rainfall
                        fusion. Where signals disagree,
                        the system flags the location
                        for review instead of silently
                        treating the highest signal as
                        truth.
                      </p>
                    </div>

                    {fusion?.warnings &&
                      fusion.warnings.length >
                        0 && (
                        <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-3">
                          <div className="flex items-center gap-2 text-[10px] font-semibold text-amber-400">
                            <AlertTriangle
                              size={13}
                            />
                            Model / Data Warnings
                          </div>

                          <div className="mt-2 space-y-1">
                            {fusion.warnings.map(
                              (
                                warning,
                              ) => (
                                <div
                                  key={
                                    warning
                                  }
                                  className="text-[10px] leading-4 text-slate-500"
                                >
                                  •{" "}
                                  {
                                    warning
                                  }
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    <div className="rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3">
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-400">
                        <CheckCircle2
                          size={13}
                        />
                        Spatial provenance
                      </div>

                      <p className="mt-1 text-[10px] leading-4 text-slate-600">
                        Risk boundaries are rendered
                        directly from backend PostGIS
                        geometry. Infrastructure points
                        are shown only when actual
                        geometry is available.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowAssessment(
                    true,
                  )
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#03130d] transition hover:bg-emerald-400"
              >
                <Search size={16} />
                View Detailed Assessment
              </button>

              {selectedFusionPercent !==
                null && (
                <div className="mt-3 text-center text-[9px] text-slate-700">
                  Operational fusion score:{" "}
                  {
                    selectedFusionPercent.toFixed(
                      1,
                    )
                  }
                  % · confidence{" "}
                  {
                    fusion?.final_confidence ??
                    "UNKNOWN"
                  }
                </div>
              )}
            </div>
          ) : searchResult ? (
            <div className="p-4 sm:p-5">
              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">
                        {searchResult.name}
                      </h2>

                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                        DATABASE
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {searchResult.district &&
                      searchResult.state
                        ? `${searchResult.district}, ${searchResult.state}`
                        : searchResult.subtitle ??
                          searchResult.type}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-white/[0.025] p-2">
                    <MapPinned
                      size={16}
                      className="text-emerald-400"
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <InfoCard
                    label="Record Type"
                    value={
                      searchResult.type
                        .replaceAll("_", " ")
                        .toUpperCase()
                    }
                  />

                  <InfoCard
                    label="Coordinates"
                    value={
                      searchPoint
                        ? "AVAILABLE"
                        : "UNAVAILABLE"
                    }
                  />

                  <InfoCard
                    label="Risk Assessment"
                    value={
                      searchResult.risk ??
                      "NOT AVAILABLE"
                    }
                  />

                  <InfoCard
                    label="Priority"
                    value={
                      searchResult.priority ??
                      "NOT AVAILABLE"
                    }
                  />
                </div>

                {searchPoint ? (
                  <div className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
                      Map Location
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Map centered using coordinates
                      returned by the BhooPehra backend.
                    </div>
                    <div className="mt-2 font-mono text-[10px] text-slate-500">
                      {searchResult.latitude?.toFixed(6)}
                      {" , "}
                      {searchResult.longitude?.toFixed(6)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-500/10 bg-amber-500/5 p-3 text-[10px] leading-4 text-amber-400">
                    This database record does not
                    currently contain verified
                    coordinates, so the map location
                    has not been fabricated.
                  </div>
                )}

                {searchResult.source && (
                  <div className="mt-4 text-[9px] text-slate-600">
                    Source: {searchResult.source}
                  </div>
                )}

                <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <Info size={12} />
                    Assessment status
                  </div>

                  <p className="mt-2 text-[10px] leading-4 text-slate-500">
                    This search result is a BhooPehra
                    database record. It is not being
                    presented as a risk-zone assessment
                    unless a matching risk zone exists.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[500px] items-center justify-center px-6 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/5 bg-white/[0.025]">
                  <MapPinned
                    size={20}
                    className="text-slate-600"
                  />
                </div>

                <div className="mt-4 text-sm font-medium text-slate-300">
                  No risk zone selected
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Select a highlighted risk
                  boundary or search for a location
                  with an available BhooPehra assessment.
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
