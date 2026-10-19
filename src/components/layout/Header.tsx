import React from "react";
import {
  Building2,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
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
  const { user, switchRole, canAccessProperty, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const isCurrentPropertyAllowed = canAccessProperty(activeProperty.id);

  const getStatusBadge = () => {
    switch (backendStatus) {
      case "healthy":
        return (
          <div
            title={`System operational — API response time: ${latencyMs ?? 1.5}ms`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">Online</span>
            {latencyMs ? <span className="font-mono text-[10px] opacity-75">({latencyMs}ms)</span> : null}
          </div>
        );
      case "degraded":
        return (
          <div
            title="System degraded: Database detached"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Degraded</span>
          </div>
        );
      default:
        return (
          <div
            title="Checking system status..."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
          >
            <RefreshCw className={`w-3 h-3 text-sky-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Connecting</span>
          </div>
        );
    }
  };

  return (
    <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 transition-colors">
      {/* Brand & Property Switcher */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-zinc-900 dark:text-zinc-100 tracking-tight text-base">
              GrandStay
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none">
              Hospitality Management
            </p>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-zinc-200 dark:bg-zinc-800 hidden md:block" />

        {/* Property Selector */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative">
            <select
              id="property-select"
              aria-label="Active Property"
              value={activeProperty.id}
              onChange={(e) => setActivePropertyId(e.target.value)}
              className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs rounded-lg px-3 py-1.5 pr-8 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[200px] sm:max-w-xs truncate"
            >
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.name}
                </option>
              ))}
            </select>
          </div>

          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider hidden lg:inline-block border ${
              activeProperty.property_type === "hostel"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                : activeProperty.property_type === "hotel"
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30"
                : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
            }`}
          >
            {activeProperty.property_type}
          </span>
        </div>
      </div>

      {/* Right Controls: Status, Theme, Role Selector, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* System Status & Manual Refresh */}
        <div className="flex items-center gap-1.5">
          {getStatusBadge()}
          <button
            onClick={onRefreshHealth}
            title="Refresh system health probe"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

        {/* Theme Switcher Toggle (Light, Dark, System) */}
        <div
          role="group"
          aria-label="Theme mode switcher"
          className="flex items-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5"
        >
          <button
            onClick={() => setTheme("light")}
            aria-label="Light mode"
            title="Switch to Light Theme"
            className={`p-1.5 rounded-md transition-colors ${
              theme === "light"
                ? "bg-white text-indigo-600 shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTheme("dark")}
            aria-label="Dark mode"
            title="Switch to Dark Theme"
            className={`p-1.5 rounded-md transition-colors ${
              theme === "dark"
                ? "bg-zinc-800 text-indigo-400 shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTheme("system")}
            aria-label="System theme mode"
            title="Follow System Theme"
            className={`p-1.5 rounded-md transition-colors ${
              theme === "system"
                ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800 hidden md:block" />

        {/* Role Selector (Demo / Testing Simulator) */}
        <div className="hidden xl:flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-800 rounded-lg px-2.5 py-1">
          <Shield className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">View as:</span>
          <select
            aria-label="Role Simulator"
            value={user.role}
            onChange={(e) => switchRole(e.target.value as UserRole)}
            className="bg-transparent text-xs text-indigo-600 dark:text-indigo-400 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="super_admin" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Super Admin</option>
            <option value="property_manager" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Property Manager</option>
            <option value="front_desk" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Front Desk</option>
            <option value="housekeeping" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Housekeeping</option>
            <option value="accountant" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Accountant</option>
            <option value="guest" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Customer / Guest</option>
          </select>
        </div>

        {/* User Card */}
        <div className="flex items-center gap-2 pl-1">
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center font-bold text-xs">
            {user.firstName?.[0] || "U"}{user.lastName?.[0] || ""}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 capitalize">
              {user.role.replace("_", " ")}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
