import {
  AlertCircle,
  CheckCircle2,
  Crosshair,
  Home,
  Info,
  Navigation,
  Plus,
  RefreshCw,
  Route,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { latLngBounds } from "leaflet"
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useRole } from "../context/RoleContext"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

const NER_CENTER: [number, number] = [25.8, 94.1]
type Shelter = {
  id?: number
  asset_code?: string | null
  name?: string | null
  capacity?: number | null
  distance_km?: number | null
  distance_m?: number | null
  latitude?: number | null
  longitude?: number | null
  risk_level?: string | null
  safety_status?: string | null
  risk_zone_id?: number | null
  geometry_available?: boolean
  location_verification?: string | null
}

type RegistryResponse = {
  status?: string
  result_status?: string
  shelter_registry?: {
    registered_shelters?: number
    mapped_shelters?: number
    location_pending?: number
  }
  shelters?: Shelter[]
}

type GeoJSONGeometry = {
  type?: string
  coordinates?: unknown
}

type RouteGeometry = {
  type?: string
  properties?: Record<string, unknown>
  geometry?: GeoJSONGeometry | null
}

type RouteShelter = Shelter & {
  shelter_id?: number
  shelter_name?: string | null
  distance_km?: number
  distance_m?: number
  edge_count?: number
  shelter_snap_distance_m?: number
  geometry?: RouteGeometry | GeoJSONGeometry | null
}

type RouteResponse = {
  status?: string
  reason?: string
  message?: string
  routing_engine?: string
  blocked_edges_excluded?: boolean
  selection_basis?: string[]
  start?: {
    latitude?: number
    longitude?: number
    routing_vertex?: number
    snap_distance_m?: number
  }
  recommended_shelter?: RouteShelter
  alternatives?: RouteShelter[]
  evaluated_candidates?: RouteShelter[]
  eta_minutes?: number | null
  eta_status?: string
  shelter_registry?: {
    registered_shelters?: number
    mapped_shelters?: number
    location_pending?: number
    mapped_risk_pending?: number
  }
}

type UserLocation = {
  latitude: number
  longitude: number
}

type NewShelterForm = {
  name: string
  capacity: string
  districtId: string
  assetCode: string
  latitude: string
  longitude: string
}

function getName(shelter: Shelter) {
  return shelter.name ?? shelter.asset_code ?? "Registered shelter"
}

function safetyTone(status?: string | null) {
  const value = String(status ?? "").toUpperCase()
  if (value.includes("NOT_RECOMMENDED")) return "text-red-300"
  if (value.includes("CAUTION")) return "text-amber-300"
  if (value.includes("LOW_RISK") || value.includes("SAFE")) return "text-emerald-300"
  return "text-slate-300"
}

function routeCoordinateSets(value: unknown): [number, number][][] {
  if (!value || typeof value !== "object") return []

  const root = value as { type?: string; coordinates?: unknown; geometry?: unknown }
  const geometry = root.type === "Feature" ? root.geometry : value

  if (!geometry || typeof geometry !== "object") return []

  const geometryObject = geometry as {
    type?: string
    coordinates?: unknown
  }

  if (!Array.isArray(geometryObject.coordinates)) return []

  if (geometryObject.type === "LineString") {
    const line = geometryObject.coordinates
      .filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === "number" &&
          typeof point[1] === "number",
      )
      .map(([longitude, latitude]) => [latitude, longitude] as [number, number])

    return line.length > 1 ? [line] : []
  }

  if (geometryObject.type === "MultiLineString") {
    return geometryObject.coordinates
      .filter(Array.isArray)
      .map((line) =>
        line
          .filter(
            (point): point is [number, number] =>
              Array.isArray(point) &&
              point.length >= 2 &&
              typeof point[0] === "number" &&
              typeof point[1] === "number",
          )
          .map(([longitude, latitude]) => [latitude, longitude] as [number, number]),
      )
      .filter((line) => line.length > 1)
  }

  return []
}

function routeCoordinateSetsFromShelter(shelter?: RouteShelter | null) {
  return shelter?.geometry ? routeCoordinateSets(shelter.geometry) : []
}


function MapViewport({
  location,
  shelter,
  routeSets,
}: {
  location: UserLocation | null
  shelter: Shelter | null | undefined
  routeSets: [number, number][][]
}) {
  const map = useMap()

  useEffect(() => {
    const points: [number, number][] = []

    if (location) {
      points.push([location.latitude, location.longitude])
    }

    if (shelter?.latitude != null && shelter.longitude != null) {
      points.push([shelter.latitude, shelter.longitude])
    }

    for (const line of routeSets) {
      points.push(...line)
    }

    if (points.length < 2) {
      if (points.length === 1) {
        map.setView(points[0], Math.max(map.getZoom(), 13), { animate: true })
      }
      return
    }

    const bounds = latLngBounds(points)

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 15,
        animate: true,
      })
    }
  }, [location, shelter, routeSets, map])

  return null
}

function MapLocationPicker({
  value,
  onChange,
}: {
  value: [number, number] | null
  onChange: (point: [number, number]) => void
}) {
  useMapEvents({
    click(event) {
      onChange([event.latlng.lat, event.latlng.lng])
    },
  })

  if (!value) return null

  return (
    <CircleMarker
      center={value}
      radius={8}
      pathOptions={{ color: "#34d399", fillColor: "#34d399", fillOpacity: 0.9 }}
    >
      <Tooltip permanent direction="top" offset={[0, -8]}>
        Selected shelter location
      </Tooltip>
    </CircleMarker>
  )
}

export default function ShelterPage() {
  const { role } = useRole()
  const isAuthority = role === "AUTHORITY"
  const isFieldTeam = role === "FIELD_TEAM"

  const [location, setLocation] = useState<UserLocation | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState("")

  const [shelters, setShelters] = useState<Shelter[]>([])
  const [registered, setRegistered] = useState(0)
  const [mapped, setMapped] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState("")
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null)
  const [routeUpdatedAt, setRouteUpdatedAt] = useState<Date | null>(null)

  const [pickerPoint, setPickerPoint] = useState<[number, number] | null>(null)
  const [selectedShelterId, setSelectedShelterId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [savingShelter, setSavingShelter] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [saveError, setSaveError] = useState("")
  const [form, setForm] = useState<NewShelterForm>({
    name: "",
    capacity: "",
    districtId: "",
    assetCode: "",
    latitude: "",
    longitude: "",
  })

  const registryPoint = useMemo<[number, number]>(() => {
    if (pickerPoint) return pickerPoint
    if (location) return [location.latitude, location.longitude]
    return NER_CENTER
  }, [location, pickerPoint])

  const loadRegistry = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const response = await fetch(`${API_BASE_URL}/api/shelters/registry`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error(`Shelter registry returned HTTP ${response.status}`)
      const payload = (await response.json()) as RegistryResponse
      setShelters(Array.isArray(payload.shelters) ? payload.shelters : [])
      setRegistered(payload.shelter_registry?.registered_shelters ?? 0)
      setMapped(payload.shelter_registry?.mapped_shelters ?? 0)
      setPending(payload.shelter_registry?.location_pending ?? 0)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load shelter registry.")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadNearby = useCallback(async (currentLocation: UserLocation) => {
    try {
      setLoading(true)
      setError("")
      const response = await fetch(
        `${API_BASE_URL}/api/shelters/nearest?latitude=${encodeURIComponent(currentLocation.latitude)}&longitude=${encodeURIComponent(currentLocation.longitude)}&limit=10`,
        { cache: "no-store" },
      )
      if (!response.ok) throw new Error(`Shelter search returned HTTP ${response.status}`)
      const payload = (await response.json()) as RegistryResponse
      setShelters(Array.isArray(payload.shelters) ? payload.shelters : [])
      setRegistered(payload.shelter_registry?.registered_shelters ?? 0)
      setMapped(payload.shelter_registry?.mapped_shelters ?? 0)
      setPending(payload.shelter_registry?.location_pending ?? 0)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to find nearby shelters.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  const getCurrentLocation = useCallback((): Promise<UserLocation> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const message = "Location services are not supported by this browser."
        setLocationError(message)
        reject(new Error(message))
        return
      }

      setLocationLoading(true)
      setLocationError("")

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }
          setLocation(next)
          setLocationLoading(false)
          void loadNearby(next)
          resolve(next)
        },
        (geolocationError) => {
          setLocationLoading(false)
          const message =
            geolocationError.code === geolocationError.PERMISSION_DENIED
              ? "Location permission was denied. Allow location access and try again."
              : "Unable to determine your current location."
          setLocationError(message)
          reject(new Error(message))
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    })
  }, [loadNearby])

  const useCurrentLocation = useCallback(() => {
    void getCurrentLocation().catch(() => undefined)
  }, [getCurrentLocation])


  function selectShelterForMapping(shelterId: number) {
    setSelectedShelterId(shelterId)
    setPickerPoint(null)
    setSaveError("")
    setSaveMessage("")
  }

  function selectPoint(point: [number, number]) {
    if (!selectedShelterId) {
      setSaveError("Select a specific shelter for mapping before choosing a point on the map.")
      return
    }

    setPickerPoint(point)
    setForm((current) => ({
      ...current,
      latitude: String(point[0]),
      longitude: String(point[1]),
    }))
    setSaveError("")
    setSaveMessage("")
  }

  function cancelShelterMapping() {
    setSelectedShelterId(null)
    setPickerPoint(null)
    setSaveError("")
    setSaveMessage("")
  }

  function clearForm() {
    setForm({
      name: "",
      capacity: "",
      districtId: "",
      assetCode: "",
      latitude: "",
      longitude: "",
    })
    setPickerPoint(null)
    setSelectedShelterId(null)
    setSaveError("")
    setSaveMessage("")
  }

  async function addShelter() {
    if (!form.name.trim()) {
      setSaveError("Shelter name is required.")
      return
    }

    const latitude = form.latitude.trim() ? Number(form.latitude) : null
    const longitude = form.longitude.trim() ? Number(form.longitude) : null

    if ((latitude === null) !== (longitude === null)) {
      setSaveError("Latitude and longitude must be supplied together.")
      return
    }

    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setSaveError("Latitude must be between -90 and 90.")
      return
    }

    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setSaveError("Longitude must be between -180 and 180.")
      return
    }

    try {
      setSavingShelter(true)
      setSaveError("")
      setSaveMessage("")

      const response = await fetch(`${API_BASE_URL}/api/shelters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Role": "AUTHORITY",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          capacity: form.capacity.trim() ? Number(form.capacity) : null,
          district_id: form.districtId.trim() ? Number(form.districtId) : null,
          asset_code: form.assetCode.trim() || null,
          latitude,
          longitude,
        }),
      })

      const payload = (await response.json()) as { message?: string; detail?: string }
      if (!response.ok) {
        throw new Error(payload.detail ?? `Shelter creation returned HTTP ${response.status}`)
      }

      setSaveMessage(payload.message ?? "Shelter added successfully.")
      clearForm()
      setShowAdd(false)
      await loadRegistry()
    } catch (requestError) {
      setSaveError(requestError instanceof Error ? requestError.message : "Unable to add shelter.")
    } finally {
      setSavingShelter(false)
    }
  }

  const calculateSafestRoute = useCallback(async (currentLocation: UserLocation) => {
    setRouteLoading(true)
    setRouteError("")

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/routing/safest-shelter?start_latitude=${encodeURIComponent(currentLocation.latitude)}&start_longitude=${encodeURIComponent(currentLocation.longitude)}&limit=10`,
        { cache: "no-store" },
      )

      let payload: RouteResponse = {}
      try {
        payload = (await response.json()) as RouteResponse
      } catch {
        throw new Error(`Routing returned HTTP ${response.status} with an invalid response.`)
      }

      if (!response.ok) {
        throw new Error(payload.message ?? `Routing returned HTTP ${response.status}`)
      }

      setRouteResult(payload)
      setRouteUpdatedAt(new Date())

      if (payload.status !== "route_found") {
        setRouteError(payload.message ?? "No safe reachable shelter route is currently available.")
      }
    } catch (requestError) {
      setRouteResult(null)
      setRouteError(
        requestError instanceof Error
          ? requestError.message
          : "Safest route calculation failed.",
      )
    } finally {
      setRouteLoading(false)
    }
  }, [])

  async function findSafestRoute() {
    try {
      const currentLocation = location ?? (await getCurrentLocation())
      await calculateSafestRoute(currentLocation)
    } catch (requestError) {
      if (requestError instanceof Error) {
        setRouteError(requestError.message)
      }
    }
  }

  useEffect(() => {
    if (!location || !routeResult?.recommended_shelter) return

    const interval = window.setInterval(() => {
      void calculateSafestRoute(location)
    }, 30000)

    return () => window.clearInterval(interval)
  }, [calculateSafestRoute, location, routeResult?.recommended_shelter?.shelter_id])


  const routeSets = useMemo(
    () => routeCoordinateSetsFromShelter(routeResult?.recommended_shelter),
    [routeResult],
  )

  return (
    <div className="min-h-screen bg-[#06111c] px-6 pb-10 pt-6 text-white">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-[#081522] p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Home size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {isAuthority
                      ? "SHELTER OPERATIONS"
                      : isFieldTeam
                        ? "FIELD SHELTER OPERATIONS"
                        : "COMMUNITY SAFETY"}
                  </p>
                  <h1 className="text-2xl font-bold">Safe Shelter</h1>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-400">
                {isAuthority
                  ? "Manage the live shelter registry and verify shelter coordinates. Verified locations become eligible for safety and road-routing decisions."
                  : isFieldTeam
                    ? "Use your real field position to find verified shelters and calculate a safe road route that avoids blocked road edges."
                    : "Find a verified shelter near you and calculate a road route that avoids blocked roads when a safe mapped shelter is available."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locationLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-60"
              >
                {locationLoading ? <RefreshCw size={17} className="animate-spin" /> : <Crosshair size={17} />}
                {locationLoading ? "Getting Location..." : "Use Current Location"}
              </button>
              {isAuthority && (
                <button
                  type="button"
                  onClick={() => {
                    clearForm()
                    setShowAdd(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#03120d] hover:bg-emerald-400"
                >
                  <Plus size={17} />
                  Add Shelter
                </button>
              )}
            </div>
          </div>
        </section>

              {!isAuthority && (
          <section className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <Navigation size={18} className="text-emerald-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">EVACUATION ROUTE</p>
                    <h2 className="mt-1 text-lg font-bold">Find safest reachable shelter</h2>
                  </div>
                </div>
                <p className="text-sm leading-6 text-slate-400">
                  The routing engine uses only Authority-verified shelter geometry, current shelter risk state, real road-network edges and verified blocked-road evidence. It does not estimate a shelter location or draw a route when the backend cannot verify one.
                </p>

                <button
                  type="button"
                  onClick={findSafestRoute}
                  disabled={routeLoading || locationLoading}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-[#03120d] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {routeLoading ? <RefreshCw size={17} className="animate-spin" /> : <Route size={17} />}
                  {routeLoading ? "Calculating Route..." : location ? "Find Safest Route" : "Get Location & Find Route"}
                </button>

                {!location && (
                  <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-300">
                    Your real browser GPS is used as the route start. If location has not been acquired yet, Find Safest Route will request it automatically. No start coordinate is generated by the app.
                  </div>
                )}

                {location && (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-[#0a1928] p-3 text-xs">
                    <span className="text-slate-500">Route start</span>
                    <p className="mt-1 font-mono text-slate-300">
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </p>
                  </div>
                )}

                {locationError && (
                  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-300">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{locationError}</span>
                    </div>
                  </div>
                )}

                {routeError && (
                  <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-300">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{routeError}</span>
                    </div>
                  </div>
                )}

                {routeResult?.recommended_shelter && (
                  <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-400">RECOMMENDED SHELTER</p>
                    <p className="mt-2 font-bold text-white">{getName(routeResult.recommended_shelter)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {routeResult.recommended_shelter.safety_status ?? "Safety status unavailable"}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-black/10 p-2">
                        <span className="text-slate-500">Route distance</span>
                        <p className="mt-1 font-semibold text-slate-200">
                          {routeResult.recommended_shelter.distance_km != null
                            ? `${routeResult.recommended_shelter.distance_km.toFixed(2)} km`
                            : "Unavailable"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-black/10 p-2">
                        <span className="text-slate-500">Capacity</span>
                        <p className="mt-1 font-semibold text-slate-200">
                          {routeResult.recommended_shelter.capacity ?? "Unavailable"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-black/10 p-2">
                        <span className="text-slate-500">Road segments</span>
                        <p className="mt-1 font-semibold text-slate-200">{routeResult.recommended_shelter.edge_count ?? "Unavailable"}</p>
                      </div>
                      <div className="rounded-lg bg-black/10 p-2">
                        <span className="text-slate-500">Risk</span>
                        <p className="mt-1 font-semibold text-slate-200">{routeResult.recommended_shelter.risk_level ?? "Unavailable"}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-slate-500">
                      {routeResult.blocked_edges_excluded ? "Blocked road edges are excluded from this route." : "Blocked-road exclusion status unavailable."} ETA is shown only when verified route-speed data exists.
                    </p>
                    {routeUpdatedAt && (
                      <p className="mt-2 text-[10px] text-slate-600">
                        Route checked {routeUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}. Automatically rechecked every 30 seconds while active.
                      </p>
                    )}
                  </div>
                )}

                {routeResult?.alternatives && routeResult.alternatives.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">ALTERNATIVE SAFE SHELTERS</p>
                      <span className="text-[10px] text-slate-600">Ranked by current safety then road distance</span>
                    </div>
                    <div className="space-y-2">
                      {routeResult.alternatives.slice(0, 3).map((alternative) => (
                        <div key={alternative.shelter_id ?? alternative.asset_code} className="rounded-xl border border-slate-800 bg-[#0a1928] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200">{getName(alternative)}</p>
                              <p className="mt-1 text-[10px] text-slate-500">{alternative.risk_level ?? "Risk unavailable"} · Capacity {alternative.capacity ?? "Unavailable"}</p>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {alternative.distance_km != null ? `${alternative.distance_km.toFixed(2)} km` : "Distance unavailable"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#081522]">
                <div className="border-b border-slate-800 px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-500">SHELTER MAP</p>
                  <h2 className="mt-1 text-lg font-bold">Verified shelters & route</h2>
                </div>
                <MapContainer center={registryPoint} zoom={6} className="w-full" style={{ height: "500px", minHeight: "500px", width: "100%", background: "#dbe7d2" }} scrollWheelZoom zoomControl>
                  <MapViewport location={location} shelter={routeResult?.recommended_shelter} routeSets={routeSets} />
                  <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {location && (
                    <CircleMarker
                      center={[location.latitude, location.longitude]}
                      radius={7}
                      pathOptions={{ color: "#60a5fa", fillColor: "#60a5fa", fillOpacity: 0.9 }}
                    >
                      <Tooltip permanent direction="top">Your current location</Tooltip>
                    </CircleMarker>
                  )}
                  {shelters
                    .filter((s) => s.latitude != null && s.longitude != null && s.geometry_available !== false)
                    .map((shelter) => (
                      <CircleMarker
                        key={shelter.id ?? shelter.asset_code}
                        center={[shelter.latitude as number, shelter.longitude as number]}
                        radius={7}
                        pathOptions={{ color: "#34d399", fillColor: "#10b981", fillOpacity: 0.9 }}
                      >
                        <Tooltip>
                          {getName(shelter)} · Capacity {shelter.capacity ?? "Unavailable"}
                        </Tooltip>
                      </CircleMarker>
                    ))}
                  <MapLocationPicker value={pickerPoint} onChange={selectPoint} />
                  {routeSets.map((line, index) => (
                    <Polyline
                      key={`route-${index}`}
                      positions={line}
                      pathOptions={{ color: "#34d399", weight: 6, opacity: 0.9 }}
                    />
                  ))}
                </MapContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-500">VERIFIED SHELTERS</p>
                  <h2 className="mt-1 text-lg font-bold">Available shelter records</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-700 bg-[#0a1928] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {mapped} mapped
                  </span>
                  {pending > 0 && (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      {pending} pending
                    </span>
                  )}
                </div>
              </div>

              {shelters.filter((shelter) => shelter.latitude != null && shelter.longitude != null).length === 0 ? (
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-slate-400">
                  No shelter with verified coordinates is available in the current response. The system will not display a fabricated shelter marker, distance or route.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {shelters
                    .filter((shelter) => shelter.latitude != null && shelter.longitude != null)
                    .map((shelter) => (
                      <div key={shelter.id ?? shelter.asset_code} className="rounded-xl border border-slate-800 bg-[#0a1928] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-200">{getName(shelter)}</p>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {shelter.asset_code ?? "Registered shelter"} · Capacity {shelter.capacity ?? "Unavailable"}
                            </p>
                          </div>
                          <CheckCircle2 size={17} className="shrink-0 text-emerald-400" />
                        </div>
                        <p className={`mt-3 text-[10px] ${safetyTone(shelter.safety_status)}`}>
                          {shelter.safety_status ?? "Safety status unavailable"}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                          <div className="rounded-lg bg-black/10 p-2">
                            <span className="text-slate-500">Distance</span>
                            <p className="mt-1 text-slate-300">
                              {shelter.distance_km != null ? `${shelter.distance_km.toFixed(2)} km` : "Unavailable"}
                            </p>
                          </div>
                          <div className="rounded-lg bg-black/10 p-2">
                            <span className="text-slate-500">Risk</span>
                            <p className="mt-1 text-slate-300">{shelter.risk_level ?? "Unavailable"}</p>
                          </div>
                        </div>
                        {isAuthority && shelter.id != null && (
                          <button
                            type="button"
                            onClick={() => selectShelterForMapping(shelter.id as number)}
                            className="mt-3 w-full rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/10"
                          >
                            Select for Mapping
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        )}
        <section className="rounded-2xl border border-slate-800 bg-[#081522] p-5">
          <div className="flex items-start gap-3"><Info size={18} className="mt-0.5 text-amber-400" /><div><h2 className="font-semibold">Operational data integrity</h2><p className="mt-1 text-xs leading-5 text-slate-500">Only registered shelters and Authority-verified coordinates are used. Distance and road routes remain unavailable until shelter geometry is verified. Safest-route recommendations exclude HIGH/CRITICAL assigned-risk shelters and blocked routing edges.</p></div></div>
        </section>

        {loading && <p className="text-xs text-slate-500">Refreshing shelter registry…</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}

        {!isAuthority && registered > 0 && mapped === 0 && !loading && (
          <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"><div className="flex items-start gap-3"><Info size={18} className="mt-0.5 text-amber-400" /><div><h2 className="font-semibold text-amber-200">Shelter location pending verification</h2><p className="mt-1 text-sm leading-6 text-slate-400">{registered} shelters are registered, but none has verified coordinates yet. The system will not invent shelter locations, distances or evacuation routes.</p></div></div></section>
        )}

        {showAdd && isAuthority && (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#081522] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.16em] text-emerald-500">AUTHORITY ACTION</p><h2 className="mt-1 text-xl font-bold">Add Shelter</h2><p className="mt-1 text-xs text-slate-500">Coordinates are optional. If supplied, they are saved as Authority-verified geometry.</p></div><button type="button" onClick={() => {
                cancelShelterMapping()
                setShowAdd(false)
              }} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X size={18} /></button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {([['name','Shelter name','text'],['capacity','Capacity','number'],['districtId','District ID (optional)','number'],['assetCode','Asset code (optional)','text'],['latitude','Latitude (optional)','number'],['longitude','Longitude (optional)','number']] as const).map(([key,label,type]) => (
                  <label key={key} className="block"><span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span><input type={type} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-700 bg-[#0a1928] px-3 py-3 text-sm text-white outline-none focus:border-emerald-500/50" /></label>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-slate-800 bg-[#0a1928] p-3 text-xs leading-5 text-slate-500">
                New shelters can be registered without coordinates. For an existing shelter, use <span className="text-slate-300">Select for Mapping</span>, click its actual point on the map, then use <span className="text-slate-300">Verify &amp; Save</span>.
              </div>
              {(saveError || saveMessage) && (
                <div className="mt-4">
                  {saveError && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-300">
                      {saveError}
                    </div>
                  )}
                  {saveMessage && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-300">
                      {saveMessage}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => {
                  cancelShelterMapping()
                  setShowAdd(false)
                }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300">Cancel</button>
                <button type="button" onClick={() => void addShelter()} disabled={savingShelter} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#03120d] disabled:opacity-50">{savingShelter ? "Saving…" : "Add Shelter"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
