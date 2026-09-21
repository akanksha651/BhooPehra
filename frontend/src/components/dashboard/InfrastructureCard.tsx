import {
  Route,
  Building2,
  School,
  Hospital,
} from "lucide-react"

const infrastructure = [
  {
    label: "Road Segments",
    value: "38",
    icon: Route,
  },
  {
    label: "Bridges",
    value: "7",
    icon: Building2,
  },
  {
    label: "Schools",
    value: "12",
    icon: School,
  },
  {
    label: "Hospitals",
    value: "4",
    icon: Hospital,
  },
]

export default function InfrastructureCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0a1926] p-5">

      <div className="mb-4">

        <h3 className="text-sm font-semibold text-white">
          Exposed Infrastructure
        </h3>

        <p className="mt-1 text-xs text-slate-600">
          Assets inside high-risk zones
        </p>

      </div>

      <div className="grid grid-cols-2 gap-3">

        {infrastructure.map((item) => {

          const Icon = item.icon

          return (
            <div
              key={item.label}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"
            >

              <Icon className="h-4 w-4 text-slate-500" />

              <p className="mt-2 text-lg font-bold text-white">
                {item.value}
              </p>

              <p className="text-[10px] text-slate-600">
                {item.label}
              </p>

            </div>
          )
        })}

      </div>

    </div>
  )
}