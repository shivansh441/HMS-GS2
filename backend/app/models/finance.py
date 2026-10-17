"""Financial foundations: Invoices, invoice items, and payment transactions."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.guest import Guest
    from app.models.property import Property


class InvoiceStatus(StrEnum):
    """Lifecycle status of a financial invoice."""

    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    VOID = "void"
    REFUNDED = "refunded"


class PaymentStatus(StrEnum):
    """Payment transaction state."""

    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class PaymentMethod(StrEnum):
    """Settlement instruments supported by the system."""

    CREDIT_CARD = "credit_card"
    DEBIT_CARD = "debit_card"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"
    POS_TERMINAL = "pos_terminal"
    CRYPTO = "crypto"


class Invoice(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Formal invoice document capturing billing items and tax breakdown."""

    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("property_id", "invoice_number", name="uq_property_invoice_number"),
        CheckConstraint("subtotal_amount >= 0", name="ck_inv_subtotal"),
        CheckConstraint("tax_amount >= 0", name="ck_inv_tax"),
        CheckConstraint("total_amount >= 0", name="ck_inv_total"),
        CheckConstraint("paid_amount >= 0", name="ck_inv_paid"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    guest_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("guests.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        SQLEnum(InvoiceStatus, native_enum=False, length=20),
        default=InvoiceStatus.DRAFT,
        nullable=False,
        index=True,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)

    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    property: Mapped[Property] = relationship("Property", back_populates="invoices")
    booking: Mapped[Booking | None] = relationship("Booking", back_populates="invoices")
    guest: Mapped[Guest] = relationship("Guest", back_populates="invoices")
    items: Mapped[list[InvoiceItem]] = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )
    payments: Mapped[list[Payment]] = relationship("Payment", back_populates="invoice")


class InvoiceItem(Base, UUIDMixin, TimestampMixin):
    """Itemized billing line on an invoice."""

    __tablename__ = "invoice_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_inv_item_qty"),
        CheckConstraint("unit_price >= 0", name="ck_inv_item_unit_price"),
        CheckConstraint("total_amount >= 0", name="ck_inv_item_total"),
    )

    invoice_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(8, 4), default=Decimal("0.0000"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Relationships
    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="items")


class Payment(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Payment transaction record."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_payment_positive_amount"),
    )

    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    booking_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    payment_reference: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod, native_enum=False, length=20),
        default=PaymentMethod.CREDIT_CARD,
        nullable=False,
    )
    status: Mapped[PaymentStatus] = mapped_column(
        SQLEnum(PaymentStatus, native_enum=False, length=20),
        default=PaymentStatus.PENDING,
        nullable=False,
        index=True,
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    transaction_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    property: Mapped[Property] = relationship("Property")
    invoice: Mapped[Invoice | None] = relationship("Invoice", back_populates="payments")
