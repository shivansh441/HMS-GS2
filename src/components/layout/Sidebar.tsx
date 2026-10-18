import React from "react";
import {
  Layers,
  Bed,
  Hotel,
  ShieldAlert,
  Server,
  FileCode2,
  Database,
  Users2,
  KeyRound,
  Sparkles,
  Building2,
  Receipt,
  UtensilsCrossed,
  Users,
  BarChart3,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";

export type ActiveTab =
  | "overview"
  | "properties"
  | "rooms-beds"
  | "finance"
  | "mess-restaurant"
  | "staff-operations"
  | "reports"
  | "health"
  | "architecture"
  | "hostel-workflow"
  | "hotel-workflow"
  | "security"
  | "database"
  | "customer-portal"
  | "admin-users";


interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const { activeProperty } = useProperty();
  const { user, canAccessProperty } = useAuth();
  const isAllowed = canAccessProperty(activeProperty.id);

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0">
      {/* Current Property Scope Warning if access denied */}
      {!isAllowed && (
        <div className="m-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Access Isolated</p>
            <p className="text-[11px] text-rose-300/80">
              Role '{user.role}' lacks assignment to this property.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Core Foundation Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            System Foundation
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("overview")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "overview"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Foundation Dashboard</span>
            </button>

            <button
              onClick={() => onSelectTab("properties")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "properties"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span>Property Registry</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono">
                Phase 5
              </span>
            </button>

            <button
              onClick={() => onSelectTab("rooms-beds")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "rooms-beds"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bed className="w-4 h-4 text-amber-400" />
                <span>Rooms, Beds & Avail</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 font-mono">
                Phase 6
              </span>
            </button>

            <button
              onClick={() => onSelectTab("health")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "health"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Health & Live Probes</span>
            </button>

            <button
              onClick={() => onSelectTab("architecture")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "architecture"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <FileCode2 className="w-4 h-4" />
              <span>Modular Architecture</span>
            </button>

            <button
              onClick={() => onSelectTab("database")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "database"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Schema & Isolation</span>
            </button>
          </nav>
        </div>

        {/* Domain Workflow Modules */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Domain Workflows</span>
            <span className="text-[10px] text-zinc-600">Phase 1 Specs</span>
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("hostel-workflow")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "hostel-workflow"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bed className="w-4 h-4 text-amber-400" />
                <span>Hostel Operations</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300">
                Bed-level
              </span>
            </button>

            <button
              onClick={() => onSelectTab("hotel-workflow")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "hotel-workflow"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Hotel className="w-4 h-4 text-sky-400" />
                <span>Hotel Operations</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-sky-300">
                Room-level
              </span>
            </button>
          </nav>
        </div>

        {/* Finance & Tax Engine Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Finance & Billing</span>
            <span className="text-[10px] text-purple-400 font-mono font-semibold">Phase 9</span>
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("finance")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "finance"
                  ? "bg-purple-600 text-white font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Receipt className="w-4 h-4 text-purple-400" />
                <span>Finance & Tax Engine</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-purple-300 font-mono">
                Folios
              </span>
            </button>
          </nav>
        </div>

        {/* Mess & Restaurant Management Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Dining & Operations</span>
            <span className="text-[10px] text-amber-400 font-mono font-semibold">Phase 10</span>
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("mess-restaurant")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "mess-restaurant"
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <UtensilsCrossed className="w-4 h-4 text-amber-400" />
                <span>Mess & Restaurant</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 font-mono">
                KDS/POS
              </span>
            </button>
          </nav>
        </div>

        {/* Staff & Operations Management Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Staff & Facilities</span>
            <span className="text-[10px] text-emerald-400 font-mono font-semibold">Phase 11</span>
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("staff-operations")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "staff-operations"
                  ? "bg-emerald-600 text-white font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Staff & Operations</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 font-mono">
                Ops/Rota
              </span>
            </button>
          </nav>
        </div>

        {/* Reports & Analytics Intelligence Section */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Intelligence & Audit</span>
            <span className="text-[10px] text-blue-400 font-mono font-semibold">Phase 12</span>
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("reports")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "reports"
                  ? "bg-blue-600 text-white font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span>Reports & Analytics</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-blue-300 font-mono">
                RevPAR
              </span>
            </button>
          </nav>
        </div>


        {/* Security & Access Enforcement */}
        <div>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Authentication & Access
          </div>
          <nav className="space-y-1">
            <button
              onClick={() => onSelectTab("customer-portal")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "customer-portal"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Users2 className="w-4 h-4 text-emerald-400" />
                <span>Customer Portal</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300">
                My Bookings
              </span>
            </button>

            <button
              onClick={() => onSelectTab("admin-users")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "admin-users"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <KeyRound className="w-4 h-4 text-purple-400" />
                <span>Admin Staff RBAC</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-purple-300">
                Super Admin
              </span>
            </button>

            <button
              onClick={() => onSelectTab("security")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "security"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Security & Token Bench</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Property Context Footer */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-900/40">
        <div className="text-[11px] text-zinc-400 flex items-center justify-between">
          <span>Active Scope:</span>
          <span className="font-mono text-zinc-300">{activeProperty.code}</span>
        </div>
        <p className="text-xs font-medium text-zinc-200 truncate mt-0.5">{activeProperty.name}</p>
        <p className="text-[11px] text-zinc-500">{activeProperty.city}, {activeProperty.country}</p>
      </div>
    </aside>
  );
};
