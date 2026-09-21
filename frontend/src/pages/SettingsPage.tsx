import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  Globe2,
  LocateFixed,
  Monitor,
  Save,
  Settings2,
  ShieldAlert,
  Smartphone,
  Volume2,
  Wifi,
  WifiOff,
  MapPin,
  Languages,
  Accessibility,
  Info,
  RotateCcw,
} from "lucide-react"
import { useEffect, useState } from "react"

import { useRole } from "../context/RoleContext"
import { useCommunityLanguage } from "../i18n/communityLanguage"

type ToggleProps = {
  enabled: boolean
  onChange: () => void
  label: string
  description: string
  disabled?: boolean
}

function Toggle({
  enabled,
  onChange,
  label,
  description,
  disabled = false,
  translate,
}: ToggleProps & {
  translate?: (value: string) => string
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-slate-800 py-4 last:border-b-0">
      <div>
        <p className="text-xs font-medium text-slate-200">
          {translate ? translate(label) : label}
        </p>
        <p className="mt-1 max-w-xl text-[11px] leading-5 text-slate-600">
          {translate ? translate(description) : description}
        </p>
      </div>

      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        aria-label={`Toggle ${label}`}
        aria-pressed={enabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          enabled ? "bg-emerald-500" : "bg-slate-700"
        } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  )
}

function SettingSelect({
  label,
  description,
  value,
  options,
  onChange,
  translate,
}: {
  label: string
  description: string
  value: string
  options: string[]
  onChange: (value: string) => void
  translate?: (value: string) => string
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-slate-800 py-4 last:border-b-0 sm:flex-row sm:items-center">
      <div>
        <p className="text-xs font-medium text-slate-200">{label}</p>
        <p className="mt-1 max-w-xl text-[11px] leading-5 text-slate-600">
          {description}
        </p>
      </div>

      <div className="relative shrink-0">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-[175px] appearance-none rounded-lg border border-slate-800 bg-[#081521] px-3 pr-9 text-xs text-slate-300 outline-none focus:border-emerald-500/30"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {translate ? translate(option) : option}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
        />
      </div>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  translate,
}: {
  icon: typeof Bell
  title: string
  description: string
  translate?: (value: string) => string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
        <Icon size={17} className="text-emerald-400" />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-100">
          {translate ? translate(title) : title}
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {translate ? translate(description) : description}
        </p>
      </div>
    </div>
  )
}

const STORAGE_KEY = "bhoopehra:community-settings"

type CommunitySettings = {
  language: string
  alertLevel: string
  rainfallAlerts: boolean
  browserNotifications: boolean
  soundAlerts: boolean
  useLocationOnWeather: boolean
  locationPermissionState: string
  offlineMode: boolean
  autoRefresh: boolean
  refreshInterval: string
  highContrast: boolean
  largeText: boolean
}

const DEFAULT_SETTINGS: CommunitySettings = {
  language: "English",
  alertLevel: "High & Critical",
  rainfallAlerts: true,
  browserNotifications: false,
  soundAlerts: false,
  useLocationOnWeather: true,
  locationPermissionState: "Not checked",
  offlineMode: true,
  autoRefresh: true,
  refreshInterval: "5 minutes",
  highContrast: false,
  largeText: false,
}

function readStoredSettings(): CommunitySettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return DEFAULT_SETTINGS
    }

    const parsed = JSON.parse(raw) as Partial<CommunitySettings>

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "Not supported"
  }

  return Notification.permission
}

export default function SettingsPage() {
  const { role, profile } = useRole()
  const isCommunity = role === "COMMUNITY"
  const { language, setLanguage, t } = useCommunityLanguage()

  const [settings, setSettings] =
    useState<CommunitySettings>(DEFAULT_SETTINGS)

  const [saved, setSaved] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [locationChecking, setLocationChecking] = useState(false)

  useEffect(() => {
    const stored = readStoredSettings()
    setLanguage(
      stored.language === "Hindi" ||
      stored.language === "Assamese" ||
      stored.language === "Mizo" ||
      stored.language === "Bengali"
        ? stored.language
        : "English",
    )

    setSettings({
      ...stored,
      language,
      browserNotifications:
        stored.browserNotifications &&
        getNotificationPermission() === "granted",
      locationPermissionState:
        stored.locationPermissionState !== "Not checked"
          ? stored.locationPermissionState
          : "Not checked",
    })
  }, [])

  const updateSetting = <K extends keyof CommunitySettings>(
    key: K,
    value: CommunitySettings[K],
  ) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
    setSaved(false)
    setStatusMessage("")
  }

  const handleSave = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      setSaved(true)
      setStatusMessage(t("Your community safety preferences are saved on this device."))

      window.setTimeout(() => {
        setSaved(false)
      }, 2500)
    } catch {
      setSaved(false)
      setStatusMessage(t("Unable to save preferences on this device."))
    }
  }

  const handleReset = () => {
    setLanguage("English")
    setSettings({
      ...DEFAULT_SETTINGS,
      language: "English",
      browserNotifications: getNotificationPermission() === "granted",
    })
    setSaved(false)
    setStatusMessage(t("Preferences reset. Save to keep the reset on this device."))
  }

  const handleBrowserNotifications = async () => {
    if (!("Notification" in window)) {
      updateSetting("browserNotifications", false)
      setStatusMessage(
        t("This browser does not support notifications. In-app safety information remains available."),
      )
      return
    }

    if (settings.browserNotifications) {
      updateSetting("browserNotifications", false)
      setStatusMessage(t("Browser notifications are disabled for this device."))
      return
    }

    if (Notification.permission === "denied") {
      updateSetting("browserNotifications", false)
      setStatusMessage(
        t("Browser notifications are blocked. Allow notifications in your browser site settings, then try again."),
      )
      return
    }

    const permission = await Notification.requestPermission()

    if (permission === "granted") {
      updateSetting("browserNotifications", true)
      setStatusMessage(t("Browser notifications are enabled on this device."))
      return
    }

    updateSetting("browserNotifications", false)
    setStatusMessage(
      t("Browser notification permission was not granted. You can still view alerts inside BhooPehra."),
    )
  }

  const checkLocationPermission = () => {
    setLocationChecking(true)
    setStatusMessage(t("Checking browser location access…"))

    if (!navigator.geolocation) {
      updateSetting("locationPermissionState", "Not supported")
      setLocationChecking(false)
      setStatusMessage(t("Location is not supported by this browser."))
      return
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        updateSetting("locationPermissionState", "Granted")
        updateSetting("useLocationOnWeather", true)
        setLocationChecking(false)
        setStatusMessage(
          t("Location access is working. Weather can use your detected location when requested."),
        )
      },
      (error) => {
        const state =
          error.code === error.PERMISSION_DENIED
            ? "Denied"
            : error.code === error.TIMEOUT
              ? "Timed out"
              : "Unavailable"

        updateSetting("locationPermissionState", state)
        setLocationChecking(false)

        if (state === "Denied") {
          setStatusMessage(
            t("Location access is denied. Allow location access in the browser if you want area-based weather and risk matching."),
          )
        } else {
          setStatusMessage(
            t("The browser could not determine your location right now. You can try again later."),
          )
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    )
  }

  type OperationalSettings = {
    alertSeverity: string
    browserNotifications: boolean
    soundAlerts: boolean
    autoRefresh: boolean
    refreshInterval: string
    useDeviceLocation: boolean
    locationPermissionState: string
    offlineMode: boolean
    largeText: boolean
  }

  const operationalStorageKey =
    role === "FIELD_TEAM"
      ? "bhoopehra:field-team-settings"
      : "bhoopehra:authority-settings"

  const operationalDefaults: OperationalSettings = {
    alertSeverity: role === "FIELD_TEAM" ? "High & Critical" : "All verified alerts",
    browserNotifications: false,
    soundAlerts: false,
    autoRefresh: true,
    refreshInterval: role === "FIELD_TEAM" ? "1 minute" : "5 minutes",
    useDeviceLocation: role === "FIELD_TEAM",
    locationPermissionState: "Not checked",
    offlineMode: role === "FIELD_TEAM",
    largeText: false,
  }

  const [operationalSettings, setOperationalSettings] =
    useState<OperationalSettings>(operationalDefaults)
  const [operationalSaved, setOperationalSaved] = useState(false)
  const [operationalStatus, setOperationalStatus] = useState("")
  const [operationalLocationChecking, setOperationalLocationChecking] =
    useState(false)

  useEffect(() => {
    if (isCommunity) {
      return
    }

    try {
      const raw = window.localStorage.getItem(operationalStorageKey)
      const stored = raw
        ? (JSON.parse(raw) as Partial<OperationalSettings>)
        : {}

      setOperationalSettings({
        ...operationalDefaults,
        ...stored,
        browserNotifications:
          Boolean(stored.browserNotifications) &&
          getNotificationPermission() === "granted",
      })
    } catch {
      setOperationalSettings(operationalDefaults)
    }
    // The active role intentionally determines a separate settings namespace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCommunity, operationalStorageKey, role])

  const updateOperationalSetting = <
    K extends keyof OperationalSettings,
  >(
    key: K,
    value: OperationalSettings[K],
  ) => {
    setOperationalSettings((current) => ({
      ...current,
      [key]: value,
    }))
    setOperationalSaved(false)
    setOperationalStatus("")
  }

  const saveOperationalSettings = () => {
    try {
      window.localStorage.setItem(
        operationalStorageKey,
        JSON.stringify(operationalSettings),
      )
      setOperationalSaved(true)
      setOperationalStatus(
        role === "FIELD_TEAM"
          ? "Field Team operational preferences are saved on this device."
          : "Authority operational preferences are saved on this device.",
      )
      window.setTimeout(() => setOperationalSaved(false), 2500)
    } catch {
      setOperationalSaved(false)
      setOperationalStatus(
        "Unable to save operational preferences on this device.",
      )
    }
  }

  const resetOperationalSettings = () => {
    const reset = {
      ...operationalDefaults,
      browserNotifications:
        getNotificationPermission() === "granted",
    }
    setOperationalSettings(reset)
    setOperationalSaved(false)
    setOperationalStatus(
      "Preferences reset. Save to keep the reset on this device.",
    )
  }

  const handleOperationalNotifications = async () => {
    if (!("Notification" in window)) {
      updateOperationalSetting("browserNotifications", false)
      setOperationalStatus(
        "This browser does not support notifications. In-app operational alerts remain available.",
      )
      return
    }

    if (operationalSettings.browserNotifications) {
      updateOperationalSetting("browserNotifications", false)
      setOperationalStatus("Browser notifications are disabled on this device.")
      return
    }

    if (Notification.permission === "denied") {
      updateOperationalSetting("browserNotifications", false)
      setOperationalStatus(
        "Browser notifications are blocked. Allow notifications in site settings, then try again.",
      )
      return
    }

    const permission = await Notification.requestPermission()

    if (permission === "granted") {
      updateOperationalSetting("browserNotifications", true)
      setOperationalStatus(
        "Browser notifications are enabled on this device.",
      )
      return
    }

    updateOperationalSetting("browserNotifications", false)
    setOperationalStatus(
      "Browser notification permission was not granted.",
    )
  }

  const checkOperationalLocation = () => {
    setOperationalLocationChecking(true)
    setOperationalStatus("Checking browser location access…")

    if (!navigator.geolocation) {
      updateOperationalSetting("locationPermissionState", "Not supported")
      setOperationalLocationChecking(false)
      setOperationalStatus("Location is not supported by this browser.")
      return
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        updateOperationalSetting("locationPermissionState", "Granted")
        updateOperationalSetting("useDeviceLocation", true)
        setOperationalLocationChecking(false)
        setOperationalStatus(
          "Location access is working. Device GPS can be used by supported operational features.",
        )
      },
      (error) => {
        const state =
          error.code === error.PERMISSION_DENIED
            ? "Denied"
            : error.code === error.TIMEOUT
              ? "Timed out"
              : "Unavailable"

        updateOperationalSetting("locationPermissionState", state)
        setOperationalLocationChecking(false)
        setOperationalStatus(
          state === "Denied"
            ? "Location access is denied. Allow browser location access and try again."
            : "The browser could not determine the device location right now.",
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    )
  }

  if (!isCommunity) {
    const isFieldTeam = role === "FIELD_TEAM"
    const roleLabel = isFieldTeam ? "Field Team" : "DDMA / Authority"
    const roleDescription = isFieldTeam
      ? "Configure field-response notifications, GPS and offline operational behavior."
      : "Configure DDMA monitoring, verified-alert notifications and operational refresh behavior."

    return (
      <div
        className={`min-h-[calc(100vh-72px)] bg-[#06111c] px-6 py-6 text-slate-100 ${
          operationalSettings.largeText ? "[&_p]:text-[13px]" : ""
        }`}
      >
        <div className="mx-auto max-w-[1450px]">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Operations</span>
                <span>/</span>
                <span className="text-slate-300">Settings</span>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Settings2 size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {roleLabel} Settings
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {roleDescription}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-800 bg-[#0a1724] px-4 py-2.5 sm:block">
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  Current Role
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-300">
                  {roleLabel}
                </p>
              </div>

              <button
                type="button"
                onClick={resetOperationalSettings}
                className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0a1724] px-4 py-2.5 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-300"
              >
                <RotateCcw size={14} />
                Reset
              </button>

              <button
                type="button"
                onClick={saveOperationalSettings}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-[#06111c] transition hover:bg-emerald-400"
              >
                {operationalSaved ? <Check size={14} /> : <Save size={14} />}
                {operationalSaved ? "Saved" : "Save Changes"}
              </button>
            </div>
          </div>

          {operationalStatus && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3">
              <Info size={15} className="mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-[11px] leading-5 text-slate-400">
                {operationalStatus}
              </p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
              <div className="border-b border-slate-800 p-5">
                <SectionHeader
                  icon={BellRing}
                  title="Operational Alerts"
                  description={
                    isFieldTeam
                      ? "Control how verified operational alerts are presented to field responders."
                      : "Control how verified alerts are presented during authority monitoring."
                  }
                />
              </div>

              <div className="px-5">
                <SettingSelect
                  label="Alert Severity"
                  description="Choose the minimum verified alert severity presented by supported operational screens."
                  value={operationalSettings.alertSeverity}
                  options={
                    isFieldTeam
                      ? ["Critical only", "High & Critical", "All verified alerts"]
                      : ["Critical only", "High & Critical", "All verified alerts"]
                  }
                  onChange={(value) =>
                    updateOperationalSetting("alertSeverity", value)
                  }
                />

                <Toggle
                  enabled={operationalSettings.browserNotifications}
                  onChange={() => void handleOperationalNotifications()}
                  label="Browser Notifications"
                  description="Allow this device to show BhooPehra operational notifications outside the active page."
                />

                <Toggle
                  enabled={operationalSettings.soundAlerts}
                  onChange={() =>
                    updateOperationalSetting(
                      "soundAlerts",
                      !operationalSettings.soundAlerts,
                    )
                  }
                  label="Sound Alerts"
                  description="Use an audible cue for supported in-app operational notifications. This does not create or publish an alert."
                  disabled={!operationalSettings.browserNotifications}
                />

                <div className="py-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      size={16}
                      className="mt-0.5 shrink-0 text-emerald-400"
                    />
                    <p className="text-[11px] leading-5 text-slate-600">
                      These preferences only control this device's presentation.
                      They do not change risk calculations, verification status,
                      alert generation or response assignments.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
              <div className="border-b border-slate-800 p-5">
                <SectionHeader
                  icon={LocateFixed}
                  title={isFieldTeam ? "Field Device & GPS" : "Location & Device"}
                  description={
                    isFieldTeam
                      ? "Check device location access for supported field workflows."
                      : "Check browser location access when a supported authority workflow needs it."
                  }
                />
              </div>

              <div className="px-5">
                <Toggle
                  enabled={operationalSettings.useDeviceLocation}
                  onChange={() =>
                    updateOperationalSetting(
                      "useDeviceLocation",
                      !operationalSettings.useDeviceLocation,
                    )
                  }
                  label={isFieldTeam ? "Use Device Location" : "Allow Device Location"}
                  description={
                    isFieldTeam
                      ? "Allow supported field features to request the device GPS location when needed."
                      : "Allow supported authority features to request device location when needed."
                  }
                />

                <div className="flex flex-col justify-between gap-4 border-b border-slate-800 py-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      Location Permission
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                      Current browser permission state for BhooPehra location requests.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        operationalSettings.locationPermissionState === "Granted"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : operationalSettings.locationPermissionState === "Denied"
                            ? "border-red-500/20 bg-red-500/10 text-red-300"
                            : "border-slate-700 bg-slate-800/40 text-slate-400"
                      }`}
                    >
                      {operationalSettings.locationPermissionState}
                    </span>

                    <button
                      type="button"
                      onClick={checkOperationalLocation}
                      disabled={operationalLocationChecking}
                      className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {operationalLocationChecking ? "Checking…" : "Check Access"}
                    </button>
                  </div>
                </div>

                <div className="py-4">
                  <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                    <div className="flex items-start gap-3">
                      <MapPin size={16} className="mt-0.5 text-sky-400" />
                      <div>
                        <p className="text-xs font-medium text-slate-300">
                          Location privacy
                        </p>
                        <p className="mt-1 text-[10px] leading-5 text-slate-600">
                          Browser GPS permission is controlled by the browser.
                          This settings page does not upload or store device
                          coordinates in the BhooPehra database.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
              <div className="border-b border-slate-800 p-5">
                <SectionHeader
                  icon={Wifi}
                  title="Data & Connectivity"
                  description={
                    isFieldTeam
                      ? "Keep field operations usable when connectivity is limited."
                      : "Control refresh behavior for operational monitoring."
                  }
                />
              </div>

              <div className="px-5">
                <Toggle
                  enabled={operationalSettings.autoRefresh}
                  onChange={() =>
                    updateOperationalSetting(
                      "autoRefresh",
                      !operationalSettings.autoRefresh,
                    )
                  }
                  label="Automatic Data Refresh"
                  description="Allow supported operational screens to refresh backend data automatically."
                />

                <SettingSelect
                  label="Refresh Interval"
                  description="Preferred refresh interval for supported operational screens."
                  value={operationalSettings.refreshInterval}
                  options={["1 minute", "5 minutes", "10 minutes", "15 minutes", "30 minutes"]}
                  onChange={(value) =>
                    updateOperationalSetting("refreshInterval", value)
                  }
                />

                {isFieldTeam && (
                  <Toggle
                    enabled={operationalSettings.offlineMode}
                    onChange={() =>
                      updateOperationalSetting(
                        "offlineMode",
                        !operationalSettings.offlineMode,
                      )
                    }
                    label="Offline Field Reporting"
                    description="Keep supported field reporting available for local saving and later synchronization when connectivity returns."
                  />
                )}

                <div className="py-4">
                  <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                    <div className="flex items-center gap-3">
                      {operationalSettings.offlineMode ? (
                        <WifiOff size={16} className="text-violet-400" />
                      ) : (
                        <Wifi size={16} className="text-slate-500" />
                      )}
                      <div>
                        <p className="text-xs font-medium text-slate-300">
                          {isFieldTeam ? "Field connectivity" : "Backend connectivity"}
                        </p>
                        <p className="mt-1 text-[10px] leading-5 text-slate-600">
                          Settings do not claim successful synchronization unless
                          the backend confirms it.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
              <div className="border-b border-slate-800 p-5">
                <SectionHeader
                  icon={Accessibility}
                  title="Display & Accessibility"
                  description="Make operational status information easier to read."
                />
              </div>

              <div className="px-5">
                <Toggle
                  enabled={operationalSettings.largeText}
                  onChange={() =>
                    updateOperationalSetting(
                      "largeText",
                      !operationalSettings.largeText,
                    )
                  }
                  label="Larger Operational Text"
                  description="Increase paragraph text size on this settings screen."
                />

                <div className="py-4">
                  <div className="flex items-start gap-3">
                    <Monitor
                      size={16}
                      className="mt-0.5 text-slate-500"
                    />
                    <p className="text-[11px] leading-5 text-slate-600">
                      Display preferences are local to this device. They do not
                      alter operational data, risk values or response workflow state.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <ShieldAlert size={17} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-emerald-300">
                  Operational safety
                </h3>
                <p className="mt-2 text-[11px] leading-5 text-slate-600">
                  Settings personalize device behavior only. Authority verification,
                  alert generation, team assignment, field response and risk
                  assessment remain controlled by their existing workflows.
                </p>
              </div>
            </div>
          </div>

          <div className="sticky bottom-4 z-20 mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-slate-700 bg-[#0a1724]/95 p-4 shadow-2xl backdrop-blur md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <Save size={16} className="text-emerald-400" />
              <div>
                <p className="text-xs font-medium text-slate-300">
                  {roleLabel} preferences
                </p>
                <p className="mt-0.5 text-[10px] text-slate-600">
                  Saved locally on this device. Operational data remains controlled
                  by the BhooPehra backend.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={saveOperationalSettings}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-[#06111c] transition hover:bg-emerald-400"
            >
              {operationalSaved ? <Check size={14} /> : <Save size={14} />}
              {operationalSaved ? "Changes Saved" : "Save Configuration"}
            </button>
          </div>

          <div className="pb-8 pt-4 text-center text-[10px] text-slate-700">
            {profile?.name ?? roleLabel} · {roleLabel} operational settings
          </div>
        </div>
      </div>
    )
  }

  const notificationPermission = getNotificationPermission()

  return (
    <div
      className={`min-h-[calc(100vh-72px)] bg-[#06111c] px-6 py-6 text-slate-100 ${
        settings.largeText ? "[&_p]:text-[13px]" : ""
      }`}
    >
      <div className="mx-auto max-w-[1450px]">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{t("Safety")}</span>
              <span>/</span>
              <span className="text-slate-300">{t("Settings")}</span>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Settings2 size={20} className="text-emerald-400" />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('Safety Settings')}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {t('Personalize how BhooPehra keeps you informed and prepared.')}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-slate-800 bg-[#0a1724] px-4 py-2.5 sm:block">
              <p className="text-[9px] uppercase tracking-wider text-slate-600">
                {t('Current Role')}
              </p>
              <p className="mt-1 text-xs font-medium text-emerald-300">
                {t('Community User')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#0a1724] px-4 py-2.5 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-300"
            >
              <RotateCcw size={14} />
              {t('Reset')}
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-[#06111c] transition hover:bg-emerald-400"
            >
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? t("Saved") : t("Save Changes")}
            </button>
          </div>
        </div>

        {/* Community summary */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-[#0a1724] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <BellRing size={17} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  {t('Safety Alerts')}
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-300">
                  {t(settings.alertLevel)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0a1724] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10">
                <Languages size={17} className="text-sky-400" />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  {t('Language')}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-300">
                  {t(settings.language)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0a1724] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                {settings.browserNotifications ? (
                  <Bell size={17} className="text-orange-400" />
                ) : (
                  <BellRing size={17} className="text-orange-400" />
                )}
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  {t('Browser Alerts')}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-300">
                  {settings.browserNotifications ? t("Enabled") : t("In-app only")}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0a1724] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
                {settings.offlineMode ? (
                  <WifiOff size={17} className="text-violet-400" />
                ) : (
                  <Wifi size={17} className="text-violet-400" />
                )}
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-600">
                  {t('Offline Support')}
                </p>
                <p className="mt-1 text-xs font-semibold text-emerald-300">
                  {settings.offlineMode ? t("Enabled") : t("Disabled")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3">
            <Info size={15} className="mt-0.5 shrink-0 text-emerald-400" />
            <p className="text-[11px] leading-5 text-slate-400">
              {statusMessage}
            </p>
          </div>
        )}

        {/* Main community settings */}
        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* Alerts */}
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
            <div className="border-b border-slate-800 p-5">
              <SectionHeader
                translate={t}
                icon={BellRing}
                title="Safety Alerts"
                description="Choose which safety information should reach you on this device."
              />
            </div>

            <div className="px-5">
              <SettingSelect
                label="Alert Severity"
                description="Show verified safety alerts from the selected severity level upward."
                value={settings.alertLevel}
                options={["Critical only", "High & Critical", "All verified alerts"]}
                onChange={(value) => updateSetting("alertLevel", value)}
                translate={t}
              />

              <Toggle
                translate={t}
                enabled={settings.rainfallAlerts}
                onChange={() =>
                  updateSetting("rainfallAlerts", !settings.rainfallAlerts)
                }
                label="Heavy Rainfall Advisories"
                description="Show rainfall-related safety advisories when verified weather information supports them."
              />

              <Toggle
                translate={t}
                enabled={settings.browserNotifications}
                onChange={() => void handleBrowserNotifications()}
                label="Browser Notifications"
                description={
                  notificationPermission === "denied"
                    ? "Blocked by the browser. Allow notifications in site settings to enable this."
                    : "Allow this device to show BhooPehra notifications outside the active page."
                }
              />

              <Toggle
                translate={t}
                enabled={settings.soundAlerts}
                onChange={() =>
                  updateSetting("soundAlerts", !settings.soundAlerts)
                }
                label="Sound Alerts"
                description="Use an audible cue for supported in-app safety notifications. This does not create emergency alerts."
                disabled={!settings.browserNotifications}
              />

              <div className="border-b border-slate-800 py-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-400"
                  />
                  <p className="text-[11px] leading-5 text-slate-600">
                    Official emergency information remains subject to the
                    verified alerts and instructions displayed by BhooPehra.
                    These preferences control how this device presents
                    notifications; they do not change the underlying risk
                    assessment or generate an alert.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Location */}
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
            <div className="border-b border-slate-800 p-5">
              <SectionHeader
                translate={t}
                icon={LocateFixed}
                title="Location & Area"
                description="Control how your device location is used for local safety context."
              />
            </div>

            <div className="px-5">
              <Toggle
                translate={t}
                enabled={settings.useLocationOnWeather}
                onChange={() =>
                  updateSetting(
                    "useLocationOnWeather",
                    !settings.useLocationOnWeather,
                  )
                }
                label="Use My Location for Weather"
                description="Allow the Weather & Safety page to request live weather for your detected GPS location."
              />

              <div className="flex flex-col justify-between gap-4 border-b border-slate-800 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    {t('Location Permission')}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">
                    Current browser permission state for BhooPehra location
                    requests.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                      settings.locationPermissionState === "Granted"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : settings.locationPermissionState === "Denied"
                          ? "border-red-500/20 bg-red-500/10 text-red-300"
                          : "border-slate-700 bg-slate-800/40 text-slate-400"
                    }`}
                  >
                    {settings.locationPermissionState}
                  </span>

                  <button
                    type="button"
                    onClick={checkLocationPermission}
                    disabled={locationChecking}
                    className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {locationChecking ? "Checking…" : "Check Access"}
                  </button>
                </div>
              </div>

              <div className="border-b border-slate-800 py-4">
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-sky-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-200">
                      {t('Area Matching')}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                      BhooPehra only associates your location with a monitored
                      zone when verified zone geometry supports that match.
                    </p>
                  </div>
                </div>
              </div>

              <div className="py-4">
                <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-600">
                    {t('Privacy')}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    Location is requested by the browser only when a feature
                    needs it. This settings page does not upload or store GPS
                    coordinates in the BhooPehra database.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* {t('Language')} and accessibility */}
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
            <div className="border-b border-slate-800 p-5">
              <SectionHeader
                translate={t}
                icon={Globe2}
                title="Language & Accessibility"
                description="Make safety information easier to understand and use."
              />
            </div>

            <div className="px-5">
              <SettingSelect
                label="Safety Language"
                description="Preferred language for supported emergency and safety guidance."
                value={settings.language}
                options={[
                  "English",
                  "Hindi",
                  "Assamese",
                  "Mizo",
                  "Bengali",
                ]}
                onChange={(value) => {
                  updateSetting("language", value)
                  setLanguage(value as "English" | "Hindi" | "Assamese" | "Mizo" | "Bengali")
                }}
                translate={t}
              />

              <Toggle
                translate={t}
                enabled={settings.highContrast}
                onChange={() =>
                  updateSetting("highContrast", !settings.highContrast)
                }
                label="Higher Contrast"
                description="Increase contrast for important safety controls and status information."
              />

              <Toggle
                translate={t}
                enabled={settings.largeText}
                onChange={() =>
                  updateSetting("largeText", !settings.largeText)
                }
                label="Larger Safety Text"
                description="Increase text size on this settings screen for easier reading."
              />

              <div className="py-4">
                <div className="flex items-start gap-3">
                  <Accessibility
                    size={16}
                    className="mt-0.5 text-emerald-400"
                  />
                  <p className="text-[11px] leading-5 text-slate-600">
                    Emergency guidance is designed around short, actionable
                    instructions. Supported critical instructions include
                    English, Hindi, Assamese, Mizo and Bengali.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Offline & refresh */}
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724]">
            <div className="border-b border-slate-800 p-5">
              <SectionHeader
                translate={t}
                icon={Wifi}
                title="Offline & Data"
                description="Keep essential community features usable when connectivity is limited."
              />
            </div>

            <div className="px-5">
              <Toggle
                translate={t}
                enabled={settings.offlineMode}
                onChange={() =>
                  updateSetting("offlineMode", !settings.offlineMode)
                }
                label="Offline Reporting Support"
                description="Keep hazard reports available for local saving and later synchronization when the network returns."
              />

              <Toggle
                translate={t}
                enabled={settings.autoRefresh}
                onChange={() =>
                  updateSetting("autoRefresh", !settings.autoRefresh)
                }
                label="Automatic Data Refresh"
                description="Allow supported screens to refresh their backend data automatically."
              />

              <SettingSelect
                label="Refresh Interval"
                description="Preferred refresh interval for supported community screens."
                value={settings.refreshInterval}
                options={[
                  "1 minute",
                  "5 minutes",
                  "10 minutes",
                  "15 minutes",
                  "30 minutes",
                ]}
                onChange={(value) => updateSetting("refreshInterval", value)}
                translate={t}
              />

              <div className="py-4">
                <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                  <div className="flex items-center gap-3">
                    {settings.offlineMode ? (
                      <WifiOff size={16} className="text-violet-400" />
                    ) : (
                      <Wifi size={16} className="text-slate-500" />
                    )}
                    <div>
                      <p className="text-xs font-medium text-slate-300">
                        {t('Local-first reporting')}
                      </p>
                      <p className="mt-1 text-[10px] leading-5 text-slate-600">
                        Offline reporting preferences affect local browser
                        behavior. They do not fabricate or mark a report as
                        successfully submitted until synchronization succeeds.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Device / privacy */}
          <section className="rounded-2xl border border-slate-800 bg-[#0a1724] xl:col-span-2">
            <div className="border-b border-slate-800 p-5">
              <SectionHeader
                translate={t}
                icon={Smartphone}
                title="Device & Privacy"
                description="Understand what these preferences affect on your device."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                <Monitor size={16} className="text-slate-500" />
                <p className="mt-3 text-xs font-medium text-slate-300">
                  {t('Device preferences')}
                </p>
                <p className="mt-1 text-[10px] leading-5 text-slate-600">
                  Community settings are stored locally in this browser so
                  they remain available on the same device.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                <LocateFixed size={16} className="text-slate-500" />
                <p className="mt-3 text-xs font-medium text-slate-300">
                  {t('Location control')}
                </p>
                <p className="mt-1 text-[10px] leading-5 text-slate-600">
                  GPS access is controlled by the browser. BhooPehra does not
                  use this page to create a permanent location profile.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#081521] p-4">
                <Volume2 size={16} className="text-slate-500" />
                <p className="mt-3 text-xs font-medium text-slate-300">
                  {t('Notification control')}
                </p>
                <p className="mt-1 text-[10px] leading-5 text-slate-600">
                  Browser permission is controlled by the operating system and
                  browser. BhooPehra cannot override a denied permission.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Safety note */}
        <div className="mt-6 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.035] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <ShieldAlert size={17} className="text-emerald-400" />
            </div>

            <div>
              <h3 className="text-xs font-semibold text-emerald-300">
                {t('Safety-first design')}
              </h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">
                Community settings personalize presentation and device
                behavior. They do not change BhooPehra's underlying landslide
                risk calculation, create warnings, or replace official
                disaster-management instructions.
              </p>
            </div>
          </div>
        </div>

        {/* Save bar */}
        <div className="sticky bottom-4 z-20 mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-slate-700 bg-[#0a1724]/95 p-4 shadow-2xl backdrop-blur md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Save size={16} className="text-emerald-400" />

            <div>
              <p className="text-xs font-medium text-slate-300">
                {t('Community preferences')}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                {t('Saved')} locally on this device. Risk and emergency data remain
                controlled by the BhooPehra backend and verified sources.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-[#06111c] transition hover:bg-emerald-400"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? t("Changes Saved") : t("Save Configuration")}
          </button>
        </div>

        {/* Small role context */}
        <div className="pb-8 pt-4 text-center text-[10px] text-slate-700">
          {profile?.name ?? "Community User"} · Community safety preferences
        </div>
      </div>
    </div>
  )
}
