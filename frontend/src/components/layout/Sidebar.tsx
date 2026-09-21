import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  ClipboardList,
  CloudRain,
  FileText,
  Flag,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Map,
  MapPinned,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react"

import {
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  useLocation,
  useNavigate,
} from "react-router"

import {
  useRole,
  type UserRole,
} from "../../context/RoleContext"

import {
  CommunityLanguageController,
  useCommunityLanguage,
} from "../../i18n/communityLanguage"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

type ActiveAlert = {
  id?: number
  status?: string
}

type AlertResponse = {
  data?: ActiveAlert[]
  alerts?: ActiveAlert[]
}

type MenuItem = {
  label: string
  path: string
  icon: typeof LayoutDashboard
}

const AUTHORITY_MENU: MenuItem[] = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Risk Map",
    path: "/risk-map",
    icon: Map,
  },
  {
    label: "Alerts & Warnings",
    path: "/alerts",
    icon: Bell,
  },
  {
    label: "Field Reports",
    path: "/field-reports",
    icon: ClipboardList,
  },
  {
    label: "Infrastructure",
    path: "/infrastructure",
    icon: Building2,
  },
  {
    label: "Reports",
    path: "/reports",
    icon: FileText,
  },
  {
    label: "Weather & Forecast",
    path: "/weather",
    icon: CloudRain,
  },
  {
    label: "Analytics",
    path: "/analytics",
    icon: BarChart3,
  },
  {
    label: "Resources",
    path: "/resources",
    icon: BookOpen,
  },
  {
    label: "Safe Shelter",
    path: "/shelter",
    icon: Home,
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
  },
]

const FIELD_TEAM_MENU: MenuItem[] = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Risk Map",
    path: "/risk-map",
    icon: Map,
  },
  {
    label: "Alerts & Warnings",
    path: "/alerts",
    icon: Bell,
  },
  {
    label: "Field Reports",
    path: "/field-reports",
    icon: ClipboardList,
  },
  {
    label: "Infrastructure",
    path: "/infrastructure",
    icon: Building2,
  },
  {
    label: "Weather & Forecast",
    path: "/weather",
    icon: CloudRain,
  },
  {
    label: "Resources",
    path: "/resources",
    icon: BookOpen,
  },
  {
    label: "Safe Shelter",
    path: "/shelter",
    icon: Home,
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
  },
]

const COMMUNITY_MENU: MenuItem[] = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Risk Map",
    path: "/risk-map",
    icon: Map,
  },
  {
    label: "Safety Alerts",
    path: "/alerts",
    icon: Bell,
  },
  {
    label: "Report Hazard",
    path: "/field-reports",
    icon: Flag,
  },
  {
    label: "My Reports",
    path: "/field-reports",
    icon: ClipboardList,
  },
  {
    label: "Safe Shelter",
    path: "/shelter",
    icon: Home,
  },
  {
    label: "Weather & Safety",
    path: "/weather",
    icon: CloudRain,
  },
  {
    label: "Safety Resources",
    path: "/resources",
    icon: BookOpen,
  },
  {
    label: "Emergency Help",
    path: "/emergency-help",
    icon: LifeBuoy,
  },
  {
    label: "Settings",
    path: "/settings",
    icon: Settings,
  },
]

function getMenuForRole(
  role: UserRole,
): MenuItem[] {
  if (role === "COMMUNITY") {
    return COMMUNITY_MENU
  }

  if (role === "FIELD_TEAM") {
    return FIELD_TEAM_MENU
  }

  return AUTHORITY_MENU
}

const COMMUNITY_SIDEBAR_TRANSLATIONS: Record<string, Record<string, string>> = {
  Hindi: {
    Dashboard: "डैशबोर्ड",
    "Risk Map": "जोखिम मानचित्र",
    "Safety Alerts": "सुरक्षा अलर्ट",
    "Report Hazard": "खतरे की रिपोर्ट",
    "My Reports": "मेरी रिपोर्ट",
    "Safe Shelter": "सुरक्षित आश्रय",
    "Weather & Safety": "मौसम और सुरक्षा",
    "Safety Resources": "सुरक्षा संसाधन",
    "Emergency Help": "आपातकालीन सहायता",
    Settings: "सेटिंग्स",
    "Main Menu": "मुख्य मेनू",
    Help: "सहायता",
    "Active role": "सक्रिय भूमिका",
    "Community User": "समुदाय उपयोगकर्ता",
    "Public Safety & Alerts": "सार्वजनिक सुरक्षा और अलर्ट",
    "Safety Companion": "सुरक्षा सहायक",
    "Report a Hazard": "खतरे की रिपोर्ट करें",
    "View warnings, check local risk information and submit a hazard report.": "चेतावनियां देखें, स्थानीय जोखिम जानकारी जांचें और खतरे की रिपोर्ट भेजें।",
    "System Online": "सिस्टम ऑनलाइन",
    "Backend Unavailable": "बैकएंड उपलब्ध नहीं",
  },
  Assamese: {
    Dashboard: "ডেশ্বব’ৰ্ড",
    "Risk Map": "ঝুঁকি মানচিত্ৰ",
    "Safety Alerts": "সুৰক্ষা সতৰ্কবাণী",
    "Report Hazard": "বিপদৰ ৰিপৰ্ট",
    "My Reports": "মোৰ ৰিপৰ্ট",
    "Safe Shelter": "নিৰাপদ আশ্ৰয়",
    "Weather & Safety": "বতৰ আৰু সুৰক্ষা",
    "Safety Resources": "সুৰক্ষা সম্পদ",
    "Emergency Help": "জৰুৰীকালীন সহায়",
    Settings: "ছেটিংছ",
    "Main Menu": "মূল মেনু",
    Help: "সহায়",
    "Active role": "সক্ৰিয় ভূমিকা",
    "Community User": "সম্প্ৰদায় ব্যৱহাৰকাৰী",
    "Public Safety & Alerts": "সাৰ্বজনীন সুৰক্ষা আৰু সতৰ্কবাণী",
    "Safety Companion": "সুৰক্ষা সহায়ক",
    "Report a Hazard": "বিপদৰ ৰিপৰ্ট কৰক",
    "View warnings, check local risk information and submit a hazard report.": "সতৰ্কবাণী চাওক, স্থানীয় ঝুঁকিৰ তথ্য পৰীক্ষা কৰক আৰু বিপদৰ ৰিপৰ্ট দাখিল কৰক।",
    "System Online": "চিষ্টেম অনলাইন",
    "Backend Unavailable": "বেকএণ্ড উপলব্ধ নহয়",
  },
  Mizo: {
    Dashboard: "Dashboard",
    "Risk Map": "Risk Map",
    "Safety Alerts": "Himna thuchah",
    "Report Hazard": "Thil hlauhawm report",
    "My Reports": "Ka report-te",
    "Safe Shelter": "Hmun him",
    "Weather & Safety": "Thliarhmun leh himna",
    "Safety Resources": "Himna resource",
    "Emergency Help": "Emergency puihna",
    Settings: "Settings",
    "Main Menu": "Menu bulpui",
    Help: "Puihna",
    "Active role": "Tunah hna",
    "Community User": "Khawtlang hmanrua",
    "Public Safety & Alerts": "Miten himna leh thuchah",
    "Safety Companion": "Himna puihna",
    "Report a Hazard": "Thil hlauhawm report rawh",
    "View warnings, check local risk information and submit a hazard report.": "Thuchah en rawh, hmun risk hriatna en rawh leh thil hlauhawm report rawh.",
    "System Online": "System Online",
    "Backend Unavailable": "Backend awm lo",
  },
  Bengali: {
    Dashboard: "ড্যাশবোর্ড",
    "Risk Map": "ঝুঁকি মানচিত্র",
    "Safety Alerts": "নিরাপত্তা সতর্কতা",
    "Report Hazard": "বিপদের রিপোর্ট",
    "My Reports": "আমার রিপোর্ট",
    "Safe Shelter": "নিরাপদ আশ্রয়",
    "Weather & Safety": "আবহাওয়া ও নিরাপত্তা",
    "Safety Resources": "নিরাপত্তা সংস্থান",
    "Emergency Help": "জরুরি সহায়তা",
    Settings: "সেটিংস",
    "Main Menu": "প্রধান মেনু",
    Help: "সহায়তা",
    "Active role": "সক্রিয় ভূমিকা",
    "Community User": "কমিউনিটি ব্যবহারকারী",
    "Public Safety & Alerts": "সর্বজনীন নিরাপত্তা ও সতর্কতা",
    "Safety Companion": "নিরাপত্তা সহায়ক",
    "Report a Hazard": "বিপদের রিপোর্ট করুন",
    "View warnings, check local risk information and submit a hazard report.": "সতর্কতা দেখুন, স্থানীয় ঝুঁকির তথ্য পরীক্ষা করুন এবং বিপদের রিপোর্ট জমা দিন।",
    "System Online": "সিস্টেম অনলাইন",
    "Backend Unavailable": "ব্যাকএন্ড উপলভ্য নয়",
  },
}

function communitySidebarText(
  language: string,
  text: string,
): string {
  if (language === "English") {
    return text
  }

  return COMMUNITY_SIDEBAR_TRANSLATIONS[language]?.[text] ?? text
}

function isPathActive(
  pathname: string,
  path: string,
) {
  if (path === "/") {
    return pathname === "/"
  }

  if (
    path === "/field-reports" &&
    pathname === "/field-reports"
  ) {
    return true
  }

  return pathname.startsWith(path)
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const {
    role,
    profile,
  } = useRole()

  const {
    language,
    t,
  } = useCommunityLanguage()

  const communityText = (value: string) =>
    language === "English"
      ? value
      : communitySidebarText(language, t(value))

  const [sidebarOpen, setSidebarOpen] =
    useState(false)

  const [activeAlerts, setActiveAlerts] =
    useState(0)

  const [backendOnline, setBackendOnline] =
    useState(false)

  const visibleMenu = useMemo(() => {
    if (!role) {
      return []
    }

    return getMenuForRole(role)
  }, [role])

  useEffect(() => {
    function toggleSidebar() {
      setSidebarOpen(
        (current) => !current,
      )
    }

    window.addEventListener(
      "bhoopehra:toggle-sidebar",
      toggleSidebar,
    )

    return () => {
      window.removeEventListener(
        "bhoopehra:toggle-sidebar",
        toggleSidebar,
      )
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSidebarStatus() {
      const [
        healthResult,
        alertResult,
      ] = await Promise.allSettled([
        fetch(
          `${API_BASE_URL}/health`,
          {
            cache: "no-store",
          },
        ),

        fetch(
          `${API_BASE_URL}/api/alerts?status=ACTIVE`,
          {
            cache: "no-store",
          },
        ),
      ])

      if (cancelled) {
        return
      }

      if (
        healthResult.status ===
          "fulfilled" &&
        healthResult.value.ok
      ) {
        try {
          const health =
            await healthResult.value.json()

          setBackendOnline(
            String(
              health?.status ?? "",
            ).toLowerCase() ===
              "healthy",
          )
        } catch {
          setBackendOnline(false)
        }
      } else {
        setBackendOnline(false)
      }

      if (
        alertResult.status ===
          "fulfilled" &&
        alertResult.value.ok
      ) {
        try {
          const payload =
            (await alertResult.value.json()) as
              | ActiveAlert[]
              | AlertResponse

          const records =
            Array.isArray(payload)
              ? payload
              : payload.data ??
                payload.alerts ??
                []

          const count =
            records.filter(
              (alert) => {
                const status =
                  alert.status?.toUpperCase()

                return (
                  status === "ACTIVE" ||
                  status === "OPEN" ||
                  status === "TRIGGERED"
                )
              },
            ).length

          setActiveAlerts(count)
        } catch {
          setActiveAlerts(0)
        }
      } else {
        setActiveAlerts(0)
      }
    }

    void loadSidebarStatus()

    const interval =
      window.setInterval(
        () => {
          void loadSidebarStatus()
        },
        60000,
      )

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (!profile || !role) {
    return null
  }

  return (
    <>
      {role === "COMMUNITY" && <CommunityLanguageController />}

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() =>
            setSidebarOpen(false)
          }
          className="fixed inset-0 z-[1090] bg-black/50lg:hidden"
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-0 z-[1100] flex w-[250px] flex-col border-r border-white/5 bg-[#07131f] text-slate-100 transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {/* BRAND */}
        <div className="flex h-[116px] shrink-0 items-center border-b border-white/5 px-4">
          <button
            type="button"
            onClick={() =>
              navigate("/")
            }
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
              <ShieldCheck
                size={23}
                className="text-emerald-400"
              />
            </div>

            <div>
              <div className="text-xl font-bold tracking-tight">
                Bhoo
                <span className="text-emerald-400">
                  Pehra
                </span>
              </div>

              <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-600">
                Landslide Intelligence
              </div>
            </div>
          </button>
        </div>

        {/* ROLE CARD */}
        <div className="shrink-0 border-b border-white/5 p-3">
          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.035] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-[10px] font-bold text-emerald-300">
                {profile.initials}
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-200">
                  {role === "COMMUNITY"
                    ? communityText(profile.title)
                    : profile.title}
                </p>

                <p className="mt-0.5 truncate text-[9px] text-slate-600">
                  {role === "COMMUNITY"
                    ? communityText(profile.department)
                    : profile.department}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
              <span className="flex items-center gap-1.5 text-[8px] uppercase tracking-wider text-slate-600">
                <Users className="h-3 w-3" />
                Active role
              </span>

              <span className="rounded-md bg-emerald-500/10 px-1.5 py-1 text-[8px] font-semibold text-emerald-400">
                {role === "AUTHORITY"
                  ? "AUTHORITY"
                  : role === "FIELD_TEAM"
                    ? "FIELD"
                    : "COMMUNITY"}
              </span>
            </div>
          </div>
        </div>

        {/* NAVIGATION */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
          <p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            {role === "COMMUNITY"
              ? communityText("Main Menu")
              : "Main Menu"}
          </p>

          <nav className="space-y-1">
            {visibleMenu.map(
              (item) => {
                const active =
                  isPathActive(
                    location.pathname,
                    item.path,
                  )

                const Icon =
                  item.icon

                return (
                  <button
                    key={`${item.label}-${item.path}`}
                    type="button"
                    onClick={() =>
                      navigate(
                        item.path,
                      )
                    }
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-slate-400 hover:bg-white/[0.035] hover:text-slate-200"
                    }`}
                  >
                    <Icon
                      size={17}
                      className={
                        active
                          ? "text-emerald-400"
                          : "text-slate-500 group-hover:text-slate-300"
                      }
                    />

                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {role === "COMMUNITY"
                        ? communityText(item.label)
                        : item.label}
                    </span>

                    {item.path ===
                      "/alerts" &&
                      activeAlerts >
                        0 && (
                        <span className="flex min-w-[19px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold text-white">
                          {activeAlerts >
                          99
                            ? "99+"
                            : activeAlerts}
                        </span>
                      )}

                    {active && (
                      <ChevronRight
                        size={13}
                        className="text-emerald-500/70"
                      />
                    )}
                  </button>
                )
              },
            )}
          </nav>

          {/* ROLE-SPECIFIC HELP / OPERATIONS */}
          {role === "AUTHORITY" && (
            <div className="mt-6 border-t border-white/5 pt-4">
              <p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Authority Tools
              </p>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/infrastructure",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <Building2
                    size={14}
                  />
                  Impact & Infrastructure
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/analytics",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <Activity
                    size={14}
                  />
                  Risk Analytics
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/reports",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <FileText
                    size={14}
                  />
                  Operational Reports
                </button>
              </div>
            </div>
          )}

          {role === "FIELD_TEAM" && (
            <div className="mt-6 border-t border-white/5 pt-4">
              <p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Field Operations
              </p>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/field-reports",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <Flag size={14} />
                  Report / Verify Hazard
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/infrastructure",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <MapPinned
                    size={14}
                  />
                  Infrastructure Risk
                </button>
              </div>
            </div>
          )}

          {role === "COMMUNITY" && (
            <div className="mt-6 border-t border-white/5 pt-4">
              <p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {role === "COMMUNITY"
                  ? communityText("Help")
                  : "Help"}
              </p>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/emergency-help",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <LifeBuoy
                    size={14}
                  />
                  {role === "COMMUNITY"
                    ? communityText("Emergency Help")
                    : "Emergency Help"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/settings",
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[10px] text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-300"
                >
                  <Settings
                    size={14}
                  />
                  {role === "COMMUNITY"
                    ? communityText("Settings")
                    : "Settings"}
                </button>
              </div>
            </div>
          )}

          {/* FIELD / COMMUNITY COMPANION */}
          <div className="mt-5 rounded-xl border border-slate-800 bg-[#091827] p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                {role ===
                "COMMUNITY" ? (
                  <ShieldCheck
                    size={15}
                    className="text-emerald-400"
                  />
                ) : (
                  <Smartphone
                    size={15}
                    className="text-emerald-400"
                  />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-semiboldtext-slate-300">
                  {role === "COMMUNITY"
                    ? communityText(profile.companionTitle)
                    : profile.companionTitle}
                </p>

                <p className="mt-1 text-[9px] leading-4text-slate-600">
                  {role === "COMMUNITY"
                    ? communityText(profile.companionDescription)
                    : profile.companionDescription}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  profile.companionPath,
                )
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[9px] font-semibold text-emerald-400 transitionhover:bg-emerald-500/15 hover:text-emerald-300"
            >
              {role === "COMMUNITY"
                ? communityText(profile.companionAction)
                : profile.companionAction}

              <ChevronRight
                size={12}
              />
            </button>
          </div>
        </div>

        {/* SYSTEM STATUS */}
        <div className="shrink-0 border-t border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            {backendOnline ? (
              <Wifi
                size={13}
                className="text-emerald-400"
              />
            ) : (
              <WifiOff
                size={13}
                className="text-red-400"
              />
            )}

            <span
              className={`text-[9px] font-semibold ${
                backendOnline
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {backendOnline
                ? "System Online"
                : "Backend Unavailable"}
            </span>
          </div>

          <div className="mt-1 text-[8px] leading-4 text-slate-700">
            BhooPehra Â· NER Landslide Prototype
          </div>
        </div>
      </aside>
    </>
  )
}
