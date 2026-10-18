import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck2,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Building2,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { useProperty } from "@/src/contexts/PropertyContext";
import { fetchAdminReservations } from "@/src/services/api-client";

export const AdminReservationsPage: React.FC = () => {
  const { activeProperty } = useProperty();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const {
    data: envelope,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-reservations", activeProperty.id],
    queryFn: () => fetchAdminReservations(activeProperty.id),
    staleTime: 1000 * 30,
  });

  const bookings: any[] = envelope?.data || [];

  const filteredBookings = bookings.filter((b) => {
    const matchesSearch =
      b.booking_reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.guest_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.guest_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || b.booking_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PageContainer
      title="Front Desk Reservations Ledger"
      description={`Active guest and hosteller booking folios within ${activeProperty.name}.`}
      breadcrumbs={[{ label: "Front Desk" }, { label: "Reservations" }]}
      actions={
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-850 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          <span>Refresh Ledger</span>
        </button>
      }
    >
      <div className="space-y-4">
        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search reference, guest name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-zinc-500"
            />
          </div>

          {/* Interactive filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-lg border border-zinc-800/80 w-full sm:w-auto">
            {["all", "confirmed", "checked_in", "checked_out"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Ledger Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-3">
              <div className="h-10 bg-zinc-800 animate-pulse rounded" />
              <div className="h-10 bg-zinc-800 animate-pulse rounded" />
              <div className="h-10 bg-zinc-800 animate-pulse rounded" />
            </div>
          ) : filteredBookings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] text-zinc-500 font-semibold uppercase tracking-wider bg-zinc-950/60">
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Guest</th>
                    <th className="py-3 px-4">Stay Dates</th>
                    <th className="py-3 px-4">Unit Allocated</th>
                    <th className="py-3 px-4 text-right">Total Fee</th>
                    <th className="py-3 px-4 text-right">Deposit</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-zinc-850/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-400">
                        {b.booking_reference}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-zinc-200">{b.guest_name}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{b.guest_email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-400 tabular-nums">
                        {b.check_in_date} · {b.check_out_date} ({b.total_nights}n)
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {b.items?.[0]?.room_type_name || "Standard Room / Bed"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-200 tabular-nums">
                        {b.total_amount?.toFixed(2)} {b.currency}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-400 tabular-nums">
                        {b.deposit_paid?.toFixed(2)} {b.currency}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${
                            b.booking_status === "confirmed"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : b.booking_status === "checked_in"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {b.booking_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center space-y-2">
              <CalendarCheck2 className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm font-semibold text-zinc-300">No Reservations Found</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {searchTerm || statusFilter !== "all"
                  ? "No bookings match your current search criteria or status filter."
                  : "No reservations are currently registered under this property scope."}
              </p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};
