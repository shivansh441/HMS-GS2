import React from "react";
import {
  LayoutDashboard,
  Bed,
  Hotel,
  Building2,
  Receipt,
  UtensilsCrossed,
  Users,
  BarChart3,
  ShieldAlert,
  Server,
  KeyRound,
  Users2,
  Settings,
  ChevronRight,
  ShieldCheck,
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

  const isHostelSupported =
    activeProperty.property_type === "hostel" || activeProperty.property_type === "hybrid";
  const isHotelSupported =
    activeProperty.property_type === "hotel" || activeProperty.property_type === "hybrid";

  // Role helpers
  const isGuest = user.role === "guest";
  const isHousekeeping = user.role === "housekeeping";
  const isAccountant = user.role === "accountant";
  const isSuperAdmin = user.role === "super_admin";

  const renderNavItem = (
    id: ActiveTab,
    label: string,
    Icon: React.ElementType,
    badge?: string,
    badgeColor: string = "zinc"
  ) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        onClick={() => onSelectTab(id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
          isActive
            ? "bg-indigo-600 text-white font-semibold shadow-xs"
            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-zinc-500 dark:text-zinc-400"}`} />
          <span className="truncate">{label}</span>
        </div>
        {badge && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ml-1.5 ${
              isActive
                ? "bg-indigo-700/80 text-white"
                : badgeColor === "amber"
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                : badgeColor === "sky"
                ? "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300"
                : badgeColor === "emerald"
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                : badgeColor === "purple"
                ? "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col shrink-0 transition-colors">
      {/* Property Isolation Notice if user not assigned */}
      {!isAllowed && (
        <div className="m-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="font-semibold leading-tight">Property Restricted</p>
            <p className="text-[11px] text-rose-600/90 dark:text-rose-300/80 mt-0.5">
              Role '{user.role.replace("_", " ")}' is not assigned to this property.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {/* Customer Self-Service Section (Highlighted for guests) */}
        {isGuest ? (
          <div>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Customer Portal
            </div>
            <nav className="space-y-1">
              {renderNavItem("customer-portal", "My Bookings & Stays", Users2, "Active", "emerald")}
              {renderNavItem("properties", "Browse Properties", Building2)}
            </nav>
          </div>
        ) : (
          <>
            {/* Core Operations Section */}
            <div>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Core Operations
              </div>
              <nav className="space-y-1">
                {renderNavItem("overview", "Dashboard & KPIs", LayoutDashboard)}

                {isHostelSupported && !isHousekeeping && !isAccountant && (
                  renderNavItem("hostel-workflow", "Hostel Front Desk", Bed, "Dorms", "amber")
                )}

                {isHotelSupported && !isHousekeeping && !isAccountant && (
                  renderNavItem("hotel-workflow", "Hotel Front Desk", Hotel, "Suites", "sky")
                )}

                {!isAccountant && (
                  renderNavItem("rooms-beds", "Rooms & Beds", Bed)
                )}
              </nav>
            </div>

            {/* Services & Facilities */}
            <div>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Hospitality Services
              </div>
              <nav className="space-y-1">
                {!isHousekeeping && (
                  renderNavItem("finance", "Billing & Payments", Receipt, "Folios", "purple")
                )}

                {!isHousekeeping && !isAccountant && (
                  renderNavItem("mess-restaurant", "Dining & Mess Hall", UtensilsCrossed, "Kitchen", "amber")
                )}

                {!isAccountant && (
                  renderNavItem("staff-operations", "Staff & Facilities", Users, "Tasks", "emerald")
                )}
              </nav>
            </div>

            {/* Intelligence & Analytics */}
            <div>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Management & Reports
              </div>
              <nav className="space-y-1">
                {!isHousekeeping && (
                  renderNavItem("reports", "Reports & Analytics", BarChart3, "Export", "sky")
                )}
                {renderNavItem("properties", "Properties Registry", Building2)}
              </nav>
            </div>

            {/* Administration & Security */}
            {(isSuperAdmin || user.role === "property_manager") && (
              <div>
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Administration
                </div>
                <nav className="space-y-1">
                  {isSuperAdmin && (
                    renderNavItem("admin-users", "Staff Access (RBAC)", KeyRound, "Admin", "purple")
                  )}
                  {renderNavItem("customer-portal", "Customer Portal", Users2)}
                  {renderNavItem("health", "System Health", Server)}
                  {isSuperAdmin && (
                    renderNavItem("security", "Security & Auditing", ShieldCheck)
                  )}
                </nav>
              </div>
            )}
          </>
        )}
      </div>

      {/* Property Context Footer */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
          <span>Active Scope:</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300 font-semibold">{activeProperty.code}</span>
        </div>
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate mt-0.5">{activeProperty.name}</p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{activeProperty.city}, {activeProperty.country}</p>
      </div>
    </aside>
  );
};
