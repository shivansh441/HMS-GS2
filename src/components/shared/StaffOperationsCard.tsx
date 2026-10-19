import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  CalendarDays,
  Clock,
  Sparkles,
  Wrench,
  BookOpen,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  UserCheck,
  Shield,
  Search,
  ClipboardList,
  CheckSquare,
  Square,
  DollarSign,
  Briefcase,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  fetchStaffMembers,
  createStaffMember,
  updateStaffMember,
  fetchStaffShifts,
  createStaffShift,
  updateStaffShift,
  fetchHousekeepingTasks,
  createHousekeepingTask,
  updateHousekeepingTask,
  fetchMaintenanceOrders,
  createMaintenanceOrder,
  updateMaintenanceOrder,
  fetchDailyLogs,
  createDailyLog,
  resolveDailyLog,
  fetchOperationsDashboard,
  fetchRooms,
} from "@/src/services/api-client";
import {
  StaffMember,
  StaffDepartment,
  StaffShift,
  ShiftType,
  HousekeepingTask,
  CleaningType,
  TaskPriority,
  MaintenanceWorkOrder,
  MaintenanceCategory,
  MaintenancePriority,
  OperationalDailyLog,
  DailyLogCategory,
  StaffOperationsDashboard,
} from "@/src/types/staff";

type OperationsSubTab =
  | "dashboard"
  | "staff"
  | "shifts"
  | "housekeeping"
  | "maintenance"
  | "logs";

export const StaffOperationsCard: React.FC = () => {
  const { activeProperty } = useProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<OperationsSubTab>("dashboard");

  // Common filters & states
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Modals & form states
  const [showAddStaffModal, setShowAddStaffModal] = useState<boolean>(false);
  const [showScheduleShiftModal, setShowScheduleShiftModal] = useState<boolean>(false);
  const [showHousekeepingModal, setShowHousekeepingModal] = useState<boolean>(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState<boolean>(false);
  const [showDailyLogModal, setShowDailyLogModal] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  const isManagerOrAdmin =
    user.role === "super_admin" ||
    user.role === "property_manager" ||
    user.role === "front_desk";

  const showFeedback = (msg: string, isError = false) => {
    if (isError) {
      setActionErrorMsg(msg);
      setTimeout(() => setActionErrorMsg(null), 4000);
    } else {
      setActionSuccessMsg(msg);
      setTimeout(() => setActionSuccessMsg(null), 3000);
    }
  };

  // Queries
  const {
    data: dashboardEnvelope,
    isLoading: isLoadingDash,
    refetch: refetchDash,
  } = useQuery({
    queryKey: ["operations-dashboard", activeProperty.id],
    queryFn: () => fetchOperationsDashboard(activeProperty.id),
  });
  const dashboardData: StaffOperationsDashboard | null = dashboardEnvelope?.data || null;

  const {
    data: staffEnvelope,
    isLoading: isLoadingStaff,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: ["operations-staff", activeProperty.id, departmentFilter],
    queryFn: () =>
      fetchStaffMembers(
        activeProperty.id,
        departmentFilter === "all" ? undefined : departmentFilter
      ),
  });
  const staffList: StaffMember[] = staffEnvelope?.data || [];

  const {
    data: shiftsEnvelope,
    isLoading: isLoadingShifts,
    refetch: refetchShifts,
  } = useQuery({
    queryKey: ["operations-shifts", activeProperty.id, selectedDate],
    queryFn: () => fetchStaffShifts(activeProperty.id, selectedDate),
  });
  const shiftsList: StaffShift[] = shiftsEnvelope?.data || [];

  const {
    data: housekeepingEnvelope,
    isLoading: isLoadingHk,
    refetch: refetchHk,
  } = useQuery({
    queryKey: ["operations-housekeeping", activeProperty.id],
    queryFn: () => fetchHousekeepingTasks(activeProperty.id),
  });
  const housekeepingList: HousekeepingTask[] = housekeepingEnvelope?.data || [];

  const {
    data: maintenanceEnvelope,
    isLoading: isLoadingMaint,
    refetch: refetchMaint,
  } = useQuery({
    queryKey: ["operations-maintenance", activeProperty.id],
    queryFn: () => fetchMaintenanceOrders(activeProperty.id),
  });
  const maintenanceList: MaintenanceWorkOrder[] = maintenanceEnvelope?.data || [];

  const {
    data: logsEnvelope,
    isLoading: isLoadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["operations-logs", activeProperty.id, selectedDate],
    queryFn: () => fetchDailyLogs(activeProperty.id, selectedDate),
  });
  const dailyLogsList: OperationalDailyLog[] = logsEnvelope?.data || [];

  const { data: roomsEnvelope } = useQuery({
    queryKey: ["property-rooms-list", activeProperty.id],
    queryFn: () => fetchRooms({ property_id: activeProperty.id }),
  });
  const roomsList = roomsEnvelope?.data || [];

  // Mutations
  const createStaffMut = useMutation({
    mutationFn: createStaffMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-staff"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      setShowAddStaffModal(false);
      showFeedback("Staff member added to directory successfully.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to add staff member.", true),
  });

  const createShiftMut = useMutation({
    mutationFn: createStaffShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      setShowScheduleShiftModal(false);
      showFeedback("Staff shift scheduled successfully.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to schedule shift.", true),
  });

  const createHkMut = useMutation({
    mutationFn: createHousekeepingTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      setShowHousekeepingModal(false);
      showFeedback("Housekeeping task queued.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to queue housekeeping task.", true),
  });

  const updateHkMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<HousekeepingTask> }) =>
      updateHousekeepingTask(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-housekeeping"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["property-rooms-list"] });
      showFeedback("Housekeeping task status updated.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to update housekeeping.", true),
  });

  const createMaintMut = useMutation({
    mutationFn: createMaintenanceOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      setShowMaintenanceModal(false);
      showFeedback("Maintenance work order submitted.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to submit maintenance order.", true),
  });

  const updateMaintMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MaintenanceWorkOrder> }) =>
      updateMaintenanceOrder(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["property-rooms-list"] });
      showFeedback("Maintenance order updated.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to update maintenance.", true),
  });

  const createLogMut = useMutation({
    mutationFn: createDailyLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-logs"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      setShowDailyLogModal(false);
      showFeedback("Operational daily log saved.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to save log entry.", true),
  });

  const resolveLogMut = useMutation({
    mutationFn: resolveDailyLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations-logs"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      showFeedback("Daily log flagged resolved.");
    },
    onError: (err: any) => showFeedback(err.message || "Failed to resolve log.", true),
  });

  const refreshAll = () => {
    refetchDash();
    refetchStaff();
    refetchShifts();
    refetchHk();
    refetchMaint();
    refetchLogs();
  };

  // Helper formatting
  const deptLabels: Record<StaffDepartment, string> = {
    front_desk: "Front Desk & Reception",
    housekeeping: "Housekeeping & Linen",
    maintenance: "Facilities & Maintenance",
    fnb_kitchen: "Mess & Kitchen F&B",
    management: "Operations Management",
    security: "Safety & Security",
    general: "General Operations",
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-emerald-950/20 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Phase 11 Operations Engine
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              Property ID: {activeProperty.id}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-400" />
            Staff & Operations Hub
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Staff rosters, shift scheduling, housekeeping turnover synchronization, facility maintenance work orders, and shift handovers for {activeProperty.name}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Ops</span>
          </button>
          {isManagerOrAdmin && (
            <button
              onClick={() => setShowAddStaffModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionSuccessMsg && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}
      {actionErrorMsg && (
        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{actionErrorMsg}</span>
        </div>
      )}

      {/* Operations Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800 overflow-x-auto pb-2 text-xs font-medium">
        <button
          onClick={() => setActiveSubTab("dashboard")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${
            activeSubTab === "dashboard"
              ? "bg-emerald-600 text-white font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Overview KPIs</span>
        </button>

        <button
          onClick={() => setActiveSubTab("staff")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${
            activeSubTab === "staff"
              ? "bg-emerald-600 text-white font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Directory ({staffList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("shifts")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${
            activeSubTab === "shifts"
              ? "bg-emerald-600 text-white font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Shifts & Rosters</span>
        </button>

        <button
          onClick={() => setActiveSubTab("housekeeping")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${
            activeSubTab === "housekeeping"
              ? "bg-emerald-600 text-white font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Housekeeping Turnover</span>
        </button>

        <button
          onClick={() => setActiveSubTab("maintenance")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${
            activeSubTab === "maintenance"
              ? "bg-emerald-600 text-white font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Maintenance & Facilities</span>
        </button>

        <button
          onClick={() => setActiveSubTab("logs")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all ${
            activeSubTab === "logs"
              ? "bg-emerald-600 text-white font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Shift Handover Logs</span>
        </button>
      </div>

      {/* 1. OVERVIEW KPIS TAB */}
      {activeSubTab === "dashboard" && (
        <div className="space-y-6">
          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Active Staff</span>
                <UserCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                {isLoadingDash ? "..." : dashboardData?.total_staff ?? 0}
              </p>
              <p className="text-[11px] text-zinc-500">
                Registered operational staff
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Scheduled Shifts Today</span>
                <CalendarDays className="w-4 h-4 text-sky-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                {isLoadingDash ? "..." : dashboardData?.today_scheduled_shifts ?? 0}
              </p>
              <p className="text-[11px] text-zinc-500">Rosters active today</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Pending Cleanings</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                {isLoadingDash ? "..." : dashboardData?.pending_housekeeping_tasks ?? 0}
              </p>
              <p className="text-[11px] text-amber-400/80">
                {dashboardData?.dirty_rooms_count ?? 0} rooms currently dirty
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Open Work Orders</span>
                <Wrench className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                {isLoadingDash ? "..." : dashboardData?.open_maintenance_orders ?? 0}
              </p>
              <p className="text-[11px] text-rose-400/90 font-semibold">
                {dashboardData?.emergency_maintenance_count ?? 0} high / emergency priority
              </p>
            </div>
          </div>

          {/* Active Quick Action Launchpad */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
              Operations Control Quick Actions
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => {
                  setActiveSubTab("staff");
                  setShowAddStaffModal(true);
                }}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-700 text-left transition-colors"
              >
                <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Add Staff</div>
                  <div className="text-[10px] text-zinc-500">Employee profile</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveSubTab("shifts");
                  setShowScheduleShiftModal(true);
                }}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-700 text-left transition-colors"
              >
                <CalendarDays className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Schedule Shift</div>
                  <div className="text-[10px] text-zinc-500">Assign duty rota</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveSubTab("housekeeping");
                  setShowHousekeepingModal(true);
                }}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-700 text-left transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Queue Cleaning</div>
                  <div className="text-[10px] text-zinc-500">Room turnover task</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveSubTab("maintenance");
                  setShowMaintenanceModal(true);
                }}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 hover:border-zinc-700 text-left transition-colors"
              >
                <Wrench className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-zinc-200">Report Issue</div>
                  <div className="text-[10px] text-zinc-500">Work order ticket</div>
                </div>
              </button>
            </div>
          </div>

          {/* Department Headcount Breakdown & Live Activity Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Department Headcounts */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-emerald-400" />
                Staff Department Distribution
              </h3>
              <div className="space-y-2 pt-1">
                {dashboardData?.department_headcount &&
                  Object.entries(dashboardData.department_headcount).map(([dept, count]) => (
                    <div
                      key={dept}
                      className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-zinc-950/60 border border-zinc-850"
                    >
                      <span className="text-zinc-300 font-medium">
                        {deptLabels[dept as StaffDepartment] || dept}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono font-semibold">
                        {count} staff
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Live Operational Activity Log */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-sky-400" />
                Live Operational Signals
              </h3>
              <div className="space-y-2 pt-1">
                {dashboardData?.recent_activity?.length ? (
                  dashboardData.recent_activity.map((act, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between text-xs p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-850 gap-3"
                    >
                      <div className="flex items-start gap-2">
                        {act.severity === "urgent" ? (
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        ) : act.severity === "warning" ? (
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium text-zinc-200">{act.title}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            {new Date(act.time).toLocaleTimeString()} • {act.type}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500 italic p-4 text-center">
                    No recent operational signals recorded.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. STAFF DIRECTORY TAB */}
      {activeSubTab === "staff" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-400">Department:</span>
              {(
                [
                  "all",
                  "front_desk",
                  "housekeeping",
                  "maintenance",
                  "fnb_kitchen",
                  "management",
                ] as const
              ).map((dept) => (
                <button
                  key={dept}
                  onClick={() => setDepartmentFilter(dept)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    departmentFilter === dept
                      ? "bg-emerald-600 text-white font-medium"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {dept === "all" ? "All Departments" : deptLabels[dept]}
                </button>
              ))}
            </div>

            {isManagerOrAdmin && (
              <button
                onClick={() => setShowAddStaffModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Employee</span>
              </button>
            )}
          </div>

          {isLoadingStaff ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading staff directory...</div>
          ) : staffList.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center text-xs text-zinc-400">
              No staff members found matching filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffList.map((member) => (
                <div
                  key={member.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white text-sm">
                          {member.first_name} {member.last_name}
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                          {member.employee_code}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-400 mt-0.5 font-medium">
                        {member.job_title}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        member.status === "active"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      }`}
                    >
                      {member.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-400 pt-1">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span>{deptLabels[member.department] || member.department}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="font-mono">{member.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">{member.email}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Rate: £{member.hourly_rate}/hr</span>
                    <span>Emergency: {member.emergency_contact_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. SHIFTS & ROSTERS TAB */}
      {activeSubTab === "shifts" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
              />
            </div>

            {isManagerOrAdmin && (
              <button
                onClick={() => setShowScheduleShiftModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Shift</span>
              </button>
            )}
          </div>

          {isLoadingShifts ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading rosters...</div>
          ) : shiftsList.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center text-xs text-zinc-400">
              No shifts scheduled for {selectedDate}.
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-900 text-zinc-400 uppercase tracking-wider text-[11px] border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3">Staff Member</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Shift Type</th>
                    <th className="px-4 py-3">Timing</th>
                    <th className="px-4 py-3">Station / Zone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {shiftsList.map((shift) => (
                    <tr key={shift.id} className="hover:bg-zinc-850/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">{shift.staff_name}</td>
                      <td className="px-4 py-3 text-zinc-300">
                        {deptLabels[shift.department] || shift.department}
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-300">{shift.shift_type}</td>
                      <td className="px-4 py-3 font-mono text-zinc-200">
                        {shift.start_time} - {shift.end_time}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {shift.station_or_zone || "General"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            shift.status === "in_progress"
                              ? "bg-sky-500/20 text-sky-300"
                              : shift.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {shift.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {shift.status === "scheduled" && (
                          <button
                            onClick={() =>
                              updateStaffShift(shift.id, { status: "in_progress" }).then(() => {
                                queryClient.invalidateQueries({ queryKey: ["operations-shifts"] });
                                showFeedback("Shift marked In Progress.");
                              })
                            }
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200"
                          >
                            Start
                          </button>
                        )}
                        {shift.status === "in_progress" && (
                          <button
                            onClick={() =>
                              updateStaffShift(shift.id, { status: "completed" }).then(() => {
                                queryClient.invalidateQueries({ queryKey: ["operations-shifts"] });
                                showFeedback("Shift completed.");
                              })
                            }
                            className="px-2 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-[11px] text-emerald-200"
                          >
                            Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. HOUSEKEEPING & ROOM CLEANLINESS TAB */}
      {activeSubTab === "housekeeping" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Synchronized Room Turnover & Inspection Workflows
            </div>
            {isManagerOrAdmin && (
              <button
                onClick={() => setShowHousekeepingModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Cleaning Task</span>
              </button>
            )}
          </div>

          {isLoadingHk ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading housekeeping...</div>
          ) : housekeepingList.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center text-xs text-zinc-400">
              No active housekeeping tasks queued.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {housekeepingList.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          Room {task.room_number || "General"}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            task.priority === "urgent"
                              ? "bg-rose-500/20 text-rose-300"
                              : task.priority === "high"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 capitalize mt-0.5">
                        {task.cleaning_type.replace("_", " ")}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        task.status === "inspected"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : task.status === "cleaned"
                          ? "bg-sky-500/20 text-sky-300"
                          : task.status === "in_progress"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {task.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Checklist */}
                  <div className="space-y-1.5 py-1">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase">
                      Turnover Checklist:
                    </span>
                    {task.checklist.map((chk, idx) => (
                      <div
                        key={chk.id || idx}
                        onClick={() => {
                          const updatedChk = task.checklist.map((c, i) =>
                            i === idx ? { ...c, completed: !c.completed } : c
                          );
                          updateHkMut.mutate({
                            id: task.id,
                            input: { checklist: updatedChk },
                          });
                        }}
                        className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer hover:text-white"
                      >
                        {chk.completed ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-zinc-600" />
                        )}
                        <span className={chk.completed ? "line-through text-zinc-500" : ""}>
                          {chk.description}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Actions & Attribution */}
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                    <span className="text-zinc-500 text-[11px]">
                      Assigned: {task.assigned_staff_name || "Unassigned"}
                    </span>
                    <div className="flex items-center gap-2">
                      {task.status === "pending" && (
                        <button
                          onClick={() =>
                            updateHkMut.mutate({ id: task.id, input: { status: "in_progress" } })
                          }
                          className="px-2.5 py-1 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[11px]"
                        >
                          Start Clean
                        </button>
                      )}
                      {task.status === "in_progress" && (
                        <button
                          onClick={() =>
                            updateHkMut.mutate({ id: task.id, input: { status: "cleaned" } })
                          }
                          className="px-2.5 py-1 rounded bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 text-[11px]"
                        >
                          Mark Cleaned
                        </button>
                      )}
                      {task.status === "cleaned" && (
                        <button
                          onClick={() =>
                            updateHkMut.mutate({
                              id: task.id,
                              input: {
                                status: "inspected",
                                inspection_passed: true,
                              },
                            })
                          }
                          className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[11px]"
                        >
                          Inspect & Pass
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. MAINTENANCE & FACILITIES TAB */}
      {activeSubTab === "maintenance" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Facility Repairs, Work Orders & Cost Tracking
            </div>
            {isManagerOrAdmin && (
              <button
                onClick={() => setShowMaintenanceModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Work Order</span>
              </button>
            )}
          </div>

          {isLoadingMaint ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading work orders...</div>
          ) : maintenanceList.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center text-xs text-zinc-400">
              No maintenance work orders found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {maintenanceList.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400">
                          {order.work_order_number}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            order.priority === "emergency"
                              ? "bg-rose-500/20 text-rose-300"
                              : order.priority === "high"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {order.priority}
                        </span>
                      </div>
                      <h4 className="font-semibold text-white text-sm mt-1">{order.title}</h4>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        order.status === "resolved" || order.status === "closed"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : order.status === "in_progress"
                          ? "bg-sky-500/20 text-sky-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {order.status.replace("_", " ")}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 line-clamp-2">{order.description}</p>

                  <div className="space-y-1 text-xs text-zinc-400">
                    <div>Location: {order.room_number ? `Room ${order.room_number}` : order.location_type}</div>
                    <div>Assigned: {order.assigned_staff_name || "Unassigned"}</div>
                    {order.actual_cost > 0 && <div>Actual Cost: £{order.actual_cost}</div>}
                    {order.resolution_notes && (
                      <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-emerald-300/90 text-[11px]">
                        Resolution: {order.resolution_notes}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-zinc-500">
                      Reported by {order.reported_by_name}
                    </span>
                    {order.status !== "resolved" && order.status !== "closed" && (
                      <button
                        onClick={() => {
                          const note = prompt("Enter resolution notes:");
                          const cost = prompt("Enter actual cost incurred (£):", "0");
                          if (note !== null) {
                            updateMaintMut.mutate({
                              id: order.id,
                              input: {
                                status: "resolved",
                                resolution_notes: note,
                                actual_cost: Number(cost) || 0,
                              },
                            });
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[11px]"
                      >
                        Resolve Order
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. SHIFT HANDOVER LOGS TAB */}
      {activeSubTab === "logs" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Shift Pass-Down Records, Incidents & Lost & Found
            </div>
            <button
              onClick={() => setShowDailyLogModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Handover Entry</span>
            </button>
          </div>

          {isLoadingLogs ? (
            <div className="p-8 text-center text-xs text-zinc-500">Loading daily logs...</div>
          ) : dailyLogsList.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center text-xs text-zinc-400">
              No daily log entries recorded for {selectedDate}.
            </div>
          ) : (
            <div className="space-y-3">
              {dailyLogsList.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-zinc-800 text-zinc-300">
                          {log.shift_period} Shift
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-sky-500/20 text-sky-300">
                          {log.category.replace("_", " ")}
                        </span>
                      </div>
                      <h4 className="font-semibold text-white text-sm mt-1">{log.summary}</h4>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        log.is_resolved
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {log.is_resolved ? "Resolved" : "Active Follow-Up"}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300">{log.details}</p>

                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      Logged by {log.author_name} at{" "}
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                    {!log.is_resolved && (
                      <button
                        onClick={() => resolveLogMut.mutate(log.id)}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                      >
                        Acknowledge & Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD STAFF */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Add Staff Member</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const fd = new FormData(form);
                createStaffMut.mutate({
                  property_id: activeProperty.id,
                  first_name: fd.get("first_name") as string,
                  last_name: fd.get("last_name") as string,
                  department: fd.get("department") as StaffDepartment,
                  job_title: fd.get("job_title") as string,
                  phone: fd.get("phone") as string,
                  email: fd.get("email") as string,
                  hourly_rate: Number(fd.get("hourly_rate")) || 16.0,
                  emergency_contact_name: fd.get("emergency_contact_name") as string,
                  emergency_contact_phone: fd.get("emergency_contact_phone") as string,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">First Name</label>
                  <input
                    name="first_name"
                    required
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400">Last Name</label>
                  <input
                    name="last_name"
                    required
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400">Department</label>
                <select
                  name="department"
                  required
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  <option value="front_desk">Front Desk & Reception</option>
                  <option value="housekeeping">Housekeeping & Cleaning</option>
                  <option value="maintenance">Facilities & Maintenance</option>
                  <option value="fnb_kitchen">Dining & Kitchen</option>
                  <option value="management">Operations Management</option>
                  <option value="security">Security</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400">Job Title</label>
                <input
                  name="job_title"
                  required
                  placeholder="e.g. Front Desk Officer"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Phone</label>
                  <input
                    name="phone"
                    placeholder="+44 20 7000 0000"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400">Hourly Rate (£)</label>
                  <input
                    name="hourly_rate"
                    type="number"
                    step="0.5"
                    defaultValue="18"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Emergency Contact</label>
                  <input
                    name="emergency_contact_name"
                    placeholder="Name"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400">Emergency Phone</label>
                  <input
                    name="emergency_contact_phone"
                    placeholder="Phone"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStaffMut.isPending}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                >
                  Register Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SCHEDULE SHIFT */}
      {showScheduleShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Schedule Staff Shift</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const fd = new FormData(form);
                createShiftMut.mutate({
                  property_id: activeProperty.id,
                  staff_id: fd.get("staff_id") as string,
                  shift_type: fd.get("shift_type") as ShiftType,
                  shift_date: fd.get("shift_date") as string,
                  start_time: fd.get("start_time") as string,
                  end_time: fd.get("end_time") as string,
                  station_or_zone: fd.get("station_or_zone") as string,
                  notes: fd.get("notes") as string,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-zinc-400">Staff Member</label>
                <select
                  name="staff_id"
                  required
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({deptLabels[s.department]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Shift Date</label>
                  <input
                    name="shift_date"
                    type="date"
                    defaultValue={selectedDate}
                    required
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400">Shift Type</label>
                  <select
                    name="shift_type"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="morning">Morning Shift</option>
                    <option value="afternoon">Afternoon Shift</option>
                    <option value="evening">Evening Shift</option>
                    <option value="night">Night Shift</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Start Time</label>
                  <input
                    name="start_time"
                    type="time"
                    defaultValue="08:00"
                    required
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400">End Time</label>
                  <input
                    name="end_time"
                    type="time"
                    defaultValue="16:30"
                    required
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400">Station / Zone</label>
                <input
                  name="station_or_zone"
                  placeholder="e.g. Floor 2 Housekeeping / Front Desk"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowScheduleShiftModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createShiftMut.isPending}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: NEW HOUSEKEEPING TASK */}
      {showHousekeepingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Queue Housekeeping Turnover</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const fd = new FormData(form);
                createHkMut.mutate({
                  property_id: activeProperty.id,
                  room_id: fd.get("room_id") as string,
                  cleaning_type: fd.get("cleaning_type") as CleaningType,
                  priority: fd.get("priority") as TaskPriority,
                  assigned_staff_id: fd.get("assigned_staff_id") as string,
                  notes: fd.get("notes") as string,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-zinc-400">Select Room</label>
                <select
                  name="room_id"
                  required
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  {roomsList.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number} (Currently {r.cleanliness_status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Cleaning Type</label>
                  <select
                    name="cleaning_type"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="checkout_clean">Checkout Clean</option>
                    <option value="stayover_clean">Stayover Clean</option>
                    <option value="deep_clean">Deep Clean</option>
                    <option value="touch_up">Touch Up</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400">Priority</label>
                  <select
                    name="priority"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-zinc-400">Assign Housekeeper</label>
                <select
                  name="assigned_staff_id"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  <option value="">Unassigned</option>
                  {staffList
                    .filter((s) => s.department === "housekeeping")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400">Notes / Instructions</label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Special instructions for the attendant..."
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowHousekeepingModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createHkMut.isPending}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                >
                  Queue Clean
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: NEW MAINTENANCE ORDER */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Create Maintenance Work Order</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const fd = new FormData(form);
                createMaintMut.mutate({
                  property_id: activeProperty.id,
                  title: fd.get("title") as string,
                  description: fd.get("description") as string,
                  category: fd.get("category") as MaintenanceCategory,
                  priority: fd.get("priority") as MaintenancePriority,
                  room_id: (fd.get("room_id") as string) || undefined,
                  assigned_staff_id: (fd.get("assigned_staff_id") as string) || undefined,
                  estimated_cost: Number(fd.get("estimated_cost")) || 0,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-zinc-400">Issue Title</label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Shower mixer cartridge leaking"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Category</label>
                  <select
                    name="category"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="hvac">HVAC / Air Conditioning</option>
                    <option value="carpentry">Carpentry & Locks</option>
                    <option value="appliance">Appliances</option>
                    <option value="structural">Structural</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400">Priority</label>
                  <select
                    name="priority"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-zinc-400">Affected Room (Optional)</label>
                <select
                  name="room_id"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  <option value="">General Facility / Common Area</option>
                  {roomsList.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      Room {r.room_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400">Assign Technician</label>
                <select
                  name="assigned_staff_id"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  <option value="">Unassigned</option>
                  {staffList
                    .filter((s) => s.department === "maintenance")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400">Detailed Description</label>
                <textarea
                  name="description"
                  rows={2}
                  required
                  placeholder="Describe the failure or defect..."
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMaintMut.isPending}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                >
                  Submit Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: NEW DAILY LOG ENTRY */}
      {showDailyLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Record Shift Handover / Incident</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const fd = new FormData(form);
                createLogMut.mutate({
                  property_id: activeProperty.id,
                  summary: fd.get("summary") as string,
                  details: fd.get("details") as string,
                  category: fd.get("category") as DailyLogCategory,
                  shift_period: fd.get("shift_period") as "morning" | "evening" | "night",
                });
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400">Shift Period</label>
                  <select
                    name="shift_period"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="morning">Morning Shift</option>
                    <option value="evening">Evening Shift</option>
                    <option value="night">Night Shift</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400">Category</label>
                  <select
                    name="category"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="shift_handover">Shift Handover</option>
                    <option value="incident">Incident Report</option>
                    <option value="lost_and_found">Lost & Found</option>
                    <option value="guest_request">Guest Request</option>
                    <option value="maintenance_flag">Maintenance Flag</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-zinc-400">Summary</label>
                <input
                  name="summary"
                  required
                  placeholder="e.g. Morning turnover complete, Ensuite 103 plumbing check"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div>
                <label className="text-zinc-400">Full Details / Pass-Down Notes</label>
                <textarea
                  name="details"
                  rows={3}
                  required
                  placeholder="Detailed notes for the incoming shift team..."
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowDailyLogModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLogMut.isPending}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                >
                  Save Log Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
