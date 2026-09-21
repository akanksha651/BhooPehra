import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CloudRain,
  House,
  Map,
  Mountain,
  Radio,
  ShieldCheck,
  Siren,
  Users,
  Wifi,
} from "lucide-react"
import { useNavigate } from "react-router"
import {
  useRole,
  type UserRole,
} from "../context/RoleContext"

type BootStep = {
  label: string
  icon: typeof Activity
}

const BOOT_STEPS: BootStep[] = [
  { label: "Initializing risk intelligence", icon: BrainCircuit },
  { label: "Connecting hazard monitoring", icon: Radio },
  { label: "Loading field response network", icon: Users },
  { label: "Verifying safety services", icon: ShieldCheck },
]

const ROLE_CARDS: Array<{
  role: UserRole
  short: string
  title: string
  description: string
  action: string
  icon: typeof Users
  path: string
}> = [
  {
    role: "COMMUNITY",
    short: "CITIZEN",
    title: "Community",
    description: "Understand local risk, receive safety information, report hazards and find verified shelter guidance.",
    action: "Enter Community",
    icon: Users,
    path: "/community",
  },
  {
    role: "FIELD_TEAM",
    short: "FIELD OPERATIONS",
    title: "Field Response Team",
    description: "Receive verified response work, inspect ground conditions, navigate safely and update field status.",
    action: "Enter Field Operations",
    icon: Mountain,
    path: "/field-team",
  },
  {
    role: "AUTHORITY",
    short: "DDMA / CONTROL",
    title: "Authority",
    description: "Monitor risk, verify evidence, prioritize action, issue alerts and coordinate field response.",
    action: "Enter Command Center",
    icon: ShieldCheck,
    path: "/authority",
  },
]

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value))
}

export default function StartupScreen() {
  const navigate = useNavigate()
  const { setRole } = useRole()

  const [phase, setPhase] = useState<"boot" | "gateway">("boot")
  const [progress, setProgress] = useState(0)
  const [activeStep, setActiveStep] = useState(0)
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)

  useEffect(() => {
    const startedAt = window.setTimeout(() => setProgress(8), 250)

    const progressTimer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 100) {
          window.clearInterval(progressTimer)
          return 100
        }

        const next = current < 35
          ? current + 4
          : current < 70
            ? current + 3
            : current < 92
              ? current + 2
              : current + 1

        return clampProgress(next)
      })
    }, 100)

    const stepTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, BOOT_STEPS.length))
    }, 900)

    return () => {
      window.clearTimeout(startedAt)
      window.clearInterval(progressTimer)
      window.clearInterval(stepTimer)
    }
  }, [])

  useEffect(() => {
    if (progress < 100 || phase === "gateway") {
      return
    }

    const gatewayTimer = window.setTimeout(() => {
      setActiveStep(BOOT_STEPS.length)
      setPhase("gateway")
    }, 900)

    return () => window.clearTimeout(gatewayTimer)
  }, [progress, phase])

  const progressLabel = useMemo(() => {
    if (phase === "gateway") return "SYSTEM READY"
    if (progress >= 96) return "SYSTEM READY"
    if (progress >= 70) return "SECURING OPERATIONAL LINK"
    if (progress >= 35) return "SYNCHRONIZING INTELLIGENCE"
    return "INITIALIZING BHOOPEHRA"
  }, [phase, progress])

  function enterRole(role: UserRole, path: string) {
    setSelectedRole(role)
    setRole(role)

    // The startup gateway has been completed for this browser session.
    // This lets the normal Dashboard route (/) work when the user clicks
    // Dashboard from the sidebar instead of reopening the startup screen.
    window.sessionStorage.setItem("bhoopehra:startup-complete", "true")

    window.setTimeout(() => {
      navigate(path)
    }, 420)
  }

  function openRoleGateway() {
    setProgress(100)
    setActiveStep(BOOT_STEPS.length)
    setPhase("gateway")
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020a12] text-white">
      {/* Cinematic background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute right-[-160px] top-[-100px] h-[620px] w-[620px] rounded-full bg-cyan-500/8 blur-[140px]" />
        <div className="absolute bottom-[-240px] left-1/3 h-[520px] w-[760px] rounded-full bg-emerald-500/6 blur-[130px]" />

        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(52,211,153,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(52,211,153,.35) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(circle at center, black 0%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 72%)",
          }}
        />

        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-[#01060b] via-[#01070c]/70 to-transparent" />
      </div>

      {/* Top brand bar */}
      <header className="relative z-10 flex items-center justify-between px-7 py-6 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/8 shadow-[0_0_35px_rgba(16,185,129,.12)]">
            <ShieldCheck className="text-emerald-300" size={25} />
            <span className="absolute inset-0 animate-ping rounded-2xl border border-emerald-400/10" />
          </div>
          <div>
            <div className="text-[22px] font-black tracking-tight">
              Bhoo<span className="text-emerald-400">Pehra</span>
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Landslide Intelligence
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 md:flex">
          <span>People</span>
          <span className="text-emerald-400/50">•</span>
          <span>Places</span>
          <span className="text-emerald-400/50">•</span>
          <span>Preparedness</span>
          <span className="ml-2 border-l border-slate-800 pl-7 text-emerald-300">
            Northeast India
          </span>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-92px)] max-w-[1500px] flex-col px-7 pb-8 lg:px-12">
        {phase === "boot" ? (
          <section className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-[1180px]">
              <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr]">
                {/* Hero copy */}
                <div className="animate-[fadeUp_.7s_ease-out_both]">
                  <div className="mb-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.32em] text-emerald-400">
                    <span className="h-px w-10 bg-emerald-400/70" />
                    Monitor · Analyze · Alert · Protect
                  </div>

                  <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                    Safer Communities.
                    <br />
                    <span className="text-emerald-400">Stronger Tomorrows.</span>
                  </h1>

                  <p className="mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                    AI-powered landslide risk intelligence, early-warning
                    decision support and safer response coordination for a
                    resilient Northeast India.
                  </p>

                  <div className="mt-9 flex flex-wrap gap-3">
                    {[
                      { icon: Activity, label: "Risk Intelligence" },
                      { icon: Siren, label: "Early Warnings" },
                      { icon: Map, label: "Safe Routing" },
                      { icon: House, label: "Shelter Guidance" },
                    ].map(({ icon: Icon, label }, index) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#07131f]/80 px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 backdrop-blur"
                        style={{ animationDelay: `${index * 90 + 180}ms` }}
                      >
                        <Icon size={15} className="text-emerald-400" />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Intelligence visual */}
                <div className="relative mx-auto h-[390px] w-full max-w-[560px]">
                  <div className="absolute inset-0 rounded-[42px] border border-emerald-400/10 bg-gradient-to-br from-emerald-400/[0.06] via-transparent to-cyan-400/[0.04]" />

                  {/* Abstract Northeast radar */}
                  <div className="absolute left-1/2 top-1/2 h-[290px] w-[290px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/10">
                    <div className="absolute inset-7 rounded-full border border-emerald-400/10" />
                    <div className="absolute inset-14 rounded-full border border-emerald-400/15" />
                    <div className="absolute inset-0 animate-[spin_12s_linear_infinite] rounded-full border-t border-emerald-300/50" />
                    <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_28px_rgba(52,211,153,.95)]" />
                  </div>

                  <div className="absolute left-[20%] top-[19%] h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(103,232,249,.8)]" />
                  <div className="absolute right-[20%] top-[29%] h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(52,211,153,.8)]" />
                  <div className="absolute left-[29%] bottom-[22%] h-2 w-2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(52,211,153,.8)]" />
                  <div className="absolute right-[27%] bottom-[18%] h-2 w-2 animate-pulse rounded-full bg-amber-300 shadow-[0_0_20px_rgba(252,211,77,.8)]" />

                  {/* Floating intelligence cards */}
                  <div className="absolute left-0 top-8 rounded-2xl border border-emerald-400/20 bg-[#06131f]/90 px-4 py-3 shadow-2xl backdrop-blur-xl animate-[float_5s_ease-in-out_infinite]">
                    <div className="flex items-center gap-2">
                      <CloudRain size={17} className="text-cyan-300" />
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                          Dynamic signals
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-white">
                          Rainfall · Wetness · Risk
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="absolute right-0 top-[42%] rounded-2xl border border-emerald-400/20 bg-[#06131f]/90 px-4 py-3 shadow-2xl backdrop-blur-xl animate-[float_6s_ease-in-out_infinite]">
                    <div className="flex items-center gap-2">
                      <Wifi size={17} className="text-emerald-300" />
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                          Operational link
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-white">
                          Field network online
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="absolute bottom-7 left-[14%] rounded-2xl border border-slate-700 bg-[#06131f]/90 px-4 py-3 shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={17} className="text-emerald-300" />
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Decision support
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-white">
                          Hazard → Risk → Action
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Boot console */}
              <div className="mx-auto mt-10 max-w-[920px] rounded-2xl border border-slate-800 bg-[#04101a]/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,.35)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-emerald-400">
                      BhooPehra system initialization
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-200">
                      {progressLabel}
                    </p>
                  </div>
                  <div className="font-mono text-sm font-bold text-emerald-300">
                    {Math.round(progress)}%
                  </div>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-300 to-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.65)] transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {BOOT_STEPS.map(({ label, icon: Icon }, index) => {
                    const done = index < activeStep
                    const current = index === activeStep && !done

                    return (
                      <div
                        key={label}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                          done
                            ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300"
                            : current
                              ? "border-cyan-400/20 bg-cyan-400/5 text-cyan-300"
                              : "border-slate-800 bg-slate-900/30 text-slate-600"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Icon size={14} />
                        )}
                        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.08em]">
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-slate-600">
                  <span>People today · Safer tomorrow</span>
                  <button
                    type="button"
                    onClick={openRoleGateway}
                    className="text-slate-500 transition hover:text-emerald-300"
                  >
                    Enter BhooPehra →
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 items-center justify-center py-10">
            <div className="w-full max-w-[1180px]">
              <div className="mx-auto max-w-3xl text-center animate-[fadeUp_.65s_ease-out_both]">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/8 shadow-[0_0_40px_rgba(16,185,129,.15)]">
                  <ShieldCheck size={29} className="text-emerald-300" />
                </div>

                <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-emerald-400">
                  Operational access gateway
                </p>
                <h1 className="mt-3 text-4xl font-black tracking-[-0.035em] sm:text-5xl">
                  Enter <span className="text-emerald-400">BhooPehra</span>
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400">
                  Select the perspective you want to enter. Each workspace is
                  tailored to its operational responsibility.
                </p>
              </div>

              <div className="mt-10 grid gap-4 lg:grid-cols-3">
                {ROLE_CARDS.map((card, index) => {
                  const Icon = card.icon
                  const selected = selectedRole === card.role

                  return (
                    <button
                      key={card.role}
                      type="button"
                      onClick={() => enterRole(card.role, card.path)}
                      className={`group relative overflow-hidden rounded-2xl border p-6 text-left transition-all duration-300 animate-[fadeUp_.65s_ease-out_both] ${
                        selected
                          ? "border-emerald-400/60 bg-emerald-400/10 shadow-[0_0_50px_rgba(16,185,129,.14)]"
                          : "border-slate-800 bg-[#06131f]/85 hover:-translate-y-1 hover:border-emerald-400/30 hover:bg-[#081824]"
                      }`}
                      style={{ animationDelay: `${index * 100 + 140}ms` }}
                    >
                      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-emerald-400/5 blur-3xl transition group-hover:bg-emerald-400/10" />

                      <div className="relative flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/6 text-emerald-300">
                          <Icon size={23} />
                        </div>
                        <span className="rounded-full border border-slate-800 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          {card.short}
                        </span>
                      </div>

                      <div className="relative mt-7">
                        <h2 className="text-xl font-bold">{card.title}</h2>
                        <p className="mt-3 min-h-[78px] text-xs leading-5 text-slate-400">
                          {card.description}
                        </p>
                      </div>

                      <div className="relative mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                          {selected ? "Opening workspace..." : card.action}
                        </span>
                        {selected ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-300" />
                        ) : (
                          <ArrowRight
                            size={17}
                            className="text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-emerald-300"
                          />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mx-auto mt-8 flex max-w-3xl items-center justify-center gap-3 text-center text-[9px] uppercase tracking-[0.18em] text-slate-600">
                <span className="h-px w-12 bg-slate-800" />
                <span>Monitor · Analyze · Alert · Protect</span>
                <span className="h-px w-12 bg-slate-800" />
              </div>

              <p className="mt-4 text-center text-[9px] text-slate-700">
                BhooPehra · NER Landslide Prototype · Decision-support platform
              </p>
            </div>
          </section>
        )}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
      `}</style>
    </main>
  )
}
