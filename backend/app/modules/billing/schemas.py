from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BillingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class PaymentRequest(BillingRequest):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_method: Literal["CASH", "UPI", "CARD", "BANK_TRANSFER"] = Field(
        alias="paymentMethod"
    )
    reference: str | None = Field(default=None, max_length=100)


class UtilityReadingCreateRequest(BillingRequest):
    property_id: str = Field(alias="propertyId", min_length=1, max_length=36)
    unit_assignment_id: str = Field(alias="unitAssignmentId", min_length=1, max_length=36)
    fee_type: Literal["ELECTRICITY_FEE", "WATER_CHARGE"] = Field(alias="feeType")
    period_start: date = Field(alias="periodStart")
    period_end: date = Field(alias="periodEnd")
    previous_reading: Decimal = Field(
        alias="previousReading", ge=0, max_digits=12, decimal_places=3
    )
    current_reading: Decimal = Field(
        alias="currentReading", ge=0, max_digits=12, decimal_places=3
    )


class RazorpayPaymentVerificationRequest(BillingRequest):
    order_id: str = Field(alias="razorpay_order_id", min_length=1, max_length=64)
    payment_id: str = Field(alias="razorpay_payment_id", min_length=1, max_length=64)
    signature: str = Field(alias="razorpay_signature", min_length=1, max_length=128)


class InvoiceResponse(BaseModel):
    id: str
    invoice_number: str = Field(alias="invoiceNumber")
    property_id: str = Field(alias="propertyId")
    property_name: str = Field(alias="propertyName")
    currency: str
    unit_number: str = Field(alias="unitNumber")
    billing_month: date = Field(alias="billingMonth")
    due_date: date = Field(alias="dueDate")
    unit_fee: Decimal = Field(alias="unitFee")
    mess_fee: Decimal = Field(alias="messFee")
    electricity_arrears: Decimal = Field(alias="electricityArrears")
    water_arrears: Decimal = Field(alias="waterArrears")
    total_amount: Decimal = Field(alias="totalAmount")
    paid_amount: Decimal = Field(alias="paidAmount")
    balance: Decimal
    status: str
    created_at: datetime = Field(alias="createdAt")


class PaymentReceiptResponse(BaseModel):
    id: str
    receipt_number: str = Field(alias="receiptNumber")
    user_id: str = Field(alias="userId")
    invoice_id: str | None = Field(alias="invoiceId")
    deposit_escrow_id: str | None = Field(alias="depositEscrowId")
    amount: Decimal
    payment_method: str = Field(alias="paymentMethod")
    reference: str | None
    received_at: datetime = Field(alias="receivedAt")


class RazorpayCheckoutResponse(BaseModel):
    key_id: str = Field(alias="keyId")
    order_id: str = Field(alias="orderId")
    amount: int
    currency: str
    invoice_number: str = Field(alias="invoiceNumber")
    property_name: str = Field(alias="propertyName")


class InvoiceGenerationResponse(BaseModel):
    billing_month: date = Field(alias="billingMonth")
    created_count: int = Field(alias="createdCount")
    skipped_count: int = Field(alias="skippedCount")
    invoices: list[InvoiceResponse]


class DepositResponse(BaseModel):
    id: str
    unit_assignment_id: str = Field(alias="unitAssignmentId")
    amount: Decimal
    collected_amount: Decimal = Field(alias="collectedAmount")
    balance: Decimal
    status: str


class AssignmentOptionResponse(BaseModel):
    id: str
    user_id: str = Field(alias="userId")
    user_name: str | None = Field(alias="userName")
    unit_number: str = Field(alias="unitNumber")
    billing_strategy: str = Field(alias="billingStrategy")
