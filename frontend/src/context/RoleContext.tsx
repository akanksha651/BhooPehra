import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type UserRole =
  | "AUTHORITY"
  | "FIELD_TEAM"
  | "COMMUNITY"

export type RoleProfile = {
  role: UserRole
  name: string
  shortName: string
  title: string
  department: string
  initials: string
  description: string
  dashboardTitle: string
  dashboardSubtitle: string
  companionTitle: string
  companionDescription: string
  companionAction: string
  companionPath: string
}

export const ROLE_PROFILES: Record<UserRole, RoleProfile> = {
  AUTHORITY: {
    role: "AUTHORITY",
    name: "DDMA Officer",
    shortName: "DDMA Officer",
    title: "DDMA Officer",
    department: "District Disaster Management",
    initials: "DO",
    description:
      "Monitor regional landslide risk, alerts, infrastructure impact, field evidence and response priorities.",
    dashboardTitle: "Authority Command Center",
    dashboardSubtitle:
      "Regional risk, impact, priority and response monitoring",
    companionTitle: "Field Companion",
    companionDescription:
      "Review field evidence, verification status and operational reports.",
    companionAction: "Open Field Reports",
    companionPath: "/field-reports",
  },

  FIELD_TEAM: {
    role: "FIELD_TEAM",
    name: "Field Response Team",
    shortName: "Field Team",
    title: "Field Response Team",
    department: "Field Operations",
    initials: "FT",
    description:
      "Inspect risk areas, capture field evidence, verify hazards and coordinate response operations.",
    dashboardTitle: "Field Operations Center",
    dashboardSubtitle:
      "Risk intelligence, field verification and response coordination",
    companionTitle: "Field Companion",
    companionDescription:
      "Capture hazard observations, GPS evidence and field reports for verification.",
    companionAction: "Open Field Reporting",
    companionPath: "/field-reports",
  },

  COMMUNITY: {
    role: "COMMUNITY",
    name: "Community User",
    shortName: "Community",
    title: "Community User",
    department: "Public Safety & Alerts",
    initials: "CU",
    description:
      "Receive safety information, check local risk, follow warnings and report hazards.",
    dashboardTitle: "Community Safety Center",
    dashboardSubtitle:
      "Local risk awareness, warnings and safer movement information",
    companionTitle: "Safety Companion",
    companionDescription:
      "View warnings, check local risk information and submit a hazard report.",
    companionAction: "Report a Hazard",
    companionPath: "/field-reports",
  },
}

const ROLE_STORAGE_KEY = "bhoopehra:user-role"

type RoleContextValue = {
  role: UserRole | null
  profile: RoleProfile | null
  hasRole: boolean
  setRole: (role: UserRole) => void
  clearRole: () => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

function readStoredRole(): UserRole | null {
  try {
    const stored =
      window.localStorage.getItem(
        ROLE_STORAGE_KEY,
      )

    if (
      stored === "AUTHORITY" ||
      stored === "FIELD_TEAM" ||
      stored === "COMMUNITY"
    ) {
      return stored
    }

    return null
  } catch {
    return null
  }
}

function persistRole(role: UserRole | null) {
  try {
    if (role) {
      window.localStorage.setItem(
        ROLE_STORAGE_KEY,
        role,
      )
    } else {
      window.localStorage.removeItem(
        ROLE_STORAGE_KEY,
      )
    }
  } catch {
    // Local storage is optional.
  }
}

export function RoleProvider({
  children,
}: {
  children: ReactNode
}) {
  const [role, setRoleState] =
    useState<UserRole | null>(() =>
      readStoredRole(),
    )

  useEffect(() => {
    persistRole(role)
  }, [role])

  const value = useMemo<RoleContextValue>(
    () => ({
      role,

      profile:
        role !== null
          ? ROLE_PROFILES[role]
          : null,

      hasRole: role !== null,

      setRole: (nextRole) => {
        // Persist immediately before any navigation/reload.
        persistRole(nextRole)

        setRoleState(nextRole)
      },

      clearRole: () => {
        // Remove immediately before any navigation/reload.
        persistRole(null)

        setRoleState(null)
      },
    }),
    [role],
  )

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole(): RoleContextValue {
  const context =
    useContext(RoleContext)

  if (!context) {
    throw new Error(
      "useRole must be used inside RoleProvider",
    )
  }

  return context
}