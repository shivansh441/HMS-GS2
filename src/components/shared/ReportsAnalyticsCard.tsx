import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  BedDouble,
  Calendar,
  Utensils,
  Users,
  Download,
  Filter,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Wrench,
  Sparkles,
  PieChart,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Info,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  fetchExecutiveReport,
  fetchOccupancyReport,
  fetchBookingStayReport,
  fetchFinancialReport,
  fetchFoodDiningReport,
  fetchStaffOpsReport,
  downloadReportCsv,
} from "@/src/services/api-client";

type ReportTab =
  | "executive"
  | "occupancy"
  | "bookings"
  | "finance"
  | "dining"
  | "operations";

export const ReportsAnalyticsCard: React.FC = () => {
  const { activeProperty, properties } = useProperty();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ReportTab>("executive");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    user?.role === "super_admin" ? "all" : (activeProperty?.id || "prop-hostel-001")
  );

  // Preset Date Range State
  const [datePreset, setDatePreset] = useState<"7d" | "30d" | "month" | "custom">("30d");
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState<string>(thirtyDaysAgo);
  const [endDate, setEndDate] = useState<string>(today);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Handle Preset changes
  const applyPreset = (preset: "7d" | "30d" | "month" | "custom") => {
    setDatePreset(preset);
    const now = new Date();
    const end = now.toISOString().split("T")[0];
    setEndDate(end);

    if (preset === "7d") {
      const start = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
      setStartDate(start);
    } else if (preset === "30d") {
      const start = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];
      setStartDate(start);
    } else if (preset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      setStartDate(start);
    }
  };

  const queryParams = {
    property_id: selectedPropertyId,
    start_date: startDate,
    end_date: endDate,
  };

  // Queries for each report tab
  const executiveQuery = useQuery({
    queryKey: ["report-executive", queryParams],
    queryFn: () => fetchExecutiveReport(queryParams),
    enabled: activeTab === "executive",
  });

  const occupancyQuery = useQuery({
    queryKey: ["report-occupancy", queryParams],
    queryFn: () => fetchOccupancyReport(queryParams),
    enabled: activeTab === "occupancy",
  });

  const bookingsQuery = useQuery({
    queryKey: ["report-bookings", queryParams],
    queryFn: () => fetchBookingStayReport(queryParams),
    enabled: activeTab === "bookings",
  });

  const financeQuery = useQuery({
    queryKey: ["report-finance", queryParams],
    queryFn: () => fetchFinancialReport(queryParams),
    enabled: activeTab === "finance",
  });

  const diningQuery = useQuery({
    queryKey: ["report-dining", queryParams],
    queryFn: () => fetchFoodDiningReport(queryParams),
    enabled: activeTab === "dining",
  });

  const staffOpsQuery = useQuery({
    queryKey: ["report-staff-ops", queryParams],
    queryFn: () => fetchStaffOpsReport(queryParams),
    enabled: activeTab === "operations",
  });

  const handleDownloadCsv = async (reportType: string) => {
    try {
      setIsExporting(true);
      setExportMessage(null);
      const csvData = await downloadReportCsv({
        report_type: reportType,
        property_id: selectedPropertyId,
        start_date: startDate,
        end_date: endDate,
      });

      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `grandstay-${reportType}-${selectedPropertyId}-${startDate}-${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportMessage(`Successfully exported ${reportType} CSV.`);
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err: any) {
      setExportMessage(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const activeQuery =
    activeTab === "executive"
      ? executiveQuery
      : activeTab === "occupancy"
      ? occupancyQuery
      : activeTab === "bookings"
      ? bookingsQuery
      : activeTab === "finance"
      ? financeQuery
      : activeTab === "dining"
      ? diningQuery
      : staffOpsQuery;

  return (
    <div className="space-y-6">
      {/* Header & Controls Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Phase 12
              </span>
              <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Reports & Enterprise Analytics
              </h2>
            </div>
            <p className="text-xs text-zinc-400">
              Audit-grade revenue intelligence, RevPAR, multi-tenancy ADR, occupancy timelines, tax reconciliation & operational metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleDownloadCsv(activeTab)}
              disabled={isExporting || activeQuery.isLoading}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition border border-zinc-700 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
            <button
              onClick={() => activeQuery.refetch()}
              disabled={activeQuery.isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs transition border border-zinc-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${activeQuery.isFetching ? "animate-spin text-blue-400" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/50 text-blue-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{exportMessage}</span>
          </div>
        )}

        {/* Filters: Property Scope & Date Range Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80">
          {/* Property Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-zinc-500" />
              Property Scope
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              {user?.role === "super_admin" && (
                <option value="all">Consolidated (All Properties)</option>
              )}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.property_type === "hostel" ? "Hostel" : "Hotel"})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Date Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              Time Horizon
            </label>
            <div className="flex rounded-lg border border-zinc-800 p-0.5 bg-zinc-900">
              <button
                type="button"
                onClick={() => applyPreset("7d")}
                className={`flex-1 py-1 text-[11px] font-medium rounded ${
                  datePreset === "7d" ? "bg-blue-600 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset("30d")}
                className={`flex-1 py-1 text-[11px] font-medium rounded ${
                  datePreset === "30d" ? "bg-blue-600 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset("month")}
                className={`flex-1 py-1 text-[11px] font-medium rounded ${
                  datePreset === "month" ? "bg-blue-600 text-white font-semibold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                This Month
              </button>
            </div>
          </div>

          {/* Date Picker Start */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
              }}
              max={endDate}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Date Picker End */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
              }}
              min={startDate}
              max={today}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 overflow-x-auto gap-2 pt-2">
          <button
            onClick={() => setActiveTab("executive")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === "executive"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Executive Summary
          </button>
          <button
            onClick={() => setActiveTab("occupancy")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === "occupancy"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BedDouble className="w-3.5 h-3.5" />
            Occupancy & Capacity
          </button>
          <button
            onClick={() => setActiveTab("bookings")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === "bookings"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Bookings & Stays
          </button>
          <button
            onClick={() => setActiveTab("finance")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === "finance"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Finance & Tax Ledger
          </button>
          <button
            onClick={() => setActiveTab("dining")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === "dining"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            Mess & Dining Sales
          </button>
          <button
            onClick={() => setActiveTab("operations")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
              activeTab === "operations"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Staff & Housekeeping
          </button>
        </div>
      </div>

      {/* Content Areas */}
      {activeQuery.isLoading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-12 text-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
          <p className="text-sm font-medium text-zinc-300">Computing analytics calculations...</p>
          <p className="text-xs text-zinc-500">Aggregating stay folios, room nights, and operational records</p>
        </div>
      ) : activeQuery.isError ? (
        <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-6 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <p className="font-semibold text-rose-200">Unable to load report</p>
            <p>{(activeQuery.error as any)?.message || "Failed to retrieve reporting telemetry"}</p>
          </div>
        </div>
      ) : (
        <>
          {/* TAB 1: EXECUTIVE SUMMARY */}
          {activeTab === "executive" && executiveQuery.data?.data && (
            <div className="space-y-6">
              {/* Executive Primary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Invoiced Revenue</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-zinc-100 font-mono">
                    £{executiveQuery.data.data.kpis.total_revenue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Gross £{executiveQuery.data.data.kpis.gross_revenue.toLocaleString()} + Tax £
                    {executiveQuery.data.data.kpis.total_tax.toLocaleString()}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Net Cash Collected</span>
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                  </div>
                  <p className="text-2xl font-bold text-blue-400 font-mono">
                    £{executiveQuery.data.data.kpis.net_cash_flow.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Collected £{executiveQuery.data.data.kpis.total_collected.toLocaleString()} - Refunded £
                    {executiveQuery.data.data.kpis.total_refunded.toLocaleString()}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Occupancy Rate</span>
                    <BedDouble className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {executiveQuery.data.data.kpis.occupancy_rate}%
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    ADR: £{executiveQuery.data.data.kpis.adr} | RevPAR: £{executiveQuery.data.data.kpis.revpar}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Outstanding Receivables</span>
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  </div>
                  <p className="text-2xl font-bold text-rose-400 font-mono">
                    £{executiveQuery.data.data.kpis.outstanding_receivables.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Cancellation Rate: {executiveQuery.data.data.kpis.cancellation_rate}%
                  </p>
                </div>
              </div>

              {/* Trend Visualizer Chart */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">Revenue & Cash Flow Daily Trend</h3>
                    <p className="text-xs text-zinc-400">
                      Window: {executiveQuery.data.data.reporting_period.start_date} to{" "}
                      {executiveQuery.data.data.reporting_period.end_date} (
                      {executiveQuery.data.data.reporting_period.days_count} days)
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Invoiced
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Collections
                    </span>
                  </div>
                </div>

                <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {executiveQuery.data.data.trend_series.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-center space-y-1"
                    >
                      <span className="text-[10px] text-zinc-400 font-mono block">{item.date.slice(5)}</span>
                      <p className="text-xs font-bold text-blue-300 font-mono">£{Math.round(item.revenue)}</p>
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{
                            width: `${Math.min(100, (item.collections / Math.max(1, item.revenue)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500">{item.occupancy_pct}% occ</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category Breakdown & Operations Pulse */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-purple-400" />
                    Revenue Composition by Stream
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(executiveQuery.data.data.category_breakdown).map(([cat, val]) => (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300 capitalize">{cat.replace("_", " ")}</span>
                          <span className="font-mono text-zinc-100 font-medium">£{val.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{
                              width: `${
                                executiveQuery.data!.data.kpis.total_revenue > 0
                                  ? Math.min(100, (val / executiveQuery.data!.data.kpis.total_revenue) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    Operational Vital Signs
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">Total Bookings</span>
                      <span className="text-lg font-bold text-zinc-100 font-mono">
                        {executiveQuery.data.data.kpis.total_bookings_count}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">Completed Stays</span>
                      <span className="text-lg font-bold text-emerald-400 font-mono">
                        {executiveQuery.data.data.kpis.completed_stays_count}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">On-Duty Staff</span>
                      <span className="text-lg font-bold text-zinc-100 font-mono">
                        {executiveQuery.data.data.kpis.active_staff_headcount}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">Open Maintenance</span>
                      <span className="text-lg font-bold text-amber-400 font-mono">
                        {executiveQuery.data.data.kpis.open_maintenance_count}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OCCUPANCY & CAPACITY */}
          {activeTab === "occupancy" && occupancyQuery.data?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Hotel Room Occupancy</span>
                  <p className="text-2xl font-bold text-blue-400 font-mono">
                    {occupancyQuery.data.data.hotel_occupancy_pct}%
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {occupancyQuery.data.data.room_nights_sold} / {occupancyQuery.data.data.room_nights_available} room nights
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Hostel Bed Occupancy</span>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {occupancyQuery.data.data.hostel_occupancy_pct}%
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {occupancyQuery.data.data.bed_nights_sold} / {occupancyQuery.data.data.bed_nights_available} bed nights
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Average Daily Rate (ADR)</span>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    £{occupancyQuery.data.data.adr}
                  </p>
                  <p className="text-[11px] text-zinc-400">Revenue per sold unit</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">RevPAR</span>
                  <p className="text-2xl font-bold text-purple-400 font-mono">
                    £{occupancyQuery.data.data.revpar}
                  </p>
                  <p className="text-[11px] text-zinc-400">Revenue per available capacity unit</p>
                </div>
              </div>

              {/* Daily Occupancy Timeline Table */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">Daily Occupancy & Availability Timeline</h3>
                  <span className="text-xs text-zinc-400 font-mono">
                    {occupancyQuery.data.data.daily_breakdown.length} days recorded
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-900/70 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider font-mono">
                      <tr>
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4">Hotel Rooms Occupied</th>
                        <th className="py-2.5 px-4">Room Occ %</th>
                        <th className="py-2.5 px-4">Hostel Beds Occupied</th>
                        <th className="py-2.5 px-4">Bed Occ %</th>
                        <th className="py-2.5 px-4">Available Units</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                      {occupancyQuery.data.data.daily_breakdown.slice(0, 14).map((pt, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/30">
                          <td className="py-2.5 px-4 text-zinc-200">{pt.date}</td>
                          <td className="py-2.5 px-4">{pt.occupied_rooms}</td>
                          <td className="py-2.5 px-4 text-blue-400">{pt.room_occupancy_pct}%</td>
                          <td className="py-2.5 px-4">{pt.occupied_beds}</td>
                          <td className="py-2.5 px-4 text-emerald-400">{pt.bed_occupancy_pct}%</td>
                          <td className="py-2.5 px-4 text-zinc-400">
                            {pt.available_rooms} rooms / {pt.available_beds} beds
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BOOKINGS & STAYS */}
          {activeTab === "bookings" && bookingsQuery.data?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Total Bookings Recorded</span>
                  <p className="text-2xl font-bold text-zinc-100 font-mono">
                    {bookingsQuery.data.data.total_bookings}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Checked In: {bookingsQuery.data.data.checked_in_count} | Done: {bookingsQuery.data.data.checked_out_count}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Avg Length of Stay</span>
                  <p className="text-2xl font-bold text-blue-400 font-mono">
                    {bookingsQuery.data.data.average_length_of_stay_days} nights
                  </p>
                  <p className="text-[11px] text-zinc-400">Lead time avg: {bookingsQuery.data.data.lead_time_days_avg} days</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Guests Served</span>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {bookingsQuery.data.data.total_guests_served}
                  </p>
                  <p className="text-[11px] text-zinc-400">Hostellers & hotel guests</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Cancellations</span>
                  <p className="text-2xl font-bold text-rose-400 font-mono">
                    {bookingsQuery.data.data.cancelled_count}
                  </p>
                  <p className="text-[11px] text-zinc-400">Confirmed: {bookingsQuery.data.data.confirmed_count}</p>
                </div>
              </div>

              {/* Bookings Table */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">Recent Guest Reservations & Stays</h3>
                  <button
                    onClick={() => handleDownloadCsv("bookings")}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Table
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-900/70 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider font-mono">
                      <tr>
                        <th className="py-2.5 px-4">Booking ID</th>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4">Guest / Hosteller</th>
                        <th className="py-2.5 px-4">Assigned Unit</th>
                        <th className="py-2.5 px-4">Check-In</th>
                        <th className="py-2.5 px-4">Check-Out</th>
                        <th className="py-2.5 px-4">Nights</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Folio Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                      {bookingsQuery.data.data.records.map((rec) => (
                        <tr key={rec.id} className="hover:bg-zinc-900/30">
                          <td className="py-2.5 px-4 text-zinc-400">{rec.id}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                rec.type === "hotel_booking"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}
                            >
                              {rec.type === "hotel_booking" ? "Hotel" : "Hostel"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-sans font-medium text-zinc-200">{rec.guest_name}</td>
                          <td className="py-2.5 px-4 text-zinc-400">{rec.unit_label}</td>
                          <td className="py-2.5 px-4">{rec.check_in}</td>
                          <td className="py-2.5 px-4">{rec.check_out}</td>
                          <td className="py-2.5 px-4">{rec.nights}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                rec.status === "checked_in"
                                  ? "text-emerald-400 bg-emerald-950/40"
                                  : rec.status === "checked_out"
                                  ? "text-zinc-400 bg-zinc-900"
                                  : rec.status === "cancelled"
                                  ? "text-rose-400 bg-rose-950/40"
                                  : "text-blue-400 bg-blue-950/40"
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-zinc-100">
                            £{rec.total_amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FINANCE & TAX */}
          {activeTab === "finance" && financeQuery.data?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Total Invoiced Revenue</span>
                  <p className="text-2xl font-bold text-zinc-100 font-mono">
                    £{financeQuery.data.data.invoiced_revenue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">In period window</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Gross Cash Collected</span>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    £{financeQuery.data.data.cash_collected.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">Direct & card terminal payments</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Refunds Disbursed</span>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    £{financeQuery.data.data.refunds_processed.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">Approved refunds</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Net Collections</span>
                  <p className="text-2xl font-bold text-blue-400 font-mono">
                    £{financeQuery.data.data.net_collections.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">Collected minus refunds</p>
                </div>
              </div>

              {/* Aging Receivables & Tax Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Aging Schedule */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-400" />
                    Accounts Receivable Aging Buckets
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">Current (0-30 days)</span>
                      <span className="text-base font-bold text-emerald-400 font-mono">
                        £{financeQuery.data.data.aging_receivables.current_0_30.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">31-60 Days Overdue</span>
                      <span className="text-base font-bold text-amber-400 font-mono">
                        £{financeQuery.data.data.aging_receivables.overdue_31_60.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">61-90 Days Overdue</span>
                      <span className="text-base font-bold text-rose-400 font-mono">
                        £{financeQuery.data.data.aging_receivables.overdue_61_90.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1">90+ Days Overdue</span>
                      <span className="text-base font-bold text-rose-500 font-mono">
                        £{financeQuery.data.data.aging_receivables.overdue_90_plus.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tax Ledger Summary */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Statutory VAT & Tax Reconciliation
                  </h3>
                  <div className="space-y-3 font-mono text-xs">
                    {financeQuery.data.data.tax_summary.map((t, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                        <div>
                          <span className="font-sans font-medium text-zinc-200 block">{t.tax_type}</span>
                          <span className="text-[11px] text-zinc-400">Taxable base: £{t.taxable_amount.toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-400">£{t.tax_collected.toLocaleString()}</span>
                          <span className="text-[10px] text-zinc-500 block">collected</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DINING & MESS */}
          {activeTab === "dining" && diningQuery.data?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Meal Attendances</span>
                  <p className="text-2xl font-bold text-zinc-100 font-mono">
                    {diningQuery.data.data.total_meal_attendances}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Plan redemptions: {diningQuery.data.data.entitlement_redemptions}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Pay-Per-Meal Sales</span>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    £{diningQuery.data.data.pay_per_meal_revenue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {diningQuery.data.data.pay_per_meal_count} meals served
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Restaurant Orders</span>
                  <p className="text-2xl font-bold text-blue-400 font-mono">
                    {diningQuery.data.data.restaurant_orders_count}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Total: £{diningQuery.data.data.restaurant_sales_total.toLocaleString()}
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Average Order Value</span>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    £{diningQuery.data.data.avg_order_value}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Low stock alerts: {diningQuery.data.data.stock_summary.low_stock_items}
                  </p>
                </div>
              </div>

              {/* Popular Menu Items */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-200">Top-Selling Menu Items & Dishes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {diningQuery.data.data.popular_menu_items.map((it, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-zinc-200 block">{it.name}</span>
                        <span className="text-[11px] text-zinc-400">{it.quantity_sold} portions served</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        £{it.revenue.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: STAFF & OPERATIONS */}
          {activeTab === "operations" && staffOpsQuery.data?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Attendance Punctuality</span>
                  <p className="text-2xl font-bold text-emerald-400 font-mono">
                    {staffOpsQuery.data.data.attendance_punctuality_pct}%
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Total Hours: {staffOpsQuery.data.data.total_work_hours} hrs
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Housekeeping Turnover</span>
                  <p className="text-2xl font-bold text-blue-400 font-mono">
                    {staffOpsQuery.data.data.housekeeping_turnover_rate_pct}%
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Avg turnaround: {staffOpsQuery.data.data.avg_turnaround_time_mins} mins
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Maintenance Resolution</span>
                  <p className="text-2xl font-bold text-amber-400 font-mono">
                    {staffOpsQuery.data.data.maintenance_resolution_rate_pct}%
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {staffOpsQuery.data.data.maintenance_resolved_total} / {staffOpsQuery.data.data.maintenance_orders_total} orders
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-1">
                  <span className="text-xs text-zinc-400">Maintenance Costs</span>
                  <p className="text-2xl font-bold text-rose-400 font-mono">
                    £{staffOpsQuery.data.data.total_maintenance_expenses.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Shift logs: {staffOpsQuery.data.data.handover_logs_count} recorded
                  </p>
                </div>
              </div>

              {/* Department Headcount Breakdown */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-200">Department Headcount & Allocation</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {Object.entries(staffOpsQuery.data.data.department_distribution).map(([dept, count]) => (
                    <div key={dept} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-400 block mb-1 capitalize">{dept.replace("_", " ")}</span>
                      <span className="text-lg font-bold text-zinc-100 font-mono">{count} staff</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
