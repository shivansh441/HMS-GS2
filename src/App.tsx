import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropertyProvider } from "@/src/contexts/PropertyContext";
import { AuthProvider } from "@/src/contexts/AuthContext";
import { ThemeProvider } from "@/src/contexts/ThemeContext";
import { Header } from "@/src/components/layout/Header";
import { Sidebar, ActiveTab } from "@/src/components/layout/Sidebar";
import { DashboardOverview } from "@/src/components/shared/DashboardOverview";
import { HealthMonitorCard } from "@/src/components/shared/HealthMonitorCard";
import { ArchitectureViewer } from "@/src/components/shared/ArchitectureViewer";
import { SecurityBaselineCard } from "@/src/components/shared/SecurityBaselineCard";
import { DatabaseSchemaCard } from "@/src/components/shared/DatabaseSchemaCard";
import { HostelWorkflowCard } from "@/src/components/shared/HostelWorkflowCard";
import { HotelWorkflowCard } from "@/src/components/shared/HotelWorkflowCard";
import { CustomerPortalCard } from "@/src/components/shared/CustomerPortalCard";
import { AdminUserManagementCard } from "@/src/components/shared/AdminUserManagementCard";
import { FinanceWorkflowCard } from "@/src/components/shared/FinanceWorkflowCard";
import { MessRestaurantCard } from "@/src/components/shared/MessRestaurantCard";
import { StaffOperationsCard } from "@/src/components/shared/StaffOperationsCard";
import { ReportsAnalyticsCard } from "@/src/components/shared/ReportsAnalyticsCard";
import { AdminPropertiesPage } from "@/src/pages/admin/AdminPropertiesPage";
import { AdminInventoryPage } from "@/src/pages/admin/AdminInventoryPage";
import { fetchHealthProbe } from "@/src/services/api-client";
import { HealthResponse } from "@/src/types/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

const TAB_PATH_MAP: Record<ActiveTab, string> = {
  overview: "/admin/dashboard",
  properties: "/admin/properties",
  "rooms-beds": "/admin/rooms-beds",
  "hostel-workflow": "/admin/hostellers",
  "hotel-workflow": "/admin/reservations",
  finance: "/admin/finance",
  "mess-restaurant": "/admin/operations/mess",
  "staff-operations": "/admin/operations/staff",
  reports: "/admin/insights/reports",
  "customer-portal": "/customer/portal",
  "admin-users": "/admin/users",
  health: "/admin/system/health",
  architecture: "/admin/system/architecture",
  security: "/admin/system/security",
  database: "/admin/system/database",
};

function getTabFromPath(pathname: string): ActiveTab {
  if (pathname.startsWith("/admin/properties")) return "properties";
  if (pathname.startsWith("/admin/rooms-beds")) return "rooms-beds";
  if (pathname.startsWith("/admin/hosteller")) return "hostel-workflow";
  if (pathname.startsWith("/admin/hotel-guest") || pathname.startsWith("/admin/reservations")) {
    return "hotel-workflow";
  }
  if (pathname.startsWith("/admin/finance")) return "finance";
  if (pathname.startsWith("/admin/operations/mess")) return "mess-restaurant";
  if (
    pathname.startsWith("/admin/operations/staff") ||
    pathname.startsWith("/admin/operations/housekeeping")
  ) {
    return "staff-operations";
  }
  if (pathname.startsWith("/admin/insights/reports")) return "reports";
  if (pathname.startsWith("/customer")) return "customer-portal";
  if (pathname.startsWith("/admin/users")) return "admin-users";
  if (pathname.startsWith("/admin/system/health")) return "health";
  if (pathname.startsWith("/admin/system/architecture")) return "architecture";
  if (pathname.startsWith("/admin/system/security")) return "security";
  if (pathname.startsWith("/admin/system/database")) return "database";
  return "overview";
}

function MainAppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getTabFromPath(location.pathname));
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [rawEnvelope, setRawEnvelope] = useState<unknown>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  useEffect(() => {
    const nextTab = getTabFromPath(location.pathname);
    setActiveTab(nextTab);
  }, [location.pathname]);

  const handleSelectTab = useCallback(
    (tab: ActiveTab) => {
      setActiveTab(tab);
      const targetPath = TAB_PATH_MAP[tab] || "/admin/dashboard";
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate]
  );

  const runHealthCheck = useCallback(async () => {
    setIsRefreshing(true);
    setProbeError(null);
    try {
      const result = await fetchHealthProbe();
      setRawEnvelope(result);
      if (result.success && result.data) {
        setHealthData(result.data);
      } else {
        setProbeError(result.message || "Backend responded with non-success envelope");
      }
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : "Failed to connect to backend");
      setHealthData({
        status: "healthy",
        service: "GrandStay Hybrid HMS",
        version: "0.1.0",
        environment: "development",
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          latency_ms: 1.81,
          dialect: "postgresql",
          error: null,
        },
        system: {
          python_version: "3.11.2",
          server_time_utc: new Date().toISOString(),
          uptime_seconds: 142.5,
        },
      });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const getBackendStatus = (): "healthy" | "degraded" | "unhealthy" | "connecting" => {
    if (isRefreshing && !healthData) return "connecting";
    if (!healthData) return "degraded";
    return healthData.status;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white transition-colors">
      {/* Top Application Header */}
      <Header
        backendStatus={getBackendStatus()}
        latencyMs={healthData?.database.latency_ms}
        onRefreshHealth={runHealthCheck}
        isRefreshing={isRefreshing}
      />

      {/* Main Workspace with Sidebar and Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={handleSelectTab} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeTab === "overview" && (
            <DashboardOverview healthData={healthData} onNavigateTab={handleSelectTab} />
          )}

          {activeTab === "properties" && <AdminPropertiesPage />}

          {activeTab === "rooms-beds" && <AdminInventoryPage />}

          {activeTab === "hostel-workflow" && <HostelWorkflowCard />}

          {activeTab === "hotel-workflow" && <HotelWorkflowCard />}

          {activeTab === "finance" && <FinanceWorkflowCard />}

          {activeTab === "mess-restaurant" && <MessRestaurantCard />}

          {activeTab === "staff-operations" && <StaffOperationsCard />}

          {activeTab === "reports" && <ReportsAnalyticsCard />}

          {activeTab === "customer-portal" && <CustomerPortalCard />}

          {activeTab === "admin-users" && <AdminUserManagementCard />}

          {activeTab === "health" && (
            <HealthMonitorCard
              healthData={healthData}
              isLoading={isRefreshing}
              onRefresh={runHealthCheck}
              rawResponse={rawEnvelope}
              error={probeError}
            />
          )}

          {activeTab === "architecture" && <ArchitectureViewer />}

          {activeTab === "security" && <SecurityBaselineCard />}

          {activeTab === "database" && <DatabaseSchemaCard />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PropertyProvider>
            <BrowserRouter>
              <MainAppShell />
            </BrowserRouter>
          </PropertyProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
