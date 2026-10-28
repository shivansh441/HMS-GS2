import { Role, StaffRole } from '../types';

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_PROPERTIES: 'VIEW_PROPERTIES',
  VIEW_USERS: 'VIEW_USERS',
  CREATE_STAFF: 'CREATE_STAFF',
  ONBOARD_GUEST: 'ONBOARD_GUEST',
  VIEW_UNASSIGNED_CUSTOMERS: 'VIEW_UNASSIGNED_CUSTOMERS',
  MANAGE_PROPERTIES: 'MANAGE_PROPERTIES',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  VIEW_SECURITY: 'VIEW_SECURITY',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

const staffPermissions: Record<StaffRole, PermissionKey[]> = {
  FRONT_DESK: ['VIEW_DASHBOARD', 'VIEW_PROPERTIES', 'VIEW_USERS'],
  MAINTENANCE: ['VIEW_DASHBOARD', 'VIEW_PROPERTIES'],
  HOUSEKEEPING: ['VIEW_DASHBOARD', 'VIEW_PROPERTIES'],
};

export function canAccess(
  role: Role,
  staffRole: StaffRole | null,
  requiredPermission: PermissionKey
): boolean {
  if (role === 'ADMIN') return true;
  if (role === 'STAFF' && staffRole) {
    return staffPermissions[staffRole].includes(requiredPermission);
  }
  return false;
}
