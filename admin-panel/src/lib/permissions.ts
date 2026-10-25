import { AccountType, StaffRole } from '../types';

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_PROPERTIES: 'VIEW_PROPERTIES',
  VIEW_USERS: 'VIEW_USERS',
  CREATE_STAFF: 'CREATE_STAFF',
  ONBOARD_GUEST: 'ONBOARD_GUEST',
  VIEW_UNASSIGNED_CUSTOMERS: 'VIEW_UNASSIGNED_CUSTOMERS',
  MANAGE_PROPERTIES: 'MANAGE_PROPERTIES',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function canAccess(
  userAccountType: AccountType,
  userStaffRole: StaffRole | null,
  requiredPermission: PermissionKey
): boolean {
  if (userAccountType === 'SUPER_ADMIN') {
    return true;
  }

  if (userAccountType === 'MANAGER') {
    const managerAllowed: PermissionKey[] = [
      'VIEW_DASHBOARD',
      'VIEW_PROPERTIES',
      'VIEW_USERS',
      'CREATE_STAFF',
      'ONBOARD_GUEST',
    ];
    return managerAllowed.includes(requiredPermission);
  }

  if (userAccountType === 'STAFF') {
    if (userStaffRole === 'FRONT_DESK') {
      const frontDeskAllowed: PermissionKey[] = [
        'VIEW_DASHBOARD',
        'VIEW_PROPERTIES',
        'VIEW_USERS',
        'ONBOARD_GUEST',
      ];
      return frontDeskAllowed.includes(requiredPermission);
    }
    if (userStaffRole === 'MAINTENANCE' || userStaffRole === 'HOUSEKEEPING') {
      const opsAllowed: PermissionKey[] = ['VIEW_DASHBOARD', 'VIEW_PROPERTIES'];
      return opsAllowed.includes(requiredPermission);
    }
  }

  return false;
}
