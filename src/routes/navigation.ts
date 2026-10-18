import { LucideIcon } from "lucide-react";
import { UserRole } from "@/src/types/property";

export interface SubNavItem {
  id: string;
  label: string;
  path: string;
  icon?: LucideIcon;
  badge?: string;
  allowedRoles?: UserRole[];
  isImplemented: boolean;
  moduleName: string;
}

export interface NavGroup {
  id: string;
  groupLabel: string;
  items: SubNavItem[];
}

export const ADMIN_NAVIGATION: NavGroup[] = [
  {
    id: "overview-group",
    groupLabel: "Overview",
    items: [
      {
        id: "nav-dashboard",
        label: "Dashboard",
        path: "/admin/dashboard",
        isImplemented: true,
        moduleName: "Operational Overview",
      },
    ],
  },
  {
    id: "property-group",
    groupLabel: "Property",
    items: [
      {
        id: "nav-properties",
        label: "Properties",
        path: "/admin/properties",
        allowedRoles: ["super_admin", "property_manager"],
        isImplemented: true, // We have property viewing & tenant isolation
        moduleName: "Properties Registry",
      },
      {
        id: "nav-rooms-beds",
        label: "Rooms & Beds",
        path: "/admin/rooms-beds",
        allowedRoles: ["super_admin", "property_manager", "front_desk", "housekeeping"],
        isImplemented: false,
        moduleName: "Inventory (Phase 5)",
      },
    ],
  },
  {
    id: "frontdesk-group",
    groupLabel: "Front Desk",
    items: [
      {
        id: "nav-reservations",
        label: "Reservations",
        path: "/admin/reservations",
        allowedRoles: ["super_admin", "property_manager", "front_desk"],
        isImplemented: true, // Backed by /api/v1/bookings endpoints
        moduleName: "Reservation Ledger",
      },
      {
        id: "nav-hostellers",
        label: "Hostellers",
        path: "/admin/hostellers",
        allowedRoles: ["super_admin", "property_manager", "front_desk"],
        isImplemented: false,
        moduleName: "Hostel Resident Management",
      },
      {
        id: "nav-hotel-guests",
        label: "Hotel Guests",
        path: "/admin/hotel-guests",
        allowedRoles: ["super_admin", "property_manager", "front_desk"],
        isImplemented: false,
        moduleName: "Hotel Guest Folios",
      },
    ],
  },
  {
    id: "finance-group",
    groupLabel: "Finance",
    items: [
      {
        id: "nav-invoices",
        label: "Fees & Invoices",
        path: "/admin/finance/invoices",
        allowedRoles: ["super_admin", "property_manager", "accountant"],
        isImplemented: false,
        moduleName: "Invoicing Engine",
      },
      {
        id: "nav-payments",
        label: "Payments",
        path: "/admin/finance/payments",
        allowedRoles: ["super_admin", "property_manager", "accountant"],
        isImplemented: false,
        moduleName: "Payment Gateway Reconciliation",
      },
    ],
  },
  {
    id: "operations-group",
    groupLabel: "Operations",
    items: [
      {
        id: "nav-mess",
        label: "Mess & Restaurant",
        path: "/admin/operations/mess",
        allowedRoles: ["super_admin", "property_manager", "accountant"],
        isImplemented: false,
        moduleName: "Mess & Dining Operations",
      },
      {
        id: "nav-staff",
        label: "Staff",
        path: "/admin/operations/staff",
        allowedRoles: ["super_admin", "property_manager"],
        isImplemented: true, // Backed by /api/v1/auth/admin/provision & users
        moduleName: "Staff Directory & RBAC",
      },
      {
        id: "nav-housekeeping",
        label: "Housekeeping & Maintenance",
        path: "/admin/operations/housekeeping",
        allowedRoles: ["super_admin", "property_manager", "housekeeping", "front_desk"],
        isImplemented: false,
        moduleName: "Housekeeping Task Dispatcher",
      },
    ],
  },
  {
    id: "insights-group",
    groupLabel: "Insights",
    items: [
      {
        id: "nav-reports",
        label: "Reports",
        path: "/admin/insights/reports",
        allowedRoles: ["super_admin", "property_manager", "accountant"],
        isImplemented: false,
        moduleName: "Analytics & Tax Reports",
      },
    ],
  },
  {
    id: "config-group",
    groupLabel: "Configuration",
    items: [
      {
        id: "nav-property-settings",
        label: "Property Settings",
        path: "/admin/config/property-settings",
        allowedRoles: ["super_admin", "property_manager"],
        isImplemented: true, // Workflow & Property configurations from Phase 1-2
        moduleName: "Property Policy & Configuration",
      },
      {
        id: "nav-tax-rules",
        label: "Tax & Fee Rules",
        path: "/admin/config/tax-fee-rules",
        allowedRoles: ["super_admin", "property_manager", "accountant"],
        isImplemented: false,
        moduleName: "Tax, Linen & Deposit Rules",
      },
    ],
  },
];
