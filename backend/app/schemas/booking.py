"""Booking schemas supporting both public customer checkout and administrative reservations."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.booking import BookingSource, BookingStatus
from app.schemas.guest import GuestCreateAdmin, GuestCreatePublic, GuestRead


class BookingItemCreate(BaseModel):
    room_type_id: str
    rate_plan_id: str | None = None
    guest_name: str | None = None
    allocated_room_id: str | None = None
    allocated_bed_id: str | None = None
    check_in_date: date
    check_out_date: date


class BookingItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    booking_id: str
    property_id: str
    room_type_id: str
    rate_plan_id: str | None
    allocated_room_id: str | None
    allocated_bed_id: str | None
    guest_name: str | None
    check_in_date: date
    check_out_date: date
    unit_price_per_night: Decimal
    total_item_price: Decimal
    tax_breakdown: dict[str, Any]


class BookingCreatePublic(BaseModel):
    """Payload submitted by a customer on the public booking website."""

    property_id: str
    guest: GuestCreatePublic
    check_in_date: date
    check_out_date: date
    adult_count: int = Field(default=1, ge=1)
    child_count: int = Field(default=0, ge=0)
    items: list[BookingItemCreate] = Field(..., min_length=1)
    special_requests: str | None = None


class BookingCreateAdmin(BaseModel):
    """Payload submitted by authorized staff in the administrative application."""

    property_id: str
    guest_id: str | None = None
    guest: GuestCreateAdmin | None = None
    booking_source: BookingSource = BookingSource.ADMIN
    check_in_date: date
    check_out_date: date
    adult_count: int = Field(default=1, ge=1)
    child_count: int = Field(default=0, ge=0)
    items: list[BookingItemCreate] = Field(..., min_length=1)
    base_amount: Decimal = Field(..., ge=0)
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    service_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    total_amount: Decimal = Field(..., ge=0)
    deposit_paid: Decimal = Field(default=Decimal("0.00"), ge=0)
    special_requests: str | None = None


class BookingPublicRead(BaseModel):
    """Customer-facing booking receipt with status and breakdown."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    booking_reference: str
    property_id: str
    booking_status: BookingStatus
    check_in_date: date
    check_out_date: date
    total_nights: int
    adult_count: int
    child_count: int
    currency: str
    base_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    deposit_paid: Decimal
    special_requests: str | None
    guest: GuestRead
    items: list[BookingItemRead]
    created_at: datetime


class BookingAdminRead(BookingPublicRead):
    """Administrative booking representation with full lifecycle metadata."""

    booking_source: BookingSource
    hold_expires_at: datetime | None
    cancelled_at: datetime | None
    cancellation_reason: str | None
    created_by_user_id: str | None
    updated_at: datetime
