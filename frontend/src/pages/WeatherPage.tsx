import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CloudRain,
  Droplets,
  RefreshCw,
  ShieldAlert,
  Timer,
  Waves,
} from "lucide-react"
import {
  getDistricts,
  getLocationWeather,
  getRainfallObservations,
} from "../services/api"
import type {
  District,
  LocationWeather,
  RainfallObservation,
} from "../services/api"

const formatNumber = (
  value: number | null | undefined,
  decimals = 1,
): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable"
  }

  return value.toFixed(decimals)
}

const formatObservedTime = (
  value: string | null | undefined,
): string => {
  if (!value) {
    return "Unavailable"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Unavailable"
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  })
}

const getTriggerClass = (trigger: string | null | undefined): string => {
  const normalized = String(trigger ?? "").toUpperCase()

  if (normalized === "CRITICAL") {
    return "border-red-500/30 bg-red-500/10 text-red-300"
  }

  if (normalized === "HIGH") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-300"
  }

  if (normalized === "MODERATE") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
  }

  if (normalized === "LOW") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
  }

  return "border-slate-700 bg-slate-900/60 text-slate-300"
}

const getDistrictName = (
  districtId: number,
  districts: District[],
): string => {
  const district = districts.find(
    (item) => item.id === districtId,
  )

  return district?.name ?? `District #${districtId}`
}

function MetricCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>

        <div className="rounded-lg border border-slate-800 bg-[#081522] p-2 text-slate-400">
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        <p className="text-2xl font-bold tracking-tight text-white">
          {value}
        </p>

        {unit ? (
          <span className="mb-0.5 text-xs text-slate-500">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default function WeatherPage() {
  const [observations, setObservations] = useState<
    RainfallObservation[]
  >([])
  const [districts, setDistricts] = useState<District[]>([])
  const [selectedDistrictId, setSelectedDistrictId] = useState<
    number | "ALL"
  >("ALL")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [locationWeather, setLocationWeather] =
    useState<LocationWeather | null>(null)
  const [locationStatus, setLocationStatus] = useState<
    "IDLE" | "REQUESTING" | "LOADING" | "READY" | "DENIED" | "ERROR"
  >("IDLE")
  const [locationError, setLocationError] =
    useState<string | null>(null)

  const loadWeather = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      const [weatherData, districtData] = await Promise.all([
        getRainfallObservations(),
        getDistricts(),
      ])

      setObservations(weatherData)
      setDistricts(districtData)
    } catch (err) {
      console.error("Failed to load weather data:", err)

      setError(
        "Weather data could not be loaded from the backend.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const requestMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("ERROR")
      setLocationError(
        "Browser geolocation is not available on this device.",
      )
      return
    }

    setLocationStatus("REQUESTING")
    setLocationError(null)
    setLocationWeather(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords

        setLocationStatus("LOADING")

        try {
          const weather = await getLocationWeather(
            latitude,
            longitude,
          )

          setLocationWeather(weather)
          setLocationStatus("READY")
        } catch (err) {
          console.error(
            "Failed to load location weather:",
            err,
          )

          setLocationStatus("ERROR")

          const message =
            err instanceof Error ? err.message : String(err)

          if (
            message
              .toLowerCase()
              .includes("outside bhoopehra ner coverage")
          ) {
            setLocationError(
              "Location is outside BhooPehra coverage. Live location weather is available only within the North Eastern Region.",
            )
          } else {
            setLocationError(
              "Live weather data could not be loaded for your current location.",
            )
          }
        }
      },
      (geoError) => {
        if (geoError.code === 1) {
          setLocationStatus("DENIED")
          setLocationError(
            "Location permission was denied. Location unavailable.",
          )
          return
        }

        if (geoError.code === 2) {
          setLocationStatus("ERROR")
          setLocationError(
            "Your device could not determine the current location.",
          )
          return
        }

        setLocationStatus("ERROR")
        setLocationError(
          "Location request timed out. Location unavailable.",
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    )
  }

  useEffect(() => {
    void loadWeather()
  }, [])

  const latestByDistrict = useMemo(() => {
    const latest = new Map<number, RainfallObservation>()

    for (const observation of observations) {
      const existing = latest.get(observation.district_id)

      if (!existing) {
        latest.set(observation.district_id, observation)
        continue
      }

      const currentTime = new Date(
        observation.observed_at,
      ).getTime()

      const existingTime = new Date(
        existing.observed_at,
      ).getTime()

      if (currentTime > existingTime) {
        latest.set(observation.district_id, observation)
      }
    }

    return Array.from(latest.values()).sort((a, b) =>
      getDistrictName(a.district_id, districts).localeCompare(
        getDistrictName(b.district_id, districts),
      ),
    )
  }, [observations, districts])

  const selectedObservation = useMemo(() => {
    if (selectedDistrictId === "ALL") {
      return latestByDistrict[0] ?? null
    }

    return (
      latestByDistrict.find(
        (observation) =>
          observation.district_id === selectedDistrictId,
      ) ?? null
    )
  }, [latestByDistrict, selectedDistrictId])

  const latestOverallObservation = useMemo(() => {
    if (observations.length === 0) {
      return null
    }

    return observations.reduce((latest, observation) =>{
      if (!latest) {
        return observation
      }

      return new Date(observation.observed_at).getTime() >
        new Date(latest.observed_at).getTime()
        ? observation
        : latest
    }, null as RainfallObservation | null)
  }, [observations])

  const displayedObservations = useMemo(() => {
    if (selectedDistrictId === "ALL") {
      return latestByDistrict
    }

    return latestByDistrict.filter(
      (observation) =>
        observation.district_id === selectedDistrictId,
    )
  }, [latestByDistrict, selectedDistrictId])

  const modelDerivedCount = useMemo(
    () =>
      latestByDistrict.filter(
        (observation) =>
          observation.data_type === "MODEL_DERIVED",
      ).length,
    [latestByDistrict],
  )

  return (
    <div className="min-h-full bg-[#06111d] text-slate-200">
      <div className="mx-auto max-w-[1600px] p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400">
              Weather & Forecast
            </p>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
              Rainfall & Soil Conditions
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Weather context used by BhooPehra&apos;s landslide
              risk pipeline. Values shown here are returned by the
              backend and are not manually simulated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={requestMyLocation}
              disabled={
                locationStatus === "REQUESTING" ||
                locationStatus === "LOADING"
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-base leading-none">⌖</span>
              {locationStatus === "REQUESTING"
                ? "Requesting Location..."
                : locationStatus === "LOADING"
                  ? "Loading Location..."
                  : "Use My Location"}
            </button>

            <button
              type="button"
              onClick={() => void loadWeather(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0b1a2a] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-[#102236] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-cyan-300">
              <CloudRain className="h-4 w-4" />
            </div>

            <div>
              <p className="text-sm font-semibold text-cyan-200">
                Data provenance
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Current rainfall observations are sourced from the
                configured backend weather ingestion pipeline. When
                marked MODEL_DERIVED, the values are model-derived
                weather data and should not be interpreted as
                ground-station measurements.
              </p>
            </div>
          </div>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-[#0b1a2a]">
          <div className="border-b border-slate-800 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                  Live Location Context
                </p>
                <h2 className="mt-1 text-base font-bold text-white">
                  Weather at My Location
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Uses your browser&apos;s GPS coordinates and fetches
                  location-specific data from Open-Meteo. No fallback
                  location is used.
                </p>
              </div>

              {locationWeather ? (
                <div className="rounded-xl border border-slate-800 bg-[#081522] px-3 py-2 text-right">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">
                    GPS Coordinates
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-200">
                    {locationWeather.location.latitude.toFixed(6)},
                    {" "}
                    {locationWeather.location.longitude.toFixed(6)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-4">
            {locationStatus === "IDLE" ? (
              <div className="rounded-xl border border-slate-800 bg-[#081522] p-5">
                <p className="text-sm font-semibold text-slate-200">
                  Location not requested
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Select &quot;Use My Location&quot; to request your
                  device&apos;s current GPS position.
                </p>
              </div>
            ) : null}

            {locationStatus === "REQUESTING" ||
            locationStatus === "LOADING" ? (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-5">
                <p className="text-sm font-semibold text-cyan-200">
                  {locationStatus === "REQUESTING"
                    ? "Waiting for location permission..."
                    : "Fetching live weather for your coordinates..."}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  No estimated or fallback location is being used.
                </p>
              </div>
            ) : null}

            {locationStatus === "DENIED" ||
            locationStatus === "ERROR" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                <p className="text-sm font-semibold text-amber-200">
                  Location unavailable
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {locationError ?? "Location unavailable."}
                </p>
              </div>
            ) : null}

            {locationWeather ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Current 1h Rain"
                    value={formatNumber(
                      locationWeather.current
                        .precipitation_1h_mm,
                    )}
                    unit="mm"
                    icon={<CloudRain className="h-4 w-4" />}
                  />

                  <MetricCard
                    label="24h Rainfall"
                    value={formatNumber(
                      locationWeather.rainfall["24h_mm"],
                    )}
                    unit="mm"
                    icon={<Waves className="h-4 w-4" />}
                  />

                  <MetricCard
                    label="72h Rainfall"
                    value={formatNumber(
                      locationWeather.rainfall["72h_mm"],
                    )}
                    unit="mm"
                    icon={<Timer className="h-4 w-4" />}
                  />

                  <MetricCard
                    label="Soil Moisture"
                    value={formatNumber(
                      locationWeather.current
                        .soil_moisture_percent,
                    )}
                    unit="%"
                    icon={<Droplets className="h-4 w-4" />}
                  />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">
                      48h Rainfall
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatNumber(
                        locationWeather.rainfall["48h_mm"],
                      )}{" "}
                      mm
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">
                      Observed Hour
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {formatObservedTime(
                        locationWeather.observed_at,
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">
                      Data Provenance
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {locationWeather.source}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {locationWeather.data_type} · not a
                      ground-station measurement
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3">
                  <p className="text-xs leading-5 text-slate-400">
                    Location-specific weather is calculated from the
                    exact GPS coordinates returned by your browser.
                    BhooPehra does not substitute a nearby city or
                    guessed location when GPS is unavailable.
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

              <div>
                <p className="text-sm font-semibold text-red-200">
                  Weather data unavailable
                </p>

                <p className="mt-1 text-xs text-red-300/80">
                  {error}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-[#0b1a2a] p-8 text-center text-sm text-slate-500">
            Loading verified weather context...
          </div>
        ) : (
          <>
            <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Latest 1h Rainfall"
                value={formatNumber(
                  selectedObservation?.rainfall_1h,
                )}
                unit="mm"
                icon={<CloudRain className="h-4 w-4" />}
              />

              <MetricCard
                label="Latest 24h Rainfall"
                value={formatNumber(
                  selectedObservation?.rainfall_24h,
                )}
                unit="mm"
                icon={<Waves className="h-4 w-4" />}
              />

              <MetricCard
                label="72h Rainfall"
                value={formatNumber(
                  selectedObservation?.rainfall_72h,
                )}
                unit="mm"
                icon={<Timer className="h-4 w-4" />}
              />

              <MetricCard
                label="Soil Moisture"
                value={formatNumber(
                  selectedObservation?.soil_moisture,
                )}
                unit="%"
                icon={<Droplets className="h-4 w-4" />}
              />
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
                <div className="border-b border-slate-800 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Location Context
                      </p>

                      <h2 className="mt-1 text-base font-bold text-white">
                        District Weather Data
                      </h2>
                    </div>

                    <select
                      value={selectedDistrictId}
                      onChange={(event) => {
                        const value = event.target.value

                        setSelectedDistrictId(
                          value === "ALL"
                            ? "ALL"
                            : Number(value),
                        )
                      }}
                      className="rounded-xl border border-slate-700 bg-[#081522] px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                    >
                      <option value="ALL">
                        Latest available district
                      </option>

                      {latestByDistrict.map((observation) => (
                        <option
                          key={observation.district_id}
                          value={observation.district_id}
                        >
                          {getDistrictName(
                            observation.district_id,
                            districts,
                          )}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-[9px] uppercase tracking-[0.12em] text-slate-500">
                        <th className="px-4 py-3 font-semibold">
                          District
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          1h
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          24h
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          48h
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          72h
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          Soil
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          Trigger
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {displayedObservations.map(
                        (observation) => (
                          <tr
                            key={observation.id}
                            className="border-b border-slate-800/70 last:border-0"
                          >
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-slate-200">
                                {getDistrictName(
                                  observation.district_id,
                                  districts,
                                )}
                              </p>

                              <p className="mt-0.5 text-[10px] text-slate-500">
                                {formatObservedTime(
                                  observation.observed_at,
                                )}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-300">
                              {formatNumber(
                                observation.rainfall_1h,
                              )}{" "}
                              mm
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-300">
                              {formatNumber(
                                observation.rainfall_24h,
                              )}{" "}
                              mm
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-300">
                              {formatNumber(
                                observation.rainfall_48h,
                              )}{" "}
                              mm
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-300">
                              {formatNumber(
                                observation.rainfall_72h,
                              )}{" "}
                              mm
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-300">
                              {formatNumber(
                                observation.soil_moisture,
                              )}{" "}
                              {observation.soil_moisture !== null
                                ? "%"
                                : ""}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${getTriggerClass(
                                  observation.trigger_level,
                                )}`}
                              >
                                {observation.trigger_level ||
                                  "Unavailable"}
                              </span>
                            </td>
                          </tr>
                        ),
                      )}

                      {displayedObservations.length ===0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-8 text-center text-sm text-slate-500"
                          >
                            No verified weather observations are
                            available for this selection.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a]">
                <div className="border-b border-slate-800 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Selected Observation
                  </p>

                  <h2 className="mt-1 text-base font-bold text-white">
                    Weather Context
                  </h2>
                </div>

                <div className="space-y-3 p-4">
                  {selectedObservation ? (
                    <>
                      <div className="rounded-xl border border-slate-800 bg-[#081522] p-4">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                          District
                        </p>

                        <p className="mt-1 text-lg font-bold text-white">
                          {getDistrictName(
                            selectedObservation.district_id,
                            districts,
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                          <p className="text-[9px] uppercase tracking-wide text-slate-500">
                            48h Rainfall
                          </p>

                          <p className="mt-1 text-sm font-bold text-white">
                            {formatNumber(
                              selectedObservation.rainfall_48h,
                            )}{" "}
                            mm
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                          <p className="text-[9px] uppercase tracking-wide text-slate-500">
                            Antecedent
                          </p>

                          <p className="mt-1 text-sm font-bold text-white">
                            {formatNumber(
                              selectedObservation.antecedent_rainfall,
                            )}{" "}
                            mm
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[9px] uppercase tracking-wide text-slate-500">
                              Rainfall Trigger
                            </p>

                            <p className="mt-1 text-sm font-bold text-white">
                              {selectedObservation.trigger_level ||
                                "Unavailable"}
                            </p>
                          </div>

                          <ShieldAlert className="h-5 w-5 text-slate-500" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                        <p className="text-[9px] uppercase tracking-wide text-slate-500">
                          Source
                        </p>

                        <p className="mt-1 text-sm font-semibold text-slate-200">
                          {selectedObservation.source ||
                            "Unavailable"}
                        </p>

                        <p className="mt-2 text-[10px] leading-5 text-slate-500">
                          Data type:{" "}
                          {selectedObservation.data_type ||
                            "Unavailable"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-[#081522] p-3">
                        <p className="text-[9px] uppercase tracking-wide text-slate-500">
                          Observed
                        </p>

                        <p className="mt-1 text-sm font-semibold text-slate-200">
                          {formatObservedTime(
                            selectedObservation.observed_at,
                          )}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-[#081522] p-5 text-sm text-slate-500">
                      No weather observation is currently
                      available.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-slate-800 bg-[#081522] p-2 text-slate-400">
                    <CloudRain className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">
                      Districts with latest data
                    </p>

                    <p className="mt-1 text-xl font-bold text-white">
                      {latestByDistrict.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-slate-800 bg-[#081522] p-2 text-slate-400">
                    <ShieldAlert className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">
                      Model-derived observations
                    </p>

                    <p className="mt-1 text-xl font-bold text-white">
                      {modelDerivedCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#0b1a2a] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-slate-800 bg-[#081522] p-2 text-slate-400">
                    <Timer className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-slate-500">
                      Latest backend update
                    </p>

                    <p className="mt-1 text-sm font-bold text-white">
                      {formatObservedTime(
                        latestOverallObservation?.observed_at,
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />

                <div>
                  <p className="text-sm font-semibold text-amber-200">
                    Operational interpretation
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Rainfall and soil-moisture values provide
                    environmental context for BhooPehra&apos;s risk
                    assessment. They are not, by themselves, a
                    prediction that a landslide will occur. Weather
                    data should also not be confused with a verified
                    field report or an operational emergency alert.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
