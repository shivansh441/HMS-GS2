import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bed,
  Building2,
  CalendarCheck2,
  CreditCard,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Clock,
  AlertCircle,
  RefreshCw,
  Plus,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { fetchDashboardSummary } from "@/src/services/api-client";
import { DashboardDataContract } from "@/src/types/dashboard";

export const AdminDashboardPage: React.FC = () => {
  const { activeProperty } = useProperty();
  const { user } = useAuth();

  const {
    data: envelope,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["dashboard-summary", activeProperty.id, user.id],
    queryFn: () => fetchDashboardSummary(activeProperty.id),
    staleTime: 1000 * 30,
  });

  const dashboardData: DashboardDataContract | null = envelope?.data || null;

  return (
    <PageContainer
      title="Operational Overview"
      description={`Real-time operational metrics and front-desk ledger for ${activeProperty.name}.`}
      breadcrumbs={[{ label: "Overview" }, { label: "Dashboard" }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-850 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            <span>Sync Live</span>
          </button>
          <Link
            to="/admin/reservations"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Reservation</span>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Error State Banner */}
        {isError && (
          <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 flex items-start gap-3 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Failed to load real dashboard telemetry</p>
              <p className="mt-0.5 text-rose-300/80">
                {error instanceof Error ? error.message : "Unknown error connecting to /api/v1/dashboard/summary"}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* 1. Summary Statistic Cards (Tabular figures, anti-slop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Occupancy Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-medium">Total Occupancy</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            {isLoading ? (
              <div className="h-8 w-24 bg-zinc-800 animate-pulse rounded" />
            ) : (
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono tracking-tight text-zinc-100 tabular-nums">
                    {dashboardData?.summary.totalOccupancyPercentage ?? "--"}%
                  </span>
                  <span className="text-xs text-zinc-500 font-mono tabular-nums">
                    ({dashboardData?.summary.occupiedRoomsOrBeds ?? 0} units occupied)
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Scope: {activeProperty.property_type.toUpperCase()} · {activeProperty.total_rooms} rooms / {activeProperty.total_beds} beds
                </p>
              </div>
            )}
          </div>

          {/* Active Reservations */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-medium">Active Bookings</span>
              <CalendarCheck2 className="w-4 h-4 text-indigo-400" />
            </div>
            {isLoading ? (
              <div className="h-8 w-24 bg-zinc-800 animate-pulse rounded" />
            ) : (
              <div>
                <span className="text-2xl font-bold font-mono tracking-tight text-zinc-100 tabular-nums">
                  {dashboardData?.summary.activeReservationsCount ?? "--"}
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Confirmed or active checked-in folios
                </p>
              </div>
            )}
          </div>

          {/* Front Desk Turnaround Today */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-medium">Today's Front Desk</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            {isLoading ? (
              <div className="h-8 w-24 bg-zinc-800 animate-pulse rounded" />
            ) : (
              <div>
                <div className="flex items-baseline gap-3 text-zinc-100 font-mono text-2xl font-bold tabular-nums">
                  <span title="Arrivals">{dashboardData?.summary.pendingCheckInsToday ?? 0} <span className="text-xs text-emerald-400 font-sans font-normal">in</span></span>
                  <span className="text-zinc-600 font-sans">/</span>
                  <span title="Departures">{dashboardData?.summary.pendingCheckOutsToday ?? 0} <span className="text-xs text-sky-400 font-sans font-normal">out</span></span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Expected check-in and check-out turns
                </p>
              </div>
            )}
          </div>

          {/* Pending Receivables / Dues */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-medium">Pending Balances</span>
              <CreditCard className="w-4 h-4 text-purple-400" />
            </div>
            {isLoading ? (
              <div className="h-8 w-24 bg-zinc-800 animate-pulse rounded" />
            ) : (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold font-mono tracking-tight text-zinc-100 tabular-nums">
                    {dashboardData?.summary.pendingDuesTotalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {dashboardData?.summary.currency || activeProperty.currency}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Across {dashboardData?.summary.pendingPaymentsCount ?? 0} unsettled guest folios
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 2. Middle Row: Occupancy Breakdown & Quick Operational Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Occupancy Summary Box */}
          <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Occupancy &amp; Inventory Allocation</h3>
                <p className="text-xs text-zinc-400">Differentiated hostel dorm beds vs hotel private room suites</p>
              </div>
              <span className="text-xs text-zinc-500 font-mono">Real Scope</span>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-12 bg-zinc-800/60 animate-pulse rounded" />
                <div className="h-12 bg-zinc-800/60 animate-pulse rounded" />
              </div>
            ) : dashboardData?.occupancy.length ? (
              <div className="space-y-3">
                {dashboardData.occupancy.map((occ) => (
                  <div
                    key={occ.propertyId}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/80 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-200">{occ.propertyName}</span>
                        <span className="text-[10px] uppercase font-mono text-indigo-400 px-1.5 py-0.5 rounded bg-indigo-500/10">
                          {occ.propertyType}
                        </span>
                      </div>
                      <span className="font-mono text-zinc-300 font-semibold tabular-nums">
                        {occ.totalOccupancyRate}% Occupied
                      </span>
                    </div>

                    {/* Capacity bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                      {occ.propertyType !== "hotel" && (
                        <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                          <span className="text-zinc-400 flex items-center gap-1.5">
                            <Bed className="w-3.5 h-3.5 text-amber-400" />
                            Dorm Beds
                          </span>
                          <span className="font-mono text-zinc-200 tabular-nums">
                            {occ.dormBedsOccupied} / {occ.dormBedsTotal}
                          </span>
                        </div>
                      )}

                      <div className="p-2 rounded bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                        <span className="text-zinc-400 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-sky-400" />
                          Private Rooms
                        </span>
                        <span className="font-mono text-zinc-200 tabular-nums">
                          {occ.privateRoomsOccupied} / {occ.privateRoomsTotal}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-zinc-500">
                No active occupancy breakdown available for this property scope.
              </div>
            )}
          </div>

          {/* Quick Actions Panel */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-100">Front Desk Quick Actions</h3>
            <p className="text-xs text-zinc-400">Common administrative workflows</p>

            <div className="space-y-2 pt-1">
              <Link
                to="/admin/reservations"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 hover:border-zinc-700 transition-all text-xs group"
              >
                <div className="flex items-center gap-2.5 text-zinc-200 font-medium">
                  <CalendarCheck2 className="w-4 h-4 text-indigo-400" />
                  <span>View All Reservations</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </Link>

              <Link
                to="/admin/properties"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 hover:border-zinc-700 transition-all text-xs group"
              >
                <div className="flex items-center gap-2.5 text-zinc-200 font-medium">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span>Scoped Properties</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </Link>

              <Link
                to="/admin/operations/staff"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 hover:border-zinc-700 transition-all text-xs group"
              >
                <div className="flex items-center gap-2.5 text-zinc-200 font-medium">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Staff &amp; Roles Directory</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </Link>

              <Link
                to="/admin/config/property-settings"
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 hover:border-zinc-700 transition-all text-xs group"
              >
                <div className="flex items-center gap-2.5 text-zinc-200 font-medium">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>Property Rules &amp; Curfew</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </Link>
            </div>
          </div>
        </div>

        {/* 3. Bottom Row: Recent Reservations Table & Recent Activity Log */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Reservations Table */}
          <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Recent Scoped Reservations</h3>
                <p className="text-xs text-zinc-400">Real guest reservations backed by /api/v1/admin/reservations</p>
              </div>
              <Link
                to="/admin/reservations"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
              >
                <span>View ledger</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <div className="h-10 bg-zinc-800 animate-pulse rounded" />
                <div className="h-10 bg-zinc-800 animate-pulse rounded" />
                <div className="h-10 bg-zinc-800 animate-pulse rounded" />
              </div>
            ) : dashboardData?.recentReservations.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Guest</th>
                      <th className="pb-2">Unit</th>
                      <th className="pb-2">Dates</th>
                      <th className="pb-2 text-right">Amount</th>
                      <th className="pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {dashboardData.recentReservations.map((res) => (
                      <tr key={res.id} className="hover:bg-zinc-850/50 transition-colors">
                        <td className="py-2.5 font-mono text-indigo-300 font-medium">
                          {res.bookingReference}
                        </td>
                        <td className="py-2.5 font-medium text-zinc-200">
                          {res.guestName}
                        </td>
                        <td className="py-2.5 text-zinc-400 truncate max-w-[160px]">
                          {res.roomOrUnitName}
                        </td>
                        <td className="py-2.5 text-zinc-400 font-mono text-[11px] tabular-nums">
                          {res.checkInDate} · {res.checkOutDate}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-zinc-200 tabular-nums">
                          {res.totalAmount.toFixed(2)} {res.currency}
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${
                              res.status === "confirmed"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : res.status === "checked_in"
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {res.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500">
                No reservations found within this property scope.
              </div>
            )}
          </div>

          {/* Recent Activity Log */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Activity Log</h3>
              <p className="text-xs text-zinc-400">Security &amp; front-desk audit trace</p>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-10 bg-zinc-800 animate-pulse rounded" />
                <div className="h-10 bg-zinc-800 animate-pulse rounded" />
              </div>
            ) : dashboardData?.recentActivities.length ? (
              <div className="space-y-3">
                {dashboardData.recentActivities.map((act) => (
                  <div key={act.id} className="text-xs p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="font-semibold text-zinc-300">{act.actor.name}</span>
                      <span className="font-mono tabular-nums text-[10px]">
                        {new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-zinc-300 leading-snug">{act.description}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 pt-0.5">
                      <span className="capitalize">{act.category}</span>
                      {act.entityReference && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-zinc-400">{act.entityReference}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-zinc-500">
                No recent activity recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
