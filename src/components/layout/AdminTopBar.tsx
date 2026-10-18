import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu,
  Building2,
  ChevronDown,
  User,
  LogOut,
  Bell,
  ExternalLink,
  Shield,
  Layers,
  Check,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth, PRESET_CREDENTIALS } from "@/src/contexts/AuthContext";
import { UserRole } from "@/src/types/property";

interface AdminTopBarProps {
  onToggleSidebar: () => void;
  collapsed: boolean;
}

export const AdminTopBar: React.FC<AdminTopBarProps> = ({ onToggleSidebar }) => {
  const location = useLocation();
  const { properties, activeProperty, setActivePropertyId } = useProperty();
  const { user, switchRole, canAccessProperty, logout, isAuthenticated } = useAuth();

  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  const propMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (propMenuRef.current && !propMenuRef.current.contains(event.target as Node)) {
        setPropertyDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter properties authorized for current user
  const authorizedProperties = properties.filter((p) => canAccessProperty(p.id));

  // Derive breadcrumb from path
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const breadcrumbSection = pathSegments.length > 1 ? pathSegments[1].replace(/-/g, " ") : "Dashboard";
  const breadcrumbDetail = pathSegments.length > 2 ? pathSegments[2].replace(/-/g, " ") : null;

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Left: Sidebar Toggle, Brand & Dynamic Route Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
          title="Toggle Navigation (⌘B)"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <Link to="/admin/dashboard" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center shadow-sm">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-zinc-100 text-sm tracking-tight hidden sm:inline">
              GrandStay
            </span>
          </Link>

          <span className="text-zinc-600 hidden sm:inline">/</span>

          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumbs" className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="text-zinc-200 font-medium capitalize truncate max-w-[140px] sm:max-w-xs">
              {breadcrumbSection}
            </span>
            {breadcrumbDetail && (
              <>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-400 capitalize truncate max-w-[120px]">
                  {breadcrumbDetail}
                </span>
              </>
            )}
          </nav>
        </div>
      </div>

      {/* Center: Authorized Property Selector */}
      <div className="flex items-center gap-2">
        <div className="relative" ref={propMenuRef}>
          <button
            onClick={() => setPropertyDropdownOpen(!propertyDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition-all cursor-pointer"
            title="Switch authorized property scope"
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate max-w-[120px] sm:max-w-[200px] text-left">
              {activeProperty.name}
            </span>
            <span className="font-mono text-[10px] text-zinc-400 uppercase hidden md:inline">
              [{activeProperty.code}]
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {propertyDropdownOpen && (
            <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 w-72 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl py-1 z-50">
              <div className="px-3 py-1.5 border-b border-zinc-800 text-[10px] uppercase font-semibold text-zinc-500">
                Authorized Properties ({authorizedProperties.length})
              </div>

              {authorizedProperties.length === 0 ? (
                <div className="p-3 text-xs text-zinc-400 text-center">
                  No properties currently authorized for role '{user.role}'.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto py-1">
                  {authorizedProperties.map((p) => {
                    const isSelected = p.id === activeProperty.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActivePropertyId(p.id);
                          setPropertyDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-zinc-800/80 transition-colors ${
                          isSelected ? "bg-indigo-600/10 text-indigo-300 font-medium" : "text-zinc-300"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">
                            {p.code} · {p.property_type.toUpperCase()} · {p.city}
                          </p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-zinc-800 p-2">
                <Link
                  to="/admin/properties"
                  onClick={() => setPropertyDropdownOpen(false)}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Manage All Properties</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Public Visitor Link preview */}
        <Link
          to="/"
          className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          title="Open Public Booking Experience"
        >
          <span>Public Portal</span>
          <ExternalLink className="w-3 h-3 text-zinc-500" />
        </Link>
      </div>

      {/* Right: Notifications (honest placeholder), Role switcher & Profile Menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification Bell (Identified as Phase 4 Honest Placeholder) */}
        <div className="relative" ref={notifMenuRef}>
          <button
            onClick={() => setNotificationOpen(!notificationOpen)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors relative"
            title="System notifications (Placeholder)"
          >
            <Bell className="w-4 h-4" />
          </button>

          {notificationOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl p-3 z-50 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-200">Notifications</span>
                <span className="text-[10px] text-amber-400 font-mono">Phase 5 Feature</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Real-time WebSocket alerts for room check-ins, overdue invoices, and mess dispatching will be active in Phase 5.
              </p>
              <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-500">
                Backend Event Broker contract ready at <code className="text-zinc-300">/api/v1/events/stream</code>.
              </div>
            </div>
          )}
        </div>

        {/* Quick Role Simulator for RBAC Testing */}
        <div className="hidden xl:flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-500 text-[11px]">Role:</span>
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

        {/* User Identity Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-xs font-bold">
              {user.firstName ? user.firstName[0] : "U"}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-medium text-zinc-200 leading-tight">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[10px] text-zinc-500 capitalize">{user.role.replace("_", " ")}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 hidden md:block" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl py-1 z-50">
              <div className="px-3 py-2 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-200">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-zinc-500 font-mono truncate">{user.email}</p>
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-400 font-mono capitalize">
                  {user.role}
                </span>
              </div>

              <div className="py-1">
                <Link
                  to="/admin/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>My Profile &amp; Credentials</span>
                </Link>
                <Link
                  to="/admin/config/property-settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Property Settings</span>
                </Link>
              </div>

              <div className="border-t border-zinc-800 pt-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
