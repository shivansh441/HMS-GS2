"""Pricing, rate plans, seasonal price rules, and property taxes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
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
    from app.models.booking import BookingItem
    from app.models.inventory import RoomType
    from app.models.property import Property


class TaxType(StrEnum):
    """Tax assessment method."""

    PERCENTAGE = "percentage"
    FIXED_PER_NIGHT = "fixed_per_night"
    FIXED_PER_STAY = "fixed_per_stay"


class RatePlan(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Commercial rate plan conditions (e.g. Flexible, Non-Refundable, Long-term Resident)."""

    __tablename__ = "rate_plans"
    __table_args__ = (
        UniqueConstraint("property_id", "code", name="uq_rate_plan_property_code"),
        CheckConstraint("min_nights >= 1", name="ck_rate_plan_min_nights"),
        CheckConstraint("max_nights >= min_nights", name="ck_rate_plan_max_nights"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancellation_policy: Mapped[str] = mapped_column(String(50), default="flexible", nullable=False)

    min_nights: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_nights: Mapped[int] = mapped_column(Integer, default=365, nullable=False)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="rate_plans")
    price_rules: Mapped[list[PriceRule]] = relationship("PriceRule", back_populates="rate_plan")
    booking_items: Mapped[list[BookingItem]] = relationship("BookingItem", back_populates="rate_plan")


class PriceRule(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Date-specific rate pricing override per room type and rate plan."""

    __tablename__ = "price_rules"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_price_rule_dates"),
        CheckConstraint("price_per_night >= 0", name="ck_price_rule_positive_amount"),
        CheckConstraint("minimum_stay >= 1", name="ck_price_rule_min_stay"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rate_plan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rate_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_type_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("room_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    price_per_night: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    minimum_stay: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_closed_to_arrival: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_closed_to_departure: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    rate_plan: Mapped[RatePlan] = relationship("RatePlan", back_populates="price_rules")
    room_type: Mapped[RoomType] = relationship("RoomType", back_populates="price_rules")


class PropertyTax(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Property-specific taxes, tourism levies, and municipal surcharges."""

    __tablename__ = "property_taxes"

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tax_type: Mapped[TaxType] = mapped_column(
        SQLEnum(TaxType, native_enum=False, length=20),
        default=TaxType.PERCENTAGE,
        nullable=False,
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)  # e.g. 0.1200 for 12%
    is_inclusive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="taxes")
