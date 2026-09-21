import {
  AlertTriangle,
  Clock3,
  ChevronRight,
} from "lucide-react"

const alerts = [
  {
    title: "Critical rainfall threshold crossed",
    location: "Gangtok Corridor, Sikkim",
    time: "12 min ago",
    level: "CRITICAL",
  },
  {
    title: "Landslide risk increased",
    location: "Tawang Highway, Arunachal Pradesh",
    time: "34 min ago",
    level: "HIGH",
  },
  {
    title: "Slope instability reported",
    location: "East Khasi Hills, Meghalaya",
    time: "1 hr ago",
    level: "MODERATE",
  },
]

const styles = {
  CRITICAL: "text-red-400 bg-red-500/10",
  HIGH: "text-orange-400 bg-orange-500/10",
  MODERATE: "text-yellow-400 bg-yellow-500/10",
}

export default function RecentAlerts() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0a1926]">

      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">

        <div>
          <h3 className="text-sm font-semibold text-white">
            Recent Alerts
          </h3>

          <p className="mt-1 text-xs text-slate-600">
            Latest risk notifications
          </p>
        </div>

        <button className="text-xs text-green-400">
          View all
        </button>

      </div>

      <div className="divide-y divide-slate-800">

        {alerts.map((alert) => (

          <div
            key={alert.title}
            className="flex items-center gap-3 px-5 py-4 hover:bg-slate-900/40"
          >

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
            </div>

            <div className="min-w-0 flex-1">

              <p className="truncate text-sm font-medium text-slate-300">
                {alert.title}
              </p>

              <p className="mt-1 truncate text-[11px] text-slate-600">
                {alert.location}
              </p>

              <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-700">
                <Clock3 className="h-3 w-3" />
                {alert.time}
              </div>

            </div>

            <span
              className={`rounded-md px-2 py-1 text-[9px] font-semibold ${
                styles[alert.level as keyof typeof styles]
              }`}
            >
              {alert.level}
            </span>

            <ChevronRight className="h-4 w-4 text-slate-700" />

          </div>

        ))}

      </div>

    </div>
  )
}