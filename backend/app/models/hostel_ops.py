"""Hostel operational models for admissions, KYC, and long-term residency agreements."""

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
    from app.models.guest import Guest
    from app.models.inventory import Bed
    from app.models.property import Property


class AgreementTermType(StrEnum):
    """Term classification for resident housing."""

    SHORT_TERM = "short_term"
    SEMESTER = "semester"
    ACADEMIC_YEAR = "academic_year"
    MONTHLY_ROLLING = "monthly_rolling"


class AgreementStatus(StrEnum):
    """Lifecycle status of a residency agreement."""

    DRAFT = "draft"
    ACTIVE = "active"
    TERMINATED = "terminated"
    COMPLETED = "completed"


class HostelResidentProfile(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Resident KYC, admissions record, and emergency contact registry."""

    __tablename__ = "hostel_resident_profiles"
    __table_args__ = (
        UniqueConstraint("property_id", "guest_id", name="uq_resident_property_guest"),
    )

    guest_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("guests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    emergency_contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    emergency_contact_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    institution_or_employer: Mapped[str | None] = mapped_column(String(150), nullable=True)
    student_or_work_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    is_kyc_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    curfew_exemption: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    guest: Mapped[Guest] = relationship("Guest", back_populates="resident_profile")
    property: Mapped[Property] = relationship("Property")
    agreements: Mapped[list[HostelAgreement]] = relationship(
        "HostelAgreement",
        back_populates="resident_profile",
        cascade="all, delete-orphan",
    )


class HostelAgreement(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Long-term resident contract linked to assigned hostel bed."""

    __tablename__ = "hostel_agreements"
    __table_args__ = (
        UniqueConstraint("property_id", "agreement_number", name="uq_hostel_agreement_number"),
        CheckConstraint("end_date > start_date", name="ck_agreement_dates"),
        CheckConstraint("monthly_rate >= 0", name="ck_agreement_rate"),
        CheckConstraint("security_deposit >= 0", name="ck_agreement_deposit"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resident_profile_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("hostel_resident_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    allocated_bed_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("beds.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    agreement_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    term_type: Mapped[AgreementTermType] = mapped_column(
        SQLEnum(AgreementTermType, native_enum=False, length=20),
        default=AgreementTermType.SEMESTER,
        nullable=False,
    )
    status: Mapped[AgreementStatus] = mapped_column(
        SQLEnum(AgreementStatus, native_enum=False, length=20),
        default=AgreementStatus.DRAFT,
        nullable=False,
        index=True,
    )

    monthly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    security_deposit: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    special_terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    resident_profile: Mapped[HostelResidentProfile] = relationship(
        "HostelResidentProfile",
        back_populates="agreements",
    )
    allocated_bed: Mapped[Bed] = relationship("Bed")
    property: Mapped[Property] = relationship("Property")
