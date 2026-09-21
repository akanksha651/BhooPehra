import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudRain,
  Crosshair,
  ExternalLink,
  Layers3,
  MapPinned,
  Navigation,
  RefreshCw,
  Route,
  Send,
  ShieldAlert,
  Siren,
  TriangleAlert,
  Users,
  X,
} from "lucide-react"
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet"
import { LatLngBounds } from "leaflet"
import { useNavigate } from "react-router"
import {
  getAlerts,
  getDistrictBoundaries,
  getFieldReports,
  getInfrastructureAssets,
  getNearestShelters,
  getRiskFusionZone,
  getRiskZones,
  getRoutingStatus,
  updateFieldReportResponse,
} from "../services/api"

const NER_CENTER: [number, number] = [25.8, 94.1]
const NER_BOUNDS: [[number, number], [number, number]] = [
  [21.3, 88.0],
  [29.9, 97.6],
]

type RiskLevel =
  | "CRITICAL"
  | "HIGH"
  | "MODERATE"
  | "LOW"
  | "UNKNOWN"

type ResponseStatus =
  | "NOT_STARTED"
  | "ALERT_GENERATED"
  | "TEAM_ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"

type RiskZone = {
  id?: string | number
  zone_id?: string | number
  name?: string
  location?: string
  district?: string | { id?: number; name?: string; state?: string; code?: string }
  state?: string
  risk_level?: string
  risk?: string
  probability?: number
  confidence?: number | string
  priority?: string
  operational_status?: string
  rainfall_trigger?: string
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
    rainfall_observation?: RainfallObservation | null
  }
  rainfall_observation?: RainfallObservation | null
}

type RainfallObservation = {
  observed_at?: string
  rainfall_1h?: number
  rainfall_24h?: number
  rainfall_48h?: number
  rainfall_72h?: number
  antecedent_rainfall?: number
  soil_moisture?: number | null
  trigger_level?: string
  source?: string
  data_type?: string
}

type AlertItem = {
  id?: string | number
  alert_id?: string | number
  title?: string
  message?: string
  severity?: string
  status?: string
  created_at?: string
  location?: string
}

type FieldReport = {
  id?: string | number
  report_id?: string | number
  report_code?: string
  title?: string
  status?: string
  response_status?: string
  response_status_label?: string
  hazard?: string
  severity?: string
  description?: string
  created_at?: string
  submitted_at?: string
  location?: string
  state?: string
  district_name?: string
  latitude?: number
  longitude?: number
  assigned_team?: string
  response_notes?: string
  verification_notes?: string
  verified_at?: string
  road_impact?: string
  village_impact?: string
  photo_count?: number
}

type InfrastructureAsset = {
  id?: string | number
  asset_id?: string | number
  asset_code?: string
  name?: string
  asset_type?: string
  risk_level?: string
  probability?: number
  priority?: string
  exposure_count?: number
  geometry?: {
    available?: boolean
    spatially_verified?: boolean
    zone_intersection?: boolean
    verification_status?: string
    geometry_type?: string | null
    coordinates?: unknown
    wkt?: string | null
  } | unknown
  status?: string
  recommendation?: string | null
}

type InfrastructureSummary = {
  total: number
  critical: number
  high: number
  moderate: number
  geometryAvailable: number
  spatiallyVerified: number
  pendingGeometry: number
}

type RoutingStatus = {
  status?: string
  routing_engine?: string
  routing_graph?: {
    edges?: number
    available_edges?: number
    blocked_edges?: number
    vertices?: number
  }
  road_network?: {
    roads?: number
    blocked_roads?: number
  }
  source?: string
  synthetic_geometry?: boolean
}

type DistrictBoundary = {
  id?: number | string
  name?: string
  state?: string
  geometry?: unknown
}

type FusionResult = {
  status?: string
  final_probability?: number
  final_probability_percent?: number
  final_risk_level?: string
  final_confidence?: string
  operational_assessment?: string
  signals?: {
    ml?: {
      probability?: number
      probability_percent?: number
      risk_level?: string
      confidence?: string
    }
    rule_engine?: {
      probability?: number
      probability_percent?: number
      risk_level?: string
      confidence?: string
      rainfall_trigger?: string
    }
  }
  agreement?: {
    signals_agree?: boolean
    signal_disagreement?: boolean
  }
}



function normalizeRisk(value?: string): RiskLevel {
  const normalized = String(value ?? "").toUpperCase()

  if (normalized.includes("CRITICAL")) return "CRITICAL"
  if (normalized.includes("HIGH")) return "HIGH"
  if (normalized.includes("MODERATE")) return "MODERATE"
  if (normalized.includes("LOW")) return "LOW"

  return "UNKNOWN"
}

function normalizeResponseStatus(value?: string): ResponseStatus {
  const normalized = String(value ?? "").toUpperCase()

  if (
    normalized === "RESOLVED" ||
    normalized === "IN_PROGRESS" ||
    normalized === "TEAM_ASSIGNED" ||
    normalized === "ALERT_GENERATED"
  ) {
    return normalized
  }

  return "NOT_STARTED"
}

function riskColor(level: RiskLevel) {
  switch (level) {
    case "CRITICAL":
      return "#ef4444"
    case "HIGH":
      return "#f97316"
    case "MODERATE":
      return "#eab308"
    case "LOW":
      return "#22c55e"
    default:
      return "#64748b"
  }
}

function riskClass(level: RiskLevel) {
  switch (level) {
    case "CRITICAL":
      return "border-red-500/20 bg-red-500/10 text-red-400"
    case "HIGH":
      return "border-orange-500/20 bg-orange-500/10 text-orange-400"
    case "MODERATE":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
    case "LOW":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    default:
      return "border-slate-700 bg-slate-800/40 text-slate-500"
  }
}

function responseClass(status: ResponseStatus) {
  switch (status) {
    case "RESOLVED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    case "IN_PROGRESS":
      return "border-blue-500/20 bg-blue-500/10 text-blue-400"
    case "TEAM_ASSIGNED":
      return "border-purple-500/20 bg-purple-500/10 text-purple-400"
    case "ALERT_GENERATED":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
    default:
      return "border-slate-700 bg-slate-800/40 text-slate-500"
  }
}

function formatResponseStatus(value?: string) {
  return normalizeResponseStatus(value).replaceAll("_", " ")
}

function formatTime(value?: string) {
  if (!value) return "Time unavailable"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Time unavailable"

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable"
  }

  const percent = value <= 1 ? value * 100 : value
  return `${percent.toFixed(1)}%`
}

function flattenPairs(
  value: unknown,
  output: Array<[number, number]> = [],
): Array<[number, number]> {
  if (Array.isArray(value)) {
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      output.push([value[0], value[1]])
      return output
    }

    for (const child of value) flattenPairs(child, output)
    return output
  }

  if (value && typeof value === "object") {
    const object = value as {
      coordinates?: unknown
      geometry?: unknown
    }

    if (object.coordinates !== undefined) {
      flattenPairs(object.coordinates, output)
    }

    if (object.geometry !== undefined) {
      flattenPairs(object.geometry, output)
    }
  }

  return output
}

function parseGeometry(value: unknown): unknown {
  if (typeof value !== "string") return value

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function getPolygonRings(value: unknown): [number, number][][] {
  const parsed = parseGeometry(value)
  if (!parsed || typeof parsed !== "object") return []

  const object = parsed as {
    type?: string
    coordinates?: unknown
    geometry?: unknown
  }

  if (object.type === "Feature") {
    return getPolygonRings(object.geometry)
  }

  if (object.type === "Polygon" && Array.isArray(object.coordinates)) {
    const rings: [number, number][][] = []

    for (const rawRing of object.coordinates) {
      if (!Array.isArray(rawRing)) continue

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

      if (ring.length >= 3) rings.push(ring)
    }

    return rings
  }

  if (object.type === "MultiPolygon" && Array.isArray(object.coordinates)) {
    const rings: [number, number][][] = []

    for (const rawPolygon of object.coordinates) {
      if (!Array.isArray(rawPolygon)) continue
      const outerRing = rawPolygon[0]
      if (!Array.isArray(outerRing)) continue

      const ring: [number, number][] = []
      for (const rawPoint of outerRing) {
        if (
          Array.isArray(rawPoint) &&
          rawPoint.length >= 2 &&
          typeof rawPoint[0] === "number" &&
          typeof rawPoint[1] === "number"
        ) {
          ring.push([rawPoint[1], rawPoint[0]])
        }
      }

      if (ring.length >= 3) rings.push(ring)
    }

    return rings
  }

  return []
}

function getPointFromGeometry(value: unknown): [number, number] | null {
  const parsed = parseGeometry(value)
  if (!parsed) return null

  if (typeof parsed === "string") {
    const match = parsed.match(
      /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i,
    )

    if (!match) return null
    return [Number(match[2]), Number(match[1])]
  }

  if (typeof parsed !== "object") return null

  const object = parsed as {
    type?: string
    coordinates?: unknown
    geometry?: unknown
  }

  if (object.type === "Feature") {
    return getPointFromGeometry(object.geometry)
  }

  if (
    object.type === "Point" &&
    Array.isArray(object.coordinates) &&
    object.coordinates.length >= 2 &&
    typeof object.coordinates[0] === "number" &&
    typeof object.coordinates[1] === "number"
  ) {
    return [object.coordinates[1], object.coordinates[0]]
  }

  return null
}

function getDistrictName(zone: RiskZone) {
  if (typeof zone.district === "string") return zone.district
  return zone.district?.name ?? zone.location ?? "District unavailable"
}

function getStateName(zone: RiskZone) {
  if (zone.state) return zone.state
  if (typeof zone.district === "object") return zone.district.state ?? "State unavailable"
  return "State unavailable"
}

function MapViewport({
  zones,
}: {
  zones: RiskZone[]
}) {
  const map = useMap()

  useEffect(() => {
    const points: [number, number][] = []

    for (const zone of zones) {
      const rings = getPolygonRings(zone.geometry)
      for (const ring of rings) points.push(...ring)
    }

    if (points.length > 0) {
      map.fitBounds(new LatLngBounds(points), {
        padding: [25, 25],
        maxZoom: 8,
      })
      return
    }

    map.setView(NER_CENTER, 7.5)
  }, [map, zones])

  return null
}

function MapFocus({
  point,
}: {
  point: [number, number] | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!point) return
    map.flyTo(point, Math.max(map.getZoom(), 10), { duration: 0.8 })
  }, [map, point])

  return null
}

function MapLocateControl() {
  const map = useMap()

  function locate() {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ]
        map.flyTo(point, 11, { duration: 0.8 })
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    )
  }

  return (
    <div className="absolute bottom-4 right-4 z-[500]">
      <button
        type="button"
        onClick={locate}
        title="Use current location"
        className="rounded-xl border border-white/10 bg-[#081522]/95 p-2.5 text-slate-300 shadow-xl backdrop-blur transition hover:border-emerald-500/30 hover:text-emerald-400"
      >
        <Crosshair size={16} />
      </button>
    </div>
  )
}

function LayerButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[9px] text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {typeof count === "number" && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] text-slate-600">
            {count}
          </span>
        )}
        <span
          className={`h-3.5 w-6 rounded-full p-0.5 ${
            active ? "bg-emerald-500" : "bg-white/10"
          }`}
        >
          <span
            className={`block h-2.5 w-2.5 rounded-full bg-white transition ${
              active ? "translate-x-2.5" : "translate-x-0"
            }`}
          />
        </span>
      </span>
    </button>
  )
}

function OperationalMap({
  zones,
  reports,
  infrastructure,
  districts,
  showZones,
  showReports,
  showInfrastructure,
  showDistricts,
  focusPoint,
  onFocusPoint,
}: {
  zones: RiskZone[]
  reports: FieldReport[]
  infrastructure: InfrastructureAsset[]
  districts: DistrictBoundary[]
  showZones: boolean
  showReports: boolean
  showInfrastructure: boolean
  showDistricts: boolean
  focusPoint: [number, number] | null
  onFocusPoint: (point: [number, number]) => void
}) {
  const verifiedReports = reports.filter(
    (report) => String(report.status ?? "").toUpperCase() === "VERIFIED",
  )

  const mappedAssets = infrastructure.filter((asset) => {
    if (!asset.geometry || typeof asset.geometry !== "object") return false
    const geometry = asset.geometry as {
      available?: boolean
      spatially_verified?: boolean
      coordinates?: unknown
      wkt?: string | null
    }

    return (
      geometry.available === true &&
      geometry.coordinates !== null &&
      geometry.coordinates !== undefined
    )
  })

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-b-2xl">
      <MapContainer
        center={NER_CENTER}
        zoom={7.5}
        minZoom={5}
        maxZoom={14}
        maxBounds={NER_BOUNDS}
        maxBoundsViscosity={0.65}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        />

        <MapViewport zones={zones} />
        <MapFocus point={focusPoint} />
        <MapLocateControl />

        {showDistricts &&
          districts.map((district, index) => {
            const geometry = parseGeometry(district.geometry)
            if (!geometry) return null

            return (
              <GeoJSON
                key={district.id ?? `district-${index}`}
                data={geometry as never}
                style={() => ({
                  color: "#94a3b8",
                  weight: 1,
                  opacity: 0.35,
                  fillOpacity: 0,
                })}
              />
            )
          })}

        {showZones &&
          zones.map((zone, index) => {
            const level = normalizeRisk(zone.risk_level ?? zone.risk)
            const color = riskColor(level)
            const rings = getPolygonRings(zone.geometry)

            if (rings.length === 0) return null

            return rings.map((ring, ringIndex) => (
              <Polygon
                key={`${zone.id ?? `zone-${index}`}-${ringIndex}`}
                positions={ring}
                eventHandlers={{
                  click: () => {
                    const point = ring[0]
                    if (point) onFocusPoint(point)
                  },
                }}
                pathOptions={{
                  color,
                  weight: level === "CRITICAL" || level === "HIGH" ? 2.5 : 1.5,
                  fillColor: color,
                  fillOpacity:
                    level === "CRITICAL"
                      ? 0.3
                      : level === "HIGH"
                        ? 0.25
                        : level === "MODERATE"
                          ? 0.18
                          : 0.12,
                }}
              >
                <Tooltip sticky>
                  {zone.name ?? "Risk zone"} · {level}
                </Tooltip>
                <Popup>
                  <div className="min-w-[210px] text-slate-900">
                    <p className="text-sm font-bold">
                      {zone.name ?? "Risk zone"}
                    </p>
                    <p className="mt-1 text-xs">
                      {getDistrictName(zone)}, {getStateName(zone)}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <span>
                        <strong>Baseline:</strong> {level}
                      </span>
                      <span>
                        <strong>Probability:</strong>{" "}
                        {formatPercent(zone.probability)}
                      </span>
                      <span>
                        <strong>Priority:</strong>{" "}
                        {zone.priority ?? "Unavailable"}
                      </span>
                      <span>
                        <strong>Rain trigger:</strong>{" "}
                        {zone.rainfall_trigger ?? "Unavailable"}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Polygon>
            ))
          })}

        {showReports &&
          verifiedReports.map((report, index) => {
            if (
              typeof report.latitude !== "number" ||
              typeof report.longitude !== "number" ||
              !Number.isFinite(report.latitude) ||
              !Number.isFinite(report.longitude)
            ) {
              return null
            }

            const level = normalizeRisk(report.severity)
            const color = riskColor(level)

            return (
              <CircleMarker
                key={report.id ?? report.report_id ?? `report-${index}`}
                center={[report.latitude, report.longitude]}
                radius={7}
                eventHandlers={{
                  click: () => onFocusPoint([report.latitude as number, report.longitude as number]),
                }}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.95,
                }}
              >
                <Tooltip>
                  {report.report_code ?? "Field report"} · VERIFIED
                </Tooltip>
                <Popup>
                  <div className="min-w-[220px] text-slate-900">
                    <p className="text-sm font-bold">
                      {report.report_code ?? "Field report"}
                    </p>
                    <p className="mt-1 text-xs font-medium">
                      {report.hazard ?? report.title ?? "Field observation"}
                    </p>
                    <div className="mt-2 space-y-1 text-xs">
                      <p>
                        <strong>Severity:</strong> {report.severity ?? "Unavailable"}
                      </p>
                      <p>
                        <strong>Response:</strong>{" "}
                        {formatResponseStatus(report.response_status)}
                      </p>
                      <p>
                        <strong>Location:</strong>{" "}
                        {report.location ?? "Unavailable"}
                      </p>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

        {showInfrastructure &&
          mappedAssets.map((asset, index) => {
            const geometry = asset.geometry as {
              geometry_type?: string | null
              coordinates?: unknown
              wkt?: string | null
            }

            const geometryType = String(geometry.geometry_type ?? "").toUpperCase()
            const coordinates = geometry.coordinates
            const assetColor =
              String(asset.asset_type ?? "").toUpperCase() === "ROAD"
                ? "#38bdf8"
                : String(asset.asset_type ?? "").toUpperCase() === "BRIDGE"
                  ? "#a78bfa"
                  : "#f59e0b"

            if (geometryType.includes("LINE") && Array.isArray(coordinates)) {
              const points = flattenPairs(coordinates).map(([lng, lat]) => [
                lat,
                lng,
              ] as [number, number])

              if (points.length < 2) return null

              return (
                <Polyline
                  key={asset.id ?? asset.asset_id ?? `asset-${index}`}
                  positions={points}
                  pathOptions={{ color: assetColor, weight: 3, opacity: 0.85 }}
                >
                  <Tooltip>{asset.name ?? asset.asset_code ?? "Infrastructure"}</Tooltip>
                  <Popup>
                    <div className="min-w-[210px] text-slate-900">
                      <p className="text-sm font-bold">
                        {asset.name ?? asset.asset_code ?? "Infrastructure"}
                      </p>
                      <p className="mt-1 text-xs">
                        {asset.asset_type ?? "Asset"} · {asset.risk_level ?? "Risk unavailable"}
                      </p>
                      <p className="mt-2 text-xs">
                        Spatial verification: {asset.geometry && typeof asset.geometry === "object" && (asset.geometry as { spatially_verified?: boolean }).spatially_verified ? "Verified" : "Not verified"}
                      </p>
                    </div>
                  </Popup>
                </Polyline>
              )
            }

            const point = getPointFromGeometry(geometry.wkt ?? coordinates)
            if (!point) return null

            return (
              <CircleMarker
                key={asset.id ?? asset.asset_id ?? `asset-${index}`}
                center={point}
                radius={5}
                eventHandlers={{
                  click: () => onFocusPoint(point),
                }}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  fillColor: assetColor,
                  fillOpacity: 0.95,
                }}
              >
                <Popup>
                  <div className="min-w-[210px] text-slate-900">
                    <p className="text-sm font-bold">
                      {asset.name ?? asset.asset_code ?? "Infrastructure"}
                    </p>
                    <p className="mt-1 text-xs">
                      {asset.asset_type ?? "Asset"}
                    </p>
                    <p className="mt-2 text-xs">
                      Geometry available; spatial verification remains based on backend result.
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
      </MapContainer>
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtext,
  icon,
  tone = "neutral",
}: {
  label: string
  value: string
  subtext: string
  icon: ReactNode
  tone?: "neutral" | "red" | "orange" | "yellow" | "blue" | "green"
}) {
  const toneClasses = {
    neutral: "border-slate-800 text-white",
    red: "border-red-500/15 text-red-400",
    orange: "border-orange-500/15 text-orange-400",
    yellow: "border-yellow-500/15 text-yellow-400",
    blue: "border-blue-500/15 text-blue-400",
    green: "border-emerald-500/15 text-emerald-400",
  }

  return (
    <div className={`rounded-2xl border bg-[#091827] p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {label}
        </p>
        <span>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[9px] text-slate-600">{subtext}</p>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  icon,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  icon: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 text-emerald-400">{icon}</div>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-500">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">{title}</h2>
          {description && (
            <p className="mt-1 text-[9px] leading-4 text-slate-600">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()

  const [zones, setZones] = useState<RiskZone[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [reports, setReports] = useState<FieldReport[]>([])
  const [infrastructure, setInfrastructure] = useState<InfrastructureAsset[]>([])
  const [districts, setDistricts] = useState<DistrictBoundary[]>([])
  const [routingStatus, setRoutingStatus] = useState<RoutingStatus | null>(null)
  const [fusion, setFusion] = useState<Record<string, FusionResult>>({})
  const [shelterRegistry, setShelterRegistry] = useState<{
    registered: number | null
    mapped: number | null
    pending: number | null
  }>({ registered: null, mapped: null, pending: null })

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null)
  const [teamName, setTeamName] = useState("")
  const [responseNotes, setResponseNotes] = useState("")
  const [updatingReport, setUpdatingReport] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [showZones, setShowZones] = useState(true)
  const [showReports, setShowReports] = useState(true)
  const [showInfrastructure, setShowInfrastructure] = useState(true)
  const [showDistricts, setShowDistricts] = useState(false)
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null)

  async function loadDashboard(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)

    setError(null)

    try {
      const results = await Promise.allSettled([
        getRiskZones(),
        getAlerts(),
        getFieldReports(),
        getInfrastructureAssets(),
        getDistrictBoundaries(),
        getRoutingStatus(),
      ])

      let successCount = 0

      const zonesResult = results[0]
      if (zonesResult.status === "fulfilled") {
        const nextZones = zonesResult.value as unknown as RiskZone[]
        setZones(nextZones)
        successCount += 1

        const fusionResults = await Promise.allSettled(
          nextZones
            .map((zone) => zone.id ?? zone.zone_id)
            .filter((id): id is string | number => id !== undefined && id !== null)
            .map(async (id) => {
              const payload = await getRiskFusionZone(Number(id))
              return [String(id), payload.risk_fusion as FusionResult] as const
            }),
        )

        const nextFusion: Record<string, FusionResult> = {}
        for (const result of fusionResults) {
          if (result.status === "fulfilled" && result.value[1]) {
            nextFusion[result.value[0]] = result.value[1]
          }
        }
        setFusion(nextFusion)
      }

      const alertsResult = results[1]
      if (alertsResult.status === "fulfilled") {
        setAlerts(alertsResult.value as unknown as AlertItem[])
        successCount += 1
      }

      const reportsResult = results[2]
      if (reportsResult.status === "fulfilled") {
        setReports(reportsResult.value as unknown as FieldReport[])
        successCount += 1
      }

      const infrastructureResult = results[3]
      if (infrastructureResult.status === "fulfilled") {
        setInfrastructure(
          infrastructureResult.value as unknown as InfrastructureAsset[],
        )
        successCount += 1
      }

      const districtsResult = results[4]
      if (districtsResult.status === "fulfilled") {
        setDistricts(districtsResult.value as unknown as DistrictBoundary[])
        successCount += 1
      }

      const routingResult = results[5]
      if (routingResult.status === "fulfilled") {
        setRoutingStatus(routingResult.value as unknown as RoutingStatus)
        successCount += 1
      }

      try {
        const firstZone = zonesResult.status === "fulfilled"
          ? (zonesResult.value[0] as unknown as RiskZone | undefined)
          : undefined
        const zonePoint = firstZone
          ? getPolygonRings(firstZone.geometry)[0]?.[0]
          : undefined

        if (zonePoint) {
          const response = await getNearestShelters(
            zonePoint[0],
            zonePoint[1],
          )

          setShelterRegistry({
            registered: response.shelter_registry?.registered_shelters ?? null,
            mapped: response.shelter_registry?.mapped_shelters ?? null,
            pending: response.shelter_registry?.location_pending ?? null,
          })
        } else {
          setShelterRegistry({
            registered: null,
            mapped: null,
            pending: null,
          })
        }
      } catch {
        setShelterRegistry({
          registered: null,
          mapped: null,
          pending: null,
        })
      }

      if (successCount === 0) {
        throw new Error("Dashboard APIs are unavailable")
      }

      if (successCount < 4) {
        setError("Some operational data sources are temporarily unavailable.")
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load dashboard data.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadDashboard()

    const interval = window.setInterval(() => {
      void loadDashboard(true)
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  const riskSummary = useMemo(() => {
    return zones.reduce(
      (summary, zone) => {
        summary[normalizeRisk(zone.risk_level ?? zone.risk)] += 1
        return summary
      },
      {
        CRITICAL: 0,
        HIGH: 0,
        MODERATE: 0,
        LOW: 0,
        UNKNOWN: 0,
      } as Record<RiskLevel, number>,
    )
  }, [zones])

  const highestBaselineZone = useMemo(() => {
    const available = zones.filter(
      (zone) =>
        typeof zone.probability === "number" &&
        Number.isFinite(zone.probability),
    )

    if (!available.length) return null

    return available.reduce<RiskZone>((highest, zone) =>
      (zone.probability as number) > (highest.probability as number)
        ? zone
        : highest,
      available[0],
    )
  }, [zones])

  const averageBaselineProbability = useMemo(() => {
    const values = zones
      .map((zone) => zone.probability)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

    if (!values.length) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [zones])

  const activeAlerts = useMemo(
    () =>
      alerts.filter(
        (alert) => String(alert.status ?? "ACTIVE").toUpperCase() === "ACTIVE",
      ),
    [alerts],
  )

  const recentReports = useMemo(
    () =>
      [...reports]
        .sort(
          (a, b) =>
            new Date(b.created_at ?? b.submitted_at ?? "").getTime() -
            new Date(a.created_at ?? a.submitted_at ?? "").getTime(),
        )
        .slice(0, 5),
    [reports],
  )

  const responseQueue = useMemo(
    () =>
      [...reports]
        .filter(
          (report) =>
            String(report.status ?? "").toUpperCase() === "VERIFIED" &&
            normalizeResponseStatus(report.response_status) !== "RESOLVED",
        )
        .sort((a, b) => {
          const rank: Record<ResponseStatus, number> = {
            NOT_STARTED: 1,
            ALERT_GENERATED: 2,
            TEAM_ASSIGNED: 3,
            IN_PROGRESS: 4,
            RESOLVED: 5,
          }

          return (
            rank[normalizeResponseStatus(a.response_status)] -
            rank[normalizeResponseStatus(b.response_status)]
          )
        })
        .slice(0, 5),
    [reports],
  )

  const unresolvedCount = useMemo(
    () =>
      reports.filter(
        (report) =>
          String(report.status ?? "").toUpperCase() === "VERIFIED" &&
          normalizeResponseStatus(report.response_status) !== "RESOLVED",
      ).length,
    [reports],
  )

  const infrastructureSummary = useMemo<InfrastructureSummary>(() => {
    return infrastructure.reduce(
      (summary, asset) => {
        const level = normalizeRisk(asset.risk_level)
        const geometry =
          asset.geometry && typeof asset.geometry === "object"
            ? (asset.geometry as {
                available?: boolean
                spatially_verified?: boolean
              })
            : undefined

        summary.total += 1
        summary.critical += level === "CRITICAL" ? 1 : 0
        summary.high += level === "HIGH" ? 1 : 0
        summary.moderate += level === "MODERATE" ? 1 : 0
        summary.geometryAvailable += geometry?.available === true ? 1 : 0
        summary.spatiallyVerified += geometry?.spatially_verified === true ? 1 : 0
        summary.pendingGeometry += geometry?.available === true ? 0 : 1

        return summary
      },
      {
        total: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        geometryAvailable: 0,
        spatiallyVerified: 0,
        pendingGeometry: 0,
      },
    )
  }, [infrastructure])

  const weatherContext = useMemo(() => {
    const observations = zones
      .map((zone) => zone.rainfall_observation ?? zone.risk_engine?.rainfall_observation)
      .filter((observation): observation is RainfallObservation => Boolean(observation))

    if (!observations.length) return null

    const latest = observations.reduce((current, observation) => {
      const currentTime = new Date(current.observed_at ?? "").getTime()
      const nextTime = new Date(observation.observed_at ?? "").getTime()
      return nextTime > currentTime ? observation : current
    })

    return latest
  }, [zones])

  const featuredRiskIntelligence = useMemo(() => {
    const available = zones
      .map((zone) => {
        const zoneId = zone.id ?? zone.zone_id
        if (zoneId === undefined || zoneId === null) return null

        const result = fusion[String(zoneId)]
        if (!result || typeof result.final_probability !== "number") return null

        return { zone, result }
      })
      .filter((item): item is { zone: RiskZone; result: FusionResult } => Boolean(item))

    if (!available.length) {
      return highestBaselineZone
        ? { zone: highestBaselineZone, result: null as FusionResult | null }
        : null
    }

    return available.reduce((current, item) =>
      (item.result.final_probability ?? -1) >
      (current.result.final_probability ?? -1)
        ? item
        : current,
    )
  }, [fusion, highestBaselineZone, zones])

  async function updateReportStatus(
    report: FieldReport,
    nextStatus: ResponseStatus,
  ) {
    const reportId = report.id ?? report.report_id

    if (reportId === undefined || reportId === null) {
      setActionError("This report does not have a valid report ID.")
      return
    }

    if (String(report.status ?? "").toUpperCase() !== "VERIFIED") {
      setActionError("Authority response actions require a VERIFIED field report.")
      return
    }

    if (nextStatus === "TEAM_ASSIGNED" && !teamName.trim()) {
      setActionError("Enter the actual response team name before assigning.")
      return
    }

    setUpdatingReport(true)
    setActionError(null)

    try {
      await updateFieldReportResponse(reportId as number, {
        response_status: nextStatus,
        assigned_team:
          nextStatus === "TEAM_ASSIGNED" || nextStatus === "IN_PROGRESS"
            ? teamName.trim() || report.assigned_team
            : report.assigned_team,
        response_notes: responseNotes.trim() || report.response_notes,
      })

      setSelectedReport(null)
      setTeamName("")
      setResponseNotes("")
      await loadDashboard(true)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Unable to update field response.",
      )
    } finally {
      setUpdatingReport(false)
    }
  }

  function openReportAction(report: FieldReport) {
    setSelectedReport(report)
    setTeamName(report.assigned_team ?? "")
    setResponseNotes(report.response_notes ?? "")
    setActionError(null)
  }

  function openPage(path: string) {
    navigate(path)
  }

  const highestRisk = highestBaselineZone
    ? normalizeRisk(highestBaselineZone.risk_level ?? highestBaselineZone.risk)
    : "UNKNOWN"

  const verifiedReportCount = reports.filter(
    (report) => String(report.status ?? "").toUpperCase() === "VERIFIED",
  ).length

  const pendingVerificationCount = reports.filter(
    (report) => String(report.status ?? "").toUpperCase() === "SUBMITTED",
  ).length

  return (
    <div className="min-h-screen bg-[#07111d] px-4 py-5 text-white lg:px-6 xl:px-8">
      <div className="mx-auto max-w-[1780px]">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-800/80 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldAlert className="h-4 w-4" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">BhooPehra · DDMA Operations</p>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white lg:text-4xl">Landslide Risk Command Center</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-slate-400">
              Monitor risk, verify field evidence, prioritize response and track operational action from one command view.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-slate-800 bg-[#0b1a2a] px-4 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Auto refresh</p>
              <p className="mt-0.5 text-xs font-medium text-slate-300">Every 60 seconds</p>
            </div>
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-50"
            >
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh Intelligence
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="mb-5 grid gap-3 md:grid-cols-4">
          {([
            { number: "01", title: "Analyze", description: "Risk zones & field evidence", Icon: MapPinned, active: true },
            { number: "02", title: "Prioritize", description: "Severity, exposure & response state", Icon: ShieldAlert, active: true },
            { number: "03", title: "Assign", description: "Verified incidents only", Icon: Users, active: unresolvedCount > 0 },
            { number: "04", title: "Respond", description: "Track field action to resolution", Icon: CheckCircle2, active: reports.some((report) => normalizeResponseStatus(report.response_status) === "IN_PROGRESS") },
          ] as const).map(({ number, title, description, Icon, active }) => (
            <div key={number} className={`rounded-xl border px-4 py-3 ${active ? "border-emerald-500/25 bg-emerald-500/[0.07]" : "border-slate-800 bg-[#0b1a2a]"}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${active ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-slate-800 bg-[#081522] text-slate-600"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${active ? "text-white" : "text-slate-500"}`}>{number} · {title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Monitored Risk Zones" value={loading ? "--" : String(zones.length)} subtext="Baseline zones from risk service" icon={<MapPinned className="h-5 w-5" />} tone="green" />
          <MetricCard label="Highest Baseline" value={loading ? "--" : highestBaselineZone ? formatPercent(highestBaselineZone.probability) : "Unavailable"} subtext={highestBaselineZone ? `${highestBaselineZone.name ?? "Zone"} · ${highestRisk}` : "No baseline assessment returned"} icon={<ShieldAlert className="h-5 w-5" />} tone="orange" />
          <MetricCard label="Average Baseline" value={loading ? "--" : formatPercent(averageBaselineProbability ?? undefined)} subtext="Returned zone probabilities only" icon={<Navigation className="h-5 w-5" />} tone="blue" />
          <MetricCard label="High / Critical" value={loading ? "--" : String(riskSummary.HIGH + riskSummary.CRITICAL)} subtext="Baseline classification" icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
          <MetricCard label="Active Alerts" value={loading ? "--" : String(activeAlerts.length)} subtext="Current ACTIVE records" icon={<Siren className="h-5 w-5" />} tone="yellow" />
          <MetricCard label="Response Queue" value={loading ? "--" : String(unresolvedCount)} subtext="Verified reports not resolved" icon={<Users className="h-5 w-5" />} tone="blue" />
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.7fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">District Situation Map</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Northeast India Operational GIS View</h2>
                <p className="mt-1 text-xs text-slate-500">Live backend geometry for monitored zones, verified field evidence and mapped infrastructure.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button type="button" className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#081522] px-3 py-2 text-xs font-semibold text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400">
                    <Layers3 className="h-4 w-4" /> Layers
                  </button>
                  <div className="invisible absolute right-0 top-full z-[1000] mt-2 w-72 rounded-xl border border-slate-700 bg-[#081522]/98 p-2 opacity-0 shadow-2xl backdrop-blur transition group-hover:visible group-hover:opacity-100">
                    <LayerButton label="Risk Zones" active={showZones} count={zones.length} onClick={() => setShowZones((value) => !value)} />
                    <LayerButton label="Verified Field Reports" active={showReports} count={verifiedReportCount} onClick={() => setShowReports((value) => !value)} />
                    <LayerButton label="Mapped Infrastructure" active={showInfrastructure} count={infrastructureSummary.geometryAvailable} onClick={() => setShowInfrastructure((value) => !value)} />
                    <LayerButton label="District Boundaries" active={showDistricts} count={districts.length || undefined} onClick={() => setShowDistricts((value) => !value)} />
                    <div className="mt-1 border-t border-slate-800 px-2.5 pt-2 text-[9px] leading-4 text-slate-500">Road blockage counts are shown from the routing service. No road segment is fabricated without verified geometry.</div>
                  </div>
                </div>
                <span className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${riskClass(highestRisk)}`}>{highestRisk === "UNKNOWN" ? "BASELINE UNAVAILABLE" : `${highestRisk} BASELINE`}</span>
              </div>
            </div>
            <div className="relative h-[500px] lg:h-[560px]">
              <OperationalMap zones={zones} reports={reports} infrastructure={infrastructure} districts={districts} showZones={showZones} showReports={showReports} showInfrastructure={showInfrastructure} showDistricts={showDistricts} focusPoint={focusPoint} onFocusPoint={setFocusPoint} />
              <div className="absolute right-4 top-4 z-[500] flex flex-wrap justify-end gap-2">
                <div className="rounded-lg border border-white/10 bg-[#081522]/95 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400 shadow-lg backdrop-blur">Risk zones <span className="text-white">{zones.length}</span></div>
                <div className="rounded-lg border border-white/10 bg-[#081522]/95 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400 shadow-lg backdrop-blur">Verified reports <span className="text-white">{verifiedReportCount}</span></div>
                <div className="rounded-lg border border-white/10 bg-[#081522]/95 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400 shadow-lg backdrop-blur">Mapped assets <span className="text-white">{infrastructureSummary.geometryAvailable}</span></div>
              </div>
              <div className="absolute bottom-4 left-4 z-[500] w-64 rounded-xl border border-white/10 bg-[#081522]/95 p-3 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Map Legend</p><span className="text-[8px] font-semibold text-emerald-400">VERIFIED DATA</span></div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-slate-400">
                  {([ ["CRITICAL", "#ef4444", riskSummary.CRITICAL], ["HIGH", "#f97316", riskSummary.HIGH], ["MODERATE", "#eab308", riskSummary.MODERATE], ["LOW", "#22c55e", riskSummary.LOW] ] as Array<[string, string, number]>).map(([label, color, count]) => (
                    <span key={label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border" style={{ borderColor: color, backgroundColor: `${color}33` }} /><span>{label}</span><span className="text-slate-600">{count}</span></span>
                  ))}
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-white bg-transparent ring-1 ring-sky-400" /><span>Verified report</span><span className="text-slate-600">{verifiedReportCount}</span></span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-white bg-amber-400" /><span>Mapped asset</span><span className="text-slate-600">{infrastructureSummary.geometryAvailable}</span></span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
              <SectionHeader eyebrow="Field Evidence" title="Recent Field Reports" description="Verification and response status are shown separately." icon={<Clock3 className="h-4 w-4" />} action={<button type="button" onClick={() => openPage("/field-reports")} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">View all →</button>} />
              <div className="space-y-2 p-4">
                {recentReports.length === 0 ? <div className="rounded-xl border border-slate-800 bg-[#081522] p-4 text-sm text-slate-500">No field reports returned.</div> : recentReports.slice(0, 4).map((report, index) => {
                  const verified = String(report.status ?? "").toUpperCase() === "VERIFIED"
                  const responseStatus = normalizeResponseStatus(report.response_status)
                  return <button key={report.id ?? report.report_id ?? `recent-${index}`} type="button" onClick={() => openReportAction(report)} className="w-full rounded-xl border border-slate-800 bg-[#081522] p-3 text-left transition hover:border-emerald-500/25 hover:bg-[#0a1826]">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-200">{report.report_code ?? report.title ?? "Field report"}</p><p className="mt-1 truncate text-xs text-slate-500">{report.hazard ?? "Field observation"} · {report.location ?? "Location unavailable"}</p></div><span className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold ${verified ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"}`}>{verified ? "VERIFIED" : String(report.status ?? "UNKNOWN").toUpperCase()}</span></div>
                    <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-600">{formatTime(report.created_at ?? report.submitted_at)}</span><span className={`rounded-md border px-2 py-1 text-[9px] font-semibold ${responseClass(responseStatus)}`}>{formatResponseStatus(responseStatus)}</span></div>
                  </button>
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
              <SectionHeader eyebrow="Quick Actions" title="Authority Operations" description="Navigate to the existing operational modules." icon={<Navigation className="h-4 w-4" />} />
              <div className="grid grid-cols-2 gap-2 p-4">
                <button type="button" onClick={() => openPage("/risk-map")} className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-3 text-left hover:bg-blue-500/10"><p className="text-xs font-semibold text-blue-300">Inspect Risk Map</p><p className="mt-1 text-[10px] text-slate-500">Review monitored zones</p></button>
                <button type="button" onClick={() => openPage("/field-reports")} className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-3 text-left hover:bg-yellow-500/10"><p className="text-xs font-semibold text-yellow-300">Verify Reports</p><p className="mt-1 text-[10px] text-slate-500">Review field evidence</p></button>
                <button type="button" onClick={() => openPage("/alerts")} className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-3 text-left hover:bg-red-500/10"><p className="text-xs font-semibold text-red-300">Manage Alerts</p><p className="mt-1 text-[10px] text-slate-500">{activeAlerts.length} active record(s)</p></button>
                <button type="button" onClick={() => openPage("/infrastructure")} className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-3 text-left hover:bg-purple-500/10"><p className="text-xs font-semibold text-purple-300">Infrastructure</p><p className="mt-1 text-[10px] text-slate-500">Exposure & geometry</p></button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader eyebrow="Priority Actions" title="Authority Decision Queue" description="Only actions supported by current backend state are shown." icon={<ShieldAlert className="h-4 w-4" />} />
            <div className="p-4">
              {pendingVerificationCount > 0 && <button type="button" onClick={() => openPage("/field-reports")} className="mb-2 flex w-full items-center justify-between rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-left hover:bg-yellow-500/10"><span><span className="block text-sm font-semibold text-yellow-300">Verify Field Evidence</span><span className="mt-1 block text-xs text-slate-500">{pendingVerificationCount} submitted report(s) awaiting verification</span></span><ArrowRight className="h-4 w-4 text-yellow-400" /></button>}
              {(riskSummary.HIGH + riskSummary.CRITICAL) > 0 && <button type="button" onClick={() => openPage("/risk-map")} className="mb-2 flex w-full items-center justify-between rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-left hover:bg-orange-500/10"><span><span className="block text-sm font-semibold text-orange-300">Review High / Critical Baseline</span><span className="mt-1 block text-xs text-slate-500">{riskSummary.HIGH + riskSummary.CRITICAL} monitored zone(s)</span></span><ArrowRight className="h-4 w-4 text-orange-400" /></button>}
              {responseQueue.length > 0 && <button type="button" onClick={() => openReportAction(responseQueue[0])} className="mb-2 flex w-full items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-left hover:bg-blue-500/10"><span><span className="block text-sm font-semibold text-blue-300">Advance Field Response</span><span className="mt-1 block text-xs text-slate-500">Verified operational response requires action</span></span><ArrowRight className="h-4 w-4 text-blue-400" /></button>}
              {activeAlerts.length > 0 && <button type="button" onClick={() => openPage("/alerts")} className="flex w-full items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left hover:bg-red-500/10"><span><span className="block text-sm font-semibold text-red-300">Review Active Alerts</span><span className="mt-1 block text-xs text-slate-500">{activeAlerts.length} active alert record(s)</span></span><ArrowRight className="h-4 w-4 text-red-400" /></button>}
              {pendingVerificationCount === 0 && riskSummary.HIGH + riskSummary.CRITICAL === 0 && responseQueue.length === 0 && activeAlerts.length === 0 && <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-5"><p className="text-sm font-semibold text-emerald-300">No immediate dashboard action is currently generated.</p><p className="mt-1 text-xs leading-5 text-slate-500">Continue monitoring verified intelligence. This does not imply that no hazard exists.</p></div>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader eyebrow="Risk Intelligence" title="Baseline vs ML vs Fusion" description="Signals remain separate so an unavailable model result is never mistaken for a risk value." icon={<AlertTriangle className="h-4 w-4" />} />
            <div className="p-4">
              {featuredRiskIntelligence ? <div className="rounded-xl border border-slate-800 bg-[#081522] p-4">
                <div className="flex items-start justify-between gap-4"><div><p className="text-base font-semibold text-white">{featuredRiskIntelligence.zone.name ?? "Risk zone"}</p><p className="mt-1 text-xs text-slate-500">{getDistrictName(featuredRiskIntelligence.zone)}, {getStateName(featuredRiskIntelligence.zone)}</p></div><span className={`rounded-md border px-2.5 py-1.5 text-[9px] font-bold ${riskClass(normalizeRisk(featuredRiskIntelligence.zone.risk_level ?? featuredRiskIntelligence.zone.risk))}`}>{normalizeRisk(featuredRiskIntelligence.zone.risk_level ?? featuredRiskIntelligence.zone.risk)} BASELINE</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-800 p-3"><p className="text-[9px] uppercase tracking-wide text-slate-500">Baseline</p><p className="mt-1.5 text-lg font-bold text-white">{formatPercent(featuredRiskIntelligence.zone.probability)}</p><p className="mt-0.5 text-[9px] text-slate-500">{normalizeRisk(featuredRiskIntelligence.zone.risk_level ?? featuredRiskIntelligence.zone.risk)}</p></div>
                  <div className="rounded-lg border border-slate-800 p-3"><p className="text-[9px] uppercase tracking-wide text-slate-500">ML</p><p className="mt-1.5 text-lg font-bold text-white">{featuredRiskIntelligence.result ? formatPercent(featuredRiskIntelligence.result.signals?.ml?.probability ?? featuredRiskIntelligence.result.signals?.ml?.probability_percent) : "Unavailable"}</p><p className="mt-0.5 text-[9px] text-slate-500">{featuredRiskIntelligence.result?.signals?.ml?.risk_level ?? "No ML result"}</p></div>
                  <div className="rounded-lg border border-slate-800 p-3"><p className="text-[9px] uppercase tracking-wide text-slate-500">Fusion</p><p className="mt-1.5 text-lg font-bold text-white">{featuredRiskIntelligence.result ? formatPercent(featuredRiskIntelligence.result.final_probability ?? featuredRiskIntelligence.result.final_probability_percent) : "Unavailable"}</p><p className="mt-0.5 text-[9px] text-slate-500">{featuredRiskIntelligence.result?.final_risk_level ?? "No fusion result"}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#0b1a2a] px-3 py-2.5"><span className="text-[10px] text-slate-500">Operational assessment</span><span className="text-[10px] font-semibold text-slate-300">{featuredRiskIntelligence.result?.operational_assessment ?? "Unavailable"}</span></div>
              </div> : <div className="rounded-xl border border-slate-800 bg-[#081522] p-5 text-sm text-slate-500">Risk intelligence unavailable.</div>}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader eyebrow="Response Operations" title="Verified Field Response Queue" description="Authority can advance only verified reports through the response lifecycle." icon={<Users className="h-4 w-4" />} />
            <div className="p-4">
              <div className="grid grid-cols-4 gap-2">
                {([ ["Alert Generated", reports.filter((r) => normalizeResponseStatus(r.response_status) === "ALERT_GENERATED").filter((r) => String(r.status).toUpperCase() === "VERIFIED").length], ["Team Assigned", reports.filter((r) => normalizeResponseStatus(r.response_status) === "TEAM_ASSIGNED").filter((r) => String(r.status).toUpperCase() === "VERIFIED").length], ["In Progress", reports.filter((r) => normalizeResponseStatus(r.response_status) === "IN_PROGRESS").filter((r) => String(r.status).toUpperCase() === "VERIFIED").length], ["Resolved", reports.filter((r) => normalizeResponseStatus(r.response_status) === "RESOLVED").filter((r) => String(r.status).toUpperCase() === "VERIFIED").length] ] as Array<[string, number]>).map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-[#081522] p-3"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1.5 text-xl font-bold text-white">{value}</p></div>)}
              </div>
              <div className="mt-3 space-y-2">
                {responseQueue.length === 0 ? <div className="rounded-xl border border-slate-800 bg-[#081522] px-4 py-5"><p className="text-sm font-medium text-slate-400">No verified report currently requires response action.</p><p className="mt-1 text-xs text-slate-500">Unverified reports remain outside the operational response queue.</p></div> : responseQueue.map((report, index) => <div key={report.id ?? report.report_id ?? `queue-${index}`} className="rounded-xl border border-slate-800 bg-[#081522] p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-200">{report.report_code ?? report.title ?? "Verified field report"}</p><p className="mt-1 truncate text-xs text-slate-500">{report.hazard ?? "Field observation"} · {report.location ?? "Location unavailable"}</p></div><button type="button" onClick={() => openReportAction(report)} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400">Manage</button></div></div>)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader eyebrow="Active Alerts" title="Operational Warning Preview" description="Only alert records currently marked ACTIVE are shown." icon={<Siren className="h-4 w-4" />} action={<button type="button" onClick={() => openPage("/alerts")} className="text-xs font-semibold text-red-400 hover:text-red-300">Open alerts →</button>} />
            <div className="space-y-2 p-4">
              {activeAlerts.length === 0 ? <div className="rounded-xl border border-slate-800 bg-[#081522] p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="text-sm font-semibold text-slate-300">No active alert record</p><p className="mt-1 text-xs leading-5 text-slate-500">The backend currently has no ACTIVE alert. Continue monitoring verified intelligence and official communications.</p></div></div></div> : activeAlerts.slice(0, 4).map((alert, index) => <button type="button" key={alert.id ?? alert.alert_id ?? `alert-${index}`} onClick={() => openPage("/alerts")} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#081522] p-3 text-left hover:border-red-500/25"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{alert.title ?? "Active alert"}</p><p className="mt-1 truncate text-xs text-slate-500">{alert.location ?? "Location unavailable"}</p></div><span className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold ${riskClass(normalizeRisk(alert.severity))}`}>{String(alert.severity ?? "ACTIVE").toUpperCase()}</span></button>)}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader
              eyebrow="Weather Context"
              title="Rainfall & Soil Conditions"
              description="Latest model-derived rainfall context returned by the backend."
              icon={<CloudRain className="h-4 w-4" />}
            />
            <div className="p-4">
              {weatherContext ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      ["1h", weatherContext.rainfall_1h, "mm"],
                      ["24h", weatherContext.rainfall_24h, "mm"],
                      ["48h", weatherContext.rainfall_48h, "mm"],
                      ["72h", weatherContext.rainfall_72h, "mm"],
                      ["Antecedent", weatherContext.antecedent_rainfall, "mm"],
                      ["Soil moisture", weatherContext.soil_moisture, "%"],
                      ["Trigger", weatherContext.trigger_level, ""],
                    ] as Array<[string, unknown, string]>).map(([label, value, suffix]) => (
                      <div key={label} className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                        <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
                        <p className="mt-1.5 text-sm font-bold text-white">
                          {typeof value === "number" && Number.isFinite(value)
                            ? `${value}${suffix}`
                            : value
                              ? `${String(value)}${suffix}`
                              : "Unavailable"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-800 bg-[#081522] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Data provenance
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-200">
                          {weatherContext.source ?? "Unavailable"}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {weatherContext.data_type === "MODEL_DERIVED"
                            ? "Model-derived weather data · not a ground-station measurement"
                            : weatherContext.data_type
                              ? `Data type: ${weatherContext.data_type}`
                              : "Data type unavailable"}
                        </p>
                      </div>

                      <div className="sm:text-right">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Observed time
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-300">
                          {formatTime(weatherContext.observed_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-[#081522] p-5 text-sm text-slate-500">
                  Weather context unavailable.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader eyebrow="Infrastructure Exposure" title="Registry & Geometry" description="Known registry data is separated from spatial verification." icon={<Route className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2 p-4">{([["Assets", infrastructureSummary.total], ["Geometry available", infrastructureSummary.geometryAvailable], ["Spatially verified", infrastructureSummary.spatiallyVerified], ["Geometry pending", infrastructureSummary.pendingGeometry]] as Array<[string, number]>).map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-[#081522] p-3"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1.5 text-xl font-bold text-white">{loading ? "--" : value}</p></div>)}</div>
            <div className="px-4 pb-4"><button type="button" onClick={() => openPage("/infrastructure")} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#081522] px-3 py-2.5 text-xs font-semibold text-slate-300 hover:border-emerald-500/20 hover:text-emerald-400">Inspect infrastructure <ArrowRight className="h-4 w-4" /></button></div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
            <SectionHeader eyebrow="Road & Shelter" title="Response Readiness" description="No route or shelter location is estimated when verified geometry is unavailable." icon={<Navigation className="h-4 w-4" />} />
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#081522] px-3 py-3"><span className="text-xs text-slate-500">Routing engine</span><span className="text-xs font-semibold text-emerald-400">{routingStatus?.routing_engine ?? "Unavailable"}</span></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#081522] px-3 py-3"><span className="text-xs text-slate-500">Blocked roads</span><span className="text-xs font-semibold text-orange-400">{typeof routingStatus?.road_network?.blocked_roads === "number" ? routingStatus.road_network.blocked_roads : "Unavailable"}</span></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#081522] px-3 py-3"><span className="text-xs text-slate-500">Shelters registered</span><span className="text-xs font-semibold text-slate-300">{shelterRegistry.registered ?? "Unavailable"}</span></div>
              <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#081522] px-3 py-3"><span className="text-xs text-slate-500">Shelters mapped</span><span className="text-xs font-semibold text-emerald-400">{shelterRegistry.mapped ?? "Unavailable"}</span></div>
              <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/5 px-3 py-3"><p className="text-xs font-semibold text-yellow-300">{shelterRegistry.mapped === 0 ? "Shelter location pending verification" : "Shelter mapping status"}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">No shelter distance or marker is estimated without verified coordinates.</p></div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-[#0b1a2a] px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /><div><p className="text-sm font-semibold text-white">Operational data integrity</p><p className="mt-1 text-xs leading-5 text-slate-500">BhooPehra does not fabricate coordinates, alerts, shelter distances, infrastructure intersections or ML results. Missing information is shown as unavailable or pending verification.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => openPage("/analytics")} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white">Analytics <ExternalLink className="h-3.5 w-3.5" /></button><button type="button" onClick={() => openPage("/reports")} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white">Reports <ExternalLink className="h-3.5 w-3.5" /></button></div></div>
        </section>
      </div>

      {selectedReport && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#091827] shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-500">Authority Response Management</p>
                <h2 className="mt-1 text-base font-semibold text-white">Assign & Update Field Response</h2>
                <p className="mt-1 text-[9px] text-slate-600">Operational response is available only after evidence verification.</p>
              </div>
              <button type="button" onClick={() => setSelectedReport(null)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-800 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl border border-slate-800 bg-[#07131f] p-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 p-2 text-blue-400">
                    <Send className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-slate-300">{selectedReport.report_code ?? selectedReport.title ?? "Field report"}</p>
                    <p className="mt-1 text-[9px] text-slate-600">{selectedReport.hazard ?? selectedReport.description ?? "Field observation"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[7px] font-semibold text-emerald-400">Evidence: {String(selectedReport.status ?? "UNKNOWN").toUpperCase()}</span>
                      <span className={`rounded-md border px-2 py-1 text-[7px] font-semibold ${responseClass(normalizeResponseStatus(selectedReport.response_status))}`}>Response: {formatResponseStatus(selectedReport.response_status)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {String(selectedReport.status ?? "").toUpperCase() !== "VERIFIED" ? (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-3">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-yellow-400" />
                    <div>
                      <p className="text-[9px] font-semibold text-yellow-400">Verification required before response</p>
                      <p className="mt-1 text-[8px] leading-4 text-slate-600">This report is {String(selectedReport.status ?? "UNVERIFIED").toUpperCase()}. Operational response cannot start until Authority verifies the evidence.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="dashboard-team-name" className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">Response Team</label>
                    <input id="dashboard-team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Enter authorised team name" className="w-full rounded-xl border border-slate-800 bg-[#07131f] px-3 py-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-emerald-500/40" />
                  </div>

                  <div>
                    <label htmlFor="dashboard-response-notes" className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">Response Notes</label>
                    <textarea id="dashboard-response-notes" value={responseNotes} onChange={(event) => setResponseNotes(event.target.value)} rows={3} placeholder="Optional operational note" className="w-full resize-none rounded-xl border border-slate-800 bg-[#07131f] px-3 py-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-emerald-500/40" />
                  </div>

                  {actionError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[9px] text-red-400">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5" />
                      <span>{actionError}</span>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    {normalizeResponseStatus(selectedReport.response_status) === "NOT_STARTED" && (
                      <button type="button" disabled={updatingReport} onClick={() => void updateReportStatus(selectedReport, "ALERT_GENERATED")} className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5 text-[9px] font-semibold text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50">Generate Alert Status</button>
                    )}
                    {["NOT_STARTED", "ALERT_GENERATED"].includes(normalizeResponseStatus(selectedReport.response_status)) && (
                      <button type="button" disabled={updatingReport} onClick={() => void updateReportStatus(selectedReport, "TEAM_ASSIGNED")} className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2.5 text-[9px] font-semibold text-purple-400 hover:bg-purple-500/10 disabled:opacity-50">Assign Team</button>
                    )}
                    {normalizeResponseStatus(selectedReport.response_status) === "TEAM_ASSIGNED" && (
                      <button type="button" disabled={updatingReport} onClick={() => void updateReportStatus(selectedReport, "IN_PROGRESS")} className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-[9px] font-semibold text-blue-400 hover:bg-blue-500/10 disabled:opacity-50">Start Response</button>
                    )}
                    {normalizeResponseStatus(selectedReport.response_status) === "IN_PROGRESS" && (
                      <button type="button" disabled={updatingReport} onClick={() => void updateReportStatus(selectedReport, "RESOLVED")} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[9px] font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">Mark Resolved</button>
                    )}
                  </div>

                  {updatingReport && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-[#07131f] px-3 py-2.5 text-[9px] text-slate-500">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Updating response status...
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-800 px-5 py-3">
              <button type="button" onClick={() => setSelectedReport(null)} className="rounded-lg border border-slate-800 bg-[#07131f] px-3 py-2 text-[9px] font-medium text-slate-500 hover:text-slate-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
