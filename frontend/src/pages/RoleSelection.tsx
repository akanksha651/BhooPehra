import {
  Building2,
  ChevronRight,
  RadioTower,
  ShieldCheck,
  Users,
} from "lucide-react"

import {
  ROLE_PROFILES,
  useRole,
  type UserRole,
} from "../context/RoleContext"

const ROLE_ICONS: Record<
  UserRole,
  typeof ShieldCheck
> = {
  AUTHORITY: ShieldCheck,
  FIELD_TEAM: RadioTower,
  COMMUNITY: Users,
}

const ROLE_ORDER: UserRole[] = [
  "AUTHORITY",
  "FIELD_TEAM",
  "COMMUNITY",
]

export default function RoleSelection() {
  const { setRole } = useRole()

  function selectRole(role: UserRole) {
    setRole(role)
  }

  return (
    <div className="min-h-screen bg-[#06111c] px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center justify-center">
        <div className="w-full">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
              <Building2 className="h-7 w-7 text-emerald-400" />
            </div>

            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-500">
              BhooPehra
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Select Your Operational Role
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Choose the dashboard according to your operational
              responsibility. The available tools and information will
              adapt to the selected role.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {ROLE_ORDER.map((role) => {
              const profile = ROLE_PROFILES[role]
              const Icon = ROLE_ICONS[role]

              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => selectRole(role)}
                  className="group rounded-2xl border border-slate-800 bg-[#091827] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-500/30 hover:bg-[#0b1c2b]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 text-slate-600 transition group-hover:border-emerald-500/20 group-hover:text-emerald-400">
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-500">
                      {profile.shortName}
                    </p>

                    <h2 className="mt-1 text-lg font-semibold text-white">
                      {profile.title}
                    </h2>

                    <p className="mt-1 text-[10px] text-slate-600">
                      {profile.department}
                    </p>

                    <p className="mt-4 min-h-[60px] text-xs leading-5 text-slate-400">
                      {profile.description}
                    </p>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-slate-600">
                      Dashboard
                    </p>

                    <p className="mt-1 text-xs font-medium text-slate-300">
                      {profile.dashboardTitle}
                    </p>

                    <p className="mt-1 text-[9px] leading-4 text-slate-600">
                      {profile.dashboardSubtitle}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 text-[9px] text-slate-700">
            <ShieldCheck className="h-3 w-3" />
            BhooPehra role-based operational interface
          </div>
        </div>
      </div>
    </div>
  )
}