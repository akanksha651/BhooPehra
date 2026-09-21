import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Flame,
  HeartPulse,
  LifeBuoy,
  MapPin,
  Phone,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from "lucide-react"
import { Link } from "react-router"

type EmergencyContact = {
  title: string
  subtitle: string
  number: string
  description: string
  icon: typeof Phone
  primary?: boolean
}

const EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    title: "National Emergency",
    subtitle: "Police · Fire · Medical · Rescue",
    number: "112",
    description:
      "For an immediate or life-threatening emergency anywhere in India.",
    icon: Siren,
    primary: true,
  },
  {
    title: "East Siang DEOC",
    subtitle: "District Emergency Operations Centre",
    number: "9485236821",
    description:
      "Official East Siang disaster-management emergency contact.",
    icon: ShieldAlert,
  },
  {
    title: "East Siang DEOC",
    subtitle: "Alternate district emergency contact",
    number: "8731956069",
    description:
      "Alternate official DEOC contact listed by Arunachal Pradesh SDMA.",
    icon: ShieldAlert,
  },
  {
    title: "District Disaster Management Officer",
    subtitle: "East Siang · DDMO",
    number: "9402615036",
    description:
      "Official district disaster-management officer contact.",
    icon: LifeBuoy,
  },
]

const SAFETY_STEPS = [
  {
    icon: TriangleAlert,
    title: "Move away from the slope",
    description:
      "If you notice fresh cracks, falling rocks, unusual sounds, or moving soil, leave the immediate slope area.",
  },
  {
    icon: MapPin,
    title: "Move to safer ground",
    description:
      "Avoid unstable slopes, river channels, drainage paths, and areas directly below a landslide.",
  },
  {
    icon: HeartPulse,
    title: "Help only when safe",
    description:
      "Do not enter a collapsed or unstable area to rescue someone if it puts you at risk.",
  },
  {
    icon: Phone,
    title: "Call for emergency help",
    description:
      "For an immediate threat to life, call 112. For district disaster coordination, contact the East Siang DEOC.",
  },
]

export default function EmergencyHelpPage() {
  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] px-6 py-6 text-white">
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* Header */}
        <section className="rounded-2xl border border-red-500/20 bg-[#091725] p-6 shadow-[0_0_30px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                <Siren size={28} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-400">
                  Community Safety
                </p>

                <h1 className="mt-1 text-3xl font-bold tracking-tight">
                  Emergency Help
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Use this page when you need urgent assistance or district
                  disaster-management support. Only verified emergency
                  contacts are shown.
                </p>
              </div>
            </div>

            <a
              href="tel:112"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400"
            >
              <Phone size={18} />
              Call 112
            </a>
          </div>
        </section>

        {/* Immediate danger */}
        <section className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <AlertTriangle size={21} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">
                If there is immediate danger
              </h2>

              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-300">
                Move to a safer location first. If there is an immediate
                threat to life, call the national emergency number.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="tel:112"
                  className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-400"
                >
                  <Phone size={16} />
                  Call 112
                </a>

                <Link
                  to="/shelter"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0b1b2b] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500"
                >
                  <LifeBuoy size={16} />
                  Find Safe Shelter
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Official contacts */}
        <section>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Verified Contacts
            </p>

            <h2 className="mt-1 text-xl font-bold text-white">
              Emergency & disaster-management contacts
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {EMERGENCY_CONTACTS.map((contact) => {
              const Icon = contact.icon

              return (
                <article
                  key={`${contact.title}-${contact.number}`}
                  className={`rounded-2xl border p-5 ${
                    contact.primary
                      ? "border-red-500/30 bg-red-500/[0.06]"
                      : "border-slate-800 bg-[#091725]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        contact.primary
                          ? "bg-red-500/10 text-red-400"
                          : "bg-teal-400/10 text-teal-300"
                      }`}
                    >
                      <Icon size={20} />
                    </div>

                    {contact.primary && (
                      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                        Emergency
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 text-base font-bold text-white">
                    {contact.title}
                  </h3>

                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {contact.subtitle}
                  </p>

                  <a
                    href={`tel:${contact.number}`}
                    className="mt-4 flex items-center gap-2 text-2xl font-bold tracking-wide text-teal-300 hover:text-teal-200"
                  >
                    <Phone size={19} />
                    {contact.number}
                  </a>

                  <p className="mt-3 min-h-[48px] text-xs leading-5 text-slate-400">
                    {contact.description}
                  </p>

                  <a
                    href={`tel:${contact.number}`}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    Call contact
                    <ArrowRight size={14} />
                  </a>
                </article>
              )
            })}
          </div>
        </section>

        {/* Safety actions */}
        <section className="rounded-2xl border border-slate-800 bg-[#091725] p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-400">
              Immediate Safety
            </p>

            <h2 className="mt-1 text-xl font-bold text-white">
              What to do during a landslide emergency
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {SAFETY_STEPS.map((step, index) => {
              const Icon = step.icon

              return (
                <div
                  key={step.title}
                  className="flex gap-4 rounded-xl border border-slate-800 bg-[#07131f] p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
                    <Icon size={19} />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-teal-400">
                        0{index + 1}
                      </span>

                      <h3 className="text-sm font-bold text-white">
                        {step.title}
                      </h3>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Citizen actions */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Link
            to="/field-reports"
            className="group rounded-2xl border border-slate-800 bg-[#091725] p-5 transition hover:border-teal-500/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
                <AlertTriangle size={19} />
              </div>

              <ArrowRight
                size={17}
                className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-teal-300"
              />
            </div>

            <h3 className="mt-4 font-bold text-white">
              Report a Hazard
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Report a landslide, blocked road, slope crack, rockfall, or
              another hazard to the response system.
            </p>
          </Link>

          <Link
            to="/shelter"
            className="group rounded-2xl border border-slate-800 bg-[#091725] p-5 transition hover:border-teal-500/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
                <LifeBuoy size={19} />
              </div>

              <ArrowRight
                size={17}
                className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-teal-300"
              />
            </div>

            <h3 className="mt-4 font-bold text-white">
              Find Safe Shelter
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Find the nearest shelter only when its location has been
              verified and mapped.
            </p>
          </Link>

          <Link
            to="/risk-map"
            className="group rounded-2xl border border-slate-800 bg-[#091725] p-5 transition hover:border-teal-500/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
                <MapPin size={19} />
              </div>

              <ArrowRight
                size={17}
                className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-teal-300"
              />
            </div>

            <h3 className="mt-4 font-bold text-white">
              Check Area Risk
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Open the risk map to understand the currently available
              location-based risk information.
            </p>
          </Link>
        </section>

        {/* Source / trust footer */}
        <section className="rounded-2xl border border-slate-800 bg-[#07131f] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={18}
                className="mt-0.5 shrink-0 text-teal-400"
              />

              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Contact verification
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Emergency contacts are based on official Government of
                  India, East Siang District Administration, and Arunachal
                  Pradesh SDMA sources. Contact information can change and
                  should be re-verified periodically.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href="https://112.gov.in/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
              >
                112.gov.in
                <ExternalLink size={12} />
              </a>

              <a
                href="https://eastsiang.nic.in/disaster-management/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
              >
                East Siang District
                <ExternalLink size={12} />
              </a>

              <a
                href="https://sdma-arunachal.in/home/contact-details-of-deocs-2/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
              >
                Arunachal SDMA
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-4 text-[11px] text-slate-600">
            <Flame size={13} />
            <span>
              Use emergency services only when genuine assistance is required.
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}