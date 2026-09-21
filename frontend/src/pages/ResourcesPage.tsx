import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Flame,
  Globe2,
  HeartPulse,
  Home,
  Info,
  Languages,
  LifeBuoy,
  Map,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Smartphone,
  Tent,
  Users,
  XCircle,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
} from "react"
import { useRole } from "../context/RoleContext"

type Language =
  | "EN"
  | "HI"
  | "AS"
  | "MIZO"
  | "BN"

type Resource = {
  id?: number | string
  name?: string
  title?: string
  provider?: string
  source?: string
  description?: string
  url?: string
  link?: string
  category?: string
  type?: string
  resource_type?: string
  is_active?: boolean
}

type ResourcesResponse = {
  count?: number
  data?: Resource[]
}

type Shelter = {
  id?: number | string
  name?: string
  asset_name?: string
  title?: string
  capacity?: number | null
  latitude?: number | null
  longitude?: number | null
  distance_km?: number | null
  distance_m?: number | null
  mapped?: boolean
  location_verified?: boolean
  status?: string
}

type SheltersResponse = {
  count?: number
  registered_count?: number
  mapped_count?: number
  pending_location_count?: number
  data?: Shelter[]
  shelters?: Shelter[]
  message?: string
  status?: string
}

const LANGUAGE_OPTIONS: {
  key: Language
  label: string
  nativeLabel: string
}[] = [
  {
    key: "EN",
    label: "English",
    nativeLabel: "English",
  },
  {
    key: "HI",
    label: "Hindi",
    nativeLabel: "हिन्दी",
  },
  {
    key: "AS",
    label: "Assamese",
    nativeLabel: "অসমীয়া",
  },
  {
    key: "MIZO",
    label: "Mizo",
    nativeLabel: "Mizo",
  },
  {
    key: "BN",
    label: "Bengali",
    nativeLabel: "বাংলা",
  },
]

const SAFETY_CONTENT: Record<
  Language,
  {
    title: string
    subtitle: string
    immediate: string
    instructions: {
      title: string
      description: string
    }[]
  }
> = {
  EN: {
    title: "Landslide Safety Guidance",
    subtitle:
      "Simple actions to stay safer before, during and after landslide danger.",
    immediate:
      "If there is immediate danger, move to a safer location when possible and follow instructions from local authorities and emergency services.",
    instructions: [
      {
        title: "Move away from unstable slopes",
        description:
          "Stay away from fresh cracks, falling rocks, steep unstable slopes and visible ground movement.",
      },
      {
        title: "Do not cross blocked routes",
        description:
          "Never cross debris, flooded road sections or visibly damaged bridges and roads.",
      },
      {
        title: "Follow verified warnings",
        description:
          "Follow evacuation and safety instructions issued by local authorities and emergency services.",
      },
      {
        title: "Report hazards when safe",
        description:
          "Share the location, visible damage and photographs through BhooPehra when it is safe to do so.",
      },
    ],
  },

  HI: {
    title: "भूस्खलन सुरक्षा मार्गदर्शन",
    subtitle:
      "भूस्खलन के खतरे से पहले, दौरान और बाद में सुरक्षित रहने के लिए सरल कदम।",
    immediate:
      "यदि तत्काल खतरा हो, तो संभव होने पर सुरक्षित स्थान पर जाएँ और स्थानीय प्रशासन तथा आपातकालीन सेवाओं के निर्देशों का पालन करें।",
    instructions: [
      {
        title: "अस्थिर ढलानों से दूर रहें",
        description:
          "नई दरारों, गिरते पत्थरों, अस्थिर ढलानों और जमीन की हलचल से दूर रहें।",
      },
      {
        title: "बंद रास्तों को पार न करें",
        description:
          "मलबे, पानी से भरे रास्तों या क्षतिग्रस्त पुल और सड़कों को पार न करें।",
      },
      {
        title: "सत्यापित चेतावनियों का पालन करें",
        description:
          "स्थानीय प्रशासन और आपातकालीन सेवाओं द्वारा जारी निकासी एवं सुरक्षा निर्देशों का पालन करें।",
      },
      {
        title: "सुरक्षित होने पर खतरे की सूचना दें",
        description:
          "सुरक्षित होने पर स्थान, दिखाई देने वाली क्षति और तस्वीरें BhooPehra के माध्यम से साझा करें।",
      },
    ],
  },

  AS: {
    title: "ভূমিস্খলন সুৰক্ষা নিৰ্দেশনা",
    subtitle:
      "ভূমিস্খলনৰ আশংকাৰ আগতে, সময়ত আৰু পিছত সুৰক্ষিত থাকিবলৈ সহজ পদক্ষেপ।",
    immediate:
      "যদি তাৎক্ষণিক বিপদ থাকে, সম্ভৱ হ'লে নিৰাপদ স্থানলৈ যাওক আৰু স্থানীয় কৰ্তৃপক্ষ আৰু জৰুৰীকালীন সেৱাৰ নিৰ্দেশনা অনুসৰণ কৰক।",
    instructions: [
      {
        title: "অস্থিৰ পাহাৰৰ ঢালৰ পৰা আঁতৰি থাকক",
        description:
          "নতুন ফাট, সৰি পৰা শিল, অস্থিৰ ঢাল আৰু মাটিৰ দৃশ্যমান নড়াচড়াৰ পৰা আঁতৰি থাকক।",
      },
      {
        title: "বন্ধ পথ পাৰ নহ'ব",
        description:
          "ধ্বংসাৱশেষ, পানীত ডুব যোৱা পথ বা ক্ষতিগ্ৰস্ত দলং আৰু পথ পাৰ নহ'ব।",
      },
      {
        title: "সত্যাপিত সতৰ্কবাণী অনুসৰণ কৰক",
        description:
          "স্থানীয় কৰ্তৃপক্ষ আৰু জৰুৰীকালীন সেৱাই দিয়া নিৰ্দেশনা অনুসৰণ কৰক।",
      },
      {
        title: "নিৰাপদ হ'লে বিপদৰ খবৰ দিয়ক",
        description:
          "নিৰাপদ হ'লে স্থান, দৃশ্যমান ক্ষতি আৰু ফটো BhooPehra-ৰ জৰিয়তে শ্বেয়াৰ কৰক।",
      },
    ],
  },

  MIZO: {
    title: "Landslide Safety Guidance",
    subtitle:
      "Landslide hlauh hma, lai leh hnuah himna atan hmalakna pawimawh te.",
    immediate:
      "Danger a awm mek chuan, a theih chuan hmun him zawkah kal rawh leh local authority leh emergency service-te thuchhuah zawm rawh.",
    instructions: [
      {
        title: "Slope him lo te lakah in hla rawh",
        description:
          "Crack thar, lung tla, slope him lo leh lei insawina te lakah in hla rawh.",
      },
      {
        title: "Road khar te chu kal paltlang lo rawh",
        description:
          "Debris, tui luang luhna road, bridge emaw road hman theih lo te chu kal paltlang lo rawh.",
      },
      {
        title: "Warning dik te zawm rawh",
        description:
          "Local authority leh emergency service-te thuchhuah leh himna thu te zawm rawh.",
      },
      {
        title: "A him hnuah danger report rawh",
        description:
          "A him hnuah hmun, damage lang te leh photo te BhooPehra hmangin report rawh.",
      },
    ],
  },

  BN: {
    title: "ভূমিধস নিরাপত্তা নির্দেশিকা",
    subtitle:
      "ভূমিধসের ঝুঁকির আগে, সময়ে এবং পরে নিরাপদ থাকার জন্য সহজ পদক্ষেপ।",
    immediate:
      "তাৎক্ষণিক বিপদ থাকলে সম্ভব হলে নিরাপদ স্থানে চলে যান এবং স্থানীয় কর্তৃপক্ষ ও জরুরি পরিষেবার নির্দেশনা অনুসরণ করুন।",
    instructions: [
      {
        title: "অস্থিতিশীল ঢাল থেকে দূরে থাকুন",
        description:
          "নতুন ফাটল, পড়ন্ত পাথর, অস্থিতিশীল ঢাল এবং মাটির দৃশ্যমান নড়াচড়া থেকে দূরে থাকুন।",
      },
      {
        title: "বন্ধ রাস্তা পার হবেন না",
        description:
          "ধ্বংসাবশেষ, জলে ডুবে থাকা রাস্তা বা ক্ষতিগ্রস্ত সেতু ও রাস্তা পার হবেন না।",
      },
      {
        title: "যাচাইকৃত সতর্কতা অনুসরণ করুন",
        description:
          "স্থানীয় কর্তৃপক্ষ ও জরুরি পরিষেবার দেওয়া নিরাপত্তা এবং সরিয়ে নেওয়ার নির্দেশনা অনুসরণ করুন।",
      },
      {
        title: "নিরাপদ হলে বিপদের খবর দিন",
        description:
          "নিরাপদ হলে অবস্থান, দৃশ্যমান ক্ষতি এবং ছবি BhooPehra-এর মাধ্যমে শেয়ার করুন।",
      },
    ],
  },
}

const PREPAREDNESS_ITEMS = [
  {
    icon: Smartphone,
    title: "Keep your phone charged",
    description:
      "Keep your phone, power bank and essential communication devices ready.",
  },
  {
    icon: LifeBuoy,
    title: "Basic first-aid",
    description:
      "Keep a basic first-aid kit and essential personal medicines accessible.",
  },
  {
    icon: Tent,
    title: "Emergency essentials",
    description:
      "Keep drinking water, dry food, a torch and spare batteries ready.",
  },
  {
    icon: FileText,
    title: "Important documents",
    description:
      "Keep essential identification and important documents protected and accessible.",
  },
  {
    icon: Users,
    title: "Family contact plan",
    description:
      "Agree on a safe meeting point and a way to contact family members.",
  },
  {
    icon: Navigation,
    title: "Know safer routes",
    description:
      "Use verified routes and avoid steep slopes, debris and visibly damaged roads.",
  },
]

const TRUSTED_SOURCE_NAMES = [
  "GSI NLFC",
  "ISRO Landslide Atlas",
  "IMD",
  "GSI Bhukosh",
  "Bhuvan",
]

function normalizeResourceName(
  resource: Resource,
): string {
  return String(
    resource.name ??
      resource.title ??
      resource.provider ??
      resource.source ??
      "",
  ).trim()
}

function getResourceUrl(
  resource: Resource,
): string {
  return String(
    resource.url ??
      resource.link ??
      "",
  ).trim()
}

function getResourceDescription(
  resource: Resource,
): string {
  return String(
    resource.description ??
      "Trusted information source available through BhooPehra.",
  ).trim()
}

function isTrustedResource(
  resource: Resource,
): boolean {
  const name = normalizeResourceName(
    resource,
  ).toLowerCase()

  return TRUSTED_SOURCE_NAMES.some(
    (trustedName) =>
      name ===
        trustedName.toLowerCase() ||
      name.includes(
        trustedName.toLowerCase(),
      ),
  )
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-[#0b1724] ${className}`}
    >
      {children}
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldAlert
  title: string
  description: string
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
        <Icon size={20} />
      </div>

      <div className="min-w-0">
        <h2 className="font-semibold text-white">
          {title}
        </h2>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: typeof ArrowRight
  label: string
  onClick: () => void
  tone?: "default" | "danger" | "success"
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
      : tone === "success"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
        : "border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-900"

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${toneClass}`}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

function openPage(path: string) {
  window.location.assign(path)
}

function CommunityResourcesContent() {
  const [language, setLanguage] =
    useState<Language>("EN")

  const [resources, setResources] =
    useState<Resource[]>([])

  const [resourcesLoading, setResourcesLoading] =
    useState(true)

  const [resourcesError, setResourcesError] =
    useState("")

  const [shelters, setShelters] =
    useState<Shelter[]>([])

  const [shelterStatus, setShelterStatus] =
    useState<
      | "LOCATION_REQUIRED"
      | "LOADING"
      | "AVAILABLE"
      | "PENDING"
      | "ERROR"
    >("LOCATION_REQUIRED")

  const [shelterMessage, setShelterMessage] =
    useState("")

  const [expandedSafety, setExpandedSafety] =
    useState<number | null>(null)

  const safetyContent =
    SAFETY_CONTENT[language]

  useEffect(() => {
    let cancelled = false

    async function loadResources() {
      try {
        setResourcesLoading(true)
        setResourcesError("")

        const response =
          await fetch("/api/resources", {
            method: "GET",
            cache: "no-store",
          })

        if (!response.ok) {
          throw new Error(
            `Resources request failed with HTTP ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as ResourcesResponse

        if (cancelled) {
          return
        }

        const data = Array.isArray(
          payload.data,
        )
          ? payload.data
          : []

        setResources(data)
      } catch (error) {
        if (cancelled) {
          return
        }

        console.error(
          "Community resources load failed:",
          error,
        )

        setResources([])
        setResourcesError(
          "Trusted resource information is currently unavailable.",
        )
      } finally {
        if (!cancelled) {
          setResourcesLoading(false)
        }
      }
    }

    void loadResources()

    return () => {
      cancelled = true
    }
  }, [])

  const trustedResources = useMemo(
    () =>
      resources
        .filter(isTrustedResource)
        .filter(
          (resource) =>
            resource.is_active !== false,
        )
        .slice(0, 6),
    [resources],
  )

  function requestShelters() {
    if (!navigator.geolocation) {
      setShelterStatus("ERROR")
      setShelterMessage(
        "Location services are not available in this browser.",
      )
      return
    }

    setShelterStatus("LOADING")
    setShelterMessage(
      "Requesting your location…",
    )

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude =
            position.coords.latitude

          const longitude =
            position.coords.longitude

          const response =
            await fetch(
              `/api/shelters/nearest?latitude=${encodeURIComponent(
                latitude,
              )}&longitude=${encodeURIComponent(
                longitude,
              )}`,
              {
                method: "GET",
                cache: "no-store",
              },
            )

          if (!response.ok) {
            throw new Error(
              `Shelter request failed with HTTP ${response.status}`,
            )
          }

          const payload =
            (await response.json()) as SheltersResponse

          const candidateShelters =
            Array.isArray(
              payload.data,
            )
              ? payload.data
              : Array.isArray(
                    payload.shelters,
                  )
                ? payload.shelters
                : []

          const mappedShelters =
            candidateShelters.filter(
              (shelter) => {
                const hasCoordinates =
                  typeof shelter.latitude ===
                    "number" &&
                  typeof shelter.longitude ===
                    "number"

                const explicitlyMapped =
                  shelter.mapped === true ||
                  shelter.location_verified ===
                    true

                return (
                  hasCoordinates &&
                  (
                    explicitlyMapped ||
                    shelter.mapped === undefined
                  )
                )
              },
            )

          setShelters(mappedShelters)

          if (
            mappedShelters.length > 0
          ) {
            setShelterStatus(
              "AVAILABLE",
            )
            setShelterMessage(
              "Verified mapped shelter information is available for your location.",
            )
          } else {
            setShelterStatus(
              "PENDING",
            )
            setShelterMessage(
              "Registered shelters may exist, but no verified mapped shelter location is currently available.",
            )
          }
        } catch (error) {
          console.error(
            "Community shelter lookup failed:",
            error,
          )

          setShelters([])
          setShelterStatus("ERROR")
          setShelterMessage(
            "Verified shelter information could not be retrieved.",
          )
        }
      },
      (error) => {
        console.warn(
          "Community location request failed:",
          error,
        )

        setShelters([])
        setShelterStatus(
          "LOCATION_REQUIRED",
        )
        setShelterMessage(
          "Location permission is required to find verified nearby shelter information.",
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 300000,
      },
    )
  }

  return (
    <div className="min-h-full bg-[#07121d] px-5 py-6 text-slate-200 md:px-7">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <span>
                  Community
                </span>

                <ChevronRight
                  size={13}
                />

                <span className="text-slate-300">
                  Safety Resources
                </span>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <LifeBuoy size={22} />
                </div>

                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                    Community Safety Resources
                  </h1>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    Emergency help, safe-location information,
                    preparedness guidance and trusted public
                    safety resources for community members.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0b1724] p-2">
              <div className="mb-2 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Languages
                  size={13}
                  className="text-emerald-400"
                />
                Safety Language
              </div>

              <div className="flex flex-wrap gap-1.5">
                {LANGUAGE_OPTIONS.map(
                  (option) => {
                    const active =
                      language ===
                      option.key

                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() =>
                          setLanguage(
                            option.key,
                          )
                        }
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                        }`}
                        aria-pressed={
                          active
                        }
                      >
                        {option.nativeLabel}
                      </button>
                    )
                  },
                )}
              </div>
            </div>
          </div>
        </div>

        <Card className="mb-6 border-red-500/20 bg-[#0d1722] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <Siren size={21} />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">
                  Immediate danger?
                </p>

                <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-400">
                  Do not wait for the dashboard. Move to a safer
                  location when possible and follow instructions
                  from local authorities and emergency services.
                </p>
              </div>
            </div>

            <ActionButton
              icon={AlertTriangle}
              label="Report a Hazard"
              tone="danger"
              onClick={() =>
                openPage(
                  "/field-reports",
                )
              }
            />
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <SectionHeader
              icon={Phone}
              title="Emergency Contacts"
              description="Use verified local emergency-service information. Contact details are shown only when configured and verified by the system."
            />

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                    <HeartPulse
                      size={19}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      Medical Emergency
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      For injuries or urgent medical situations,
                      contact the appropriate local emergency
                      medical service.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                    <Flame size={19} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      Police / Fire / Rescue
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Contact the appropriate emergency service
                      when there is immediate danger to life or
                      property.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                    <ShieldAlert
                      size={19}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      Disaster Management Authority
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Follow verified instructions from the local
                      district administration and disaster
                      management authority.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <Info
                    size={17}
                    className="mt-0.5 shrink-0 text-amber-400"
                  />

                  <p className="text-xs leading-5 text-slate-400">
                    Verified local contact numbers are not
                    configured in the current Community resource
                    registry. No unverified phone number is
                    displayed here.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader
              icon={Home}
              title="Safe Locations"
              description="Find verified mapped shelters when location data is available."
            />

            {shelterStatus ===
              "LOCATION_REQUIRED" && (
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <MapPin
                      size={19}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">
                      Find verified nearby shelters
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Your location is required to check nearby
                      mapped shelter information.
                    </p>

                    {shelterMessage && (
                      <p className="mt-3 text-xs text-amber-400">
                        {shelterMessage}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={
                        requestShelters
                      }
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15"
                    >
                      <Navigation
                        size={15}
                      />
                      Use My Location
                    </button>
                  </div>
                </div>
              </div>
            )}

            {shelterStatus ===
              "LOADING" && (
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
                    <Navigation
                      size={18}
                      className="animate-pulse"
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">
                      Checking nearby shelter information…
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Only verified mapped locations will be
                      displayed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {shelterStatus ===
              "PENDING" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                    <Home
                      size={19}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">
                      No verified mapped shelter available
                    </p>

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Registered shelter information may exist,
                      but unverified coordinates are not presented
                      as mapped locations.
                    </p>

                    <p className="mt-3 text-xs text-amber-400">
                      {shelterMessage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {shelterStatus ===
              "ERROR" && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="flex items-start gap-3">
                  <XCircle
                    size={19}
                    className="mt-0.5 shrink-0 text-red-400"
                  />

                  <div>
                    <p className="text-sm font-semibold text-white">
                      Shelter information unavailable
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {shelterMessage}
                    </p>

                    <button
                      type="button"
                      onClick={
                        requestShelters
                      }
                      className="mt-4 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                    >
                      Try location lookup again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {shelterStatus ===
              "AVAILABLE" &&
              shelters.length > 0 && (
                <div className="space-y-3">
                  {shelters
                    .slice(0, 4)
                    .map(
                      (
                        shelter,
                        index,
                      ) => {
                        const name =
                          shelter.name ??
                          shelter.asset_name ??
                          shelter.title ??
                          `Verified Shelter ${index + 1}`

                        const distance =
                          typeof shelter.distance_km ===
                          "number"
                            ? `${shelter.distance_km.toFixed(
                                1,
                              )} km`
                            : typeof shelter.distance_m ===
                                "number"
                              ? `${(
                                  shelter.distance_m /
                                  1000
                                ).toFixed(
                                  1,
                                )} km`
                              : "Distance unavailable"

                        return (
                          <div
                            key={
                              String(
                                shelter.id ??
                                  index,
                              )
                            }
                            className="rounded-xl border border-slate-800 bg-[#08131f] p-4"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                                <Home
                                  size={
                                    18
                                  }
                                />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-white">
                                    {name}
                                  </p>

                                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                                    Mapped
                                  </span>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                                  <span>
                                    {distance}
                                  </span>

                                  {typeof shelter.capacity ===
                                    "number" && (
                                    <span>
                                      Capacity:{" "}
                                      {
                                        shelter.capacity
                                      }
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      },
                    )}
                </div>
              )}
          </Card>
        </div>

        <div className="mt-6">
          <Card className="p-5">
            <SectionHeader
              icon={LifeBuoy}
              title="Emergency Preparedness"
              description="Simple things community members can prepare before an emergency."
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PREPAREDNESS_ITEMS.map(
                (item) => {
                  const Icon =
                    item.icon

                  return (
                    <div
                      key={
                        item.title
                      }
                      className="rounded-xl border border-slate-800 bg-[#08131f] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
                          <Icon
                            size={18}
                          />
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-white">
                            {item.title}
                          </p>

                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {
                              item.description
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                },
              )}
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <Card className="overflow-hidden border-red-500/20">
            <div className="border-b border-slate-800 bg-[#0d1824] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                  <ShieldAlert
                    size={21}
                  />
                </div>

                <div>
                  <h2 className="font-semibold text-white">
                    {
                      safetyContent.title
                    }
                  </h2>

                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    {
                      safetyContent.subtitle
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 shrink-0 text-red-400"
                  />

                  <p className="text-xs leading-5 text-slate-300">
                    {
                      safetyContent.immediate
                    }
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {safetyContent.instructions.map(
                  (
                    instruction,
                    index,
                  ) => {
                    const expanded =
                      expandedSafety ===
                      index

                    return (
                      <div
                        key={
                          instruction.title
                        }
                        className="rounded-xl border border-slate-800 bg-[#08131f]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSafety(
                              expanded
                                ? null
                                : index,
                            )
                          }
                          className="flex w-full items-center gap-3 p-4 text-left"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-400">
                            {index +
                              1}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-white">
                              {
                                instruction.title
                              }
                            </span>

                            {!expanded && (
                              <span className="mt-1 block truncate text-xs text-slate-600">
                                {
                                  instruction.description
                                }
                              </span>
                            )}
                          </span>

                          <ChevronRight
                            size={16}
                            className={`shrink-0 text-slate-600 transition ${
                              expanded
                                ? "rotate-90 text-emerald-400"
                                : ""
                            }`}
                          />
                        </button>

                        {expanded && (
                          <div className="border-t border-slate-800 px-4 pb-4 pt-3 pl-[60px]">
                            <p className="text-xs leading-6 text-slate-400">
                              {
                                instruction.description
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  },
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <Card className="p-5">
            <SectionHeader
              icon={Map}
              title="Safety Actions"
              description="Quick access to the tools community members are most likely to need."
            />

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() =>
                  openPage(
                    "/risk-map",
                  )
                }
                className="group rounded-xl border border-slate-800 bg-[#08131f] p-4 text-left transition hover:border-blue-500/20 hover:bg-[#0b1826]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                  <Map size={19} />
                </div>

                <p className="text-sm font-semibold text-white">
                  Check Risk Map
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  View available monitored risk zones and
                  location-specific intelligence.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-400">
                  Open map
                  <ArrowRight
                    size={14}
                    className="transition group-hover:translate-x-1"
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  openPage(
                    "/alerts",
                  )
                }
                className="group rounded-xl border border-slate-800 bg-[#08131f] p-4 text-left transition hover:border-amber-500/20 hover:bg-[#0b1826]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <AlertTriangle
                    size={19}
                  />
                </div>

                <p className="text-sm font-semibold text-white">
                  View Warnings
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Review verified alerts and warning information
                  available from the system.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-400">
                  View warnings
                  <ArrowRight
                    size={14}
                    className="transition group-hover:translate-x-1"
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  openPage(
                    "/field-reports",
                  )
                }
                className="group rounded-xl border border-slate-800 bg-[#08131f] p-4 text-left transition hover:border-red-500/20 hover:bg-[#0b1826]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                  <AlertTriangle
                    size={19}
                  />
                </div>

                <p className="text-sm font-semibold text-white">
                  Report a Hazard
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Report landslides, cracks, road blockage or
                  other visible hazards.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-red-400">
                  Submit report
                  <ArrowRight
                    size={14}
                    className="transition group-hover:translate-x-1"
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  openPage(
                    "/field-reports",
                  )
                }
                className="group rounded-xl border border-slate-800 bg-[#08131f] p-4 text-left transition hover:border-emerald-500/20 hover:bg-[#0b1826]"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <FileText
                    size={19}
                  />
                </div>

                <p className="text-sm font-semibold text-white">
                  My Reports
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  View and track community hazard reports and
                  their verification status.
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  View reports
                  <ArrowRight
                    size={14}
                    className="transition group-hover:translate-x-1"
                  />
                </div>
              </button>
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <Card className="p-5">
            <SectionHeader
              icon={Globe2}
              title="Trusted Official Sources"
              description="Public information sources that are relevant to landslide awareness and disaster safety."
            />

            {resourcesLoading && (
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-5">
                <p className="text-sm font-semibold text-white">
                  Loading trusted sources…
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Reading the BhooPehra resource registry.
                </p>
              </div>
            )}

            {!resourcesLoading &&
              resourcesError && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="flex items-start gap-3">
                    <Info
                      size={18}
                      className="mt-0.5 shrink-0 text-amber-400"
                    />

                    <div>
                      <p className="text-sm font-semibold text-white">
                        Trusted source list unavailable
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {resourcesError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {!resourcesLoading &&
              !resourcesError &&
              trustedResources.length ===
                0 && (
                <div className="rounded-xl border border-slate-800 bg-[#08131f] p-5">
                  <div className="flex items-start gap-3">
                    <XCircle
                      size={18}
                      className="mt-0.5 shrink-0 text-slate-500"
                    />

                    <div>
                      <p className="text-sm font-semibold text-white">
                        No trusted source links currently available
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        The Community view does not display
                        unverified or unknown resource entries.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {!resourcesLoading &&
              !resourcesError &&
              trustedResources.length >
                0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {trustedResources.map(
                    (
                      resource,
                      index,
                    ) => {
                      const name =
                        normalizeResourceName(
                          resource,
                        )

                      const url =
                        getResourceUrl(
                          resource,
                        )

                      const description =
                        getResourceDescription(
                          resource,
                        )

                      return (
                        <div
                          key={
                            String(
                              resource.id ??
                                name ??
                                index,
                            )
                          }
                          className="rounded-xl border border-slate-800 bg-[#08131f] p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                              <BookOpen
                                size={18}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-white">
                                  {name}
                                </p>

                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                                  Trusted
                                </span>
                              </div>

                              <p className="mt-2 text-xs leading-5 text-slate-500">
                                {description}
                              </p>

                              {url && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.open(
                                      url,
                                      "_blank",
                                      "noopener,noreferrer",
                                    )
                                  }
                                  className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                                >
                                  Open source
                                  <ExternalLink
                                    size={
                                      13
                                    }
                                  />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    },
                  )}
                </div>
              )}
          </Card>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-[#0b1724] p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={19}
              className="mt-0.5 shrink-0 text-emerald-400"
            />

            <div>
              <p className="text-sm font-semibold text-white">
                Community information policy
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                BhooPehra shows community safety information only
                when it is supported by available system data.
                Missing, unmapped or unverified information is
                intentionally shown as unavailable or pending
                verification rather than estimated.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type OperationalResource = Resource

function resourceName(resource: OperationalResource) {
  return String(
    resource.name ??
      resource.title ??
      resource.provider ??
      resource.source ??
      "Unnamed resource",
  ).trim()
}

function resourceDescription(resource: OperationalResource) {
  return String(
    resource.description ??
      "No description is currently available in the backend resource registry.",
  ).trim()
}

function resourceUrl(resource: OperationalResource) {
  return String(resource.url ?? resource.link ?? "").trim()
}

function resourceCategory(resource: OperationalResource) {
  return String(
    resource.category ??
      resource.type ??
      resource.resource_type ??
      "Operational reference",
  ).trim()
}

function OperationalResourceCard({
  resource,
}: {
  resource: OperationalResource
}) {
  const url = resourceUrl(resource)

  return (
    <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <BookOpen size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">
              {resourceName(resource)}
            </p>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
              Registered
            </span>
          </div>

          <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">
            {resourceCategory(resource)}
          </p>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            {resourceDescription(resource)}
          </p>

          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Open source
              <ExternalLink size={13} />
            </a>
          ) : (
            <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-semibold text-slate-600">
              Source link unavailable
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function RoleResourcesContent({
  role,
}: {
  role: "AUTHORITY" | "FIELD_TEAM"
}) {
  const [resources, setResources] = useState<OperationalResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadResources() {
      try {
        setLoading(true)
        setError("")

        const response = await fetch("/api/resources", {
          method: "GET",
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = (await response.json()) as ResourcesResponse
        const data = Array.isArray(payload.data) ? payload.data : []

        if (!cancelled) {
          setResources(data.filter((resource) => resource.is_active !== false))
        }
      } catch (requestError) {
        console.error("Operational resources load failed:", requestError)
        if (!cancelled) {
          setResources([])
          setError(
            "The backend resource registry is currently unavailable. No unverified resource information is displayed.",
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadResources()

    return () => {
      cancelled = true
    }
  }, [])

  const isAuthority = role === "AUTHORITY"
  const title = isAuthority
    ? "Authority Operational Resources"
    : "Field Operations Resources"
  const subtitle = isAuthority
    ? "Authoritative reference sources for DDMA risk monitoring, verification, impact assessment and operational decision support."
    : "Trusted reference sources for field verification, hazard reporting, infrastructure checks and safe field operations."
  const eyebrow = isAuthority ? "Authority / DDMA" : "Field Operations"
  const policyTitle = isAuthority
    ? "Authority resource policy"
    : "Field resource policy"
  const policyText = isAuthority
    ? "These resources provide reference information only. They do not directly change risk, verify reports, generate alerts or assign response teams."
    : "These resources support field operations only. They do not directly change risk, verify reports or alter Authority decisions."

  return (
    <div className="min-h-full bg-[#07121d] px-5 py-6 text-slate-200 md:px-7">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <span>{eyebrow}</span>
              <span>/</span>
              <span className="text-slate-300">Resources</span>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <BookOpen size={22} />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  {title}
                </h1>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
                  {subtitle}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-[#0b1724] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-emerald-400" />
            <div>
              <h2 className="font-semibold text-white">Backend Resource Registry</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Active resource entries are loaded from the BhooPehra backend. Missing descriptions or links are shown as unavailable rather than fabricated.
              </p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-white">Resource registry unavailable</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{error}</p>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="mb-6 rounded-2xl border border-slate-800 bg-[#0b1724] p-6">
            <p className="text-sm font-semibold text-white">Loading operational resources…</p>
            <p className="mt-1 text-xs text-slate-500">Reading the backend resource registry.</p>
          </div>
        ) : resources.length === 0 ? (
          <div className="mb-6 rounded-2xl border border-slate-800 bg-[#0b1724] p-6">
            <div className="flex items-start gap-3">
              <XCircle size={18} className="mt-0.5 shrink-0 text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-white">No active resources registered</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  The backend returned no active resource entries for this operational view.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-5 md:grid-cols-3">
              <Card className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-slate-600">Registry entries</p>
                <p className="mt-2 text-2xl font-semibold text-white">{resources.length}</p>
                <p className="mt-1 text-[10px] text-slate-600">Active backend entries</p>
              </Card>
              <Card className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-slate-600">Role</p>
                <p className="mt-2 text-2xl font-semibold text-white">{isAuthority ? "DDMA" : "FIELD"}</p>
                <p className="mt-1 text-[10px] text-slate-600">Role-specific resource view</p>
              </Card>
              <Card className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-slate-600">Data source</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">LIVE</p>
                <p className="mt-1 text-[10px] text-slate-600">BhooPehra backend registry</p>
              </Card>
            </div>

            <Card className="mb-6 p-5">
              <SectionHeader
                icon={ShieldCheck}
                title={isAuthority ? "DDMA Reference Sources" : "Field Reference Sources"}
                description={
                  isAuthority
                    ? "Registered sources available to support Authority monitoring and operational decisions."
                    : "Registered sources available to support field verification and operational awareness."
                }
              />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {resources.map((resource, index) => (
                  <OperationalResourceCard
                    key={String(resource.id ?? `${resourceName(resource)}-${index}`)}
                    resource={resource}
                  />
                ))}
              </div>
            </Card>
          </>
        )}

        <div className="rounded-2xl border border-slate-800 bg-[#0b1724] p-5">
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 shrink-0 text-sky-400" />
            <div>
              <p className="text-sm font-semibold text-white">{policyTitle}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{policyText}</p>
            </div>
          </div>
        </div>

        <div className="pb-8 pt-5 text-center text-[10px] text-slate-700">
          BhooPehra · {isAuthority ? "DDMA / Authority" : "Field Team"} Resources
        </div>
      </div>
    </div>
  )
}

export default function ResourcesPage() {
  const { role } = useRole()

  if (role === "COMMUNITY") {
    return <CommunityResourcesContent />
  }

  if (role === "FIELD_TEAM") {
    return <RoleResourcesContent role="FIELD_TEAM" />
  }

  return <RoleResourcesContent role="AUTHORITY" />
}
