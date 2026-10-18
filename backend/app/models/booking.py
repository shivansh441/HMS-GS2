"""Reservation, booking items, and concurrency-safe inventory allocation models."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.finance import Invoice
    from app.models.guest import Guest
    from app.models.inventory import Bed, Room, RoomType
    from app.models.pricing import RatePlan
    from app.models.property import Property
    from app.models.user import User


class BookingSource(StrEnum):
    """Channel through which the reservation originated."""

    PUBLIC_WEBSITE = "public_website"
    ADMIN = "admin"
    WALK_IN = "walk_in"
    PHONE_DIRECT = "phone_direct"
    OTA_CHANNEL = "ota_channel"


class BookingStatus(StrEnum):
    """Lifecycle state machine for a booking."""

    PENDING = "pending"  # Awaiting payment or confirmation
    CONFIRMED = "confirmed"  # Confirmed inventory reservation
    CHECKED_IN = "checked_in"  # Currently in house
    CHECKED_OUT = "checked_out"  # Stay completed
    CANCELLED = "cancelled"  # Cancelled before or during stay
    EXPIRED = "expired"  # Temporary hold window elapsed without payment


class InventoryAllocationType(StrEnum):
    """Type of physical inventory lock."""

    RESERVATION = "reservation"
    CHECK_IN = "check_in"
    MAINTENANCE_BLOCK = "maintenance_block"


class Booking(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Master reservation entity for hotel rooms and hostel beds."""

    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("check_out_date > check_in_date", name="ck_booking_date_range"),
        CheckConstraint("adult_count >= 1", name="ck_booking_adult_count"),
        CheckConstraint("total_amount >= 0", name="ck_booking_positive_total"),
        CheckConstraint("base_amount >= 0", name="ck_booking_positive_base"),
        Index("ix_bookings_property_dates", "property_id", "check_in_date", "check_out_date"),
        Index("ix_bookings_property_status", "property_id", "booking_status"),
    )

    booking_reference: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    guest_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("guests.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    booking_source: Mapped[BookingSource] = mapped_column(
        SQLEnum(BookingSource, native_enum=False, length=20),
        default=BookingSource.PUBLIC_WEBSITE,
        nullable=False,
        index=True,
    )
    booking_status: Mapped[BookingStatus] = mapped_column(
        SQLEnum(BookingStatus, native_enum=False, length=20),
        default=BookingStatus.PENDING,
        nullable=False,
        index=True,
    )

    # Date Range (Stay convention: check_in inclusive, check_out exclusive)
    check_in_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_out_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    total_nights: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    adult_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    child_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    # Historical Financial Snapshot (Immutable record of agreed prices)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    service_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)

    special_requests: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Temporary Hold Expiry
    hold_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    # Cancellation Metadata
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="bookings")
    guest: Mapped[Guest] = relationship("Guest", back_populates="bookings")
    user: Mapped[User | None] = relationship("User", foreign_keys=[user_id])
    created_by_user: Mapped[User | None] = relationship("User", foreign_keys=[created_by_user_id])
    items: Mapped[list[BookingItem]] = relationship(
        "BookingItem",
        back_populates="booking",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list[Invoice]] = relationship("Invoice", back_populates="booking")


class BookingItem(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Specific room or bed inventory line item under a reservation."""

    __tablename__ = "booking_items"
    __table_args__ = (
        CheckConstraint("check_out_date > check_in_date", name="ck_item_date_range"),
        CheckConstraint("unit_price_per_night >= 0", name="ck_item_unit_price"),
        CheckConstraint("total_item_price >= 0", name="ck_item_total_price"),
    )

    booking_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_type_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("room_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    rate_plan_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("rate_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Physical assignment (can be assigned later by front desk or at booking time)
    allocated_room_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    allocated_bed_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("beds.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    guest_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    check_in_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_out_date: Mapped[date] = mapped_column(Date, nullable=False)

    unit_price_per_night: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_item_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # Relationships
    booking: Mapped[Booking] = relationship("Booking", back_populates="items")
    room_type: Mapped[RoomType] = relationship("RoomType", back_populates="booking_items")
    rate_plan: Mapped[RatePlan | None] = relationship("RatePlan", back_populates="booking_items")
    allocated_room: Mapped[Room | None] = relationship("Room", foreign_keys=[allocated_room_id])
    allocated_bed: Mapped[Bed | None] = relationship("Bed", foreign_keys=[allocated_bed_id])
    allocations: Mapped[list[InventoryAllocation]] = relationship(
        "InventoryAllocation",
        back_populates="booking_item",
        cascade="all, delete-orphan",
    )


class InventoryAllocation(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Physical inventory allocation locking rooms or beds for specific date ranges."""

    __tablename__ = "inventory_allocations"
    __table_args__ = (
        CheckConstraint("check_out_date > check_in_date", name="ck_alloc_date_range"),
        CheckConstraint("room_id IS NOT NULL OR bed_id IS NOT NULL", name="ck_alloc_target_exists"),
        Index("ix_alloc_room_dates", "room_id", "check_in_date", "check_out_date"),
        Index("ix_alloc_bed_dates", "bed_id", "check_in_date", "check_out_date"),
        Index("ix_alloc_active", "is_active", "check_in_date", "check_out_date"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_item_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("booking_items.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    room_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    bed_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("beds.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    check_in_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_out_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    allocation_type: Mapped[InventoryAllocationType] = mapped_column(
        SQLEnum(InventoryAllocationType, native_enum=False, length=20),
        default=InventoryAllocationType.RESERVATION,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Relationships
    booking_item: Mapped[BookingItem | None] = relationship("BookingItem", back_populates="allocations")
    room: Mapped[Room | None] = relationship("Room", back_populates="allocations")
    bed: Mapped[Bed | None] = relationship("Bed", back_populates="allocations")
