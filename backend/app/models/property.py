"""Property model supporting hostels, hotels, and hybrid properties."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.finance import Invoice
    from app.models.inventory import Bed, Building, Floor, Room, RoomType
    from app.models.pricing import PropertyTax, RatePlan
    from app.models.user import UserPropertyAssignment


class PropertyType(StrEnum):
    """Classification of property type defining applicable operational workflows."""

    HOSTEL = "hostel"  # Dorm bed allocations, bunk assignments, lock boxes, communal events
    HOTEL = "hotel"  # Whole private rooms, housekeeping turndown, room service, concierge
    HYBRID = "hybrid"  # Property hosting both dormitory wings and private hotel suites


class PublicationStatus(StrEnum):
    """Publication lifecycle governing public discovery."""

    DRAFT = "draft"  # In preparation, invisible to public website
    PUBLISHED = "published"  # Discoverable on public booking website if is_bookable is True
    UNPUBLISHED = "unpublished"  # Hidden from public discovery, admin accessible only


class Property(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Multi-tenant property entity providing strict data boundary isolation."""

    __tablename__ = "properties"

    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    property_type: Mapped[PropertyType] = mapped_column(
        SQLEnum(PropertyType, native_enum=False, length=20),
        nullable=False,
        index=True,
    )

    # Public Discovery & Publication
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    publication_status: Mapped[PublicationStatus] = mapped_column(
        SQLEnum(PublicationStatus, native_enum=False, length=20),
        default=PublicationStatus.DRAFT,
        nullable=False,
        index=True,
    )
    is_bookable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Localization and financial baseline
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)

    # Address & Geo Location
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    state_province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Contact Info
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Operating Policy Hours
    checkin_time_start: Mapped[str] = mapped_column(String(5), default="14:00", nullable=False)
    checkout_time_deadline: Mapped[str] = mapped_column(String(5), default="11:00", nullable=False)

    # Capacity
    total_rooms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_beds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Amenities & Policies
    amenities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    policies: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # Property-specific configuration (hostel bed-level rules vs hotel room rules)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # Audit & Lifecycle Tracking
    created_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user_assignments: Mapped[list[UserPropertyAssignment]] = relationship(
        "UserPropertyAssignment",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    buildings: Mapped[list[Building]] = relationship(
        "Building",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    floors: Mapped[list[Floor]] = relationship(
        "Floor",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    room_types: Mapped[list[RoomType]] = relationship(
        "RoomType",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    rooms: Mapped[list[Room]] = relationship(
        "Room",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    beds: Mapped[list[Bed]] = relationship(
        "Bed",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    rate_plans: Mapped[list[RatePlan]] = relationship(
        "RatePlan",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    taxes: Mapped[list[PropertyTax]] = relationship(
        "PropertyTax",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    bookings: Mapped[list[Booking]] = relationship(
        "Booking",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list[Invoice]] = relationship(
        "Invoice",
        back_populates="property",
        cascade="all, delete-orphan",
    )
