import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Compass,
  Crosshair,
  FileText,
  Home,
  Map,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  Users,
  WifiOff,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRole } from "../context/RoleContext"
import {
  useCommunityLanguage,
  type CommunityLanguage,
} from "../i18n/communityLanguage"


const LOCAL_DASHBOARD_TRANSLATIONS: Record<CommunityLanguage, Record<string, string>> = {
  English: {},
  Hindi: {
    "Community": "??????",
    "Understand local risk, stay safe, report hazards and track your reports.": "??????? ????? ?????, ???????? ????, ????? ?? ??????? ???? ?? ???? ??????? ?? ?????? ??????",
    "GPS is not available in this browser.": "?? ???????? ??? GPS ?????? ???? ???",
    "Current location could not be verified. Allow browser location access and try again.": "??????? ????? ???????? ???? ???? ?? ???? ???????? ??? ????? ?? ?????? ??? ?? ??? ?????? ?????",
    "Getting location...": "????? ??????? ???? ?? ??? ??...",
    "Use Current Location": "??????? ????? ????? ????",
    "Outside currently monitored zones": "??????? ??? ??????? ??? ?? ????????? ?? ????",
    "Location not selected": "????? ????? ???? ??",
    "Your verified GPS position could not be matched to one of the currently mapped BhooPehra risk-zone polygons. No local risk level is being estimated.": "???? ???????? GPS ????? ?? ??????? ??? ??? ?? BhooPehra ????? ??????? ?? ????? ???? ?? ???? ??????? ????? ???? ?? ?????? ???? ????? ?? ??? ???",
    "Use Current Location to check whether your actual position falls inside a monitored BhooPehra risk zone.": "?? ?????? ?? ??? ??????? ????? ????? ???? ?? ???? ???????? ????? BhooPehra ?? ??????? ????? ??????? ??? ??? ?? ?? ?????",
    "Use verified GPS to determine whether your location is inside a monitored zone.": "?? ????????? ???? ?? ??? ???????? GPS ?? ????? ???? ?? ???? ????? ??????? ??????? ??? ?? ?? ?????",
    "Matched to": "????? ???:",
    "Active warning information is available.": "?????? ??????? ?? ??????? ?????? ???",
    "No active emergency alert is currently available.": "??? ??? ?????? ????????? ????? ?????? ???? ???",
    "Safety warning": "??????? ???????",
    "Follow official local authority instructions and avoid unnecessary travel through hazardous areas.": "??????? ????????? ?? ???????? ????????? ?? ???? ???? ?? ?????? ????????? ??? ???????? ?????? ?? ?????",
    "Avoid steep or visibly unstable slopes.": "???? ?? ?????? ??? ?? ?????? ?????? ?? ?????",
    "Do not cross blocked or damaged roads.": "??????? ?? ??????????? ?????? ?? ??? ? ?????",
    "Move away from fresh cracks or falling-rock areas.": "?? ?????? ?? ????? ????? ???? ????????? ?? ??? ?????",
    "Follow official evacuation instructions.": "???????? ?????? ????????? ?? ???? ?????",
    "No active alert is currently available from the BhooPehra alert service. This does not guarantee that no hazard exists; follow official local authority communication during an emergency.": "BhooPehra ????? ???? ?? ??? ??? ?????? ????? ?????? ???? ??? ???? ???? ?? ???? ?? ?? ??? ???? ????? ???? ??; ??????? ??? ??????? ????????? ?? ???????? ????? ?? ???? ?????",
    "Shelter location mapping is pending verification.": "????? ????? ?? ?????? ??????? ????? ???",
    "A verified mapped shelter is not currently available.": "??? ??? ???????? ??? ???? ??? ????? ?????? ???? ???",
    "Registered shelters exist in the system, but mapped shelter coordinates are not currently available for a verified nearest-shelter calculation.": "?????? ??? ??????? ????? ????? ???, ????? ???????? ??????-????? ???? ?? ??? ??? ??? ?? ????? ?????????? ??? ?????? ???? ????",
    "BhooPehra can use verified field reports to identify road blockage information. Route availability is shown only when a verified route assessment exists.": "BhooPehra ???????? ????? ??????? ?? ????? ???? ????? ?? ??????? ??????? ?? ??? ?? ???? ??? ????? ?? ???????? ???? ???????? ????? ???? ???? ?? ????? ???? ???",
    "Submit a hazard report to start tracking its verification and response status here.": "???? ??????? ?? ??????? ?? ??????????? ?????? ???? ????? ?? ??? ???? ?? ??????? ??? ?????",
    "Avoid fresh cracks, falling rocks, steep unstable slopes and visible ground movement.": "?? ??????, ????? ???????, ???? ?????? ?????? ?? ????? ???? ???? ???? ?? ???? ?? ?????",
    "Do not cross debris, flooded sections or visibly damaged roads.": "????, ?????? ??????? ?? ?????? ??? ?? ??????????? ?????? ?? ??? ? ?????",
    "Follow instructions issued by local authorities and emergency services.": "??????? ????????? ?? ????????? ?????? ?????? ???? ????????? ?? ???? ?????",
    "When safe, share the location, hazard type, description and photographs through BhooPehra.": "?? ???????? ??, ?? BhooPehra ?? ?????? ?? ?????, ???? ?? ??????, ????? ?? ???????? ???? ?????",
    "Move to a safer location when possible and contact the appropriate local emergency service. Do not wait for BhooPehra if there is an immediate threat.": "???? ?? ?? ???????? ????? ?? ???? ?? ???? ??????? ????????? ???? ?? ?????? ????? ?????? ???? ??? BhooPehra ?? ?????? ? ?????",
    "Critical emergency instructions are intended to support English, Hindi, Assamese, Mizo and Bengali community users.": "?????????? ????????? ??????? ?????????, ?????, ??????, ????? ?? ?????? ?????? ???????????? ?? ??? ?????? ????",
    "Weather can influence landslide concern, but BhooPehra does not show model internals, rainfall trigger percentages or technical risk-engine calculations on the community dashboard.": "???? ??????? ?? ????? ?? ???????? ?? ???? ??, ????? BhooPehra ????????? ???????? ?? ???? ?? ?????? ???????, ????? ?????? ??????? ?? ?????? ?????-???? ???? ???? ???????",
    "Report a landslide, road blockage, slope crack, rockfall, flooding or another visible hazard when it is safe to do so. GPS, photographs and offline submission are supported by the reporting workflow.": "?? ???????? ??, ?? ???????, ???? ?????, ???? ?? ????, ????? ?????, ???? ?? ???? ???? ????? ???? ???? ???? ?? ??????? ????? ?????????? ????????? GPS, ???????? ?? ?????? ?????? ?? ?????? ???? ???",
    "BhooPehra does not invent local risk, shelter distance, road status or emergency alerts when verified system data is unavailable. Missing or unverified information is shown clearly instead.": "???????? ?????? ???? ?????? ? ???? ?? BhooPehra ??????? ?????, ????? ????, ???? ?????? ?? ????????? ????? ???? ?????? ???????? ?? ????????? ??????? ?? ?????? ??? ?? ?????? ???? ???",
    "Data checked": "???? ????? ???",
    "ACTIVE": "??????",
    "Shelter": "?????",
    "Available": "??????",
    "Verified": "????????",
    "Stay aware of local conditions and follow verified warnings.": "??????? ???????????? ?? ???? ???? ?? ???????? ?????????? ?? ???? ?????",
    "Use caution around slopes and avoid unnecessary travel near known hazard areas.": "?????? ?? ????? ??????? ????? ?? ????? ???? ???? ????????? ?? ??? ???????? ?????? ?? ?????",
    "Avoid steep or unstable slopes, visible cracks and blocked roads. Follow official evacuation instructions.": "???? ?? ?????? ??????, ????? ???? ???? ?????? ?? ??????? ?????? ?? ????? ???????? ?????? ????????? ?? ???? ?????",
  },
  Assamese: {
    "Community": "??????????",
    "Understand local risk, stay safe, report hazards and track your reports.": "???????? ????? ????, ???????? ????, ????? ?????? ??? ??? ?????? ??????? ?????? ?????? ????",
    "GPS is not available in this browser.": "?? ????????? GPS ?????? ?????",
    "Current location could not be verified. Allow browser location access and try again.": "??????? ????? ??????? ???? ??? ??'?? ????????? ?????? ?????? ?? ???? ?????? ????",
    "Getting location...": "????? ??? ??? ????...",
    "Use Current Location": "??????? ????? ??????? ???",
    "Outside currently monitored zones": "??????? ???????? ??? ?????? ??????",
    "Location not selected": "????? ???????? ??? ???? ???",
    "Matched to": "??????:",
    "Active warning information is available.": "??????? ?????????? ???? ???????",
    "No active emergency alert is currently available.": "??????? ???? ??????? ?????????? ????????? ?????? ?????",
    "Safety warning": "??????? ?????????",
    "Avoid steep or visibly unstable slopes.": "???? ?? ?????????? ?????? ??? ???? ????",
    "Do not cross blocked or damaged roads.": "??????? ?? ??????????? ?? ??? ??'??",
    "Move away from fresh cracks or falling-rock areas.": "???? ??? ?? ??? ???? ??? ?????? ??? ????? ?????",
    "Follow official evacuation instructions.": "?????? ??????????? ????????? ???? ????",
    "Data checked": "???? ??????? ??? ????",
    "ACTIVE": "???????",
    "Shelter": "??????",
    "Available": "??????",
    "Verified": "????????",
    "Stay aware of local conditions and follow verified warnings.": "???????? ?????????? ?????? ???? ???? ??? ???????? ????????? ???? ????",
    "Use caution around slopes and avoid unnecessary travel near known hazard areas.": "???? ???? ?????? ??? ??? ??? ???? ?????? ???? ???????????? ?????? ???? ????",
    "Avoid steep or unstable slopes, visible cracks and blocked roads. Follow official evacuation instructions.": "???? ?? ?????? ???, ???????? ??? ??? ??????? ?? ???? ???? ?????? ??????????? ????????? ???? ????",
    "Location-specific safety information is shown only when your current location can be matched to an actual monitored risk zone.": "?????-????????? ??????? ???? ???? ????????? ??????? ??? ??????? ?????? ??????? ????? ??? ?????? ???????? ??? ????? ?????? ???? ????? ?????",
    "Your verified GPS position could not be matched to one of the currently mapped BhooPehra risk-zone polygons. No local risk level is being estimated.": "?????? ???????? GPS ????? ??????? ??? ??? BhooPehra ????? ?????? ???? ????? ????????? ???????? ????? ????? ???? ?????? ??? ???? ????",
    "Use Current Location to check whether your actual position falls inside a monitored BhooPehra risk zone.": "?????? ?????? ????? BhooPehra-? ???????? ??? ????? ?????? ????? ??? ?? ??? ??????? ?????? ??????? ????? ??????? ????",
    "No active alert is currently available from the BhooPehra alert service. This does not guarantee that no hazard exists; follow official local authority communication during an emergency.": "BhooPehra ????????? ????? ??? ??????? ???? ??????? ????????? ?????? ????? ????? ???? ???? ??? ???? ??????? ????; ????????? ???????? ?????????? ?????? ???? ?????? ????",
    "Registered shelters exist in the system, but mapped shelter coordinates are not currently available for a verified nearest-shelter calculation.": "????????? ???????? ??? ?????? ???, ?????? ???????? ?????? ?????? ????? ???? ??? ??? ??????? ???????? ??????? ?????? ?????",
    "BhooPehra can use verified field reports to identify road blockage information. Route availability is shown only when a verified route assessment exists.": "BhooPehra-? ???????? ????? ?????? ??????? ??? ?? ?????? ???? ??????? ???? ????? ???????? ?? ????????? ???????? ??? ???????? ??????? ????",
    "Submit a hazard report to start tracking its verification and response status here.": "????? ??????? ??? ????????????? ?????? ?????? ?????? ??? ????? ?????? ??? ??????",
    "Avoid fresh cracks, falling rocks, steep unstable slopes and visible ground movement.": "???? ???, ??? ???, ???? ?????? ??? ??? ???????? ????? ????? ???? ????",
    "Do not cross debris, flooded sections or visibly damaged roads.": "???????, ????? ???? ??? ?? ?????????? ??????????? ?? ??? ??'??",
    "Follow instructions issued by local authorities and emergency services.": "???????? ????????? ??? ?????????? ????? ???? ??? ????????? ???? ????",
    "When safe, share the location, hazard type, description and photographs through BhooPehra.": "???????? ?'?? BhooPehra-? ??????? ?????, ????? ???, ????? ??? ??? ???????? ????",
    "Move to a safer location when possible and contact the appropriate local emergency service. Do not wait for BhooPehra if there is an immediate threat.": "????? ?'?? ???????? ??????? ???? ??? ??????? ???????? ?????????? ????? ???? ??????? ???? ????????? ???? ?????? BhooPehra-? ???? ??????? ??????",
    "Critical emergency instructions are intended to support English, Hindi, Assamese, Mizo and Bengali community users.": "???????????? ?????????? ????????? ??????, ??????, ???????, ???? ??? ????? ??????????? ???????????? ???? ???????",
    "Weather can influence landslide concern, but BhooPehra does not show model internals, rainfall trigger percentages or technical risk-engine calculations on the community dashboard.": "???? ?????????? ?????? ???????? ???? ????, ?????? BhooPehra-? ?????????? ??????'???? ????? ??????? ????, ????? ??????? ????? ?? ??????? ?????-?????? ???? ??????? ?????",
    "Report a landslide, road blockage, slope crack, rockfall, flooding or another visible hazard when it is safe to do so. GPS, photographs and offline submission are supported by the reporting workflow.": "???????? ?'?? ?????????, ?? ?????, ???? ???, ??? ???, ??????? ?? ?? ???????? ????? ?????? ???? ???????? ??????????? GPS, ??? ??? ?????? ??? ?????? ????",
    "BhooPehra does not invent local risk, shelter distance, road status or emergency alerts when verified system data is unavailable. Missing or unverified information is shown clearly instead.": "???????? ??????? ???? ?????? ??????? BhooPehra-? ???????? ?????, ??????? ??????, ??? ?????? ?? ?????????? ????????? ???? ????? ???????? ?? ????????? ???? ?????????? ??????? ????",
  },
  Mizo: {
    "Community": "Khawtlang",
    "Understand local risk, stay safe, report hazards and track your reports.": "Hmun chhûng risk hrethiam rawh, him taka awm rawh, thil hlauhawm report rawh leh i report-te dinhmun zui rawh.",
    "GPS is not available in this browser.": "He browser-ah GPS a awm lo.",
    "Current location could not be verified. Allow browser location access and try again.": "Tunah i hmun dikna verify theih lo. Browser-ah hmun hman phalna pe la, chuan thawk leh rawh.",
    "Getting location...": "Hmun zawng mek...",
    "Use Current Location": "Tunah hmun hmang rawh",
    "Outside currently monitored zones": "Tunah enhimna hmun pawnah",
    "Location not selected": "Hmun thlan a ni lo",
    "Matched to": "A milna:",
    "Active warning information is available.": "Thuchah kal mek hriatna a awm.",
    "No active emergency alert is currently available.": "Tunah emergency thuchah kal mek a awm lo.",
    "Safety warning": "Himna thuchah",
    "Avoid steep or visibly unstable slopes.": "Dawh hmun sang emaw him lo deuh te pumpelh rawh.",
    "Do not cross blocked or damaged roads.": "Kawng khar emaw tihchhiat kawng te zawh kual suh.",
    "Move away from fresh cracks or falling-rock areas.": "Kawngpui thar emaw lung tla theih hmun atangin kal hlauh rawh.",
    "Follow official evacuation instructions.": "Official kal chhuah tur thuchah zawm rawh.",
    "Data checked": "Data en fel a ni",
    "ACTIVE": "Kal mek",
    "Shelter": "Hmun him",
    "Available": "A awm",
    "Verified": "Dikna awm",
    "Location-specific safety information is shown only when your current location can be matched to an actual monitored risk zone.": "Hmun bik himna hriatna chu i hmun tunlai chu risk hmun dik nena mil theih chauhvin tihchhuah a ni.",
    "Your verified GPS position could not be matched to one of the currently mapped BhooPehra risk-zone polygons. No local risk level is being estimated.": "I GPS hmun dik chu tunlai BhooPehra risk hmun map te nena mil theih lo. Hmun risk level chhiar a ni lo.",
    "Use Current Location to check whether your actual position falls inside a monitored BhooPehra risk zone.": "I hmun dik chu BhooPehra risk hmun enhimna chhungah a awm em tih en nan tunlai hmun hmang rawh.",
    "No active alert is currently available from the BhooPehra alert service. This does not guarantee that no hazard exists; follow official local authority communication during an emergency.": "BhooPehra alert service atangin tunah alert kal mek a awm lo. Hei hian hlauhawm a awm lo tih a chiang lo; emergency-ah official local authority thuchah zawm rawh.",
    "Registered shelters exist in the system, but mapped shelter coordinates are not currently available for a verified nearest-shelter calculation.": "System-ah shelter register a awm, mahse nearest shelter chhiarna dik atan shelter hmun coordinate map a awm lo.",
    "BhooPehra can use verified field reports to identify road blockage information. Route availability is shown only when a verified route assessment exists.": "BhooPehra-in field report dikte hmangin kawng khar hriatna a siam thei. Route dikna assessment a awm chauhvin route availability a lang.",
    "Submit a hazard report to start tracking its verification and response status here.": "Heta hian i hazard report dikna leh puihna dinhmun zui nan report thawn rawh.",
    "Avoid fresh cracks, falling rocks, steep unstable slopes and visible ground movement.": "Crack thar, lung tla, dawh hmun him lo leh lei chet i hmuh te pumpelh rawh.",
    "Do not cross debris, flooded sections or visibly damaged roads.": "Debris, tui lian hmun emaw kawng tihchhiat te zawh kual suh.",
    "Follow instructions issued by local authorities and emergency services.": "Local authority leh emergency service te thuchah zawm rawh.",
    "When safe, share the location, hazard type, description and photographs through BhooPehra.": "Him taka awm chuan hmun, hazard type, thu leh photo te BhooPehra hmangin thawn rawh.",
    "Move to a safer location when possible and contact the appropriate local emergency service. Do not wait for BhooPehra if there is an immediate threat.": "A theih chuan hmun him zawkah kal la local emergency service nena inbiak rawh. Tunah hlauhawm a awm chuan BhooPehra nghah suh.",
    "Critical emergency instructions are intended to support English, Hindi, Assamese, Mizo and Bengali community users.": "Emergency thuchah pawimawh te chu English, Hindi, Assamese, Mizo leh Bengali khawtlang hmanruate tan an awm.",
    "Weather can influence landslide concern, but BhooPehra does not show model internals, rainfall trigger percentages or technical risk-engine calculations on the community dashboard.": "Thliarhmunin landslide hlauhawm a nghawng thei, mahse BhooPehra khawtlang dashboard-ah model chhunga thil, ruah trigger percentage emaw technical risk-engine chhiarna te a lang lo.",
    "Report a landslide, road blockage, slope crack, rockfall, flooding or another visible hazard when it is safe to do so. GPS, photographs and offline submission are supported by the reporting workflow.": "Him taka tih theih chuan landslide, kawng khar, slope crack, lung tla, tui lian emaw thil hlauhawm dang report rawh. Reporting workflow hian GPS, photo leh offline submission a pui.",
    "BhooPehra does not invent local risk, shelter distance, road status or emergency alerts when verified system data is unavailable. Missing or unverified information is shown clearly instead.": "System data dik a awm loh chuan BhooPehra-in local risk, shelter hla zawng, kawng dinhmun emaw emergency alert a siamchhuak lo. A awm lo emaw verify loh te chu chiang taka a lang.",
  },
  Bengali: {
    "Community": "????????",
    "Understand local risk, stay safe, report hazards and track your reports.": "???????? ????? ?????, ?????? ?????, ?????? ??????? ???? ??? ????? ????????? ?????? ??????",
    "GPS is not available in this browser.": "?? ????????? GPS ?????? ????",
    "Current location could not be verified. Allow browser location access and try again.": "??????? ??????? ????? ??? ??????? ????????? ????????? ?????? ????? ???? ?????? ?????",
    "Getting location...": "??????? ?????? ?????...",
    "Use Current Location": "??????? ??????? ??????? ????",
    "Outside currently monitored zones": "???????? ??????????? ?????? ?????",
    "Location not selected": "??????? ???????? ??? ?????",
    "Matched to": "??????:",
    "Active warning information is available.": "??????? ???????? ???? ???????",
    "No active emergency alert is currently available.": "???????? ???? ??????? ????? ??????? ?????? ????",
    "Safety warning": "????????? ???????",
    "Avoid steep or visibly unstable slopes.": "????? ?? ?????? ?????????? ??? ??????? ?????",
    "Do not cross blocked or damaged roads.": "??????? ?? ??????????? ?????? ??? ???? ???",
    "Move away from fresh cracks or falling-rock areas.": "???? ???? ?? ???? ????? ????? ???? ???? ??????",
    "Follow official evacuation instructions.": "?????? ?????? ??????? ????????? ?????? ?????",
    "Data checked": "???? ??????? ??? ??????",
    "ACTIVE": "???????",
    "Shelter": "??????",
    "Available": "??????",
    "Verified": "????????",
    "Location-specific safety information is shown only when your current location can be matched to an actual monitored risk zone.": "?????-????????? ????????? ???? ???? ?????? ??? ??? ????? ??????? ??????? ???? ?????? ??????????? ????? ?????? ????? ?????? ?????",
    "Your verified GPS position could not be matched to one of the currently mapped BhooPehra risk-zone polygons. No local risk level is being estimated.": "????? ???????? GPS ??????? ???????? ????? ??? BhooPehra ????? ?????? ????? ?????? ??????? ???????? ?????? ???? ?????? ??? ????? ???",
    "Use Current Location to check whether your actual position falls inside a monitored BhooPehra risk zone.": "????? ?????? ??????? BhooPehra ??????????? ????? ?????? ????? ??? ?? ?? ????? ??????? ??????? ??????? ?????",
    "No active alert is currently available from the BhooPehra alert service. This does not guarantee that no hazard exists; follow official local authority communication during an emergency.": "BhooPehra ??????? ??????? ???? ???????? ???? ??????? ??????? ???? ?? ???? ???? ??? ??? ???; ????? ???????? ???????? ??????????? ?????? ???? ?????? ?????",
    "Registered shelters exist in the system, but mapped shelter coordinates are not currently available for a verified nearest-shelter calculation.": "???????? ???????? ?????? ??????, ?????? ???????? ?????? ?????? ????? ???? ????? ??? ???????? ????????? ???????? ?????? ????",
    "BhooPehra can use verified field reports to identify road blockage information. Route availability is shown only when a verified route assessment exists.": "BhooPehra ???????? ????? ??????? ??????? ??? ?????? ??????? ???? ?????? ???? ????? ???????? ??? ????????? ?????? ????? ???????? ?????? ????",
    "Submit a hazard report to start tracking its verification and response status here.": "????? ????? ? ????????????? ?????? ????? ???? ?????? ??????? ??? ????",
    "Avoid fresh cracks, falling rocks, steep unstable slopes and visible ground movement.": "???? ????, ???? ????, ????? ?????????? ??? ??? ???????? ????? ???????? ??????? ?????",
    "Do not cross debris, flooded sections or visibly damaged roads.": "??????????, ?????? ??? ?? ?????? ??????????? ?????? ??? ???? ???",
    "Follow instructions issued by local authorities and emergency services.": "???????? ????????? ? ????? ???????? ?????? ????????? ?????? ?????",
    "When safe, share the location, hazard type, description and photographs through BhooPehra.": "?????? ??? BhooPehra-?? ??????? ???????, ?????? ???, ????? ? ??? ?????? ?????",
    "Move to a safer location when possible and contact the appropriate local emergency service. Do not wait for BhooPehra if there is an immediate threat.": "????? ??? ?????? ?????? ??? ??? ??????? ???????? ????? ???????? ????? ??????? ????? ????????? ????? BhooPehra-?? ???? ??????? ????? ???",
    "Critical emergency instructions are intended to support English, Hindi, Assamese, Mizo and Bengali community users.": "???????????? ????? ????????? ??????, ??????, ???????, ???? ? ????? ???????? ?????????????? ???? ???????",
    "Weather can influence landslide concern, but BhooPehra does not show model internals, rainfall trigger percentages or technical risk-engine calculations on the community dashboard.": "???????? ???????? ??????? ???????? ???? ????, ??? BhooPehra ???????? ??????????? ?????? ?????????? ????, ??????? ??????? ????? ?? ??????????? ?????-?????? ???? ?????? ???",
    "Report a landslide, road blockage, slope crack, rockfall, flooding or another visible hazard when it is safe to do so. GPS, photographs and offline submission are supported by the reporting workflow.": "?????? ??? ??????, ?????? ?????, ????? ????, ???? ????, ????? ?? ???? ???? ???????? ?????? ??????? ????? ????????? ?????????? GPS, ??? ? ?????? ??? ????????",
    "BhooPehra does not invent local risk, shelter distance, road status or emergency alerts when verified system data is unavailable. Missing or unverified information is shown clearly instead.": "???????? ??????? ???? ?? ????? BhooPehra ???????? ?????, ???????? ??????, ??????? ?????? ?? ????? ??????? ??????? ?????? ??? ???????? ?? ????????? ???? ?????????? ?????? ????",
  },
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8000"

type RiskLevel =
  | "CRITICAL"
  | "HIGH"
  | "MODERATE"
  | "LOW"

type RiskZone = {
  id: number
  name: string
  district?: {
    id?: number
    name?: string
    state?: string
    code?: string
  } | null
  risk_level?: string
  probability?: number
  confidence?: string
  geometry?: unknown
  updated_at?: string | null
}

type RiskResponse = {
  count?: number
  zones?: RiskZone[]
}

type AlertItem = {
  id: number
  title?: string
  alert_type?: string
  severity?: string
  status?: string
  message?: string
  description?: string
  district_name?: string
  district?: string
  state?: string
  created_at?: string | null
  issued_at?: string | null
}

type AlertsResponse = {
  count?: number
  data?: AlertItem[]
  alerts?: AlertItem[]
}

type ShelterItem = {
  id?: number
  asset_code?: string
  name?: string
  capacity?: number | null
  distance_km?: number | null
  distance_m?: number | null
  safety_status?: string
  latitude?: number | null
  longitude?: number | null
  location_status?: string
  district?: string | null
}

type ShelterResponse = {
  status?: string
  code?: string
  message?: string
  registered_count?: number
  mapped_count?: number
  pending_count?: number
  nearest?: ShelterItem | null
  nearest_shelter?: ShelterItem | null
  shelters?: ShelterItem[]
  data?: ShelterItem[]
}

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

type CommunityReport = {
  id: number
  code: string
  title: string
  hazard: string
  status: ReportStatus
  responseStatus: ResponseStatus
  responseStatusLabel?: string
  assignedTeam?: string | null
  district?: string
  state?: string
  createdAt?: string | null
}

type ReportsResponse = {
  count?: number
  data?: Array<{
    id: number
    report_code: string
    title: string
    hazard: string
    status: ReportStatus
    response_status?: ResponseStatus
    response_status_label?: string
    assigned_team?: string | null
    district_name?: string | null
    state?: string
    created_at?: string | null
  }>
}

function normalizeRiskLevel(
  value?: string,
): RiskLevel | null {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()

  if (
    normalized === "CRITICAL" ||
    normalized === "HIGH" ||
    normalized === "MODERATE" ||
    normalized === "LOW"
  ) {
    return normalized
  }

  return null
}

function probabilityPercent(
  value?: number,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null
  }

  return value <= 1
    ? value * 100
    : value
}

function riskTextClass(
  risk: RiskLevel | null,
): string {
  switch (risk) {
    case "CRITICAL":
      return "text-red-400"

    case "HIGH":
      return "text-orange-400"

    case "MODERATE":
      return "text-yellow-400"

    case "LOW":
      return "text-emerald-400"

    default:
      return "text-slate-400"
  }
}

function riskBorderClass(
  risk: RiskLevel | null,
): string {
  switch (risk) {
    case "CRITICAL":
      return "border-red-500/30 bg-red-500/5"

    case "HIGH":
      return "border-orange-500/30 bg-orange-500/5"

    case "MODERATE":
      return "border-yellow-500/30 bg-yellow-500/5"

    case "LOW":
      return "border-emerald-500/20 bg-emerald-500/5"

    default:
      return "border-slate-800 bg-[#08131f]"
  }
}

function getSafetyLabel(
  risk: RiskLevel | null,
): string {
  switch (risk) {
    case "CRITICAL":
      return "EMERGENCY"

    case "HIGH":
      return "HIGH CAUTION"

    case "MODERATE":
      return "CAUTION"

    case "LOW":
      return "SAFE / MONITOR"

    default:
      return "VERIFICATION REQUIRED"
  }
}

function responseLabel(
  status: ResponseStatus,
): string {
  switch (status) {
    case "ALERT_GENERATED":
      return "Alert generated"

    case "TEAM_ASSIGNED":
      return "Team assigned"

    case "IN_PROGRESS":
      return "Response in progress"

    case "RESOLVED":
      return "Resolved"

    case "NOT_STARTED":
    default:
      return "Awaiting response"
  }
}

function pointInPolygon(
  latitude: number,
  longitude: number,
  coordinates: unknown,
): boolean {
  if (!Array.isArray(coordinates)) {
    return false
  }

  const rings =
    coordinates as unknown[]

  if (
    rings.length === 0 ||
    !Array.isArray(rings[0])
  ) {
    return false
  }

  const ring = rings[0] as unknown[]

  let inside = false

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const current = ring[i]
    const previous = ring[j]

    if (
      !Array.isArray(current) ||
      !Array.isArray(previous) ||
      current.length < 2 ||
      previous.length < 2
    ) {
      continue
    }

    const x1 = Number(current[0])
    const y1 = Number(current[1])
    const x2 = Number(previous[0])
    const y2 = Number(previous[1])

    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      continue
    }

    const intersects =
      y1 > latitude !==
        y2 > latitude &&
      longitude <
        ((x2 - x1) *
          (latitude - y1)) /
          (y2 - y1) +
          x1

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function isPointInsideGeometry(
  latitude: number,
  longitude: number,
  geometry: unknown,
): boolean {
  if (!geometry || typeof geometry !== "object") {
    return false
  }

  const geo =
    geometry as {
      type?: string
      coordinates?: unknown
    }

  if (
    geo.type === "Polygon"
  ) {
    return pointInPolygon(
      latitude,
      longitude,
      geo.coordinates,
    )
  }

  if (
    geo.type === "MultiPolygon" &&
    Array.isArray(geo.coordinates)
  ) {
    return (
      geo.coordinates as unknown[]
    ).some((polygon) => {
      if (!Array.isArray(polygon)) {
        return false
      }

      return pointInPolygon(
        latitude,
        longitude,
        polygon,
      )
    })
  }

  return false
}

function formatUpdatedAt(
  value?: string | null,
): string {
  if (!value) {
    return "--"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "--"
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  )
}

function formatDistance(
  shelter?: ShelterItem | null,
): string {
  if (!shelter) {
    return "--"
  }

  if (
    typeof shelter.distance_km ===
      "number" &&
    Number.isFinite(
      shelter.distance_km,
    )
  ) {
    return `${shelter.distance_km.toFixed(1)} km`
  }

  if (
    typeof shelter.distance_m ===
      "number" &&
    Number.isFinite(
      shelter.distance_m,
    )
  ) {
    return shelter.distance_m < 1000
      ? `${Math.round(shelter.distance_m)} m`
      : `${(
          shelter.distance_m / 1000
        ).toFixed(1)} km`
  }

  return "--"
}

function CommunityMetric({
  icon: Icon,
  label,
  value,
  description,
  tone = "default",
  translate,
}: {
  icon: typeof ShieldAlert
  label: string
  value: string
  description: string
  translate: (text: string) => string
  tone?:
    | "default"
    | "warning"
    | "danger"
    | "success"
}) {
  const iconClass =
    tone === "danger"
      ? "bg-red-500/10 text-red-400"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-400"
        : tone === "success"
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-slate-900 text-emerald-400"

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0b1724] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon size={20} />
        </div>

        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          {translate("Community")}
        </span>
      </div>

      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-bold tracking-tight text-white">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  )
}

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  tone = "default",
}: {
  icon: typeof Map
  title: string
  description: string
  onClick: () => void
  tone?:
    | "default"
    | "danger"
    | "blue"
    | "success"
}) {
  const iconClass =
    tone === "danger"
      ? "bg-red-500/10 text-red-400"
      : tone === "blue"
        ? "bg-blue-500/10 text-blue-400"
        : tone === "success"
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-slate-900 text-emerald-400"

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[100px] w-full items-center gap-4 rounded-2xl border border-slate-800 bg-[#0b1724] p-4 text-left transition hover:border-slate-700 hover:bg-[#0d1c2b]"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
      >
        <Icon size={21} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>

      <ArrowRight
        size={17}
        className="shrink-0 text-slate-700 transition group-hover:translate-x-1 group-hover:text-emerald-400"
      />
    </button>
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof MapPin
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0b1724] p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
          <Icon size={19} />
        </div>

        <div>
          <h2 className="font-semibold text-white">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  )
}

function ReportStatusBadge({
  status,
  translate,
}: {
  status: ReportStatus
  translate: (text: string) => string
}) {
  const className =
    status === "VERIFIED"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : status === "REJECTED"
        ? "border-red-500/20 bg-red-500/10 text-red-300"
        : status === "SUBMITTED"
          ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
          : "border-slate-700 bg-slate-900 text-slate-400"

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${className}`}
    >
      {translate(status)}
    </span>
  )
}

function ResponseBadge({
  status,
  translate,
}: {
  status: ResponseStatus
  translate: (text: string) => string
}) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
      {translate(responseLabel(status))}
    </span>
  )
}

export default function CommunityDashboard() {
  const { profile } = useRole()
  const { language, t } = useCommunityLanguage()

  const translate = useCallback(
    (text: string) => {
      const translated = t(text)
      return translated !== text
        ? translated
        : LOCAL_DASHBOARD_TRANSLATIONS[language]?.[text] ?? text
    },
    [language, t],
  )

  const [latitude, setLatitude] =
    useState<number | null>(null)

  const [longitude, setLongitude] =
    useState<number | null>(null)

  const [locationLoading, setLocationLoading] =
    useState(false)

  const [locationError, setLocationError] =
    useState("")

  const [zones, setZones] =
    useState<RiskZone[]>([])

  const [zonesLoading, setZonesLoading] =
    useState(false)

  const [alerts, setAlerts] =
    useState<AlertItem[]>([])

  const [alertsLoading, setAlertsLoading] =
    useState(false)

  const [shelter, setShelter] =
    useState<ShelterItem | null>(null)

  const [shelterPendingCount, setShelterPendingCount] =
    useState<number | null>(null)

  const [shelterMappedCount, setShelterMappedCount] =
    useState<number | null>(null)

  const [shelterLoading, setShelterLoading] =
    useState(false)

  const [reports, setReports] =
    useState<CommunityReport[]>([])

  const [reportsLoading, setReportsLoading] =
    useState(false)

  const [systemOnline, setSystemOnline] =
    useState(true)

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null)

  const userName =
    "Community User"

  const subtitle = translate(
    profile?.dashboardSubtitle ??
      "Understand local risk, stay safe, report hazards and track your reports.",
  )

  const getCurrentLocation =
    useCallback(() => {
      if (!navigator.geolocation) {
        setLocationError(
          translate("GPS is not available in this browser."),
        )
        return
      }

      setLocationLoading(true)
      setLocationError("")

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(
            position.coords.latitude,
          )
          setLongitude(
            position.coords.longitude,
          )
          setLocationLoading(false)
        },
        (error) => {
          console.error(
            "Community GPS error:",
            error,
          )

          setLocationLoading(false)

          setLocationError(
            translate("Current location could not be verified. Allow browser location access and try again."),
          )
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        },
      )
    }, [])

  const loadZones =
    useCallback(async () => {
      try {
        setZonesLoading(true)

        const response =
          await fetch(
            `${API_BASE_URL}/api/risk/zones`,
            {
              cache: "no-store",
            },
          )

        if (!response.ok) {
          throw new Error(
            `Risk zones request failed with ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as RiskResponse

        setZones(
          Array.isArray(payload.zones)
            ? payload.zones
            : [],
        )

        setSystemOnline(true)
        setLastUpdated(new Date())
      } catch (error) {
        console.error(
          "Community risk load failed:",
          error,
        )

        setSystemOnline(false)
        setZones([])
      } finally {
        setZonesLoading(false)
      }
    }, [])

  const loadAlerts =
    useCallback(async () => {
      try {
        setAlertsLoading(true)

        const response =
          await fetch(
            `${API_BASE_URL}/api/alerts?status=ACTIVE`,
            {
              cache: "no-store",
            },
          )

        if (!response.ok) {
          throw new Error(
            `Alerts request failed with ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as AlertsResponse

        const data =
          Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(payload.alerts)
              ? payload.alerts
              : []

        const activeOnly =
          data.filter(
            (item) =>
              String(
                item.status ?? "ACTIVE",
              ).toUpperCase() ===
              "ACTIVE",
          )

        setAlerts(activeOnly)
        setSystemOnline(true)
      } catch (error) {
        console.error(
          "Community alerts load failed:",
          error,
        )

        setAlerts([])
      } finally {
        setAlertsLoading(false)
      }
    }, [])

  const loadReports =
    useCallback(async () => {
      try {
        setReportsLoading(true)

        const response =
          await fetch(
            `${API_BASE_URL}/api/field-reports`,
            {
              cache: "no-store",
              headers: (() => {
                const headers = new Headers()

                try {
                  const reporterToken = window.localStorage.getItem(
                    "bhoopehra:reporter-token",
                  )?.trim()

                  if (reporterToken) {
                    headers.set(
                      "X-Reporter-Token",
                      reporterToken,
                    )
                  }
                } catch {
                  // Ignore localStorage access failures
                }

                return headers
              })(),
            },
          )

        if (!response.ok) {
          throw new Error(
            `Field reports request failed with ${response.status}`,
          )
        }

        const payload =
          (await response.json()) as ReportsResponse

        const data =
          Array.isArray(payload.data)
            ? payload.data
            : []

        /*
         * Community must not expose the complete
         * authority report register.
         *
         * We only surface reports explicitly marked
         * for this community browser session.
         */
        const storedCodes =
          readCommunityReportCodes()

        const ownReports =
          data
            .filter((report) =>
              storedCodes.has(
                report.report_code
                  .trim()
                  .toUpperCase(),
              ),
            )
            .map(
              (report): CommunityReport => ({
                id: report.id,
                code: report.report_code,
                title: report.title,
                hazard: report.hazard,
                status: report.status,
                responseStatus:
                  report.response_status ??
                  "NOT_STARTED",
                responseStatusLabel:
                  report.response_status_label,
                assignedTeam:
                  report.assigned_team,
                district:
                  report.district_name ??
                  undefined,
                state:
                  report.state,
                createdAt:
                  report.created_at,
              }),
            )

        setReports(ownReports)
        setSystemOnline(true)
      } catch (error) {
        console.error(
          "Community reports load failed:",
          error,
        )

        setReports([])
      } finally {
        setReportsLoading(false)
      }
    }, [])

  const loadShelter =
    useCallback(
      async (
        currentLatitude: number,
        currentLongitude: number,
      ) => {
        try {
          setShelterLoading(true)

          const response =
            await fetch(
              `${API_BASE_URL}/api/shelters/nearest?latitude=${encodeURIComponent(
                currentLatitude,
              )}&longitude=${encodeURIComponent(
                currentLongitude,
              )}`,
              {
                cache: "no-store",
              },
            )

          if (!response.ok) {
            throw new Error(
              `Shelter request failed with ${response.status}`,
            )
          }

          const payload =
            (await response.json()) as ShelterResponse

          const nearest =
            payload.nearest ??
            payload.nearest_shelter ??
            null

          const candidates =
            Array.isArray(payload.shelters)
              ? payload.shelters
              : Array.isArray(payload.data)
                ? payload.data
                : []

          setShelter(
            nearest ??
              candidates[0] ??
              null,
          )

          setShelterPendingCount(
            typeof payload.pending_count ===
              "number"
              ? payload.pending_count
              : null,
          )

          setShelterMappedCount(
            typeof payload.mapped_count ===
              "number"
              ? payload.mapped_count
              : null,
          )
        } catch (error) {
          console.error(
            "Community shelter load failed:",
            error,
          )

          setShelter(null)
        } finally {
          setShelterLoading(false)
        }
      },
      [],
    )

  useEffect(() => {
    void loadZones()
    void loadAlerts()
    void loadReports()
  }, [
    loadZones,
    loadAlerts,
    loadReports,
  ])

  useEffect(() => {
    if (
      latitude === null ||
      longitude === null
    ) {
      return
    }

    void loadShelter(
      latitude,
      longitude,
    )
  }, [
    latitude,
    longitude,
    loadShelter,
  ])

  const selectedZone = useMemo(() => {
    if (
      latitude === null ||
      longitude === null
    ) {
      return null
    }

    return (
      zones.find((zone) =>
        isPointInsideGeometry(
          latitude,
          longitude,
          zone.geometry,
        ),
      ) ?? null
    )
  }, [
    latitude,
    longitude,
    zones,
  ])

  const selectedRisk =
    normalizeRiskLevel(
      selectedZone?.risk_level,
    )

  const selectedProbability =
    probabilityPercent(
      selectedZone?.probability,
    )

  const activeAlert =
    alerts.length > 0
      ? alerts[0]
      : null

  const alertSeverity =
    normalizeRiskLevel(
      activeAlert?.severity,
    )

  const reportPreview =
    reports.slice(0, 3)

  const openPage = (
    path: string,
  ) => {
    window.location.assign(path)
  }

  const emergencyGuidance =
    selectedRisk === "CRITICAL" ||
    selectedRisk === "HIGH"
      ? translate("Avoid steep or unstable slopes, visible cracks and blocked roads. Follow official evacuation instructions.")
      : selectedRisk === "MODERATE"
        ? translate("Use caution around slopes and avoid unnecessary travel near known hazard areas.")
        : translate("Stay aware of local conditions and follow verified warnings.")

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#06111c] px-6 py-6 text-white lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        {/* ============================================================
            HEADER
        ============================================================ */}
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
              <Users size={15} />
              Community Safety
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-white">
              {translate("Welcome")}, {userName}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {translate(subtitle)}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-[#0b1724] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldAlert size={18} />
            </div>

            <div>
              <p className="text-xs font-semibold text-white">{translate("Community Mode")}</p>

              <p className="mt-0.5 text-[11px] text-slate-500">{translate("Public safety view")}</p>
            </div>

            <div
              className={`ml-2 h-2.5 w-2.5 rounded-full ${
                systemOnline
                  ? "bg-emerald-400"
                  : "bg-red-400"
              }`}
            />
          </div>
        </div>

        {/* ============================================================
            YOUR AREA
        ============================================================ */}
        <section
          className={`rounded-2xl border p-6 ${riskBorderClass(
            selectedRisk,
          )}`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPin
                  size={18}
                  className="text-emerald-400"
                />

                <h2 className="font-semibold text-white">{translate("Your Area Safety")}</h2>
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Location-specific safety information is
                shown only when your current location can
                be matched to an actual monitored risk zone.
              </p>
            </div>

            <button
              type="button"
              onClick={getCurrentLocation}
              disabled={locationLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Crosshair size={15} />

              {locationLoading
                ? translate("Getting location...")
                : translate("Use Current Location")}
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-slate-800 bg-[#08131f] p-5">
              {selectedZone ? (
                <>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{translate("Monitored Area")}</p>

                      <h3 className="mt-2 text-2xl font-bold text-white">
                        {selectedZone.name}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {selectedZone.district?.name ??
                          translate("District unavailable")}
                        {selectedZone.district?.state
                          ? ` · ${selectedZone.district.state}`
                          : ""}
                      </p>
                    </div>

                    <div
                      className={`w-fit rounded-full border border-current/20 bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${riskTextClass(
                        selectedRisk,
                      )}`}
                    >
                      {translate(getSafetyLabel(
                        selectedRisk,
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-[#0b1724] p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600">{translate("Risk Level")}</p>

                      <p
                        className={`mt-2 text-lg font-bold ${riskTextClass(
                          selectedRisk,
                        )}`}
                      >
                        {selectedRisk ??
                          translate("Unavailable")}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#0b1724] p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600">{translate("Probability")}</p>

                      <p className="mt-2 text-lg font-bold text-white">
                        {selectedProbability !==
                        null
                          ? `${selectedProbability.toFixed(
                              1,
                            )}%`
                          : "--"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#0b1724] p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600">{translate("Updated")}</p>

                      <p className="mt-2 text-sm font-semibold text-slate-300">
                        {formatUpdatedAt(
                          selectedZone.updated_at,
                        )}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{translate("Current Location")}</p>

                  <h3 className="mt-2 text-xl font-bold text-white">
                    {latitude !== null
                      ? translate("Outside currently monitored zones")
                      : translate("Location not selected")}
                  </h3>

                  <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
                    {latitude !== null
                      ? translate("Your verified GPS position could not be matched to one of the currently mapped BhooPehra risk-zone polygons. No local risk level is being estimated.")
                      : translate("Use Current Location to check whether your actual position falls inside a monitored BhooPehra risk zone.")}
                  </p>

                  {zonesLoading && zones.length === 0 && (
                    <p className="mt-4 text-[10px] text-emerald-400">{translate("Loading verified risk zones...")}</p>
                  )}

                  {locationError && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                      <WifiOff
                        size={15}
                        className="mt-0.5 shrink-0 text-red-400"
                      />

                      <p className="text-xs leading-5 text-red-300">
                        {locationError}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#08131f] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{translate("Safety Guidance")}</p>

              <p className="mt-3 text-sm font-semibold text-white">
                {translate(emergencyGuidance)}
              </p>

              <button
                type="button"
                onClick={() =>
                  openPage("/risk-map")
                }
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
              >{translate("View Safety Map")}<ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================
            SIMPLE COMMUNITY METRICS
        ============================================================ */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CommunityMetric
            translate={translate}
            icon={ShieldAlert}
            label={translate("Local Risk")}
            value={
              selectedRisk ??
              translate("Unavailable")
            }
            description={
              selectedZone
                ? `${translate("Matched to")} ${selectedZone.name}.`
                : translate("Use verified GPS to determine whether your location is inside a monitored zone.")
            }
            tone={
              selectedRisk === "CRITICAL" ||
              selectedRisk === "HIGH"
                ? "danger"
                : selectedRisk ===
                    "MODERATE"
                  ? "warning"
                  : selectedRisk === "LOW"
                    ? "success"
                    : "default"
            }
          />

          <CommunityMetric
            translate={translate}
            icon={BellRing}
            label={translate("Active Safety Alerts")}
            value={String(
              alerts.length,
            )}
            description={
              alerts.length > 0
                ? translate("Active warning information is available.")
                : translate("No active emergency alert is currently available.")
            }
            tone={
              alerts.length > 0
                ? "warning"
                : "success"
            }
          />

          <CommunityMetric
            translate={translate}
            icon={Home}
            label={translate("Safe Shelter")}
            value={
              shelterLoading
                ? translate("Checking...")
                : shelter
                  ? shelter.name ??
                    "Available"
                  : shelterPendingCount !== null ? translate("Not Available Nearby") : translate("Location Required")
            }
            description={
              shelter
                ? `${formatDistance(
                    shelter,
                  )}${
                    shelter.capacity
                      ? ` · ${translate("Capacity")} ${shelter.capacity}`
                      : ""
                  }`
                : shelterPendingCount !==
                    null &&
                  shelterMappedCount === 0
                  ? translate("No verified mapped shelter is currently available near your location.")
                  : translate("Use Current Location to find a verified nearby shelter.")
            }
          />
        </div>

        {/* ============================================================
            ACTIVE SAFETY ALERT
        ============================================================ */}
        <div className="mt-6">
          <SectionCard
            icon={BellRing}
            title={translate("Safety Alerts")}
            description={translate("Official active warning information available from the BhooPehra system.")}
          >
            {alertsLoading ? (
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-5">
                <p className="text-xs text-slate-500">{translate("Checking active safety alerts...")}</p>
              </div>
            ) : activeAlert ? (
              <div
                className={`rounded-2xl border p-5 ${riskBorderClass(
                  alertSeverity,
                )}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                      <AlertTriangle
                        size={20}
                      />
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-400">{translate("Active Safety Alert")}</p>

                      <h3 className="mt-1 text-lg font-bold text-white">
                        {activeAlert.title ??
                          activeAlert.alert_type ??
                          translate("Safety warning")}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {activeAlert.district_name ??
                          activeAlert.district ??
                          translate("Area not specified")}
                        {activeAlert.state
                          ? ` · ${activeAlert.state}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <span className="w-fit rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-red-300">
                    {activeAlert.severity ??
                      translate("ACTIVE")}
                  </span>
                </div>

                <p className="mt-5 text-sm leading-6 text-slate-300">
                  {activeAlert.message ??
                    activeAlert.description ??
                    translate("Follow official local authority instructions and avoid unnecessary travel through hazardous areas.")}
                </p>

                <div className="mt-5 rounded-xl border border-slate-800 bg-[#08131f] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">{translate("What should you do?")}</p>

                  <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                    <li>
                      • {translate("Avoid steep or visibly unstable slopes.")}
                    </li>

                    <li>
                      • {translate("Do not cross blocked or damaged roads.")}
                    </li>

                    <li>
                      • {translate("Move away from fresh cracks or falling-rock areas.")}
                    </li>

                    <li>
                      • {translate("Follow official evacuation instructions.")}
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2
                      size={19}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">{translate("No active emergency alert")}</p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {translate("No active alert is currently available from the BhooPehra alert service. This does not guarantee that no hazard exists; follow official local authority communication during an emergency.")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                openPage("/alerts")
              }
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900"
            >{translate("View Safety Alerts")}<ArrowRight size={14} />
            </button>
          </SectionCard>
        </div>

        {/* ============================================================
            SAFETY ACTIONS
        ============================================================ */}
        <div className="mt-6">
          <div className="mb-4">
            <h2 className="font-semibold text-white">{translate("Safety Actions")}</h2>

            <p className="mt-1 text-xs text-slate-500">{translate("The tools a community member actually needs.")}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ActionCard
              icon={AlertTriangle}
              title={translate("Report a Hazard")}
              description={translate("Report a landslide, road blockage, cracks, rockfall or another visible hazard.")}
              tone="danger"
              onClick={() =>
                openPage("/field-reports")
              }
            />

            <ActionCard
              icon={Map}
              title={translate("Safety Map")}
              description={translate("View available risk zones and check your location against monitored areas.")}
              tone="blue"
              onClick={() =>
                openPage("/risk-map")
              }
            />

            <ActionCard
              icon={Home}
              title={translate("Find Safe Shelter")}
              description={translate("Check verified shelter locations and capacity when mapped data is available.")}
              tone="success"
              onClick={() =>
                openPage("/shelter")
              }
            />

            <ActionCard
              icon={FileText}
              title={translate("Track My Reports")}
              description={translate("See verification and response progress for reports submitted from this device.")}
              onClick={() =>
                openPage("/field-reports")
              }
            />
          </div>
        </div>

        {/* ============================================================
            SHELTER + ROAD SAFETY
        ============================================================ */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SectionCard
            icon={Home}
            title={translate("Nearest Safe Shelter")}
            description={translate("Shelter information is shown only when the location and safety status are verified.")}
          >
            {shelter ? (
              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Home size={19} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">{translate("Verified mapped shelter")}</p>

                    <h3 className="mt-1 text-base font-bold text-white">
                      {shelter.name ??
                        translate("Shelter")}
                    </h3>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-600">{translate("Distance")}</p>

                        <p className="mt-1 text-xs font-semibold text-slate-300">
                          {formatDistance(
                            shelter,
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-600">{translate("Capacity")}</p>

                        <p className="mt-1 text-xs font-semibold text-slate-300">
                          {typeof shelter.capacity ===
                          "number"
                            ? shelter.capacity
                            : "--"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-600">{translate("Safety")}</p>

                        <p className="mt-1 text-xs font-semibold text-emerald-300">
                          {shelter.safety_status ??
                            translate("Verified")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-[#08131f] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                    <Home size={19} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">{translate("Shelter location pending verification")}</p>

                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {translate("Registered shelters exist in the system, but mapped shelter coordinates are not currently available for a verified nearest-shelter calculation.")}
                    </p>

                    {shelterPendingCount !==
                      null && (
                      <p className="mt-2 text-[10px] text-slate-600">
                        {shelterPendingCount} shelter location
                        {shelterPendingCount === 1
                          ? ""
                          : "s"} pending mapping
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                openPage("/shelter")
              }
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >{translate("View emergency resources")}<ArrowRight size={14} />
            </button>
          </SectionCard>

          <SectionCard
            icon={Navigation}
            title={translate("Road Safety")}
            description={translate("Simple citizen-facing road safety information. Internal routing-engine details are intentionally hidden.")}
          >
            <div className="rounded-2xl border border-slate-800 bg-[#08131f] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
                  <Navigation size={19} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">{translate("Check before you travel")}</p>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {translate("BhooPehra can use verified field reports to identify road blockage information. Route availability is shown only when a verified route assessment exists.")}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-[#0b1724] p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">{translate("Known blockage")}</p>

                  <p className="mt-2 text-sm font-semibold text-slate-300">{translate("Check available reports")}</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0b1724] p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">{translate("Alternate route")}</p>

                  <p className="mt-2 text-sm font-semibold text-slate-300">{translate("Only when verified")}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  openPage("/risk-map")
                }
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >{translate("Check safety map")}<ArrowRight size={14} />
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ============================================================
            MY REPORTS
        ============================================================ */}
        <div className="mt-6">
          <SectionCard
            icon={FileText}
            title={translate("My Reports")}
            description={translate("Only reports explicitly associated with this community browser session are shown here.")}
          >
            {reportsLoading ? (
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-5">
                <p className="text-xs text-slate-500">{translate("Loading your reports...")}</p>
              </div>
            ) : reportPreview.length > 0 ? (
              <div className="space-y-3">
                {reportPreview.map(
                  (report) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() =>
                        openPage(
                          `/field-reports?report_id=${encodeURIComponent(
                            String(
                              report.id,
                            ),
                          )}`,
                        )
                      }
                      className="group flex w-full items-center gap-4 rounded-xl border border-slate-800 bg-[#08131f] p-4 text-left transition hover:border-slate-700 hover:bg-[#0b1724]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
                        <FileText size={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">
                            {report.code}
                          </p>

                          <ReportStatusBadge
                            translate={translate}
                            status={
                              report.status
                            }
                          />

                          <ResponseBadge
                            translate={translate}
                            status={
                              report.responseStatus
                            }
                          />
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-400">
                          {report.title}
                        </p>

                        <p className="mt-1 text-[10px] text-slate-600">
                          {report.hazard}
                          {report.district
                            ? ` · ${report.district}`
                            : ""}
                        </p>
                      </div>

                      <ArrowRight
                        size={16}
                        className="shrink-0 text-slate-700 transition group-hover:translate-x-1 group-hover:text-emerald-400"
                      />
                    </button>
                  ),
                )}

                <button
                  type="button"
                  onClick={() =>
                    openPage("/field-reports")
                  }
                  className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                >{translate("Open Field Reports")}<ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-[#08131f] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-slate-500">
                    <FileText size={18} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">{translate("No reports from this device yet")}</p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {translate("Submit a hazard report to start tracking its verification and response status here.")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    openPage("/field-reports")
                  }
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/15"
                >{translate("Report a Hazard")}<ArrowRight size={14} />
                </button>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ============================================================
            WHAT SHOULD I DO?
        ============================================================ */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SectionCard
            icon={ShieldAlert}
            title={translate("What Should I Do?")}
            description={translate("Simple actions for suspected landslide danger.")}
          >
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <p className="text-sm font-semibold text-white">{translate("Move away from unstable slopes")}</p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {translate("Avoid fresh cracks, falling rocks, steep unstable slopes and visible ground movement.")}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <p className="text-sm font-semibold text-white">{translate("Avoid blocked roads")}</p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {translate("Do not cross debris, flooded sections or visibly damaged roads.")}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <p className="text-sm font-semibold text-white">{translate("Follow verified warnings")}</p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {translate("Follow instructions issued by local authorities and emergency services.")}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#08131f] p-4">
                <p className="text-sm font-semibold text-white">{translate("Report what you observe")}</p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {translate("When safe, share the location, hazard type, description and photographs through BhooPehra.")}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Phone}
            title={translate("Emergency Help")}
            description={translate("Use official emergency instructions and services during an immediate threat.")}
          >
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Phone size={18} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">{translate("Immediate danger")}</p>

                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    {translate("Move to a safer location when possible and contact the appropriate local emergency service. Do not wait for BhooPehra if there is an immediate threat.")}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-[#08131f] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">{translate("Multilingual safety guidance")}</p>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                {translate("Critical emergency instructions are intended to support English, Hindi, Assamese, Mizo and Bengali community users.")}
              </p>

              <button
                type="button"
                onClick={() =>
                  openPage("/resources")
                }
                className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >{translate("View safety resources")}<ArrowRight size={14} />
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ============================================================
            WEATHER AWARENESS
        ============================================================ */}
        <div className="mt-6">
          <SectionCard
            icon={Compass}
            title={translate("Weather Awareness")}
            description={translate("Simple safety awareness — not a technical forecast or ML model view.")}
          >
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#08131f] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{translate("Check current weather information")}</p>

                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  {translate("Weather can influence landslide concern, but BhooPehra does not show model internals, rainfall trigger percentages or technical risk-engine calculations on the community dashboard.")}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  openPage("/weather")
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900"
              >{translate("Weather Awareness")}<ArrowRight size={14} />
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ============================================================
            REPORT CTA
        ============================================================ */}
        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <AlertTriangle size={20} />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">{translate("See something dangerous?")}</p>

                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  {translate("Report a landslide, road blockage, slope crack, rockfall, flooding or another visible hazard when it is safe to do so. GPS, photographs and offline submission are supported by the reporting workflow.")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                openPage("/field-reports")
              }
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-[#04120d] transition hover:bg-emerald-400"
            >{translate("Report Hazard")}<ArrowRight size={15} />
            </button>
          </div>
        </div>

        {/* ============================================================
            DATA TRANSPARENCY
        ============================================================ */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-[#0b1724] p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={18}
              className="mt-0.5 shrink-0 text-emerald-400"
            />

            <div>
              <p className="text-sm font-semibold text-white">{translate("Safety information is evidence-based")}</p>

              <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-500">
                {translate("BhooPehra does not invent local risk, shelter distance, road status or emergency alerts when verified system data is unavailable. Missing or unverified information is shown clearly instead.")}
              </p>

              {lastUpdated && (
                <p className="mt-2 text-[9px] uppercase tracking-wider text-slate-700">
                  {translate("Data checked")} {" "}
                  {lastUpdated.toLocaleTimeString(
                    "en-IN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function readCommunityReportCodes(): Set<string> {
  try {
    const raw =
      window.localStorage.getItem(
        "bhoopehra:community-report-codes",
      )

    if (!raw) {
      return new Set()
    }

    const parsed =
      JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return new Set()
    }

    return new Set(
      parsed
        .filter(
          (value): value is string =>
            typeof value === "string",
        )
        .map((value) =>
          value.trim().toUpperCase(),
        ),
    )
  } catch {
    return new Set()
  }
}

