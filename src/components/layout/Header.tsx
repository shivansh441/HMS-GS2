import React from "react";
import { Building2, Shield, UserCheck, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { UserRole } from "@/src/types/property";

interface HeaderProps {
  backendStatus: "healthy" | "degraded" | "unhealthy" | "connecting";
  latencyMs?: number | null;
  onRefreshHealth: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  backendStatus,
  latencyMs,
  onRefreshHealth,
  isRefreshing,
}) => {
  const { properties, activeProperty, setActivePropertyId } = useProperty();
  const { user, switchRole, canAccessProperty, isAuthenticated, logout } = useAuth();

  const isCurrentPropertyAllowed = canAccessProperty(activeProperty.id);

  const getStatusBadge = () => {
    switch (backendStatus) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Backend Ready {latencyMs ? `(${latencyMs}ms)` : ""}
          </span>
        );
      case "degraded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            FastAPI Live (DB Unattached)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isRefreshing ? "animate-spin" : ""}`} />
            API v1 Probing
          </span>
        );
    }
  };

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Property Context */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-100 tracking-tight text-base">GrandStay</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                Phase 1 Core
              </span>
            </div>
            <p className="text-xs text-zinc-400">Hostel &amp; Hotel Manager</p>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-zinc-800 hidden sm:block" />

        {/* Property Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="property-select" className="text-xs text-zinc-400 font-medium hidden md:inline">
            Active Property:
          </label>
          <div className="relative">
            <select
              id="property-select"
              value={activeProperty.id}
              onChange={(e) => setActivePropertyId(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 pr-8 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.name} ({prop.property_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <span
            className={`text-xs px-2 py-0.5 rounded font-medium border uppercase tracking-wider ${
              activeProperty.property_type === "hostel"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : activeProperty.property_type === "hotel"
                ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                : "bg-purple-500/10 text-purple-400 border-purple-500/30"
            }`}
          >
            {activeProperty.property_type} mode
          </span>
        </div>
      </div>

      {/* Right Controls: Role Simulator & System Probe */}
      <div className="flex items-center gap-3">
        {/* Backend health status badge */}
        <div className="flex items-center gap-1.5">
          {getStatusBadge()}
          <button
            onClick={onRefreshHealth}
            title="Probe live backend health"
            className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="h-6 w-[1px] bg-zinc-800 hidden md:block" />

        {/* Role Simulator for RBAC Testing */}
        <div className="hidden lg:flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs text-zinc-400">Simulate Role:</span>
          <select
            value={user.role}
            onChange={(e) => switchRole(e.target.value as UserRole)}
            className="bg-transparent text-xs text-indigo-400 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="super_admin" className="bg-zinc-900 text-zinc-200">Super Admin (Global)</option>
            <option value="property_manager" className="bg-zinc-900 text-zinc-200">Property Manager</option>
            <option value="front_desk" className="bg-zinc-900 text-zinc-200">Front Desk</option>
            <option value="housekeeping" className="bg-zinc-900 text-zinc-200">Housekeeping</option>
            <option value="accountant" className="bg-zinc-900 text-zinc-200">Accountant</option>
            <option value="guest" className="bg-zinc-900 text-zinc-200">Guest</option>
          </select>
        </div>

        {/* User Identity avatar & Logout Action */}
        <div className="flex items-center gap-2 pl-1">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200">
            {user.firstName ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ""}` : "V"}
          </div>
          <div className="hidden xl:block text-left text-xs">
            <p className="font-medium text-zinc-200 leading-tight">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[11px] text-zinc-500 leading-tight">
              {isAuthenticated ? user.role : "Unauthenticated"}
            </p>
          </div>
          {isAuthenticated && (
            <button
              onClick={() => logout()}
              title="Revoke session and sign out"
              className="text-[11px] px-2 py-1 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors ml-1"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
