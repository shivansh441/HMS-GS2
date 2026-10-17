import React from "react";
import { Bed, Users, Key, Moon, Coffee, Shield, CheckCircle, AlertCircle } from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";

export const HostelWorkflowCard: React.FC = () => {
  const { activeProperty } = useProperty();
  const isHostel = activeProperty.property_type === "hostel" || activeProperty.property_type === "hybrid";

  const config = activeProperty.configuration as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Bed className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Hostel Domain Workflows (Bed-Level Operations)</h3>
            <p className="text-xs text-zinc-400">Dorm inventory, shared accommodations, bunk assignments & communal policies</p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          Unlike traditional hotels that sell whole rooms, hostels sell individual <strong>beds</strong> within shared rooms.
          The GrandStay architecture provides dedicated schemas (<code className="text-amber-400 font-mono">HostelConfig</code>)
          and workflows for bunk assignments (Top/Bottom), mixed/female-only dorm policies, locker deposits, and communal guidelines.
        </p>
      </div>

      {!isHostel && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Note: Currently active property <strong>{activeProperty.name}</strong> is a <strong>Hotel</strong>.
            Switch property in the top bar to <strong>GrandStay Royal Mile Hostel</strong> to inspect live hostel config.
          </span>
        </div>
      )}

      {/* Hostel Workflow Specs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Unit of Inventory */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <Bed className="w-4 h-4" />
            <h4>1. Inventory Granularity</h4>
          </div>
          <p className="text-xs text-zinc-300">
            <strong>Bed-Level Allocation:</strong> Reservations bind to individual bed spaces within a dormitory (e.g. Dorm A - Bunk 3B Lower).
          </p>
          <div className="text-[11px] font-mono text-zinc-500 pt-1">
            Total Beds: {activeProperty.total_beds} across {activeProperty.total_rooms} units
          </div>
        </div>

        {/* Dorm Sharing & Gender Prefs */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <Users className="w-4 h-4" />
            <h4>2. Dorm Gender Policies</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Enforces strict matching for female-only, male-only, or mixed-gender dorm rooms during booking validation.
          </p>
          <div className="text-[11px] font-mono text-emerald-400 pt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Mixed Dorms Allowed: {String(config.allow_mixed_gender_dorms ?? true)}
          </div>
        </div>

        {/* Key & Locker Security */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <Key className="w-4 h-4" />
            <h4>3. Lockers & Security</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Each bed allocation automatically tracks personal locker number and padlock deposit status.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Deposit: {activeProperty.currency} {String(config.linen_deposit ?? "10.00")}
          </div>
        </div>

        {/* Quiet Hours & Curfew */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
            <Moon className="w-4 h-4" />
            <h4>4. Quiet Hours & Curfews</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Automated SMS notifications and front desk handovers based on property-configured quiet hours.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Hours: {String(config.quiet_hours_start ?? "23:00")} - {String(config.quiet_hours_end ?? "07:00")}
          </div>
        </div>

        {/* Communal Amenities */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
            <Coffee className="w-4 h-4" />
            <h4>5. Communal Amenities</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Shared kitchen tag labeling, community event board registration, and communal workspace booking.
          </p>
          <div className="text-[11px] font-mono text-emerald-400 pt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Communal Kitchen: {String(config.communal_kitchen_access ?? true)}
          </div>
        </div>

        {/* Group Bookings & Tours */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold">
            <Shield className="w-4 h-4" />
            <h4>6. Multi-Bed Group Check-in</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Unified group leader billing with individual bed allocations and separate digital registration cards.
          </p>
          <div className="text-[11px] font-mono text-zinc-500 pt-1">
            Phase 2 Pipeline Integration
          </div>
        </div>
      </div>
    </div>
  );
};
