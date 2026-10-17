"""Customer and guest identity models supporting public guest checkout and registered accounts."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.finance import Invoice
    from app.models.hostel_ops import HostelResidentProfile
    from app.models.user import User


class Guest(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Customer or guest entity for public website bookings and front desk registrations."""

    __tablename__ = "guests"

    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)

    identification_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    identification_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state_province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped[User | None] = relationship("User", back_populates="guest_profile")
    bookings: Mapped[list[Booking]] = relationship("Booking", back_populates="guest")
    invoices: Mapped[list[Invoice]] = relationship("Invoice", back_populates="guest")
    resident_profile: Mapped[HostelResidentProfile | None] = relationship(
        "HostelResidentProfile",
        back_populates="guest",
        uselist=False,
    )
