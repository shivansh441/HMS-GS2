import base64
import calendar
import hashlib
import hmac
import json
from datetime import date
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.errors import BadRequestError
from app.db.models import (
    DepositEscrow,
    MonthlyInvoice,
    Property,
    PropertyFeeConfig,
    Unit,
    UnitAssignment,
    UtilityMeterReading,
)

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"


def month_bounds(month: date) -> tuple[date, date, date, date]:
    month_start = month.replace(day=1)
    month_end = month.replace(day=calendar.monthrange(month.year, month.month)[1])
    previous_month_end = month_start.fromordinal(month_start.toordinal() - 1)
    previous_month_start = previous_month_end.replace(day=1)
    return month_start, month_end, previous_month_start, previous_month_end


def ensure_deposit_escrow(
    db: Session, prop: Property, assignment: UnitAssignment
) -> DepositEscrow | None:
    if prop.type not in {"HOSTEL_BOYS", "HOSTEL_GIRLS", "HOSTEL_COED"}:
        return None
    if assignment.billing_strategy != "RECURRING_MONTHLY":
        return None
    config = db.scalar(
        select(PropertyFeeConfig).where(
            PropertyFeeConfig.property_id == prop.id,
            PropertyFeeConfig.fee_type == "SECURITY_DEPOSIT",
            PropertyFeeConfig.is_active.is_(True),
        )
    )
    if not config or config.amount <= 0:
        return None
    escrow = db.scalar(
        select(DepositEscrow).where(
            DepositEscrow.unit_assignment_id == assignment.id
        )
    )
    if escrow:
        return escrow
    escrow = DepositEscrow(
        property_id=prop.id,
        unit_assignment_id=assignment.id,
        user_id=assignment.user_id,
        amount=config.amount,
    )
    db.add(escrow)
    return escrow


def generate_monthly_invoices(
    db: Session, prop: Property, billing_month: date
) -> tuple[list[MonthlyInvoice], int]:
    if billing_month.day != 1:
        raise BadRequestError("billingMonth must be the first day of a month")
    current_month_start, current_month_end, previous_month_start, previous_month_end = (
        month_bounds(billing_month)
    )
    assignments = db.scalars(
        select(UnitAssignment)
        .join(Unit, Unit.id == UnitAssignment.unit_id)
        .options(
            joinedload(UnitAssignment.unit),
            joinedload(UnitAssignment.stay_record),
        )
        .where(
            Unit.property_id == prop.id,
            UnitAssignment.is_active.is_(True),
            UnitAssignment.billing_strategy == "RECURRING_MONTHLY",
        )
        .with_for_update()
    ).all()
    next_month_start = date.fromordinal(current_month_end.toordinal() + 1)
    eligible_assignments = [
        assignment
        for assignment in assignments
        if assignment.expected_check_in.date() < next_month_start
        and (
            assignment.expected_check_out is None
            or assignment.expected_check_out.date() >= current_month_start
        )
    ]
    existing_assignment_ids = set(
        db.scalars(
            select(MonthlyInvoice.unit_assignment_id).where(
                MonthlyInvoice.property_id == prop.id,
                MonthlyInvoice.billing_month == current_month_start,
            )
        ).all()
    )
    mess_config = (
        db.scalar(
            select(PropertyFeeConfig).where(
                PropertyFeeConfig.property_id == prop.id,
                PropertyFeeConfig.fee_type == "MESS_FEE",
                PropertyFeeConfig.is_active.is_(True),
            )
        )
        if prop.type in {"HOSTEL_BOYS", "HOSTEL_GIRLS", "HOSTEL_COED"}
        else None
    )
    mess_fee = mess_config.amount if mess_config else Decimal("0")
    created: list[MonthlyInvoice] = []
    skipped = 0

    for assignment in eligible_assignments:
        if assignment.id in existing_assignment_ids:
            skipped += 1
            continue
        unit_fee = (
            assignment.agreed_monthly_rate
            if assignment.agreed_monthly_rate is not None
            else assignment.unit.default_recurring_monthly_rate
        )
        if unit_fee is None:
            raise BadRequestError(
                f"Assignment {assignment.id} has no monthly standard or agreed rate",
                code="MONTHLY_RATE_REQUIRED",
            )
        is_hosteler = (
            assignment.stay_record is not None
            and assignment.stay_record.persona == "HOSTELER"
        )
        readings = (
            db.scalars(
                select(UtilityMeterReading)
                .where(
                    UtilityMeterReading.unit_assignment_id == assignment.id,
                    UtilityMeterReading.billing_status == "QUEUED",
                    UtilityMeterReading.period_end <= previous_month_end,
                )
                .with_for_update()
            ).all()
            if is_hosteler
            else []
        )
        electricity_arrears = sum(
            (row.amount for row in readings if row.fee_type == "ELECTRICITY_FEE"),
            start=Decimal("0"),
        )
        water_arrears = sum(
            (row.amount for row in readings if row.fee_type == "WATER_CHARGE"),
            start=Decimal("0"),
        )
        assignment_mess_fee = mess_fee if is_hosteler else Decimal("0")
        total_amount = unit_fee + assignment_mess_fee + electricity_arrears + water_arrears
        invoice = MonthlyInvoice(
            invoice_number=f"INV-{prop.code}-{billing_month:%Y%m}-{uuid4().hex[:8].upper()}",
            property_id=prop.id,
            unit_assignment_id=assignment.id,
            user_id=assignment.user_id,
            billing_month=current_month_start,
            due_date=current_month_start,
            unit_fee=unit_fee,
            mess_fee=assignment_mess_fee,
            electricity_arrears=electricity_arrears,
            water_arrears=water_arrears,
            total_amount=total_amount,
        )
        db.add(invoice)
        for reading in readings:
            reading.billing_status = "BILLED"
        created.append(invoice)
        existing_assignment_ids.add(assignment.id)

    db.flush()
    return created, skipped


def _razorpay_request(method: str, path: str, payload: dict | None = None) -> dict:
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Online payments are not configured",
        )
    credentials = base64.b64encode(
        f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}".encode()
    ).decode("ascii")
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{RAZORPAY_API_BASE}{path}",
        data=body,
        method=method,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            response_body = response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider request failed",
        ) from error
    try:
        response_data = json.loads(response_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider returned an invalid response",
        ) from error
    if not isinstance(response_data, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider returned an invalid response",
        )
    return response_data


def create_razorpay_order(invoice: MonthlyInvoice, prop: Property) -> dict:
    balance = invoice.total_amount - invoice.paid_amount
    amount_paise = int(balance * 100)
    order = _razorpay_request(
        "POST",
        "/orders",
        {
            "amount": amount_paise,
            "currency": prop.currency,
            "receipt": invoice.id,
            "notes": {
                "invoiceId": invoice.id,
                "customerId": invoice.user_id,
            },
        },
    )
    order_id = order.get("id")
    if not isinstance(order_id, str) or order.get("amount") != amount_paise:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment provider created an invalid order",
        )
    return {
        "keyId": settings.RAZORPAY_KEY_ID,
        "orderId": order_id,
        "amount": amount_paise,
        "currency": prop.currency,
        "invoiceNumber": invoice.invoice_number,
        "propertyName": prop.name,
    }


def verify_razorpay_payment(
    invoice: MonthlyInvoice,
    order_id: str,
    payment_id: str,
    signature: str,
    prop: Property,
) -> tuple[Decimal, str]:
    secret = settings.RAZORPAY_KEY_SECRET
    if not settings.RAZORPAY_KEY_ID or not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Online payments are not configured",
        )
    expected_signature = hmac.new(
        secret.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        raise BadRequestError("Payment signature is invalid", code="INVALID_PAYMENT_SIGNATURE")

    order = _razorpay_request("GET", f"/orders/{order_id}")
    if (
        order.get("receipt") != invoice.id
        or (order.get("notes") or {}).get("invoiceId") != invoice.id
        or (order.get("notes") or {}).get("customerId") != invoice.user_id
        or order.get("currency") != prop.currency
        or not isinstance(order.get("amount"), int)
        or order["amount"] <= 0
    ):
        raise BadRequestError("Payment order does not match this invoice", code="INVALID_PAYMENT_ORDER")
    payment = _razorpay_request("GET", f"/payments/{payment_id}")
    if (
        payment.get("order_id") != order_id
        or payment.get("amount") != order["amount"]
        or payment.get("currency") != prop.currency
        or payment.get("method") not in {"upi", "card"}
        or payment.get("status") not in {"authorized", "captured"}
    ):
        raise BadRequestError("Payment is invalid for this invoice", code="INVALID_PAYMENT")
    if payment["status"] == "authorized":
        payment = _razorpay_request(
            "POST",
            f"/payments/{payment_id}/capture",
            {"amount": order["amount"], "currency": prop.currency},
        )
    if (
        payment.get("order_id") != order_id
        or payment.get("status") != "captured"
        or payment.get("amount") != order["amount"]
        or payment.get("currency") != prop.currency
        or payment.get("method") not in {"upi", "card"}
    ):
        raise BadRequestError(
            "Payment capture could not be confirmed",
            code="PAYMENT_NOT_CAPTURED",
        )
    method = "UPI" if payment["method"] == "upi" else "CARD"
    return Decimal(payment["amount"]) / Decimal(100), method
