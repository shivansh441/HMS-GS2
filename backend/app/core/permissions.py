from enum import Enum

# Single constant controlling whether unlinked customers are visible only to Super Admin
UNASSIGNED_POOL_SUPER_ADMIN_ONLY = True

class AccountType(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    MANAGER = "MANAGER"
    STAFF = "STAFF"
    LONG_TERM_RESIDENT = "LONG_TERM_RESIDENT"
    SHORT_TERM_HOSTEL_GUEST = "SHORT_TERM_HOSTEL_GUEST"
    HOTEL_GUEST = "HOTEL_GUEST"

class StaffRole(str, Enum):
    FRONT_DESK = "FRONT_DESK"
    MAINTENANCE = "MAINTENANCE"
    HOUSEKEEPING = "HOUSEKEEPING"

class UserStatus(str, Enum):
    PENDING_ACTIVATION = "PENDING_ACTIVATION"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    ARCHIVED = "ARCHIVED"

class PropertyStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    MAINTENANCE = "MAINTENANCE"

class CustomerLinkSource(str, Enum):
    OFFLINE_ONBOARD = "OFFLINE_ONBOARD"
    BOOKING = "BOOKING"
    MANUAL = "MANUAL"

class ActionPermission(str, Enum):
    VIEW_DASHBOARD = "VIEW_DASHBOARD"
    VIEW_PROPERTIES = "VIEW_PROPERTIES"
    VIEW_USERS = "VIEW_USERS"
    CREATE_STAFF = "CREATE_STAFF"
    ONBOARD_GUEST = "ONBOARD_GUEST"
    VIEW_UNASSIGNED_CUSTOMERS = "VIEW_UNASSIGNED_CUSTOMERS"
    MANAGE_PROPERTIES = "MANAGE_PROPERTIES"
    VIEW_AUDIT_LOGS = "VIEW_AUDIT_LOGS"

# Centralized Role Permission Matrix
ROLE_PERMISSIONS: dict[str, set[ActionPermission]] = {
    AccountType.SUPER_ADMIN: {
        ActionPermission.VIEW_DASHBOARD,
        ActionPermission.VIEW_PROPERTIES,
        ActionPermission.VIEW_USERS,
        ActionPermission.CREATE_STAFF,
        ActionPermission.ONBOARD_GUEST,
        ActionPermission.VIEW_UNASSIGNED_CUSTOMERS,
        ActionPermission.MANAGE_PROPERTIES,
        ActionPermission.VIEW_AUDIT_LOGS,
    },
    AccountType.MANAGER: {
        ActionPermission.VIEW_DASHBOARD,
        ActionPermission.VIEW_PROPERTIES,
        ActionPermission.VIEW_USERS,
        ActionPermission.CREATE_STAFF,
        ActionPermission.ONBOARD_GUEST,
    },
    # STAFF permissions depend on staff_role
}

STAFF_ROLE_PERMISSIONS: dict[str, set[ActionPermission]] = {
    StaffRole.FRONT_DESK: {
        ActionPermission.VIEW_DASHBOARD,
        ActionPermission.VIEW_PROPERTIES,
        ActionPermission.VIEW_USERS,
        ActionPermission.ONBOARD_GUEST,
    },
    StaffRole.MAINTENANCE: {
        ActionPermission.VIEW_DASHBOARD,
        ActionPermission.VIEW_PROPERTIES,
    },
    StaffRole.HOUSEKEEPING: {
        ActionPermission.VIEW_DASHBOARD,
        ActionPermission.VIEW_PROPERTIES,
    },
}

def get_user_permissions(account_type: str, staff_role: str | None = None) -> set[ActionPermission]:
    if account_type == AccountType.SUPER_ADMIN:
        return ROLE_PERMISSIONS[AccountType.SUPER_ADMIN]
    if account_type == AccountType.MANAGER:
        return ROLE_PERMISSIONS[AccountType.MANAGER]
    if account_type == AccountType.STAFF and staff_role:
        return STAFF_ROLE_PERMISSIONS.get(staff_role, set())
    return set()

def has_permission(account_type: str, staff_role: str | None, permission: ActionPermission) -> bool:
    perms = get_user_permissions(account_type, staff_role)
    return permission in perms

def can_create_account_type(creator_account_type: str, creator_staff_role: str | None, target_account_type: str) -> bool:
    """
    Manager can create STAFF inside their own properties only.
    Front Desk can onboard only HOTEL_GUEST and SHORT_TERM_HOSTEL_GUEST.
    Maintenance and Housekeeping get no user-management access.
    """
    if creator_account_type == AccountType.SUPER_ADMIN:
        return True
    if creator_account_type == AccountType.MANAGER:
        return target_account_type in (
            AccountType.STAFF,
            AccountType.HOTEL_GUEST,
            AccountType.SHORT_TERM_HOSTEL_GUEST,
            AccountType.LONG_TERM_RESIDENT,
        )
    if creator_account_type == AccountType.STAFF and creator_staff_role == StaffRole.FRONT_DESK:
        return target_account_type in (
            AccountType.HOTEL_GUEST,
            AccountType.SHORT_TERM_HOSTEL_GUEST,
        )
    return False
