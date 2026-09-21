import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  ZoomControl,
} from "react-leaflet"

import "leaflet/dist/leaflet.css"

type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW"

interface RiskLocation {
  id: number
  name: string
  district: string
  state: string
  lat: number
  lng: number
  risk: RiskLevel
  probability: number
  confidence: string
  rainfall: string
  affectedVillages: number
  affectedRoads: number
  priority: string
}

const riskLocations: RiskLocation[] = [
  {
    id: 1,
    name: "Gangtok Corridor",
    district: "Gangtok",
    state: "Sikkim",
    lat: 27.3389,
    lng: 88.6065,
    risk: "CRITICAL",
    probability: 89,
    confidence: "HIGH",
    rainfall: "Very High",
    affectedVillages: 4,
    affectedRoads: 3,
    priority: "P1",
  },
  {
    id: 2,
    name: "Tawang Highway",
    district: "Tawang",
    state: "Arunachal Pradesh",
    lat: 27.586,
    lng: 91.859,
    risk: "HIGH",
    probability: 78,
    confidence: "MODERATE",
    rainfall: "High",
    affectedVillages: 3,
    affectedRoads: 2,
    priority: "P1",
  },
  {
    id: 3,
    name: "Dibang Valley",
    district: "Dibang Valley",
    state: "Arunachal Pradesh",
    lat: 28.05,
    lng: 95.95,
    risk: "HIGH",
    probability: 74,
    confidence: "MODERATE",
    rainfall: "High",
    affectedVillages: 2,
    affectedRoads: 2,
    priority: "P2",
  },
  {
    id: 4,
    name: "Cherrapunji Sector",
    district: "East Khasi Hills",
    state: "Meghalaya",
    lat: 25.284,
    lng: 91.721,
    risk: "MODERATE",
    probability: 61,
    confidence: "HIGH",
    rainfall: "Moderate",
    affectedVillages: 2,
    affectedRoads: 1,
    priority: "P2",
  },
  {
    id: 5,
    name: "Aizawl Hills",
    district: "Aizawl",
    state: "Mizoram",
    lat: 23.7271,
    lng: 92.7176,
    risk: "MODERATE",
    probability: 57,
    confidence: "MODERATE",
    rainfall: "Moderate",
    affectedVillages: 1,
    affectedRoads: 1,
    priority: "P3",
  },
  {
    id: 6,
    name: "Kohima Ridge",
    district: "Kohima",
    state: "Nagaland",
    lat: 25.6751,
    lng: 94.1086,
    risk: "LOW",
    probability: 34,
    confidence: "HIGH",
    rainfall: "Low",
    affectedVillages: 0,
    affectedRoads: 1,
    priority: "P3",
  },
]

const riskColors: Record<RiskLevel, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MODERATE: "#eab308",
  LOW: "#22c55e",
}

function getRiskColor(risk: RiskLevel) {
  return riskColors[risk]
}

export default function RiskMap() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">

      <MapContainer
        center={[26.5, 92.5]}
        zoom={6}
        zoomControl={false}
        className="h-full w-full"
      >

        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoomControl position="bottomright" />

        {riskLocations.map((location) => (
          <CircleMarker
            key={location.id}
            center={[location.lat, location.lng]}
            radius={10}
            pathOptions={{
              color: getRiskColor(location.risk),
              fillColor: getRiskColor(location.risk),
              fillOpacity: 0.75,
              weight: 2,
            }}
          >
            <Popup>

              <div className="min-w-[230px]">

                <div className="mb-3">
                  <p className="text-base font-bold text-slate-900">
                    {location.name}
                  </p>

                  <p className="text-xs text-slate-500">
                    {location.district}, {location.state}
                  </p>
                </div>

                <div
                  className="mb-3 rounded-lg px-3 py-2 text-white"
                  style={{
                    backgroundColor: getRiskColor(location.risk),
                  }}
                >
                  <p className="text-xs font-medium">
                    LANDSLIDE RISK
                  </p>

                  <p className="text-lg font-bold">
                    {location.risk}
                  </p>
                </div>

                <div className="space-y-2 text-xs">

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Probability
                    </span>

                    <strong>
                      {location.probability}%
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Confidence
                    </span>

                    <strong>
                      {location.confidence}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Rainfall
                    </span>

                    <strong>
                      {location.rainfall}
                    </strong>
                  </div>

                </div>

                <div className="my-3 border-t border-slate-200" />

                <p className="mb-2 text-xs font-semibold text-slate-700">
                  Potential Impact
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs">

                  <div className="rounded bg-slate-100 p-2">
                    <strong>{location.affectedVillages}</strong>
                    <p className="text-slate-500">
                      Villages
                    </p>
                  </div>

                  <div className="rounded bg-slate-100 p-2">
                    <strong>{location.affectedRoads}</strong>
                    <p className="text-slate-500">
                      Roads
                    </p>
                  </div>

                </div>

                <div className="mt-3 flex items-center justify-between">

                  <span className="text-xs text-slate-500">
                    Priority
                  </span>

                  <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-600">
                    {location.priority}
                  </span>

                </div>

              </div>

            </Popup>
          </CircleMarker>
        ))}

      </MapContainer>

      {/* Map title */}
      <div className="pointer-events-none absolute left-4 top-4 z-[1000]">
        <div className="rounded-xl border border-slate-700 bg-[#081521]/90 px-4 py-3 shadow-lg backdrop-blur">

          <p className="text-sm font-semibold text-white">
            Northeast India
          </p>

          <p className="text-[11px] text-slate-400">
            Current Landslide Risk
          </p>

        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-slate-700 bg-[#081521]/95 p-4 shadow-lg backdrop-blur">

        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Risk Level
        </p>

        <div className="space-y-2">

          {(
            Object.entries(riskColors) as [RiskLevel, string][]
          ).map(([risk, color]) => (

            <div
              key={risk}
              className="flex items-center gap-2"
            >

              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />

              <span className="text-xs text-slate-300">
                {risk}
              </span>

            </div>

          ))}

        </div>
      </div>

    </div>
  )
}