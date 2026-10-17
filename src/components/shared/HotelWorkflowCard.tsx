import React from "react";
import { Hotel, Sparkles, Wine, Bell, Car, Star, CheckCircle, AlertCircle } from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";

export const HotelWorkflowCard: React.FC = () => {
  const { activeProperty } = useProperty();
  const isHotel = activeProperty.property_type === "hotel" || activeProperty.property_type === "hybrid";

  const config = activeProperty.configuration as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Hotel className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Hotel Domain Workflows (Room-Level Operations)</h3>
            <p className="text-xs text-zinc-400">Private room suites, housekeeping turndown, guest folios & concierge services</p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          In contrast to hostel dorm bed sales, hotel workflows center around <strong>private room suites</strong>,
          room-level folios, concierge request tracking, minibar consumption reconciliation, and turndown housekeeping.
          These rules are modeled via <code className="text-sky-400 font-mono">HotelConfig</code>.
        </p>
      </div>

      {!isHotel && (
        <div className="p-4 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Note: Currently active property <strong>{activeProperty.name}</strong> is a <strong>Hostel</strong>.
            Switch property in the top bar to <strong>GrandStay Mayfair Grand Hotel</strong> to inspect live hotel config.
          </span>
        </div>
      )}

      {/* Hotel Workflow Specs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Whole Room Inventory */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
            <Hotel className="w-4 h-4" />
            <h4>1. Private Room Inventory</h4>
          </div>
          <p className="text-xs text-zinc-300">
            <strong>Room-Level Allocation:</strong> Whole room suites (Standard, Deluxe, Executive, Penthouse) with individual keycard access.
          </p>
          <div className="text-[11px] font-mono text-zinc-500 pt-1">
            Total Inventory: {activeProperty.total_rooms} Private Suites
          </div>
        </div>

        {/* Star Rating & Standard */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <Star className="w-4 h-4" />
            <h4>2. Hospitality Rating</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Enforces standard operating procedures (SOPs) based on official property classification.
          </p>
          <div className="text-[11px] font-mono text-amber-300 pt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Star Rating: {String(config.star_rating ?? "5")}-Star Standard
          </div>
        </div>

        {/* Housekeeping Turnover & Turndown */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
            <Sparkles className="w-4 h-4" />
            <h4>3. Housekeeping Turnover</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Automated morning linen change and evening turndown service tracking with room status (Clean, Dirty, Inspected, DND).
          </p>
          <div className="text-[11px] font-mono text-emerald-400 pt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Daily Cleaning: {String(config.daily_housekeeping ?? true)}
          </div>
        </div>

        {/* Minibar & In-Room POS */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold">
            <Wine className="w-4 h-4" />
            <h4>4. Minibar Consumption</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Housekeeping mobile auditing of consumed minibar inventory with real-time post to guest room folio.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Minibar Enabled: {String(config.minibar_enabled ?? true)}
          </div>
        </div>

        {/* Concierge & Guest Services */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <Bell className="w-4 h-4" />
            <h4>5. Concierge & Valet</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Luggage porterage, theatre bookings, private chauffeur scheduling, and VIP amenity requests.
          </p>
          <div className="text-[11px] font-mono text-emerald-400 pt-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Concierge Desk: {String(config.concierge_available ?? true)}
          </div>
        </div>

        {/* Room Service Hours */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
            <Car className="w-4 h-4" />
            <h4>6. Valet & Parking</h4>
          </div>
          <p className="text-xs text-zinc-300">
            Valet ticket tracking, vehicle drop-off/retrieval logging, and designated private parking slot management.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 pt-1">
            Valet: {String(config.valet_parking ?? true)}
          </div>
        </div>
      </div>
    </div>
  );
};
