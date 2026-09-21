import {
  CloudRain,
  Droplets,
  Wind,
} from "lucide-react"

export default function WeatherCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0a1926] p-5">

      <div className="flex items-center justify-between">

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Weather Conditions
          </p>

          <div className="mt-3 flex items-center gap-3">

            <CloudRain className="h-9 w-9 text-blue-400" />

            <div>
              <p className="text-2xl font-bold text-white">
                24°C
              </p>

              <p className="text-xs text-blue-400">
                Heavy rainfall expected
              </p>
            </div>

          </div>
        </div>

      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">

        <div className="rounded-lg bg-slate-900/60 p-3">

          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-400" />

            <span className="text-xs text-slate-500">
              Humidity
            </span>
          </div>

          <p className="mt-1 text-sm font-semibold text-white">
            87%
          </p>

        </div>

        <div className="rounded-lg bg-slate-900/60 p-3">

          <div className="flex items-center gap-2">
            <Wind className="h-4 w-4 text-slate-400" />

            <span className="text-xs text-slate-500">
              Wind
            </span>
          </div>

          <p className="mt-1 text-sm font-semibold text-white">
            14 km/h
          </p>

        </div>

      </div>

    </div>
  )
}