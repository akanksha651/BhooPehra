const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

export type RiskLevel =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL"
  | "UNKNOWN"

export type PriorityLevel =
  | "P1"
  | "P2"
  | "P3"
  | "P4"
  | "UNKNOWN"

export type EvidenceStatus =
  | "PENDING SYNC"
  | "SUBMITTED"
  | "VERIFIED"
  | "REJECTED"

export type ResponseStatus =
  | "NOT_STARTED"
  | "ALERT_GENERATED"
  | "TEAM_ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"

export type AlertStatus =
  | "ACTIVE"
  | "ACKNOWLEDGED"
  | "RESOLVED"

export interface District {
  id: number
  name: string
  state: string
  code: string | null
}

export interface RiskZoneDistrict {
  id: number
  name: string
  state: string
  code: string | null
}

export interface RiskZoneGeometry {
  type: string
  coordinates: unknown
}

export interface RiskEngine {
  risk_level?: string | null
  probability?: number | null
  confidence?: string | null
  priority?: string | null
  [key: string]: unknown
}

export interface RiskFusion {
  status?: string | null
  probability?: number | null
  risk_level?: string | null
  confidence?: string | null
  priority?: string | null
  baseline_probability?: number | null
  ml_probability?: number | null
  [key: string]: unknown
}

export interface RiskZone {
  id: number
  name: string
  district_id: number
  district?: RiskZoneDistrict | null
  risk_level: string
  probability: number
  confidence: string
  rainfall_trigger: string | null
  priority: string
  affected_villages: number
  affected_roads: number
  geometry?: RiskZoneGeometry | null
  risk_engine?: RiskEngine | null
  risk_fusion?: RiskFusion | null
  created_at: string
  updated_at: string
}

export interface RiskZonesResponse {
  count: number
  filters: {
    district_id: number | null
    risk_level: string | null
    priority: string | null
  }
  zones: RiskZone[]
}

export interface InfrastructureGeometry {
  available: boolean
  spatially_verified?: boolean
  verification_status?: string
  geometry?: unknown
  [key: string]: unknown
}

export interface InfrastructureAsset {
  id: number
  asset_code: string
  name: string
  asset_type: string
  district_id: number
  risk_zone_id: number | null
  risk_level: string
  probability: number | null
  priority: string
  exposure_count: number
  status: string
  recommendation: string | null
  geometry?: InfrastructureGeometry | null
  capacity?: number | null
  population_exposure?: number | null
  operational_exposure?: number | null
  spatially_verified?: boolean | null
  verification_status?: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface InfrastructureSummary {
  total_assets?: number
  critical?: number
  high?: number
  moderate?: number
  geometry_available?: number
  spatially_verified?: number
  pending_geometry?: number
  [key: string]: unknown
}

export interface InfrastructureAssetsResponse {
  status: string
  count: number
  summary: InfrastructureSummary
  data: InfrastructureAsset[]
}

export interface RainfallObservation {
  id: number
  district_id: number
  observed_at: string
  rainfall_1h: number
  rainfall_24h: number
  rainfall_48h: number
  rainfall_72h: number
  antecedent_rainfall: number
  soil_moisture: number | null
  trigger_level: string
  source: string
  data_type: string
  created_at: string
}

export interface LocationWeather {
  success: boolean
  location: {
    latitude: number
    longitude: number
  }
  source: string
  data_type: string
  observed_at: string | null
  current: {
    precipitation_1h_mm: number | null
    rain_1h_mm: number | null
    soil_moisture_percent: number | null
  }
  rainfall: {
    "1h_mm": number | null
    "24h_mm": number | null
    "48h_mm": number | null
    "72h_mm": number | null
  }
  provenance: {
    provider: string
    data_type: string
    ground_station_measurement: boolean
  }
}

export interface FieldReport {
  id: number
  report_code: string
  title: string
  reporter: string | null
  hazard: string | null
  severity: string
  status: EvidenceStatus | string
  response_status: ResponseStatus | string
  response_status_label?: string | null
  assigned_team: string | null
  created_at: string
  updated_at: string
  response_notes: string | null
  district_id: number | null
  district_name: string | null
  risk_zone_id: number | null
  location: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
  road_impact: string | null
  village_impact: string | null
  photo_count: number
  verification_notes: string | null
  submitted_at: string | null
  verified_at: string | null
}

export interface FieldReportsResponse {
  count: number
  data: FieldReport[]
}

export interface AlertItem {
  id: number
  alert_key: string
  asset_id: number | null
  risk_zone_id: number | null
  asset_code: string | null
  asset_name: string | null
  alert_type: string
  severity: string
  title: string
  message: string
  risk_level: string | null
  probability: number | null
  probability_percent: number | null
  rainfall_trigger: string | null
  confidence: string | null
  source: string | null
  priority: string | null
  recommended_action: string | null
  status: AlertStatus | string
  created_at: string
  updated_at: string
}

export interface AlertsResponse {
  count: number
  data: AlertItem[]
}

export interface RoutingStatus {
  [key: string]: unknown
}

export interface DistrictBoundary {
  [key: string]: unknown
}

export interface ShelterRiskZone {
  id: number | null
  name: string | null
  risk_level: string | null
  probability: number | null
}

export interface ShelterItem {
  id: number
  shelter_code: string
  name: string
  asset_type: "SHELTER"
  district_id: number | null
  district_name: string | null
  state: string | null
  capacity: number | null
  operational_status: string | null
  verification_status: string
  latitude: number
  longitude: number
  straight_line_distance_km: number
  route_distance_km: number | null
  route_status: string
  risk_zone: ShelterRiskZone
  safety_status: string
  safety_basis: string
  source: string
}

export interface ShelterRegistry {
  registered_shelters: number
  mapped_shelters: number
  location_pending: number
}

export interface SheltersResponse {
  status: string
  result_status: string
  query: {
    latitude: number
    longitude: number
  }
  shelter_registry: ShelterRegistry
  data_source: {
    table: string
    filter: string
    geometry_required_for_nearest: boolean
  }
  routing_note: string
  safety_note: string
  shelters: ShelterItem[]
}

export interface DashboardSummary {
  districts: {
    total: number
  }
  risk: {
    total_zones: number
    critical: number
    high: number
  }
  infrastructure: {
    total_assets: number
    at_risk: number
    priority_p1: number
  }
  latest_rainfall: {
    district_id: number
    observed_at: string
    rainfall_1h: number
    rainfall_24h: number
    rainfall_48h: number
    rainfall_72h: number
    antecedent_rainfall: number
    soil_moisture: number | null
    trigger_level: string
    source: string
  } | null
}

export interface FusionResult {
  zone: RiskZone | null
  risk_fusion: RiskFusion | null
}

export interface ResponseUpdate {
  response_status: ResponseStatus
  assigned_team?: string | null
  response_notes?: string | null
}

export interface RoadBlockageStatus {
  [key: string]: unknown
}

export interface MLHealth {
  [key: string]: unknown
}

export interface MLPrediction {
  [key: string]: unknown
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = ""

    try {
      const errorBody = await response.json()
      if (typeof errorBody?.detail === "string") {
        detail = ` - ${errorBody.detail}`
      }
    } catch {
      // Keep the HTTP status error when the response is not JSON.
    }

    throw new Error(
      `API request failed: ${response.status} ${response.statusText}${detail}`,
    )
  }

  return response.json() as Promise<T>
}

/* -------------------------------------------------------------------------- */
/* Risk                       */
/* -------------------------------------------------------------------------- */

export async function getRiskZones(params?: {
  district_id?: number
  risk_level?: string
  priority?: string
}): Promise<RiskZone[]> {
  const searchParams = new URLSearchParams()

  if (params?.district_id !== undefined) {
    searchParams.set("district_id", String(params.district_id))
  }

  if (params?.risk_level) {
    searchParams.set("risk_level", params.risk_level)
  }

  if (params?.priority) {
    searchParams.set("priority", params.priority)
  }

  const query = searchParams.toString()

  const response = await request<RiskZonesResponse>(
    `/api/risk/zones${query ? `?${query}` : ""}`,
  )

  return response.zones ?? []
}

export function getRiskZonesResponse(params?: {
  district_id?: number
  risk_level?: string
  priority?: string
}): Promise<RiskZonesResponse> {
  const searchParams = new URLSearchParams()

  if (params?.district_id !== undefined) {
    searchParams.set("district_id", String(params.district_id))
  }

  if (params?.risk_level) {
    searchParams.set("risk_level", params.risk_level)
  }

  if (params?.priority) {
    searchParams.set("priority", params.priority)
  }

  const query = searchParams.toString()

  return request<RiskZonesResponse>(
    `/api/risk/zones${query ? `?${query}` : ""}`,
  )
}

export function getRiskZone(zoneId: number): Promise<RiskZone> {
  return request<RiskZone>(`/api/risk/zones/${zoneId}`)
}

export function getRiskMLHealth(): Promise<MLHealth> {
  return request<MLHealth>("/api/risk/ml/health")
}

export function getRiskMLZone(zoneId: number): Promise<MLPrediction> {
  return request<MLPrediction>(`/api/risk/ml/zone/${zoneId}`)
}

export function getRiskFusionZone(
  zoneId: number,
): Promise<FusionResult> {
  return request<FusionResult>(
    `/api/risk/fusion/zone/${zoneId}`,
  )
}

export function recalculateRisk(): Promise<unknown> {
  return request<unknown>("/api/risk/recalculate", {
    method: "POST",
  })
}

/* -------------------------------------------------------------------------- */
/* Infrastructure                       */
/* -------------------------------------------------------------------------- */

export async function getInfrastructureAssets(): Promise<
  InfrastructureAsset[]
> {
  const response = await request<InfrastructureAssetsResponse>(
    "/api/infrastructure/assets",
  )

  return response.data ?? []
}

export function getInfrastructureAssetsResponse(): Promise<
  InfrastructureAssetsResponse
> {
  return request<InfrastructureAssetsResponse>(
    "/api/infrastructure/assets",
  )
}

export function getInfrastructureExposure(): Promise<unknown> {
  return request<unknown>("/api/infrastructure/exposure")
}

export function recalculateInfrastructure(): Promise<unknown> {
  return request<unknown>("/api/infrastructure/recalculate", {
    method: "POST",
  })
}

export function syncRoadBlockages(): Promise<unknown> {
  return request<unknown>(
    "/api/infrastructure/road-blockage/sync",
    {
      method: "POST",
    },
  )
}

export function getRoadBlockageStatus(): Promise<RoadBlockageStatus> {
  return request<RoadBlockageStatus>(
    "/api/infrastructure/road-blockage/status",
  )
}

/* -------------------------------------------------------------------------- */
/* Weather                       */
/* -------------------------------------------------------------------------- */

export function getRainfallObservations(): Promise<
  RainfallObservation[]
> {
  return request<RainfallObservation[]>(
    "/api/weather/rainfall",
  )
}

export function getLocationWeather(
  latitude: number,
  longitude: number,
): Promise<LocationWeather> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  })

  return request<LocationWeather>(
    `/api/weather/location?${params.toString()}`,
  )
}

/* -------------------------------------------------------------------------- */
/* Districts                       */
/* -------------------------------------------------------------------------- */

export function getDistricts(): Promise<District[]> {
  return request<District[]>("/api/districts")
}

export function getDistrictBoundaries(): Promise<
  DistrictBoundary[]
> {
  return request<DistrictBoundary[]>(
    "/api/districts/boundaries",
  )
}

/* -------------------------------------------------------------------------- */
/* Dashboard                       */
/* -------------------------------------------------------------------------- */

export function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>(
    "/api/dashboard/summary",
  )
}

/* -------------------------------------------------------------------------- */
/* Field reports                       */
/* -------------------------------------------------------------------------- */

export async function getFieldReports(params?: {
  severity?: string
  status?: string
  response_status?: string
  search?: string
  district_id?: number
}): Promise<FieldReport[]> {
  const searchParams = new URLSearchParams()

  if (params?.severity) {
    searchParams.set("severity", params.severity)
  }

  if (params?.status) {
    searchParams.set("status", params.status)
  }

  if (params?.response_status) {
    searchParams.set(
      "response_status",
      params.response_status,
    )
  }

  if (params?.search) {
    searchParams.set("search", params.search)
  }

  if (params?.district_id !== undefined) {
    searchParams.set("district_id", String(params.district_id))
  }

  const query = searchParams.toString()

  const response = await request<FieldReportsResponse>(
    `/api/field-reports${query ? `?${query}` : ""}`,
  )

  return response.data ?? []
}

export function getFieldReportsResponse(params?: {
  severity?: string
  status?: string
  response_status?: string
  search?: string
  district_id?: number
}): Promise<FieldReportsResponse> {
  const searchParams = new URLSearchParams()

  if (params?.severity) {
    searchParams.set("severity", params.severity)
  }

  if (params?.status) {
    searchParams.set("status", params.status)
  }

  if (params?.response_status) {
    searchParams.set(
      "response_status",
      params.response_status,
    )
  }

  if (params?.search) {
    searchParams.set("search", params.search)
  }

  if (params?.district_id !== undefined) {
    searchParams.set("district_id", String(params.district_id))
  }

  const query = searchParams.toString()

  return request<FieldReportsResponse>(
    `/api/field-reports${query ? `?${query}` : ""}`,
  )
}

export function updateFieldReportStatus(
  reportId: number,
  payload: {
    status: EvidenceStatus
    verification_notes?: string | null
  },
): Promise<unknown> {
  return request<unknown>(
    `/api/field-reports/${reportId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  )
}

export function updateFieldReportResponse(
  reportId: number,
  payload: ResponseUpdate,
): Promise<unknown> {
  return request<unknown>(
    `/api/field-reports/${reportId}/response`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  )
}

/* -------------------------------------------------------------------------- */
/* Alerts                       */
/* -------------------------------------------------------------------------- */

export async function getAlerts(params?: {
  status?: string
  severity?: string
}): Promise<AlertItem[]> {
  const searchParams = new URLSearchParams()

  if (params?.status) {
    searchParams.set("status", params.status)
  }

  if (params?.severity) {
    searchParams.set("severity", params.severity)
  }

  const query = searchParams.toString()

  const response = await request<AlertsResponse>(
    `/api/alerts${query ? `?${query}` : ""}`,
  )

  return response.data ?? []
}

export function getAlertsResponse(params?: {
  status?: string
  severity?: string
}): Promise<AlertsResponse> {
  const searchParams = new URLSearchParams()

  if (params?.status) {
    searchParams.set("status", params.status)
  }

  if (params?.severity) {
    searchParams.set("severity", params.severity)
  }

  const query = searchParams.toString()

  return request<AlertsResponse>(
    `/api/alerts${query ? `?${query}` : ""}`,
  )
}

export function getAlert(
  alertId: number,
): Promise<{ data: AlertItem }> {
  return request<{ data: AlertItem }>(
    `/api/alerts/${alertId}`,
  )
}

export function updateAlertStatus(
  alertId: number,
  status: AlertStatus,
): Promise<unknown> {
  return request<unknown>(
    `/api/alerts/${alertId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    },
  )
}

export function generateAlerts(): Promise<unknown> {
  return request<unknown>("/api/alerts/generate", {
    method: "POST",
  })
}

/* -------------------------------------------------------------------------- */
/* Shelters                       */
/* -------------------------------------------------------------------------- */

export function getNearestShelters(
  latitude: number,
  longitude: number,
  limit = 5,
): Promise<SheltersResponse> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    limit: String(limit),
  })

  return request<SheltersResponse>(
    `/api/shelters/nearest?${params.toString()}`,
  )
}

/* -------------------------------------------------------------------------- */
/* Routing                       */
/* -------------------------------------------------------------------------- */

export function getRoutingStatus(): Promise<RoutingStatus> {
  return request<RoutingStatus>("/api/routing/status")
}

export function getRoute(params: {
  source_vertex: number
  target_vertex: number
}): Promise<unknown> {
  const searchParams = new URLSearchParams({
    source_vertex: String(params.source_vertex),
    target_vertex: String(params.target_vertex),
  })

  return request<unknown>(
    `/api/routing/route?${searchParams.toString()}`,
  )
}

export function syncRoutingBlockages(): Promise<unknown> {
  return request<unknown>(
    "/api/routing/sync-blockages",
    {
      method: "POST",
    },
  )
}

/* -------------------------------------------------------------------------- */
/* Generic export                       */
/* -------------------------------------------------------------------------- */

export { API_BASE_URL }
