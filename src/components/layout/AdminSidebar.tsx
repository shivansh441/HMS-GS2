import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Bed,
  CalendarCheck2,
  Users,
  Hotel,
  Receipt,
  CreditCard,
  UtensilsCrossed,
  UserCog,
  Sparkles,
  BarChart3,
  Sliders,
  PercentSquare,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { ADMIN_NAVIGATION, NavGroup, SubNavItem } from "@/src/routes/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import { useProperty } from "@/src/contexts/PropertyContext";

interface AdminSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  "nav-dashboard": LayoutDashboard,
  "nav-properties": Building2,
  "nav-rooms-beds": Bed,
  "nav-reservations": CalendarCheck2,
  "nav-hostellers": Users,
  "nav-hotel-guests": Hotel,
  "nav-invoices": Receipt,
  "nav-payments": CreditCard,
  "nav-mess": UtensilsCrossed,
  "nav-staff": UserCog,
  "nav-housekeeping": Sparkles,
  "nav-reports": BarChart3,
  "nav-property-settings": Sliders,
  "nav-tax-rules": PercentSquare,
};

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  collapsed,
  onToggleCollapse,
}) => {
  const location = useLocation();
  const { user, canAccessProperty, hasPermission } = useAuth();
  const { activeProperty } = useProperty();

  const isPropertyAccessible = canAccessProperty(activeProperty.id);

  return (
    <aside
      className={`relative border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0 transition-all duration-200 select-none ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Property Scoping Isolation Alert (Collapsed/Expanded) */}
      {!isPropertyAccessible && (
        <div
          className={`m-2.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center ${
            collapsed ? "justify-center" : "gap-2"
          }`}
          title={`Property access denied for role '${user.role}'`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-semibold text-[11px] truncate">Tenant Isolated</p>
              <p className="text-[10px] text-rose-300/80 truncate">Unauthorized Property</p>
            </div>
          )}
        </div>
      )}

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5 scrollbar-thin scrollbar-thumb-zinc-800">
        {ADMIN_NAVIGATION.map((group: NavGroup) => {
          // Filter items based on user role authorization
          const visibleItems = group.items.filter((item: SubNavItem) => {
            if (!item.allowedRoles) return true;
            return hasPermission(item.allowedRoles);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="space-y-1">
              {!collapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {group.groupLabel}
                </div>
              )}

              <nav className="space-y-0.5">
                {visibleItems.map((item: SubNavItem) => {
                  const Icon = ICON_MAP[item.id] || LayoutDashboard;
                  const isActive = location.pathname === item.path;

                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      title={collapsed ? `${item.label} (${item.isImplemented ? "Ready" : "Upcoming"})` : undefined}
                      className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-indigo-600 text-white font-semibold shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                      } ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-300"}`} />

                      {!collapsed && (
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <span className="truncate">{item.label}</span>
                          {!item.isImplemented && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 shrink-0 ml-1">
                              Phase 5
                            </span>
                          )}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      {/* Scoped Property Context & Collapse Toggle Footer */}
      <div className="p-2 border-t border-zinc-800/80 bg-zinc-900/30 space-y-2">
        {!collapsed && (
          <div className="px-1 text-[11px] text-zinc-400">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Active Scope</span>
              <span className="font-mono text-zinc-300 text-[10px]">{activeProperty.code}</span>
            </div>
            <p className="font-medium text-zinc-200 truncate text-xs mt-0.5">{activeProperty.name}</p>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-transparent hover:border-zinc-800 transition-colors"
          title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-[11px]">Collapse View</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
