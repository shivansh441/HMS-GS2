"""Hotel operational models for stay records, room changes, and housekeeping tasks."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.booking import BookingItem
    from app.models.inventory import Bed, Room
    from app.models.property import Property
    from app.models.user import User


class HousekeepingTaskType(StrEnum):
    """Classification of room/bed turnover tasks."""

    DEPARTURE_CLEAN = "departure_clean"
    TURNDOWN = "turndown"
    LINEN_CHANGE = "linen_change"
    MAINTENANCE = "maintenance"
    DEEP_CLEAN = "deep_clean"


class HousekeepingStatus(StrEnum):
    """Lifecycle status of a housekeeping assignment."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    INSPECTED = "inspected"
    COMPLETED = "completed"


class HotelStayRecord(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Detailed guest check-in, keycards, and physical stay metrics."""

    __tablename__ = "hotel_stay_records"
    __table_args__ = (
        UniqueConstraint("booking_item_id", name="uq_stay_booking_item"),
    )

    booking_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("booking_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    actual_check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    keycards_issued: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    vehicle_license_plate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    luggage_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Relationships
    booking_item: Mapped[BookingItem] = relationship("BookingItem")
    room: Mapped[Room] = relationship("Room")
    property: Mapped[Property] = relationship("Property")


class RoomChangeLog(Base, UUIDMixin, TimestampMixin):
    """Audit log capturing mid-stay room changes with operational rationale."""

    __tablename__ = "room_change_logs"

    booking_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("booking_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="RESTRICT"),
        nullable=False,
    )
    to_room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="RESTRICT"),
        nullable=False,
    )

    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    authorized_by_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    from_room: Mapped[Room] = relationship("Room", foreign_keys=[from_room_id])
    to_room: Mapped[Room] = relationship("Room", foreign_keys=[to_room_id])
    authorized_by: Mapped[User | None] = relationship("User")


class HousekeepingTask(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Tasking model for room turnover, bed linen changes, and inspections."""

    __tablename__ = "housekeeping_tasks"

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
    bed_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("beds.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    task_type: Mapped[HousekeepingTaskType] = mapped_column(
        SQLEnum(HousekeepingTaskType, native_enum=False, length=20),
        default=HousekeepingTaskType.DEPARTURE_CLEAN,
        nullable=False,
    )
    status: Mapped[HousekeepingStatus] = mapped_column(
        SQLEnum(HousekeepingStatus, native_enum=False, length=20),
        default=HousekeepingStatus.PENDING,
        nullable=False,
        index=True,
    )

    assigned_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    property: Mapped[Property] = relationship("Property")
    room: Mapped[Room] = relationship("Room")
    bed: Mapped[Bed | None] = relationship("Bed")
    assigned_user: Mapped[User | None] = relationship("User")
