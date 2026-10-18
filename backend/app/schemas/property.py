"""Property schemas separating public discovery from internal administrative configuration."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.property import PropertyType, PublicationStatus


class HostelConfig(BaseModel):
    """Hostel-specific business workflow rules."""

    allow_mixed_gender_dorms: bool = True
    lockers_provided: bool = True
    linen_deposit: Decimal = Field(default=Decimal("10.00"), decimal_places=2)
    curfew_enabled: bool = False
    curfew_time: str | None = None
    quiet_hours_start: str = "23:00"
    quiet_hours_end: str = "07:00"
    communal_kitchen_access: bool = True


class HotelConfig(BaseModel):
    """Hotel-specific business workflow rules."""

    star_rating: int = Field(default=4, ge=1, le=5)
    concierge_available: bool = True
    room_service_hours: str = "06:00-23:00"
    daily_housekeeping: bool = True
    minibar_enabled: bool = True
    valet_parking: bool = False
    deposit_percentage: Decimal = Field(default=Decimal("20.00"), decimal_places=2)


class PropertyBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    code: str = Field(..., min_length=2, max_length=50, pattern=r"^[A-Z0-9_\-]+$")
    slug: str = Field(..., min_length=2, max_length=160, pattern=r"^[a-z0-9\-]+$")
    property_type: PropertyType
    currency: str = Field(default="USD", min_length=3, max_length=3)
    timezone: str = Field(default="UTC")
    description: str | None = None
    address: str = Field(..., max_length=255)
    city: str = Field(..., max_length=100)
    state_province: str | None = None
    country: str = Field(..., max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = None
    longitude: float | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    checkin_time_start: str = Field(default="14:00", max_length=5)
    checkout_time_deadline: str = Field(default="11:00", max_length=5)
    publication_status: PublicationStatus = PublicationStatus.DRAFT
    is_bookable: bool = True
    amenities: list[str] = Field(default_factory=list)
    policies: dict[str, Any] = Field(default_factory=dict)
    configuration: dict[str, Any] = Field(default_factory=dict)


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    currency: str | None = None
    timezone: str | None = None
    address: str | None = None
    city: str | None = None
    state_province: str | None = None
    country: str | None = None
    postal_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    checkin_time_start: str | None = None
    checkout_time_deadline: str | None = None
    publication_status: PublicationStatus | None = None
    is_bookable: bool | None = None
    amenities: list[str] | None = None
    policies: dict[str, Any] | None = None
    configuration: dict[str, Any] | None = None
    is_active: bool | None = None


class PropertyPublicRead(BaseModel):
    """Public customer-facing schema (zero internal or administrative fields exposed)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    property_type: PropertyType
    description: str | None
    currency: str
    timezone: str
    address: str
    city: str
    country: str
    checkin_time_start: str
    checkout_time_deadline: str
    amenities: list[str]
    policies: dict[str, Any]


class PropertyAdminRead(PropertyBase):
    """Administrative schema with configuration, operational status, and audit timestamps."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    total_rooms: int
    total_beds: int
    is_active: bool
    created_by_user_id: str | None = None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PropertyPublishRequest(BaseModel):
    """Request to change publication status with validation."""

    publication_status: PublicationStatus
    reason: str | None = None


class PropertyArchiveResponse(BaseModel):
    """Confirmation of property archival."""

    id: str
    is_active: bool
    publication_status: PublicationStatus
    archived_at: datetime
    message: str

