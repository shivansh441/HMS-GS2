"""Financial schemas for invoices, itemized billing, and payments."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.finance import InvoiceStatus, PaymentMethod, PaymentStatus


class InvoiceItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    quantity: int
    unit_price: Decimal
    tax_rate: Decimal
    total_amount: Decimal


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    property_id: str
    booking_id: str | None
    guest_id: str
    invoice_number: str
    status: InvoiceStatus
    currency: str
    subtotal_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    due_date: date | None
    issued_at: datetime | None
    items: list[InvoiceItemRead]


class PaymentCreate(BaseModel):
    property_id: str
    invoice_id: str | None = None
    booking_id: str | None = None
    payment_method: PaymentMethod
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    transaction_id: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    property_id: str
    invoice_id: str | None
    booking_id: str | None
    payment_reference: str
    payment_method: PaymentMethod
    status: PaymentStatus
    amount: Decimal
    currency: str
    transaction_id: str | None
    processed_at: datetime
