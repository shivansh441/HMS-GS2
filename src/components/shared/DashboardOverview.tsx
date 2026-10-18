import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  DollarSign,
  BedDouble,
  Calendar,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw,
  LogIn,
  LogOut,
  Wrench,
  Receipt,
  Sparkles,
  PieChart,
  Layers,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  fetchExecutiveReport,
  fetchOccupancyReport,
  fetchHostelFrontDesk,
  fetchHotelFrontDesk,
  fetchOperationsDashboard,
} from "@/src/services/api-client";
import { formatCurrency } from "@/src/lib/utils";
import { ActiveTab } from "@/src/components/layout/Sidebar";
import { HealthResponse } from "@/src/types/api";

interface DashboardOverviewProps {
  healthData?: HealthResponse | null;
  onNavigateTab: (tab: ActiveTab) => void;
}

type DatePreset = "today" | "7d" | "month" | "last_month" | "year";

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateTab }) => {
  const { activeProperty, properties, setActivePropertyId } = useProperty();
  const { user } = useAuth();

  const isSuperAdmin = user.role === "super_admin";

  // Dashboard Filters State
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    isSuperAdmin ? "all" : activeProperty.id
  );

  // Compute date range based on preset
  const { startDate, endDate, dateLabel } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (datePreset === "today") {
      return { startDate: todayStr, endDate: todayStr, dateLabel: "Today" };
    }
    if (datePreset === "7d") {
      const past = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
      return { startDate: past, endDate: todayStr, dateLabel: "Last 7 Days" };
    }
    if (datePreset === "last_month") {
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
      return { startDate: firstDayPrevMonth, endDate: lastDayPrevMonth, dateLabel: "Last Month" };
    }
    if (datePreset === "year") {
      const startYear = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      return { startDate: startYear, endDate: todayStr, dateLabel: "This Year" };
    }
    // Default: This Month
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    return { startDate: startMonth, endDate: todayStr, dateLabel: "This Month" };
  }, [datePreset]);

  // Executive summary metrics query
  const {
    data: execReportEnvelope,
    isLoading: isExecLoading,
    refetch: refetchExec,
  } = useQuery({
    queryKey: ["dashboard-executive", selectedPropertyId, startDate, endDate],
    queryFn: () =>
      fetchExecutiveReport({
        property_id: selectedPropertyId,
        start_date: startDate,
        end_date: endDate,
      }),
    staleTime: 1000 * 30,
  });

  // Occupancy metrics query
  const {
    data: occReportEnvelope,
    isLoading: isOccLoading,
  } = useQuery({
    queryKey: ["dashboard-occupancy", selectedPropertyId, startDate, endDate],
    queryFn: () =>
      fetchOccupancyReport({
        property_id: selectedPropertyId,
        start_date: startDate,
        end_date: endDate,
      }),
    staleTime: 1000 * 30,
  });

  // Operational Front Desk Queue query
  const isHostel = activeProperty.property_type === "hostel" || activeProperty.property_type === "hybrid";
  const isHotel = activeProperty.property_type === "hotel" || activeProperty.property_type === "hybrid";

  const { data: hostelDeskEnvelope } = useQuery({
    queryKey: ["dashboard-hostel-desk", activeProperty.id],
    queryFn: () => fetchHostelFrontDesk(activeProperty.id),
    enabled: isHostel,
    staleTime: 1000 * 20,
  });

  const { data: hotelDeskEnvelope } = useQuery({
    queryKey: ["dashboard-hotel-desk", activeProperty.id],
    queryFn: () => fetchHotelFrontDesk(activeProperty.id),
    enabled: isHotel,
    staleTime: 1000 * 20,
  });

  const { data: opsDashboardEnvelope } = useQuery({
    queryKey: ["dashboard-operations", activeProperty.id],
    queryFn: () => fetchOperationsDashboard(activeProperty.id),
    staleTime: 1000 * 30,
  });

  const exec = execReportEnvelope?.data;
  const occ = occReportEnvelope?.data;
  const hostelDesk = hostelDeskEnvelope?.data;
  const hotelDesk = hotelDeskEnvelope?.data;
  const ops = opsDashboardEnvelope?.data;

  const currency = exec?.property_scope.currency || activeProperty.currency || "GBP";

  // Aggregated Front Desk today totals
  const todayArrivalsCount =
    (hostelDesk?.today_arrivals.length || 0) + (hotelDesk?.today_arrivals.length || 0);
  const todayDeparturesCount =
    (hostelDesk?.today_departures.length || 0) + (hotelDesk?.today_departures.length || 0);
  const totalInHouseGuests =
    (hostelDesk?.in_house_hostellers.length || 0) + (hotelDesk?.in_house_guests.length || 0);

  // Business Insights Generator
  const insights = useMemo(() => {
    const list: Array<{ id: string; type: "positive" | "warning" | "info"; title: string; detail: string }> = [];

    const occRate = exec?.kpis.occupancy_rate || occ?.hotel_occupancy_pct || 0;
    if (occRate >= 70) {
      list.push({
        id: "occ-high",
        type: "positive",
        title: "Strong Occupancy Performance",
        detail: `Current occupancy is healthy at ${occRate}%, generating sustained RevPAR of ${formatCurrency(exec?.kpis.revpar || 0, currency)}.`,
      });
    } else {
      list.push({
        id: "occ-low",
        type: "warning",
        title: "Occupancy Opportunity",
        detail: `Occupancy is at ${occRate}%. Unallocated inventory available across ${occ?.total_rooms || activeProperty.total_rooms} rooms and ${occ?.total_beds || activeProperty.total_beds} beds.`,
      });
    }

    if ((exec?.kpis.outstanding_receivables || 0) > 0) {
      list.push({
        id: "fin-dues",
        type: "warning",
        title: "Pending Balance Follow-Up",
        detail: `${formatCurrency(exec?.kpis.outstanding_receivables || 0, currency)} in outstanding client folios awaiting settlement.`,
      });
    }

    if ((exec?.kpis.open_maintenance_count || 0) > 0) {
      list.push({
        id: "maint-alert",
        type: "info",
        title: "Facilities Maintenance Backlog",
        detail: `${exec?.kpis.open_maintenance_count} active work orders in progress across lodging facilities.`,
      });
    }

    return list;
  }, [exec, occ, currency, activeProperty]);

  return (
    <div className="space-y-6">
      {/* Top Dashboard Control Bar: Property Filter & Date Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Property Scope:</span>
          </div>

          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs rounded-lg px-3 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {isSuperAdmin && <option value="all">All Properties (Consolidated)</option>}
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Presets */}
        <div className="flex flex-wrap items-center gap-1 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {(
            [
              { id: "today", label: "Today" },
              { id: "7d", label: "7 Days" },
              { id: "month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "year", label: "This Year" },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              onClick={() => setDatePreset(preset.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                datePreset === preset.id
                  ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced Revenue */}
        <div
          onClick={() => onNavigateTab("finance")}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-2 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Invoiced Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {formatCurrency(exec?.kpis.total_revenue || 0, currency)}
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-zinc-500 dark:text-zinc-400">
            <span>Collected: {formatCurrency(exec?.kpis.total_collected || 0, currency)}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
              Net Flow <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Occupancy Rate */}
        <div
          onClick={() => onNavigateTab("rooms-beds")}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-2 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Occupancy Rate</span>
            <BedDouble className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {exec?.kpis.occupancy_rate || occ?.hotel_occupancy_pct || 0}%
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">overall</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-zinc-500 dark:text-zinc-400">
            <span>Rooms: {occ?.hotel_occupancy_pct || 0}%</span>
            <span>Beds: {occ?.hostel_occupancy_pct || 0}%</span>
          </div>
        </div>

        {/* Front Desk Movement Today */}
        <div
          onClick={() => onNavigateTab(isHotel ? "hotel-workflow" : "hostel-workflow")}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-2 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Front Desk Today</span>
            <Users className="w-4 h-4 text-sky-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
                {todayArrivalsCount}
              </span>
              <span className="text-xs text-zinc-500 ml-1">in</span>
            </div>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <div>
              <span className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
                {todayDeparturesCount}
              </span>
              <span className="text-xs text-zinc-500 ml-1">out</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-zinc-500 dark:text-zinc-400">
            <span>In-House Guests:</span>
            <span className="font-semibold text-sky-600 dark:text-sky-400">{totalInHouseGuests} active</span>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div
          onClick={() => onNavigateTab("finance")}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 space-y-2 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">Outstanding Receivables</span>
            <Receipt className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {formatCurrency(exec?.kpis.outstanding_receivables || 0, currency)}
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 dark:border-zinc-800/80 text-zinc-500 dark:text-zinc-400">
            <span>Refunds: {formatCurrency(exec?.kpis.total_refunded || 0, currency)}</span>
            <span className="text-purple-600 dark:text-purple-400 font-semibold">Manage Folios</span>
          </div>
        </div>
      </div>

      {/* Interactive Charts Section: Revenue Trend & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Collections Time-Series Trend */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Revenue & Collections Performance
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Daily financial movements for {dateLabel}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Invoiced
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Collected
              </span>
            </div>
          </div>

          {/* Interactive Trend Chart */}
          {exec?.trend_series && exec.trend_series.length > 0 ? (
            <div className="space-y-4 pt-2">
              <div className="h-56 flex items-end gap-2 sm:gap-4 pt-6 px-2">
                {exec.trend_series.slice(-10).map((pt, idx) => {
                  const maxVal = Math.max(...exec.trend_series.map((t) => Math.max(t.revenue, t.collections)), 100);
                  const revHeight = Math.max(8, Math.round((pt.revenue / maxVal) * 100));
                  const collHeight = Math.max(6, Math.round((pt.collections / maxVal) * 100));

                  return (
                    <div key={pt.date || idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 bg-zinc-900 text-white text-[10px] py-1 px-2 rounded-md shadow-md pointer-events-none whitespace-nowrap border border-zinc-700">
                        <p className="font-semibold">{pt.date}</p>
                        <p>Revenue: {formatCurrency(pt.revenue, currency)}</p>
                        <p>Collected: {formatCurrency(pt.collections, currency)}</p>
                      </div>

                      <div className="w-full flex items-end justify-center gap-1 h-44">
                        <div
                          style={{ height: `${revHeight}%` }}
                          className="w-1/2 bg-indigo-500/80 hover:bg-indigo-600 rounded-t-sm transition-all"
                        />
                        <div
                          style={{ height: `${collHeight}%` }}
                          className="w-1/2 bg-emerald-500/80 hover:bg-emerald-600 rounded-t-sm transition-all"
                        />
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono rotate-45 sm:rotate-0 mt-1">
                        {pt.date.slice(-5)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <span>Average Daily Rate (ADR): <strong className="text-zinc-800 dark:text-zinc-200">{formatCurrency(exec.kpis.adr, currency)}</strong></span>
                <span>RevPAR: <strong className="text-zinc-800 dark:text-zinc-200">{formatCurrency(exec.kpis.revpar, currency)}</strong></span>
              </div>
            </div>
          ) : (
            <div className="h-56 flex flex-col items-center justify-center text-zinc-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mb-2 text-indigo-500" />
              <span>Loading trend metrics...</span>
            </div>
          )}
        </div>

        {/* Revenue by Department / Category Breakdown */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 space-y-4 shadow-xs">
          <div className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-purple-500" />
              Revenue by Stream
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Departmental contribution</p>
          </div>

          <div className="space-y-3.5 pt-1">
            {exec?.category_breakdown && Object.keys(exec.category_breakdown).length > 0 ? (
              Object.entries(exec.category_breakdown).map(([categoryKey, amount], idx) => {
                const totalRev = exec.kpis.total_revenue || 1;
                const percentage = Math.min(100, Math.round(((amount as number) / totalRev) * 100));
                const label = categoryKey
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <div key={categoryKey} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                        {formatCurrency(amount as number, currency)} ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, Math.max(3, percentage))}%` }}
                        className={`h-full rounded-full ${
                          idx === 0
                            ? "bg-indigo-500"
                            : idx === 1
                            ? "bg-sky-500"
                            : idx === 2
                            ? "bg-amber-500"
                            : "bg-purple-500"
                        }`}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-zinc-500 text-center py-8">No departmental revenue recorded for this period.</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily Operations Hub & Actionable Business Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Operations Actions & Tasks */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Daily Operations Quick Actions
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Frequent tasks for reception, housekeeping, and management
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              Active Shift
            </span>
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => onNavigateTab(isHotel ? "hotel-workflow" : "hostel-workflow")}
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug">New Stay</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Book room or bed</p>
            </button>

            <button
              onClick={() => onNavigateTab("rooms-beds")}
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <BedDouble className="w-4 h-4" />
              </div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug">Room Cleaning</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Inspect & turnover</p>
            </button>

            <button
              onClick={() => onNavigateTab("finance")}
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-800 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Receipt className="w-4 h-4" />
              </div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug">Take Payment</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Settle guest folios</p>
            </button>

            <button
              onClick={() => onNavigateTab("staff-operations")}
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-sky-50 dark:hover:bg-sky-950/30 hover:border-sky-300 dark:hover:border-sky-800 text-left transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Wrench className="w-4 h-4" />
              </div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug">Work Order</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Log repair request</p>
            </button>
          </div>

          {/* Front Desk Live Arrival/Departure Preview */}
          <div className="pt-2">
            <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2.5">
              Immediate Front Desk Queue ({todayArrivalsCount} Arrivals, {todayDeparturesCount} Departures)
            </h4>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {hostelDesk?.today_arrivals.slice(0, 2).map((arr) => (
                <div key={arr.id} className="p-3 flex items-center justify-between text-xs bg-white dark:bg-zinc-900">
                  <div className="flex items-center gap-2.5">
                    <LogIn className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{arr.hosteller_name}</span>
                      <span className="text-zinc-500 ml-2">Hostel Bed: {arr.bed_label || "Unassigned"}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigateTab("hostel-workflow")}
                    className="px-2.5 py-1 text-[11px] rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-medium"
                  >
                    Check In
                  </button>
                </div>
              ))}

              {hotelDesk?.today_arrivals.slice(0, 2).map((arr) => (
                <div key={arr.id} className="p-3 flex items-center justify-between text-xs bg-white dark:bg-zinc-900">
                  <div className="flex items-center gap-2.5">
                    <LogIn className="w-4 h-4 text-sky-500" />
                    <div>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{arr.guest_name}</span>
                      <span className="text-zinc-500 ml-2">Hotel Suite: {arr.room_number ? `Room ${arr.room_number}` : "Pending Room"}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigateTab("hotel-workflow")}
                    className="px-2.5 py-1 text-[11px] rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-medium"
                  >
                    Check In
                  </button>
                </div>
              ))}

              {todayArrivalsCount === 0 && todayDeparturesCount === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">
                  No pending arrivals or departures scheduled for today.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actionable Business Observations */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-6 space-y-4 shadow-xs">
          <div className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Operational Insights
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Calculated business observations</p>
          </div>

          <div className="space-y-3">
            {insights.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                  item.type === "positive"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200"
                    : item.type === "warning"
                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200"
                    : "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/40 text-sky-900 dark:text-sky-200"
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>{item.title}</span>
                  {item.type === "positive" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : item.type === "warning" ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  )}
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">{item.detail}</p>
              </div>
            ))}
          </div>

          {/* Quick jump to complete reports */}
          <div className="pt-2">
            <button
              onClick={() => onNavigateTab("reports")}
              className="w-full py-2.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Explore Comprehensive Reports</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
