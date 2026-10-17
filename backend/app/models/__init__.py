"""SQLAlchemy 2.0 models registry exporting all domain entities for Alembic and application queries."""

from app.db.base import Base
from app.models.audit import AuditAction, AuditLog
from app.models.auth_session import PasswordResetToken, RefreshSession
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin
from app.models.booking import (
    Booking,
    BookingItem,
    BookingSource,
    BookingStatus,
    InventoryAllocation,
    InventoryAllocationType,
)
from app.models.finance import (
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
)
from app.models.guest import Guest
from app.models.hostel_ops import (
    AgreementStatus,
    AgreementTermType,
    HostelAgreement,
    HostelResidentProfile,
)
from app.models.hotel_ops import (
    HotelStayRecord,
    HousekeepingStatus,
    HousekeepingTask,
    HousekeepingTaskType,
    RoomChangeLog,
)
from app.models.inventory import (
    AccommodationTier,
    Bed,
    BedType,
    Building,
    CleanlinessStatus,
    Floor,
    GenderPolicy,
    Room,
    RoomOperationalStatus,
    RoomType,
)
from app.models.pricing import (
    PriceRule,
    PropertyTax,
    RatePlan,
    TaxType,
)
from app.models.property import Property, PropertyType, PublicationStatus
from app.models.user import User, UserPropertyAssignment

__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    "SoftDeleteMixin",
    # Auth Sessions
    "RefreshSession",
    "PasswordResetToken",
    # Property
    "Property",
    "PropertyType",
    "PublicationStatus",
    # Inventory
    "Building",
    "Floor",
    "RoomType",
    "AccommodationTier",
    "GenderPolicy",
    "Room",
    "RoomOperationalStatus",
    "CleanlinessStatus",
    "Bed",
    "BedType",
    # Pricing
    "RatePlan",
    "PriceRule",
    "TaxType",
    "PropertyTax",
    # Guest
    "Guest",
    # Booking
    "Booking",
    "BookingSource",
    "BookingStatus",
    "BookingItem",
    "InventoryAllocation",
    "InventoryAllocationType",
    # Hostel Operations
    "HostelResidentProfile",
    "HostelAgreement",
    "AgreementTermType",
    "AgreementStatus",
    # Hotel Operations
    "HotelStayRecord",
    "RoomChangeLog",
    "HousekeepingTask",
    "HousekeepingTaskType",
    "HousekeepingStatus",
    # Finance
    "Invoice",
    "InvoiceItem",
    "InvoiceStatus",
    "Payment",
    "PaymentMethod",
    "PaymentStatus",
    # Audit
    "AuditLog",
    "AuditAction",
    # Identity
    "User",
    "UserPropertyAssignment",
]
