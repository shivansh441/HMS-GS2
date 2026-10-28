from enum import Enum


class Role(str, Enum):
    ADMIN = "ADMIN"
    STAFF = "STAFF"
    CUSTOMER = "CUSTOMER"


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
    CLOSED = "CLOSED"


class PropertyType(str, Enum):
    HOSTEL_BOYS = "HOSTEL_BOYS"
    HOSTEL_GIRLS = "HOSTEL_GIRLS"
    HOSTEL_COED = "HOSTEL_COED"
    HOTEL = "HOTEL"
    CO_LIVING = "CO_LIVING"


class UnitType(str, Enum):
    BED = "BED"
    ROOM = "ROOM"
    SUITE = "SUITE"


class UnitCategory(str, Enum):
    CLASSIC = "CLASSIC"
    DELUXE = "DELUXE"
    EXECUTIVE = "EXECUTIVE"
    DORMITORY = "DORMITORY"


class SharingType(str, Enum):
    SINGLE = "SINGLE"
    DOUBLE = "DOUBLE"
    TRIPLE = "TRIPLE"
    DORMITORY = "DORMITORY"


class UnitStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    OCCUPIED = "OCCUPIED"


class FeeType(str, Enum):
    UNIT_FEE = "UNIT_FEE"
    MESS_FEE = "MESS_FEE"
    SECURITY_DEPOSIT = "SECURITY_DEPOSIT"
    ELECTRICITY_FEE = "ELECTRICITY_FEE"
    MAINTENANCE_FEE = "MAINTENANCE_FEE"
    WATER_CHARGE = "WATER_CHARGE"
    CUSTOM = "CUSTOM"


class CustomerLinkSource(str, Enum):
    OFFLINE_ONBOARD = "OFFLINE_ONBOARD"
    BOOKING = "BOOKING"
    MANUAL = "MANUAL"


class ActionPermission(str, Enum):
    VIEW_DASHBOARD = "VIEW_DASHBOARD"
    VIEW_PROPERTIES = "VIEW_PROPERTIES"
    VIEW_USERS = "VIEW_USERS"
    CREATE_STAFF = "CREATE_STAFF"
    ONBOARD_CUSTOMER = "ONBOARD_CUSTOMER"
    VIEW_UNASSIGNED_CUSTOMERS = "VIEW_UNASSIGNED_CUSTOMERS"
    MANAGE_PROPERTIES = "MANAGE_PROPERTIES"
    VIEW_AUDIT_LOGS = "VIEW_AUDIT_LOGS"


ROLE_PERMISSIONS: dict[Role, set[ActionPermission]] = {
    Role.ADMIN: set(ActionPermission),
    Role.STAFF: {
        ActionPermission.VIEW_DASHBOARD,
        ActionPermission.VIEW_PROPERTIES,
        ActionPermission.VIEW_USERS,
    },
    Role.CUSTOMER: set(),
}


def get_user_permissions(role: str, staff_role: str | None = None) -> set[ActionPermission]:
    del staff_role
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except ValueError:
        return set()


def has_permission(role: str, staff_role: str | None, permission: ActionPermission) -> bool:
    return permission in get_user_permissions(role, staff_role)
