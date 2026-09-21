import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudOff,
  FileText,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  Upload,
  Wifi,
  X,
} from "lucide-react"
import { useSearchParams } from "react-router"
import { useRole } from "../context/RoleContext"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

type Severity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW"

type ReportStatus =
  | "PENDING SYNC"
  | "SUBMITTED"
  | "VERIFIED"
  | "REJECTED"

type ResponseStatus =
  | "NOT_STARTED"
  | "ALERT_GENERATED"
  | "TEAM_ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"

type ApiFieldReport = {
  id: number
  report_code: string
  title: string
  reporter: string
  hazard: string
  severity: Severity
  status: ReportStatus
  response_status: ResponseStatus
  response_status_label: string
  assigned_team: string | null
  alert_generated_at: string | null
  assigned_at: string | null
  started_at: string | null
  resolved_at: string | null
  response_notes: string | null
  district_id: number | null
  district_name: string | null
  risk_zone_id: number | null
  location: string
  state: string
  latitude: number
  longitude: number
  description: string
  road_impact: string
  village_impact: string
  photo_count: number
  verification_notes: string | null
  submitted_at: string | null
  verified_at: string | null
  created_at: string | null
  updated_at: string | null
}

type FieldReport = {
  id: number
  code: string
  title: string
  reporter: string
  location: string
  district: string
  state: string
  severity: Severity
  status: ReportStatus
  responseStatus: ResponseStatus
  responseStatusLabel: string
  assignedTeam: string | null
  alertGeneratedAt: string | null
  assignedAt: string | null
  startedAt: string | null
  resolvedAt: string | null
  responseNotes: string | null
  hazard: string
  latitude: number
  longitude: number
  timestamp: string
  description: string
  roadImpact: string
  villageImpact: string
  photoCount: number
  districtId: number | null
  riskZoneId: number | null
  verificationNotes: string | null
  submittedAt: string | null
  verifiedAt: string | null
}

type NewReportForm = {
  title: string
  reporter: string
  hazard: string
  severity: Severity
  location: string
  state: string
  latitude: string
  longitude: string
  description: string
  roadImpact: string
  villageImpact: string
  photoCount: string
  districtId: string
  riskZoneId: string
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

const OFFLINE_DB_NAME = "bhoopehra-offline"
const OFFLINE_DB_VERSION = 1
const REPORT_CACHE_STORE = "field-reports-cache"
const REPORT_QUEUE_STORE = "field-report-queue"
const COMMUNITY_REPORT_CODES_KEY = "bhoopehra:community-report-codes"
const REPORTER_TOKEN_KEY = "bhoopehra:reporter-token"

function getReporterToken(): string {
  if (typeof window === "undefined") {
    return ""
  }

  try {
    const existing = window.localStorage.getItem(REPORTER_TOKEN_KEY)?.trim()

    if (existing && existing.length >= 16 && existing.length <= 128) {
      return existing
    }

    const token =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`

    window.localStorage.setItem(REPORTER_TOKEN_KEY, token)
    return token
  } catch (storageError) {
    console.error(storageError)
    return ""
  }
}

function readCommunityReportCodes(): string[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(
      COMMUNITY_REPORT_CODES_KEY,
    )

    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (value): value is string => typeof value === "string",
    )
  } catch (storageError) {
    console.error(storageError)
    return []
  }
}

function rememberCommunityReportCode(code: string): string[] {
  const nextCodes = Array.from(
    new Set([...readCommunityReportCodes(), code]),
  )

  try {
    window.localStorage.setItem(
      COMMUNITY_REPORT_CODES_KEY,
      JSON.stringify(nextCodes),
    )
  } catch (storageError) {
    console.error(storageError)
  }

  return nextCodes
}

type FieldReportPayload = {
  title: string
  reporter: string
  reporter_token: string | null
  hazard: string
  severity: Severity
  location: string
  state: string
  latitude: number
  longitude: number
  description: string
  road_impact: string
  village_impact: string
  photo_count: number
  district_id: number | null
  risk_zone_id: number | null
}

type QueuedFieldReport = {
  localId: string
  createdAt: string
  body: FieldReportPayload
}

function offlineReportId(localId: string): number {
  let hash = 0

  for (let index = 0; index < localId.length; index += 1) {
    hash = (hash * 31 + localId.charCodeAt(index)) | 0
  }

  return -(Math.abs(hash) % 1_000_000_000 + 1)
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."))
      return
    }

    const request = indexedDB.open(
      OFFLINE_DB_NAME,
      OFFLINE_DB_VERSION,
    )

    request.onerror = () =>
      reject(
        request.error ??
          new Error("Unable to open offline storage."),
      )

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(REPORT_CACHE_STORE)) {
        db.createObjectStore(REPORT_CACHE_STORE, {
          keyPath: "id",
        })
      }

      if (!db.objectStoreNames.contains(REPORT_QUEUE_STORE)) {
        db.createObjectStore(REPORT_QUEUE_STORE, {
          keyPath: "localId",
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
  })
}

async function cacheReports(
  reports: FieldReport[],
): Promise<void> {
  const db = await openOfflineDb()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      REPORT_CACHE_STORE,
      "readwrite",
    )
    const store = transaction.objectStore(REPORT_CACHE_STORE)

    store.clear()

    for (const report of reports) {
      store.put(report)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Unable to cache field reports."),
      )
  })

  db.close()
}

async function readCachedReports(): Promise<FieldReport[]> {
  const db = await openOfflineDb()

  const reports = await new Promise<FieldReport[]>(
    (resolve, reject) => {
      const transaction = db.transaction(
        REPORT_CACHE_STORE,
        "readonly",
      )
      const request = transaction
        .objectStore(REPORT_CACHE_STORE)
        .getAll()

      request.onsuccess = () =>
        resolve(request.result as FieldReport[])

      request.onerror = () =>
        reject(
          request.error ??
            new Error("Unable to read cached field reports."),
        )
    },
  )

  db.close()

  return reports.sort((a, b) => b.id - a.id)
}

async function queueFieldReport(
  item: QueuedFieldReport,
): Promise<void> {
  const db = await openOfflineDb()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      REPORT_QUEUE_STORE,
      "readwrite",
    )

    transaction.objectStore(REPORT_QUEUE_STORE).put(item)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Unable to save report for offline sync."),
      )
  })

  db.close()
}

async function readQueuedFieldReports(): Promise<
  QueuedFieldReport[]
> {
  const db = await openOfflineDb()

  const items = await new Promise<QueuedFieldReport[]>(
    (resolve, reject) => {
      const transaction = db.transaction(
        REPORT_QUEUE_STORE,
        "readonly",
      )
      const request = transaction
        .objectStore(REPORT_QUEUE_STORE)
        .getAll()

      request.onsuccess = () =>
        resolve(request.result as QueuedFieldReport[])

      request.onerror = () =>
        reject(
          request.error ??
            new Error(
              "Unable to read pending offline reports.",
            ),
        )
    },
  )

  db.close()

  return items.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() -
      new Date(b.createdAt).getTime(),
  )
}

async function removeQueuedFieldReport(
  localId: string,
): Promise<void> {
  const db = await openOfflineDb()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      REPORT_QUEUE_STORE,
      "readwrite",
    )

    transaction.objectStore(REPORT_QUEUE_STORE).delete(localId)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Unable to remove synced offline report."),
      )
  })

  db.close()
}

function queuedReportToFieldReport(
  item: QueuedFieldReport,
): FieldReport {
  const body = item.body

  return {
    id: offlineReportId(item.localId),
    code: `OFFLINE-${item.localId.slice(-8).toUpperCase()}`,
    title: body.title,
    reporter: body.reporter,
    location: body.location,
    district:
      body.district_id !== null
        ? `District #${body.district_id}`
        : "District not linked",
    state: body.state,
    severity: body.severity,
    status: "PENDING SYNC",
    responseStatus: "NOT_STARTED",
    responseStatusLabel: responseStatusLabels.NOT_STARTED,
    assignedTeam: null,
    alertGeneratedAt: null,
    assignedAt: null,
    startedAt: null,
    resolvedAt: null,
    responseNotes: null,
    hazard: body.hazard,
    latitude: body.latitude,
    longitude: body.longitude,
    timestamp: formatTimestamp(item.createdAt),
    description: body.description,
    roadImpact: body.road_impact,
    villageImpact: body.village_impact,
    photoCount: body.photo_count,
    districtId: body.district_id,
    riskZoneId: body.risk_zone_id,
    verificationNotes: null,
    submittedAt: item.createdAt,
    verifiedAt: null,
  }
}

const severityStyles: Record<
  Severity,
  { text: string; bg: string; border: string }
> = {
  CRITICAL: {
    text: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  HIGH: {
    text: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  MODERATE: {
    text: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  LOW: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
}

const statusStyles: Record<
  ReportStatus,
  { text: string; bg: string }
> = {
  "PENDING SYNC": {
    text: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  SUBMITTED: {
    text: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  VERIFIED: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  REJECTED: {
    text: "text-red-400",
    bg: "bg-red-500/10",
  },
}

const responseStatusLabels: Record<ResponseStatus, string> = {
  NOT_STARTED: "Response Not Started",
  ALERT_GENERATED: "Alert Generated",
  TEAM_ASSIGNED: "Team Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
}

const responseStatusStyles: Record<
  ResponseStatus,
  { text: string; bg: string; border: string }
> = {
  NOT_STARTED: {
    text: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
  },
  ALERT_GENERATED: {
    text: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  TEAM_ASSIGNED: {
    text: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  IN_PROGRESS: {
    text: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
  RESOLVED: {
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
}

const emptyForm: NewReportForm = {
  title: "",
  reporter: "",
  hazard: "",
  severity: "MODERATE",
  location: "",
  state: "",
  latitude: "",
  longitude: "",
  description: "",
  roadImpact: "No immediate impact",
  villageImpact: "No villages currently exposed",
  photoCount: "0",
  districtId: "",
  riskZoneId: "",
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Time unavailable"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable"
  }

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) {
    return "Just now"
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours} hr ago`
  }

  const diffDays = Math.floor(diffHours / 24)

  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  }

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function mapReport(report: ApiFieldReport): FieldReport {
  return {
    id: report.id,
    code: report.report_code,
    title: report.title,
    reporter: report.reporter,
    location: report.location,
    district:
      report.district_name ??
      (report.district_id !== null
        ? `District #${report.district_id}`
        : "District not linked"),
    state: report.state,
    severity: report.severity,
    status: report.status,
    responseStatus: report.response_status ?? "NOT_STARTED",
    responseStatusLabel:
      report.response_status_label ??
      responseStatusLabels[report.response_status ?? "NOT_STARTED"],
    assignedTeam: report.assigned_team,
    alertGeneratedAt: report.alert_generated_at,
    assignedAt: report.assigned_at,
    startedAt: report.started_at,
    resolvedAt: report.resolved_at,
    responseNotes: report.response_notes,
    hazard: report.hazard,
    latitude: report.latitude,
    longitude: report.longitude,
    timestamp: formatTimestamp(
      report.submitted_at ?? report.created_at,
    ),
    description: report.description,
    roadImpact: report.road_impact,
    villageImpact: report.village_impact,
    photoCount: report.photo_count,
    districtId: report.district_id,
    riskZoneId: report.risk_zone_id,
    verificationNotes: report.verification_notes,
    submittedAt: report.submitted_at,
    verifiedAt: report.verified_at,
  }
}

export default function FieldReportsPage() {
  const { role } = useRole()
  const isCommunity = role === "COMMUNITY"
  const isAuthority = role === "AUTHORITY"
  const isFieldTeam = role === "FIELD_TEAM"
  const [searchParams] = useSearchParams()
  const requestedReportId = searchParams.get("report_id")
  const [reports, setReports] = useState<FieldReport[]>([])
  const [selected, setSelected] = useState<FieldReport | null>(null)
  const [communityReportCodes, setCommunityReportCodes] = useState<string[]>(
    readCommunityReportCodes,
  )
  const [reporterToken] = useState<string>(getReporterToken)

  const [severityFilter, setSeverityFilter] = useState<
    Severity | "ALL"
  >("ALL")

  const [statusFilter, setStatusFilter] = useState<
    ReportStatus | "ALL"
  >("ALL")

  const [search, setSearch] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [responseActionLoading, setResponseActionLoading] = useState(false)
  const [assignedTeamInput, setAssignedTeamInput] = useState("")
  const [responseNotesInput, setResponseNotesInput] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState<NewReportForm>(emptyForm)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [gpsLoading, setGpsLoading] = useState(false)

  useEffect(() => {
    const urls = photoFiles.map((file) => URL.createObjectURL(file))
    setPhotoPreviews(urls)

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photoFiles])

  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  )
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [usingOfflineCache, setUsingOfflineCache] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  const loadQueuedReports = useCallback(async () => {
    try {
      const queued = await readQueuedFieldReports()
      setPendingSyncCount(queued.length)
      return queued
    } catch (storageError) {
      console.error(storageError)
      return []
    }
  }, [])

  const loadReports = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError(null)

        if (!navigator.onLine) {
          const cached = await readCachedReports()
          const queued = await readQueuedFieldReports()
          const queuedReports = queued.map(
            queuedReportToFieldReport,
          )

          const availableCached = isCommunity
            ? cached.filter((report) =>
                communityReportCodes.some(
                  (code) =>
                    code.trim().toLowerCase() === report.code.trim().toLowerCase(),
                ),
              )
            : cached

          setReports([...queuedReports, ...availableCached])
          setPendingSyncCount(queued.length)
          setUsingOfflineCache(true)

          setSelected((current) => {
            const availableCached = isCommunity
              ? cached.filter((report) =>
                  communityReportCodes.some(
                    (code) =>
                      code.trim().toLowerCase() === report.code.trim().toLowerCase(),
                  ),
                )
              : cached
            const available = [...queuedReports, ...availableCached]

            if (!current) {
              return available[0] ?? null
            }

            return (
              available.find(
                (report) => report.id === current.id,
              ) ??
              available[0] ??
              null
            )
          })

          if (!cached.length && !queued.length) {
            setError(
              "Offline mode is active and no cached field reports are available yet.",
            )
          }

          return
        }

        const response = await fetch(
          `${API_BASE_URL}/api/field-reports`,
          isCommunity && reporterToken
            ? {
                headers: {
                  "X-Reporter-Token": reporterToken,
                },
              }
            : undefined,
        )

        if (!response.ok) {
          throw new Error(
            `Unable to load field reports (${response.status})`,
          )
        }

        const payload: {
          count: number
          data: ApiFieldReport[]
        } = await response.json()

        const mappedReports = payload.data.map(mapReport)

        await cacheReports(mappedReports)

        const queued = await readQueuedFieldReports()
        const queuedReports = queued.map(
          queuedReportToFieldReport,
        )

        setReports([...queuedReports, ...mappedReports])
        setPendingSyncCount(queued.length)
        setUsingOfflineCache(false)

        setSelected((current) => {
          const available = [...queuedReports, ...mappedReports]

          if (!current) {
            return available[0] ?? null
          }

          return (
            available.find(
              (report) => report.id === current.id,
            ) ??
            available[0] ??
            null
          )
        })
      } catch (requestError) {
        console.error(requestError)

        try {
          const cached = await readCachedReports()
          const queued = await readQueuedFieldReports()
          const queuedReports = queued.map(
            queuedReportToFieldReport,
          )

          if (cached.length || queued.length) {
            setReports([...queuedReports, ...cached])
            setPendingSyncCount(queued.length)
            setUsingOfflineCache(true)
            setError(
              "BhooPehra API is unavailable. Showing cached reports; pending offline reports will sync when connectivity returns.",
            )
            return
          }
        } catch (cacheError) {
          console.error(cacheError)
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load field reports.",
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [communityReportCodes, isCommunity, reporterToken],
  )

  const syncQueuedReports = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) {
      return
    }

    syncingRef.current = true
    setSyncing(true)

    try {
      const queued = await readQueuedFieldReports()

      if (!queued.length) {
        setPendingSyncCount(0)
        return
      }

      let syncedCount = 0

      for (const item of queued) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/field-reports`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(isCommunity && reporterToken
                  ? { "X-Reporter-Token": reporterToken }
                  : {}),
              },
              body: JSON.stringify(item.body),
            },
          )

          if (!response.ok) {
            const payload = await response.json().catch(() => null)
            throw new Error(
              payload?.detail ??
                `Offline report sync failed with ${response.status}`,
            )
          }

          await removeQueuedFieldReport(item.localId)
          syncedCount += 1
        } catch (syncError) {
          console.error(
            `Unable to sync offline report ${item.localId}`,
            syncError,
          )
          break
        }
      }

      const remaining = await readQueuedFieldReports()
      setPendingSyncCount(remaining.length)

      if (syncedCount > 0) {
        setSuccess(
          `${syncedCount} offline report${
            syncedCount === 1 ? "" : "s"
          } synced successfully.`,
        )
        await loadReports(true)
      }
    } catch (syncError) {
      console.error(syncError)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [isCommunity, loadReports, reporterToken])

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false)
      setUsingOfflineCache(true)
      setSuccess(null)
    }

    const handleOnline = () => {
      setIsOnline(true)
      setError(null)
      void loadReports(true)
      void syncQueuedReports()
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)

    void loadReports()
    void loadQueuedReports()

    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [loadReports, loadQueuedReports, syncQueuedReports])
  const communityReports = useMemo(() => {
    if (!isCommunity) {
      return reports
    }

    const ownedCodes = new Set(communityReportCodes.map((code) => code.toLowerCase()))

    return reports.filter((report) =>
      ownedCodes.has(report.code.trim().toLowerCase()),
    )
  }, [communityReportCodes, isCommunity, reports])

  useEffect(() => {
    if (!requestedReportId) {
      if (isCommunity) {
        setSelected((current) =>
          communityReports.find((report) => report.id === current?.id) ??
          communityReports[0] ??
          null,
        )
      }
      return
    }

    const requested = requestedReportId.trim().toLowerCase()
    const sourceReports = isCommunity ? communityReports : reports
    const report = sourceReports.find((item) =>
      String(item.id) === requestedReportId.trim() ||
      item.code.trim().toLowerCase() === requested,
    )

    if (report) {
      setSelected(report)
    } else if (isCommunity) {
      setSelected(null)
    }
  }, [communityReports, isCommunity, reports, requestedReportId])

  const filteredReports = useMemo(() => {
    const query = search.toLowerCase().trim()

    return communityReports.filter((report) => {
      const severityMatch =
        severityFilter === "ALL" ||
        report.severity === severityFilter

      const statusMatch =
        statusFilter === "ALL" ||
        report.status === statusFilter

      const searchMatch =
        !query ||
        report.title.toLowerCase().includes(query) ||
        report.location.toLowerCase().includes(query) ||
        report.district.toLowerCase().includes(query) ||
        report.state.toLowerCase().includes(query) ||
        report.hazard.toLowerCase().includes(query) ||
        report.code.toLowerCase().includes(query) ||
        report.reporter.toLowerCase().includes(query)

      return severityMatch && statusMatch && searchMatch
    })
  }, [
    reports,
    search,
    severityFilter,
    statusFilter,
  ])

  const pendingCount = communityReports.filter(
    (report) => report.status === "PENDING SYNC",
  ).length

  const submittedCount = communityReports.filter(
    (report) => report.status === "SUBMITTED",
  ).length

  const criticalCount = communityReports.filter(
    (report) => report.severity === "CRITICAL",
  ).length

  const inProgressCount = communityReports.filter(
    (report) => report.responseStatus === "IN_PROGRESS",
  ).length

  async function updateStatus(
    report: FieldReport,
    status: "VERIFIED" | "REJECTED",
  ) {
    try {
      if (!isAuthority) {
        throw new Error("Only Authority can verify or reject field reports.")
      }

      if (!navigator.onLine) {
        throw new Error(
          "Report verification requires an online connection. The report itself can remain safely queued offline.",
        )
      }

      setActionLoading(true)
      setError(null)
      setSuccess(null)

      const response = await fetch(
        `${API_BASE_URL}/api/field-reports/${report.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            verification_notes:
              status === "VERIFIED"
                ? "Ground observation verified from BhooPehra field verification workflow."
                : "Field report rejected during BhooPehra verification workflow.",
          }),
        },
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => null)

        throw new Error(
          payload?.detail ??
            `Status update failed with ${response.status}`,
        )
      }

      const payload: {
        data: ApiFieldReport
      } = await response.json()

      const updatedReport = mapReport(payload.data)

      setReports((current) =>
        current.map((item) =>
          item.id === updatedReport.id
            ? updatedReport
            : item,
        ),
      )

      setSelected(updatedReport)

      setSuccess(
        `${updatedReport.code} marked as ${updatedReport.status}.`,
      )
    } catch (requestError) {
      console.error(requestError)

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update report status.",
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function updateResponse(
    report: FieldReport,
    responseStatus: ResponseStatus,
    assignedTeam?: string,
  ) {
    try {
      if (!navigator.onLine) {
        throw new Error(
          "Response tracking requires an online connection. Offline field reports can still be queued for later sync.",
        )
      }

      if (isCommunity) {
        throw new Error("Community reports are read-only in the operational response workflow.")
      }

      if (isFieldTeam && (responseStatus === "ALERT_GENERATED" || responseStatus === "TEAM_ASSIGNED")) {
        throw new Error("Field Team cannot generate alerts or assign response teams. Authority controls those actions.")
      }

      if (responseStatus === "TEAM_ASSIGNED" && !assignedTeam?.trim()) {
        throw new Error("Enter the actual response team name before assigning the team.")
      }

      if (isFieldTeam && !report.assignedTeam?.trim()) {
        throw new Error("This report has no assigned response team yet. Wait for Authority assignment.")
      }

      setResponseActionLoading(true)
      setError(null)
      setSuccess(null)

      const response = await fetch(
        `${API_BASE_URL}/api/field-reports/${report.id}/response`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            response_status: responseStatus,
            assigned_team: assignedTeam?.trim() || undefined,
            response_notes: responseNotesInput.trim() || undefined,
          }),
        },
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => null)

        throw new Error(
          payload?.detail ??
            `Response update failed with ${response.status}`,
        )
      }

      const payload: { data: ApiFieldReport } = await response.json()
      const updatedReport = mapReport(payload.data)

      setReports((current) =>
        current.map((item) =>
          item.id === updatedReport.id ? updatedReport : item,
        ),
      )

      setSelected(updatedReport)
      setAssignedTeamInput(updatedReport.assignedTeam ?? "")
      setResponseNotesInput(updatedReport.responseNotes ?? "")

      setSuccess(
        `${updatedReport.code}: ${updatedReport.responseStatusLabel}.`,
      )
    } catch (requestError) {
      console.error(requestError)

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update response status.",
      )
    } finally {
      setResponseActionLoading(false)
    }
  }

  async function createReport(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    try {
      setActionLoading(true)
      setError(null)
      setSuccess(null)

      const latitude = Number(form.latitude)
      const longitude = Number(form.longitude)
      const photoCount = Number(form.photoCount)

      const reportTitle =
        form.title.trim() ||
        (isCommunity
          ? `${form.hazard.trim()} reported at ${form.location.trim()}`
          : "")

      if (!reportTitle) {
        throw new Error("Report title is required.")
      }

      if (!form.reporter.trim()) {
        throw new Error("Reporter name is required.")
      }

      if (!form.hazard.trim()) {
        throw new Error("Hazard type is required.")
      }

      if (!form.location.trim()) {
        throw new Error("Location is required.")
      }

      if (!form.state.trim()) {
        throw new Error("State is required.")
      }

      if (!Number.isFinite(latitude)) {
        throw new Error("Valid latitude is required.")
      }

      if (!Number.isFinite(longitude)) {
        throw new Error("Valid longitude is required.")
      }

      if (latitude < -90 || latitude > 90) {
        throw new Error(
          "Latitude must be between -90 and 90.",
        )
      }

      if (longitude < -180 || longitude > 180) {
        throw new Error(
          "Longitude must be between -180 and 180.",
        )
      }

      if (!form.description.trim()) {
        throw new Error(
          "Observation description is required.",
        )
      }

      if (
        !Number.isInteger(photoCount) ||
        photoCount < 0
      ) {
        throw new Error(
          "Photo count must be a non-negative whole number.",
        )
      }

      const body: FieldReportPayload = {
        title: reportTitle,
        reporter: form.reporter.trim(),
        reporter_token: isCommunity ? reporterToken || null : null,
        hazard: form.hazard.trim(),
        severity: form.severity,
        location: form.location.trim(),
        state: form.state.trim(),
        latitude,
        longitude,
        description: form.description.trim(),
        road_impact: isCommunity
          ? "Not reported by community user"
          : form.roadImpact.trim(),
        village_impact: isCommunity
          ? "Not reported by community user"
          : form.villageImpact.trim(),
        photo_count: photoCount,
        district_id: isCommunity
          ? null
          : form.districtId
            ? Number(form.districtId)
            : null,
        risk_zone_id: isCommunity
          ? null
          : form.riskZoneId
            ? Number(form.riskZoneId)
            : null,
      }

      if (!navigator.onLine) {
        const queuedItem: QueuedFieldReport = {
          localId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          body,
        }

        await queueFieldReport(queuedItem)

        const queued = await readQueuedFieldReports()
        const offlineReport = queuedReportToFieldReport(queuedItem)

        setReports((current) => [
          offlineReport,
          ...current.filter(
            (report) => report.id !== offlineReport.id,
          ),
        ])
        setSelected(offlineReport)
        if (isCommunity) {
          setCommunityReportCodes(rememberCommunityReportCode(offlineReport.code))
        }
        setPendingSyncCount(queued.length)
        setUsingOfflineCache(true)

        setForm(emptyForm)
        setPhotoFiles([])
        setShowCreateModal(false)

        setSuccess(
          `${offlineReport.code} saved offline. It will sync automatically when the network returns.`,
        )

        return
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/field-reports`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(isCommunity && reporterToken
                ? { "X-Reporter-Token": reporterToken }
                : {}),
            },
            body: JSON.stringify(body),
          },
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => null)

          throw new Error(
            payload?.detail ??
              `Report creation failed with ${response.status}`,
          )
        }

        const payload: {
          message: string
          data: ApiFieldReport
        } = await response.json()

        const newReport = mapReport(payload.data)

        setReports((current) => [
          newReport,
          ...current,
        ])

        setSelected(newReport)
        if (isCommunity) {
          setCommunityReportCodes(rememberCommunityReportCode(newReport.code))
        }

        await cacheReports(
          [newReport, ...reports].filter(
            (report, index, all) =>
              all.findIndex(
                (item) => item.id === report.id,
              ) === index,
          ),
        )

        setForm(emptyForm)
        setPhotoFiles([])
        setShowCreateModal(false)

        setSuccess(
          `${newReport.code} created successfully and submitted to BhooPehra.`,
        )
      } catch (networkError) {
        if (!navigator.onLine) {
          const queuedItem: QueuedFieldReport = {
            localId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            body,
          }

          await queueFieldReport(queuedItem)

          const queued = await readQueuedFieldReports()
          const offlineReport = queuedReportToFieldReport(queuedItem)

          setReports((current) => [
            offlineReport,
            ...current.filter(
              (report) => report.id !== offlineReport.id,
            ),
          ])
          setSelected(offlineReport)
          setPendingSyncCount(queued.length)
          setUsingOfflineCache(true)

          setForm(emptyForm)
          setPhotoFiles([])
          setShowCreateModal(false)

          setSuccess(
            `${offlineReport.code} saved offline because the network was lost. It will sync automatically.`,
          )

          return
        }

        throw networkError
      }
    } catch (requestError) {
      console.error(requestError)

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create field report.",
      )
    } finally {
      setActionLoading(false)
    }
  }

  function handlePhotoSelection(files: FileList | null) {
    if (!files) {
      return
    }

    const selectedFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    )

    if (selectedFiles.length > 6) {
      setError("You can attach a maximum of 6 photos per field report.")
    } else {
      setError(null)
    }

    const nextFiles = selectedFiles.slice(0, 6)
    setPhotoFiles(nextFiles)
    setForm((current) => ({
      ...current,
      photoCount: String(nextFiles.length),
    }))
  }

  function removePhoto(index: number) {
    setPhotoFiles((current) => {
      const nextFiles = current.filter((_, fileIndex) => fileIndex !== index)
      setForm((currentForm) => ({
        ...currentForm,
        photoCount: String(nextFiles.length),
      }))
      return nextFiles
    })
  }

  function captureCurrentGps() {
    if (!navigator.geolocation) {
      setError("This device/browser does not provide GPS location.")
      return
    }

    setGpsLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude

        setForm((current) => ({
          ...current,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
          location: current.location.trim()
            ? current.location
            : `GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        }))
        setGpsLoading(false)
        setSuccess("Current device GPS captured successfully.")
      },
      (positionError) => {
        setGpsLoading(false)
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location permission was denied. Allow GPS access and try again."
            : "Unable to capture the current GPS position. Please enter coordinates manually.",
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      },
    )
  }

  function updateForm(
    field: keyof NewReportForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] text-slate-100">
      <div className="border-b border-white/5 bg-[#081522] px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Navigation size={14} />
              {isCommunity ? "Community Safety" : isAuthority ? "Authority Operations" : "Field Operations"}
              <span>/</span>
              {isCommunity ? "My Reports" : "Field Reports"}
            </div>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {isCommunity ? "My Reports" : "Field Reports"}
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              {isCommunity
                ? "Report a hazard, add GPS and photos, then track its verification and response status."
                : isAuthority ? "Validate ground observations and coordinate operational response." : "Review assigned ground observations and execute field response."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                isOnline
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
              }`}
            >
              {isOnline ? (
                <Wifi size={14} />
              ) : (
                <CloudOff size={14} />
              )}
              {isOnline
                ? isCommunity
                  ? "Community Network Online"
                  : "Field Network Online"
                : "Offline Mode"}
            </div>

            {pendingSyncCount > 0 && (
              <button
                onClick={() => void syncQueuedReports()}
                disabled={!isOnline || syncing}
                className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs font-medium text-yellow-400 transition hover:bg-yellow-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={
                    syncing ? "animate-spin" : ""
                  }
                />
                {syncing
                  ? "Syncing..."
                  : `Sync ${pendingSyncCount}`}
              </button>
            )}

            <button
              onClick={() => setShowFilters((value) => !value)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <ChevronDown
                size={15}
                className={
                  showFilters
                    ? "rotate-180 transition"
                    : "transition"
                }
              />
              Filters
            </button>

            <button
              onClick={() => void loadReports(true)}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-white/5 bg-[#07131f] px-6 py-4 lg:grid-cols-4">
        <SummaryCard
          label={isCommunity ? "My Reports" : "Total Reports"}
          value={communityReports.length}
          icon={<FileText size={17} />}
          className="text-slate-200"
        />

        <SummaryCard
          label="Pending Sync"
          value={pendingCount}
          icon={<CloudOff size={17} />}
          className="text-yellow-400"
        />

        {isFieldTeam ? (
          <SummaryCard
            label="In Progress"
            value={inProgressCount}
            icon={<Navigation size={17} />}
            className="text-yellow-400"
          />
        ) : (
          <SummaryCard
            label="Submitted"
            value={submittedCount}
            icon={<Send size={17} />}
            className="text-blue-400"
          />
        )}

        <SummaryCard
          label="Critical Reports"
          value={criticalCount}
          icon={<TriangleAlert size={17} />}
          className="text-red-400"
        />
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {(usingOfflineCache ||
        pendingSyncCount > 0 ||
        syncing) && (
        <div className="mx-6 mt-4 flex flex-col gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <CloudOff
              size={15}
              className="mt-0.5 shrink-0 text-yellow-400"
            />
            <div>
              <div className="text-xs font-semibold text-yellow-300">
                {syncing
                  ? "Synchronizing offline reports..."
                  : isOnline
                    ? "Offline queue ready"
                    : "Working from offline storage"}
              </div>
              <div className="mt-1 text-[11px] text-yellow-200/60">
                {pendingSyncCount > 0
                  ? `${pendingSyncCount} report${
                      pendingSyncCount === 1
                        ? ""
                        : "s"
                    } waiting for backend synchronization.`
                  : "Previously cached field reports remain available on this device."}
              </div>
            </div>
          </div>

          {isOnline && pendingSyncCount > 0 && (
            <button
              onClick={() => void syncQueuedReports()}
              disabled={syncing}
              className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/15 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          )}
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-[#081522] px-6 py-3">
          <FilterSelect
            value={severityFilter}
            onChange={(value) =>
              setSeverityFilter(
                value as Severity | "ALL",
              )
            }
            options={[
              "ALL",
              "CRITICAL",
              "HIGH",
              "MODERATE",
              "LOW",
            ]}
          />

          <FilterSelect
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(
                value as ReportStatus | "ALL",
              )
            }
            options={[
              "ALL",
              "PENDING SYNC",
              "SUBMITTED",
              "VERIFIED",
              "REJECTED",
            ]}
          />

          {(severityFilter !== "ALL" ||
            statusFilter !== "ALL") && (
            <button
              onClick={() => {
                setSeverityFilter("ALL")
                setStatusFilter("ALL")
              }}
              className="text-xs text-slate-500 hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="grid min-h-[calc(100vh-280px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="border-r border-white/5">
          <div className="border-b border-white/5 bg-[#081522] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  Field Activity
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {filteredReports.length} reports in current view
                </p>
              </div>

              <div className="relative w-full md:w-64">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search reports..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/30"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2
                  size={18}
                  className="animate-spin"
                />
                Loading field reports...
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => {
                    setSelected(report)
                    setAssignedTeamInput(report.assignedTeam ?? "")
                    setResponseNotesInput(report.responseNotes ?? "")
                  }}
                  className={`w-full px-5 py-4 text-left transition hover:bg-white/[0.025] ${
                    selected?.id === report.id
                      ? "border-l-2 border-emerald-500 bg-emerald-500/[0.04]"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-lg p-2 ${
                        severityStyles[report.severity].bg
                      } ${
                        severityStyles[report.severity].text
                      }`}
                    >
                      <Camera size={17} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                            severityStyles[report.severity].bg
                          } ${
                            severityStyles[report.severity].text
                          }`}
                        >
                          {report.severity}
                        </span>

                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                            statusStyles[report.status].bg
                          } ${
                            statusStyles[report.status].text
                          }`}
                        >
                          {report.status}
                        </span>

                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                            responseStatusStyles[report.responseStatus].bg
                          } ${
                            responseStatusStyles[report.responseStatus].text
                          }`}
                        >
                          {report.responseStatusLabel}
                        </span>

                        <span className="text-[10px] text-slate-600">
                          {report.code}
                        </span>
                      </div>

                      <h3 className="mt-2 truncate text-sm font-semibold text-slate-200">
                        {report.title}
                      </h3>

                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={12} />
                        {report.location}, {report.state}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                        <span>{report.hazard}</span>

                        <span className="flex items-center gap-1">
                          <Clock3 size={11} />
                          {report.timestamp}
                        </span>

                        <span>
                          {report.photoCount} photos
                        </span>
                      </div>
                    </div>

                    <ChevronDown
                      size={15}
                      className="-rotate-90 shrink-0 text-slate-700"
                    />
                  </div>
                </button>
              ))}

              {filteredReports.length === 0 && (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <Search
                    size={28}
                    className="text-slate-700"
                  />

                  <p className="mt-3 text-sm text-slate-500">
                    {isCommunity
                      ? "No reports submitted from this device yet"
                      : "No reports found"}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="bg-[#081522]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {isCommunity ? "Community Report" : "Ground Verification"}
                </div>

                <div className="mt-1 text-lg font-semibold">
                  {isCommunity ? "Report Status" : "Report Details"}
                </div>
              </div>

              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <ShieldCheck size={18} />
              </div>
            </div>
          </div>

          {selected ? (
            <div className="p-5">
              <div
                className={`rounded-xl border p-4 ${
                  severityStyles[selected.severity].border
                } ${severityStyles[selected.severity].bg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className={`text-[10px] font-bold tracking-widest ${
                        severityStyles[selected.severity].text
                      }`}
                    >
                      {selected.severity} FIELD REPORT
                    </div>

                    <h2 className="mt-2 text-lg font-semibold">
                      {selected.title}
                    </h2>

                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <MapPin size={12} />
                      {selected.location}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
                      statusStyles[selected.status].bg
                    } ${
                      statusStyles[selected.status].text
                    }`}
                  >
                    {selected.status}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <DetailBox
                  label="Report ID"
                  value={selected.code}
                />

                <DetailBox
                  label="Reporter"
                  value={selected.reporter}
                />

                <DetailBox
                  label="Hazard"
                  value={selected.hazard}
                />

                <DetailBox
                  label="District"
                  value={selected.district}
                />

                <DetailBox
                  label="State"
                  value={selected.state}
                />

                <DetailBox
                  label="Photos"
                  value={`${selected.photoCount} attached`}
                />
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold">
                  GPS Location
                </h3>

                <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                      <MapPin size={16} />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-300">
                        Field coordinates
                      </div>

                      <div className="mt-1 font-mono text-xs text-slate-500">
                        {selected.latitude.toFixed(4)},{" "}
                        {selected.longitude.toFixed(4)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold">
                  Observation
                </h3>

                <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  <p className="text-xs leading-5 text-slate-400">
                    {selected.description}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-semibold">
                  Reported Impact
                </h3>

                <div className="mt-3 space-y-2">
                  <ImpactRow
                    label="Road Impact"
                    value={selected.roadImpact}
                  />

                  <ImpactRow
                    label="Village Exposure"
                    value={selected.villageImpact}
                  />
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Photo Evidence
                  </h3>

                  <span className="text-xs text-slate-600">
                    {selected.photoCount} files
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {Array.from({
                    length: Math.min(
                      selected.photoCount,
                      4,
                    ),
                  }).map((_, index) => (
                    <div
                      key={index}
                      className="flex aspect-square items-center justify-center rounded-lg border border-white/5 bg-gradient-to-br from-slate-800 to-slate-900"
                    >
                      <Camera
                        size={18}
                        className="text-slate-600"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {isCommunity && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Report Progress
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-200">
                        Verification & Response Status
                      </h3>
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${
                        responseStatusStyles[selected.responseStatus].border
                      } ${responseStatusStyles[selected.responseStatus].bg} ${
                        responseStatusStyles[selected.responseStatus].text
                      }`}
                    >
                      {selected.responseStatusLabel}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <ResponseTimelineItem
                      label="Report Submitted"
                      active={selected.status === "SUBMITTED" || selected.status === "VERIFIED"}
                      timestamp={selected.submittedAt}
                    />
                    <ResponseTimelineItem
                      label="Report Verified"
                      active={selected.status === "VERIFIED"}
                      timestamp={selected.verifiedAt}
                    />
                    <ResponseTimelineItem
                      label="Team Assigned"
                      active={
                        selected.responseStatus === "TEAM_ASSIGNED" ||
                        selected.responseStatus === "IN_PROGRESS" ||
                        selected.responseStatus === "RESOLVED"
                      }
                      timestamp={selected.assignedAt}
                    />
                    <ResponseTimelineItem
                      label="Response In Progress"
                      active={
                        selected.responseStatus === "IN_PROGRESS" ||
                        selected.responseStatus === "RESOLVED"
                      }
                      timestamp={selected.startedAt}
                    />
                    <ResponseTimelineItem
                      label="Resolved"
                      active={selected.responseStatus === "RESOLVED"}
                      timestamp={selected.resolvedAt}
                    />
                  </div>

                  {selected.status === "REJECTED" && (
                    <div className="mt-4 rounded-lg border border-red-500/10 bg-red-500/[0.04] px-3 py-3 text-xs text-red-300">
                      This report was rejected during verification. No response assignment is shown for it.
                    </div>
                  )}
                </div>
              )}

              {(isAuthority || isFieldTeam) && selected.status === "VERIFIED" && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        {isAuthority ? "Operational Response" : "Field Response"}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-200">
                      {isAuthority ? "Response Tracking" : "Assigned Response"}
                    </h3>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${
                      responseStatusStyles[selected.responseStatus].border
                    } ${responseStatusStyles[selected.responseStatus].bg} ${
                      responseStatusStyles[selected.responseStatus].text
                    }`}
                  >
                    {selected.responseStatusLabel}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <ResponseTimelineItem
                    label="Alert Generated"
                    active={
                      selected.responseStatus !== "NOT_STARTED"
                    }
                    timestamp={selected.alertGeneratedAt}
                  />

                  <ResponseTimelineItem
                    label="Team Assigned"
                    active={
                      selected.responseStatus === "TEAM_ASSIGNED" ||
                      selected.responseStatus === "IN_PROGRESS" ||
                      selected.responseStatus === "RESOLVED"
                    }
                    timestamp={selected.assignedAt}
                    detail={selected.assignedTeam ?? undefined}
                  />

                  <ResponseTimelineItem
                    label="In Progress"
                    active={
                      selected.responseStatus === "IN_PROGRESS" ||
                      selected.responseStatus === "RESOLVED"
                    }
                    timestamp={selected.startedAt}
                  />

                  <ResponseTimelineItem
                    label="Resolved"
                    active={selected.responseStatus === "RESOLVED"}
                    timestamp={selected.resolvedAt}
                  />
                </div>

                {isAuthority && selected.responseStatus === "NOT_STARTED" && (
                  <button
                    type="button"
                    onClick={() =>
                      void updateResponse(
                        selected,
                        "ALERT_GENERATED",
                      )
                    }
                    disabled={responseActionLoading}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-[#170b02] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {responseActionLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <TriangleAlert size={16} />
                    )}
                    Generate Alert
                  </button>
                )}

                {isAuthority && selected.responseStatus === "ALERT_GENERATED" && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-400">
                        Response Team
                      </label>
                      <input
                        value={assignedTeamInput}
                        onChange={(event) =>
                          setAssignedTeamInput(event.target.value)
                        }
                        placeholder="Enter actual team name"
                        className="w-full rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-500/30"
                      />
                    </div>

                    <ResponseNotesInput
                      value={responseNotesInput}
                      onChange={setResponseNotesInput}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void updateResponse(
                          selected,
                          "TEAM_ASSIGNED",
                          assignedTeamInput,
                        )
                      }
                      disabled={responseActionLoading || !assignedTeamInput.trim()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-3 text-sm font-semibold text-[#03101c] transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {responseActionLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={16} />
                      )}
                      Assign Team
                    </button>
                  </div>
                )}

                {(isAuthority || isFieldTeam) && selected.responseStatus === "TEAM_ASSIGNED" && (
                  <div className="mt-4 space-y-3">
                    {selected.assignedTeam && (
                      <div className="rounded-lg border border-blue-500/10 bg-blue-500/[0.04] px-3 py-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">
                          Assigned Team
                        </div>
                        <div className="mt-1 text-sm font-semibold text-blue-300">
                          {selected.assignedTeam}
                        </div>
                      </div>
                    )}

                    <ResponseNotesInput
                      value={responseNotesInput}
                      onChange={setResponseNotesInput}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void updateResponse(
                          selected,
                          "IN_PROGRESS",
                        )
                      }
                      disabled={responseActionLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 text-sm font-semibold text-[#171300] transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {responseActionLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Navigation size={16} />
                      )}
                      Start Response
                    </button>
                  </div>
                )}

                {(isAuthority || isFieldTeam) && selected.responseStatus === "IN_PROGRESS" && (
                  <div className="mt-4 space-y-3">
                    {selected.assignedTeam && (
                      <div className="rounded-lg border border-yellow-500/10 bg-yellow-500/[0.04] px-3 py-3">
                        <div className="text-[9px] uppercase tracking-wider text-slate-600">
                          Active Response Team
                        </div>
                        <div className="mt-1 text-sm font-semibold text-yellow-300">
                          {selected.assignedTeam}
                        </div>
                      </div>
                    )}

                    <ResponseNotesInput
                      value={responseNotesInput}
                      onChange={setResponseNotesInput}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void updateResponse(
                          selected,
                          "RESOLVED",
                        )
                      }
                      disabled={responseActionLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#03130d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {responseActionLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Mark Resolved
                    </button>
                  </div>
                )}

                {isFieldTeam && selected.responseStatus === "NOT_STARTED" && (
                  <div className="mt-4 rounded-lg border border-slate-500/10 bg-slate-500/[0.04] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <Clock3 size={14} />
                      Awaiting Authority Assignment
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      This verified report has not yet entered the operational response queue. Authority must generate the alert and assign a response team first.
                    </p>
                  </div>
                )}

                {isFieldTeam && selected.responseStatus === "ALERT_GENERATED" && (
                  <div className="mt-4 rounded-lg border border-orange-500/10 bg-orange-500/[0.04] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-orange-300">
                      <TriangleAlert size={14} />
                      Team Assignment Pending
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      An operational alert has been generated. The field team can act after Authority assigns the actual response team.
                    </p>
                  </div>
                )}

                {selected.responseStatus === "RESOLVED" && (
                  <div className="mt-4 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.04] p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 size={14} />
                      Response Resolved
                    </div>
                    {selected.assignedTeam && (
                      <div className="mt-2 text-xs text-slate-500">
                        Team: <span className="font-semibold text-slate-300">{selected.assignedTeam}</span>
                      </div>
                    )}
                  </div>
                )}

                  {selected.responseNotes && (
                    <div className="mt-3 text-[11px] leading-5 text-slate-500">
                      Latest response note: {selected.responseNotes}
                    </div>
                  )}
                </div>
              )}

              {isAuthority && selected.status === "SUBMITTED" && (
                <div className="mt-6 rounded-xl border border-blue-500/10 bg-blue-500/[0.04] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                    <Clock3 size={14} />
                    Verification required before response
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Verify this ground observation before generating an operational alert or assigning a response team.
                  </p>
                </div>
              )}

              {isAuthority && selected.status === "REJECTED" && (
                <div className="mt-6 rounded-xl border border-red-500/10 bg-red-500/[0.04] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
                    <TriangleAlert size={14} />
                    Report rejected
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    This report is not eligible for operational response tracking.
                  </p>
                </div>
              )}

              {isAuthority && selected.verificationNotes && (
                <div className="mt-5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 size={14} />
                    Verification Notes
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {selected.verificationNotes}
                  </p>
                </div>
              )}

              {isAuthority && selected.status === "SUBMITTED" && (
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      void updateStatus(
                        selected,
                        "VERIFIED",
                      )
                    }
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#03130d] transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Verify
                  </button>

                  <button
                    onClick={() =>
                      void updateStatus(
                        selected,
                        "REJECTED",
                      )
                    }
                    disabled={actionLoading}
                    className="flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <FileText
                size={30}
                className="text-slate-700"
              />

              <p className="mt-3 text-sm text-slate-500">
                No field reports available.
              </p>
            </div>
          )}
        </aside>
      </div>

      <button
        onClick={() => {
          setError(null)
          setSuccess(null)
          setForm(emptyForm)
          setShowCreateModal(true)
        }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-[#03130d] shadow-2xl transition hover:bg-emerald-400"
      >
        <Upload size={16} />
        {isCommunity ? "Report Hazard" : "New Field Report"}
      </button>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#081522] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-[#081522] px-6 py-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                  {isCommunity ? "Community Safety" : isAuthority ? "Authority Operations" : "Field Operations"}
                </div>

                <h2 className="mt-1 text-xl font-semibold">
                  {isCommunity ? "Report a Hazard" : isAuthority ? "New Field Report" : "New Field Report"}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {isCommunity
                    ? "Tell BhooPehra what you observed. Add GPS and real photos when available."
                    : "Submit a new ground observation directly to BhooPehra."}
                </p>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={createReport}
              className="space-y-5 p-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                {!isCommunity && (
                  <FormField
                    label="Report Title"
                    required
                    value={form.title}
                    onChange={(value) =>
                      updateForm("title", value)
                    }
                    placeholder="Fresh cracks observed..."
                  />
                )}

                <FormField
                  label={isCommunity ? "Your Name" : "Reporter"}
                  required
                  value={form.reporter}
                  onChange={(value) =>
                    updateForm("reporter", value)
                  }
                  placeholder={isCommunity ? "Enter your name" : "Field Team Alpha"}
                />

                {isCommunity ? (
                  <SelectField
                    label="What did you observe?"
                    value={form.hazard}
                    onChange={(value) =>
                      updateForm("hazard", value)
                    }
                    options={[
                      "",
                      "Landslide",
                      "Road blocked",
                      "Slope cracks",
                      "Rockfall",
                      "Flood / waterlogging",
                      "Other",
                    ]}
                  />
                ) : (
                  <FormField
                    label="Hazard"
                    required
                    value={form.hazard}
                    onChange={(value) =>
                      updateForm("hazard", value)
                    }
                    placeholder="Slope instability"
                  />
                )}

                <SelectField
                  label={isCommunity ? "Observed Severity" : "Severity"}
                  value={form.severity}
                  onChange={(value) =>
                    updateForm("severity", value)
                  }
                  options={[
                    "CRITICAL",
                    "HIGH",
                    "MODERATE",
                    "LOW",
                  ]}
                />

                <FormField
                  label="Location"
                  required
                  value={form.location}
                  onChange={(value) =>
                    updateForm("location", value)
                  }
                  placeholder="Gangtok Corridor"
                />

                <FormField
                  label="State"
                  required
                  value={form.state}
                  onChange={(value) =>
                    updateForm("state", value)
                  }
                  placeholder="Sikkim"
                />

                <FormField
                  label="Latitude"
                  required
                  type="number"
                  value={form.latitude}
                  onChange={(value) =>
                    updateForm("latitude", value)
                  }
                  placeholder="27.3389"
                />

                <FormField
                  label="Longitude"
                  required
                  type="number"
                  value={form.longitude}
                  onChange={(value) =>
                    updateForm("longitude", value)
                  }
                  placeholder="88.6065"
                />

                {!isCommunity && (
                  <>
                    <FormField
                      label="District ID"
                      type="number"
                      value={form.districtId}
                      onChange={(value) =>
                        updateForm("districtId", value)
                      }
                      placeholder="1"
                    />

                    <FormField
                      label="Risk Zone ID"
                      type="number"
                      value={form.riskZoneId}
                      onChange={(value) =>
                        updateForm("riskZoneId", value)
                      }
                      placeholder="2"
                    />
                  </>
                )}

                <div className="md:col-span-2 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Camera size={14} className="text-emerald-400" />
                        Photo Evidence
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        Attach up to 6 real field photographs. The report stores the attached photo count; image files remain on this device and are not uploaded by this workflow.
                      </p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/15">
                      <Camera size={14} />
                      Add Photos
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={(event) => {
                          handlePhotoSelection(event.target.files)
                          event.currentTarget.value = ""
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {photoFiles.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      {photoFiles.map((file, index) => (
                        <div key={`${file.name}-${file.lastModified}-${index}`} className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/20">
                          <img
                            src={photoPreviews[index]}
                            alt={`Field evidence ${index + 1}`}
                            className="aspect-square w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white transition hover:bg-red-500"
                            aria-label={`Remove photo ${index + 1}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-white/10 px-4 py-4 text-center text-[11px] text-slate-600">
                      No photo evidence attached
                    </div>
                  )}
                </div>

                {!isCommunity && (
                  <>
                    <FormField
                      label="Road Impact"
                      value={form.roadImpact}
                      onChange={(value) =>
                        updateForm("roadImpact", value)
                      }
                      placeholder="No immediate impact"
                    />

                    <FormField
                      label="Village Impact"
                      value={form.villageImpact}
                      onChange={(value) =>
                        updateForm("villageImpact", value)
                      }
                      placeholder="No villages currently exposed"
                      className="md:col-span-2"
                    />
                  </>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">
                  Observation Description
                  <span className="ml-1 text-red-400">
                    *
                  </span>
                </label>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm(
                      "description",
                      event.target.value,
                    )
                  }
                  rows={5}
                  placeholder={
                    isCommunity
                      ? "Describe what you saw, where it happened, and any immediate danger to people or roads..."
                      : "Describe the observed landslide, cracks, debris, seepage, rockfall or other ground condition..."
                  }
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/30"
                />
              </div>

              <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <MapPin size={14} />
                  GPS coordinates
                </div>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-500">
                    {isCommunity
                      ? "Use Current GPS to attach your real device location. GPS works independently of backend connectivity."
                      : "Capture the current device position or enter coordinates manually above. GPS works independently of backend connectivity."}
                  </p>

                  <button
                    type="button"
                    onClick={captureCurrentGps}
                    disabled={gpsLoading}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {gpsLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Navigation size={14} />
                    )}
                    {gpsLoading ? "Locating..." : "Use Current GPS"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-white/5 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowCreateModal(false)
                  }
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-[#03130d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <Send size={16} />
                  )}
                  {isCommunity ? "Submit Hazard Report" : "Submit Field Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  className,
}: {
  label: string
  value: number
  icon: ReactNode
  className: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3">
      <div>
        <div className="text-xs text-slate-500">
          {label}
        </div>

        <div
          className={`mt-1 text-xl font-bold ${className}`}
        >
          {value}
        </div>
      </div>

      <div className={`${className} opacity-80`}>
        {icon}
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="appearance-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-3 pr-9 text-xs text-slate-300 outline-none"
      >
        {options.map((option) => (
          <option
            key={option}
            value={option}
            className="bg-[#081522]"
          >
            {option}
          </option>
        ))}
      </select>

      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  className = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-xs font-medium text-slate-400">
        {label}
        {required && (
          <span className="ml-1 text-red-400">
            *
          </span>
        )}
      </label>

      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/30"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-400">
        {label}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 pr-9 text-sm text-slate-200 outline-none focus:border-emerald-500/30"
        >
          {options.map((option) => (
            <option
              key={option}
              value={option}
              className="bg-[#081522]"
            >
              {option || "Select an option"}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
      </div>
    </div>
  )
}

function ResponseTimelineItem({
  label,
  active,
  timestamp,
  detail,
}: {
  label: string
  active: boolean
  timestamp: string | null
  detail?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          active
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
            : "border-white/10 bg-white/[0.02] text-slate-700"
        }`}
      >
        {active ? <CheckCircle2 size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${active ? "text-slate-300" : "text-slate-600"}`}>
          {label}
        </div>
        {detail && (
          <div className="mt-0.5 text-[11px] text-blue-300">
            {detail}
          </div>
        )}
        {timestamp && (
          <div className="mt-0.5 text-[10px] text-slate-600">
            {formatTimestamp(timestamp)}
          </div>
        )}
      </div>
    </div>
  )
}

function ResponseNotesInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-400">
        Response Notes
      </label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder="Optional operational note..."
        className="w-full resize-none rounded-lg border border-white/10 bg-black/10 px-3 py-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500/30"
      />
    </div>
  )
}

function DetailBox({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
      <div className="text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </div>

      <div className="mt-1 truncate text-xs font-semibold text-slate-300">
        {value}
      </div>
    </div>
  )
}

function ImpactRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span className="max-w-[55%] text-right text-xs font-semibold text-slate-300">
        {value}
      </span>
    </div>
  )
}



