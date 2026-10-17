"""Pydantic v2 schemas for API request validation and response serialization."""

from app.schemas.auth import LoginRequest, Token, UserRead
from app.schemas.booking import (
    BookingAdminRead,
    BookingCreateAdmin,
    BookingCreatePublic,
    BookingItemCreate,
    BookingItemRead,
    BookingPublicRead,
)
from app.schemas.common import (
    ApiResponse,
    ErrorDetail,
    ErrorResponse,
    Money,
    PaginatedMeta,
    PaginatedResponse,
    PaginationParams,
)
from app.schemas.finance import (
    InvoiceItemRead,
    InvoiceRead,
    PaymentCreate,
    PaymentRead,
)
from app.schemas.guest import (
    GuestAdminRead,
    GuestCreateAdmin,
    GuestCreatePublic,
    GuestRead,
)
from app.schemas.health import (
    DatabaseHealth,
    HealthResponse,
    SystemInfo,
)
from app.schemas.hostel_ops import (
    HostelAgreementCreate,
    HostelAgreementRead,
    HostelResidentProfileCreate,
    HostelResidentProfileRead,
)
from app.schemas.hotel_ops import (
    HotelStayRecordCreate,
    HotelStayRecordRead,
    HousekeepingTaskCreate,
    HousekeepingTaskRead,
    RoomChangeLogCreate,
    RoomChangeLogRead,
)
from app.schemas.inventory import (
    BedCreate,
    BedRead,
    RoomCreate,
    RoomRead,
    RoomTypeAdminRead,
    RoomTypeCreate,
    RoomTypePublicRead,
)
from app.schemas.pricing import (
    DailyPriceBreakdown,
    PriceCalculationRequest,
    PriceCalculationResult,
    PriceRuleCreate,
    PriceRuleRead,
    PropertyTaxCreate,
    PropertyTaxRead,
    RatePlanCreate,
    RatePlanRead,
)
from app.schemas.property import (
    HostelConfig,
    HotelConfig,
    PropertyAdminRead,
    PropertyCreate,
    PropertyPublicRead,
    PropertyUpdate,
)

__all__ = [
    # Common
    "ApiResponse",
    "PaginatedResponse",
    "PaginatedMeta",
    "PaginationParams",
    "ErrorResponse",
    "ErrorDetail",
    "Money",
    # Health
    "HealthResponse",
    "DatabaseHealth",
    "SystemInfo",
    # Property
    "PropertyCreate",
    "PropertyUpdate",
    "PropertyPublicRead",
    "PropertyAdminRead",
    "HostelConfig",
    "HotelConfig",
    # Inventory
    "RoomTypeCreate",
    "RoomTypePublicRead",
    "RoomTypeAdminRead",
    "RoomCreate",
    "RoomRead",
    "BedCreate",
    "BedRead",
    # Pricing
    "RatePlanCreate",
    "RatePlanRead",
    "PriceRuleCreate",
    "PriceRuleRead",
    "PropertyTaxCreate",
    "PropertyTaxRead",
    "PriceCalculationRequest",
    "PriceCalculationResult",
    "DailyPriceBreakdown",
    # Guest
    "GuestCreatePublic",
    "GuestCreateAdmin",
    "GuestRead",
    "GuestAdminRead",
    # Booking
    "BookingCreatePublic",
    "BookingCreateAdmin",
    "BookingItemCreate",
    "BookingPublicRead",
    "BookingAdminRead",
    "BookingItemRead",
    # Operations
    "HostelResidentProfileCreate",
    "HostelResidentProfileRead",
    "HostelAgreementCreate",
    "HostelAgreementRead",
    "HotelStayRecordCreate",
    "HotelStayRecordRead",
    "RoomChangeLogCreate",
    "RoomChangeLogRead",
    "HousekeepingTaskCreate",
    "HousekeepingTaskRead",
    # Finance
    "InvoiceRead",
    "InvoiceItemRead",
    "PaymentCreate",
    "PaymentRead",
    # Auth
    "Token",
    "LoginRequest",
    "UserRead",
]
