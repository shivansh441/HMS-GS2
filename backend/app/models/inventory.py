"""Physical and logical accommodation inventory models."""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.booking import BookingItem, InventoryAllocation
    from app.models.pricing import PriceRule
    from app.models.property import Property


class AccommodationTier(StrEnum):
    """Categorization of accommodation tier."""

    HOTEL_ROOM = "hotel_room"  # Private room suite
    HOSTEL_DORM = "hostel_dorm"  # Shared dormitory with bed allocations
    HOSTEL_PRIVATE = "hostel_private"  # Private room within hostel environment


class GenderPolicy(StrEnum):
    """Hostel dormitory gender eligibility rules."""

    ANY = "any"
    MIXED_ONLY = "mixed_only"
    FEMALE_ONLY = "female_only"
    MALE_ONLY = "male_only"


class RoomOperationalStatus(StrEnum):
    """Operational availability status of a physical room."""

    AVAILABLE = "available"
    OCCUPIED = "occupied"
    MAINTENANCE = "maintenance"
    OUT_OF_ORDER = "out_of_order"


class CleanlinessStatus(StrEnum):
    """Housekeeping status of a room."""

    CLEAN = "clean"
    DIRTY = "dirty"
    INSPECTED = "inspected"
    DO_NOT_DISTURB = "do_not_disturb"


class BedType(StrEnum):
    """Hostel physical bed configuration."""

    STANDARD_SINGLE = "standard_single"
    BUNK_BOTTOM = "bunk_bottom"
    BUNK_TOP = "bunk_top"
    DOUBLE = "double"


class Building(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Optional physical building campus division."""

    __tablename__ = "buildings"
    __table_args__ = (
        UniqueConstraint("property_id", "code", name="uq_building_property_code"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="buildings")
    floors: Mapped[list[Floor]] = relationship("Floor", back_populates="building")


class Floor(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Physical floor within a building or property."""

    __tablename__ = "floors"
    __table_args__ = (
        UniqueConstraint("property_id", "floor_number", name="uq_floor_property_number"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    building_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("buildings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    floor_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="floors")
    building: Mapped[Building | None] = relationship("Building", back_populates="floors")
    rooms: Mapped[list[Room]] = relationship("Room", back_populates="floor")


class RoomType(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Accommodation category specifying tier, capacities, amenities, and default pricing."""

    __tablename__ = "room_types"
    __table_args__ = (
        UniqueConstraint("property_id", "code", name="uq_room_type_property_code"),
        UniqueConstraint("property_id", "slug", name="uq_room_type_property_slug"),
        CheckConstraint("base_capacity_adults >= 1", name="ck_room_type_base_capacity"),
        CheckConstraint("max_capacity_adults >= base_capacity_adults", name="ck_room_type_max_capacity"),
        CheckConstraint("base_price_amount >= 0", name="ck_room_type_base_price"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    accommodation_tier: Mapped[AccommodationTier] = mapped_column(
        SQLEnum(AccommodationTier, native_enum=False, length=20),
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Capacity constraints
    base_capacity_adults: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_capacity_adults: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_capacity_children: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Hostel dorm specific attributes
    is_dormitory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    gender_policy: Mapped[GenderPolicy] = mapped_column(
        SQLEnum(GenderPolicy, native_enum=False, length=20),
        default=GenderPolicy.ANY,
        nullable=False,
    )

    # Pricing reference and visibility
    base_price_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    amenities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="room_types")
    rooms: Mapped[list[Room]] = relationship("Room", back_populates="room_type")
    price_rules: Mapped[list[PriceRule]] = relationship("PriceRule", back_populates="room_type")
    booking_items: Mapped[list[BookingItem]] = relationship("BookingItem", back_populates="room_type")


class Room(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Physical room unit inventory."""

    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("property_id", "room_number", name="uq_room_property_number"),
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
    floor_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("floors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    room_number: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    operational_status: Mapped[RoomOperationalStatus] = mapped_column(
        SQLEnum(RoomOperationalStatus, native_enum=False, length=20),
        default=RoomOperationalStatus.AVAILABLE,
        nullable=False,
        index=True,
    )
    cleanliness_status: Mapped[CleanlinessStatus] = mapped_column(
        SQLEnum(CleanlinessStatus, native_enum=False, length=20),
        default=CleanlinessStatus.CLEAN,
        nullable=False,
        index=True,
    )

    keycard_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="rooms")
    room_type: Mapped[RoomType] = relationship("RoomType", back_populates="rooms")
    floor: Mapped[Floor | None] = relationship("Floor", back_populates="rooms")
    beds: Mapped[list[Bed]] = relationship("Bed", back_populates="room", cascade="all, delete-orphan")
    allocations: Mapped[list[InventoryAllocation]] = relationship("InventoryAllocation", back_populates="room")


class Bed(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Physical hostel bed inventory inside a dormitory room."""

    __tablename__ = "beds"
    __table_args__ = (
        UniqueConstraint("room_id", "bed_label", name="uq_bed_room_label"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    bed_label: Mapped[str] = mapped_column(String(30), nullable=False)
    bed_type: Mapped[BedType] = mapped_column(
        SQLEnum(BedType, native_enum=False, length=20),
        default=BedType.STANDARD_SINGLE,
        nullable=False,
    )
    locker_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operational_status: Mapped[RoomOperationalStatus] = mapped_column(
        SQLEnum(RoomOperationalStatus, native_enum=False, length=20),
        default=RoomOperationalStatus.AVAILABLE,
        nullable=False,
        index=True,
    )

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="beds")
    room: Mapped[Room] = relationship("Room", back_populates="beds")
    allocations: Mapped[list[InventoryAllocation]] = relationship("InventoryAllocation", back_populates="bed")
