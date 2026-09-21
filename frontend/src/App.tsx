import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router"

import Sidebar from "./components/layout/Sidebar"
import Topbar from "./components/layout/Topbar"

import Dashboard from "./pages/Dashboard"
import FieldDashboard from "./pages/FieldDashboard"
import CommunityDashboard from "./pages/CommunityDashboard"
import RoleSelection from "./pages/RoleSelection"
import StartupScreen from "./pages/StartupScreen"

import RiskMapPage from "./pages/RiskMap"
import AlertsPage from "./pages/AlertsPage"
import FieldReportsPage from "./pages/FieldReportsPage"
import InfrastructurePage from "./pages/InfrastructurePage"
import ReportsPage from "./pages/ReportsPage"
import WeatherPage from "./pages/WeatherPage"
import AnalyticsPage from "./pages/AnalyticsPage"
import ResourcesPage from "./pages/ResourcesPage"
import SettingsPage from "./pages/SettingsPage"
import ShelterPage from "./pages/ShelterPage"
import EmergencyHelpPage from "./pages/EmergencyHelpPage"

import {
  RoleProvider,
  type UserRole,
  useRole,
} from "./context/RoleContext"

function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[]
  children: React.ReactNode
}) {
  const { role } = useRole()

  if (!role) {
    return <RoleSelection />
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
function RoleBasedDashboard() {
  const { role } = useRole()

  if (role === "FIELD_TEAM") {
    return <FieldDashboard />
  }

  if (role === "COMMUNITY") {
    return <CommunityDashboard />
  }

  return <Dashboard />
}

function ApplicationRoutes() {
  const { hasRole } = useRole()
  const location = useLocation()

  /*
   * Show the cinematic startup experience only once per browser session.
   *
   * The important distinction is that the startup screen is an entry
   * experience, not the Dashboard route itself. Once a role is selected,
   * the session is marked complete, so clicking Dashboard (/) later goes
   * to the normal role-based dashboard.
   */
  const startupComplete =
    window.sessionStorage.getItem("bhoopehra:startup-complete") === "true"

  if (location.pathname === "/" && !startupComplete) {
    return <StartupScreen />
  }

  /*
   * Preserve the existing role-selection fallback for direct access to an
   * operational route when no role is available.
   */
  if (!hasRole) {
    return <RoleSelection />
  }

  return (
    <>
      <Sidebar />
      <Topbar />

      <main className="ml-[250px] pt-[72px]">
        <Routes>
          {/* Default dashboard */}
          <Route
            path="/"
            element={<RoleBasedDashboard />}
          />

          {/* Explicit role panels */}
          <Route
            path="/authority"
            element={<RoleGuard allowedRoles={["AUTHORITY"]}><Dashboard /></RoleGuard>}
          />

          <Route
            path="/field-team"
            element={<RoleGuard allowedRoles={["FIELD_TEAM"]}><FieldDashboard /></RoleGuard>}
          />

          <Route
            path="/community"
            element={<RoleGuard allowedRoles={["COMMUNITY"]}><CommunityDashboard /></RoleGuard>}
          />

          {/* Operational modules */}
          <Route
            path="/risk-map"
            element={<RiskMapPage />}
          />

          <Route
            path="/alerts"
            element={<AlertsPage />}
          />

          <Route
            path="/field-reports"
            element={<FieldReportsPage />}
          />

          <Route
            path="/infrastructure"
            element={<RoleGuard allowedRoles={["AUTHORITY","FIELD_TEAM"]}><InfrastructurePage /></RoleGuard>}
          />

          <Route
            path="/reports"
            element={<RoleGuard allowedRoles={["AUTHORITY"]}><ReportsPage /></RoleGuard>}
          />

          <Route
            path="/weather"
            element={<WeatherPage />}
          />

          <Route
            path="/analytics"
            element={<RoleGuard allowedRoles={["AUTHORITY"]}><AnalyticsPage /></RoleGuard>}
          />

          <Route
            path="/resources"
            element={<ResourcesPage />}
          />

          {/* Community safety */}
          <Route
            path="/shelter"
            element={<ShelterPage />}
          />

          <Route
            path="/emergency-help"
            element={<RoleGuard allowedRoles={["COMMUNITY"]}><EmergencyHelpPage /></RoleGuard>}
          />

          <Route
            path="/settings"
            element={<SettingsPage />}
          />

          {/* Unknown route */}
          <Route
            path="*"
            element={<RoleBasedDashboard />}
          />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  return (
    <RoleProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#06111c]">
          <ApplicationRoutes />
        </div>
      </BrowserRouter>
    </RoleProvider>
  )
}












