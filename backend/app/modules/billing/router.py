import calendar
import re
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import Role
from app.core.rate_limit import get_client_ip
from app.db.models import (
    DepositEscrow,
    MonthlyInvoice,
    PaymentReceipt,
    Property,
    PropertyFeeConfig,
    Unit,
    UnitAssignment,
    User,
    UtilityMeterReading,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_current_customer, get_property_scope
from app.modules.billing.schemas import (
    AssignmentOptionResponse,
    DepositResponse,
    InvoiceGenerationResponse,
    InvoiceResponse,
    PaymentReceiptResponse,
    PaymentRequest,
    RazorpayCheckoutResponse,
    RazorpayPaymentVerificationRequest,
    UtilityReadingCreateRequest,
)
from app.modules.billing.service import (
    create_razorpay_order,
    generate_monthly_invoices,
    verify_razorpay_payment,
)
from app.modules.inventory.schemas import UtilityMeterReadingResponse

billing_router = APIRouter(prefix="/billing", tags=["Financial Ledger"])
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")


def _require_front_desk(actor: User) -> None:
    if actor.role == Role.ADMIN:
        return
    if actor.staff_role != "FRONT_DESK":
        raise ForbiddenError("Only front-desk staff or admins can access financial operations")


def _scoped_property(
    db: Session, actor: User, property_id: str, property_scope: set[str]
) -> Property:
    if actor.role != Role.ADMIN and property_id not in property_scope:
        raise NotFoundError("Property not found")
    prop = db.scalar(
        select(Property).where(
            Property.id == property_id,
            Property.is_deleted.is_(False),
        )
    )
    if not prop:
        raise NotFoundError("Property not found")
    return prop


def _invoice_response(db: Session, invoice: MonthlyInvoice) -> InvoiceResponse:
    assignment = db.get(UnitAssignment, invoice.unit_assignment_id)
    unit = db.get(Unit, assignment.unit_id) if assignment else None
    prop = db.get(Property, invoice.property_id)
    if not assignment or not unit or not prop:
        raise NotFoundError("Invoice assignment not found")
    status_value = invoice.status
    if invoice.paid_amount < invoice.total_amount and invoice.due_date < date.today():
        status_value = "OVERDUE"
    return InvoiceResponse(
        id=invoice.id,
        invoiceNumber=invoice.invoice_number,
        propertyId=invoice.property_id,
        propertyName=prop.name,
        currency=prop.currency,
        unitNumber=unit.unit_number,
        billingMonth=invoice.billing_month,
        dueDate=invoice.due_date,
        unitFee=invoice.unit_fee,
        messFee=invoice.mess_fee,
        electricityArrears=invoice.electricity_arrears,
        waterArrears=invoice.water_arrears,
        totalAmount=invoice.total_amount,
        paidAmount=invoice.paid_amount,
        balance=invoice.total_amount - invoice.paid_amount,
        status=status_value,
        createdAt=invoice.created_at,
    )


def _deposit_response(escrow: DepositEscrow) -> DepositResponse:
    return DepositResponse(
        id=escrow.id,
        unitAssignmentId=escrow.unit_assignment_id,
        amount=escrow.amount,
        collectedAmount=escrow.collected_amount,
        balance=escrow.amount - escrow.collected_amount,
        status=escrow.status,
    )


def _receipt_response(receipt: PaymentReceipt) -> PaymentReceiptResponse:
    return PaymentReceiptResponse(
        id=receipt.id,
        receiptNumber=receipt.receipt_number,
        userId=receipt.user_id,
        invoiceId=receipt.invoice_id,
        depositEscrowId=receipt.deposit_escrow_id,
        amount=receipt.amount,
        paymentMethod=receipt.payment_method,
        reference=receipt.reference,
        receivedAt=receipt.received_at,
    )


@billing_router.post(
    "/properties/{property_id}/invoices/generate",
    response_model=InvoiceGenerationResponse,
)
def generate_invoices_endpoint(
    property_id: str,
    request: Request,
    billing_month: str | None = Query(default=None, alias="billingMonth"),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    if actor.role != Role.ADMIN:
        raise ForbiddenError("Only admins can generate monthly invoices")
    prop = _scoped_property(db, actor, property_id, property_scope)
    month_value = billing_month or datetime.now(ZoneInfo(prop.timezone)).strftime("%Y-%m")
    if not MONTH_PATTERN.fullmatch(month_value):
        raise BadRequestError("billingMonth must use YYYY-MM format")
    try:
        month = date.fromisoformat(f"{month_value}-01")
    except ValueError as error:
        raise BadRequestError("billingMonth must be a valid calendar month") from error
    today = datetime.now(ZoneInfo(prop.timezone)).date()
    if month > today.replace(day=1):
        raise BadRequestError("Invoices cannot be generated for a future month")

    invoices, skipped_count = generate_monthly_invoices(db, prop, month)
    write_audit_log(
        db,
        action="MONTHLY_INVOICES_GENERATED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={
            "billingMonth": month_value,
            "createdCount": len(invoices),
            "skippedCount": skipped_count,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    for invoice in invoices:
        db.refresh(invoice)
    return InvoiceGenerationResponse(
        billingMonth=month,
        createdCount=len(invoices),
        skippedCount=skipped_count,
        invoices=[_invoice_response(db, invoice) for invoice in invoices],
    )


@billing_router.get(
    "/properties/{property_id}/invoices",
    response_model=list[InvoiceResponse],
)
def list_property_invoices_endpoint(
    property_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    invoices = db.scalars(
        select(MonthlyInvoice)
        .where(MonthlyInvoice.property_id == prop.id)
        .order_by(MonthlyInvoice.billing_month.desc(), MonthlyInvoice.invoice_number)
        .limit(500)
    ).all()
    return [_invoice_response(db, invoice) for invoice in invoices]


@billing_router.get("/me/invoices", response_model=list[InvoiceResponse])
def list_customer_invoices_endpoint(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    invoices = db.scalars(
        select(MonthlyInvoice)
        .where(MonthlyInvoice.user_id == customer.id)
        .order_by(MonthlyInvoice.billing_month.desc())
        .limit(100)
    ).all()
    return [_invoice_response(db, invoice) for invoice in invoices]


@billing_router.get("/me/receipts", response_model=list[PaymentReceiptResponse])
def list_customer_payment_receipts_endpoint(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    receipts = db.scalars(
        select(PaymentReceipt)
        .where(PaymentReceipt.user_id == customer.id)
        .order_by(PaymentReceipt.received_at.desc())
        .limit(100)
    ).all()
    return [_receipt_response(receipt) for receipt in receipts]


@billing_router.post(
    "/invoices/{invoice_id}/checkout",
    response_model=RazorpayCheckoutResponse,
)
def create_invoice_checkout_endpoint(
    invoice_id: str,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    invoice = db.scalar(
        select(MonthlyInvoice)
        .where(
            MonthlyInvoice.id == invoice_id,
            MonthlyInvoice.user_id == customer.id,
        )
        .with_for_update()
    )
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.status == "CANCELLED" or invoice.paid_amount >= invoice.total_amount:
        raise BadRequestError("This invoice has no outstanding balance", code="INVOICE_NOT_PAYABLE")
    prop = db.get(Property, invoice.property_id)
    if not prop:
        raise NotFoundError("Invoice property not found")
    return create_razorpay_order(invoice, prop)


@billing_router.post(
    "/invoices/{invoice_id}/payments/verify",
    response_model=PaymentReceiptResponse,
    status_code=201,
)
def verify_customer_invoice_payment_endpoint(
    invoice_id: str,
    payload: RazorpayPaymentVerificationRequest,
    request: Request,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    invoice = db.scalar(
        select(MonthlyInvoice)
        .where(
            MonthlyInvoice.id == invoice_id,
            MonthlyInvoice.user_id == customer.id,
        )
        .with_for_update()
    )
    if not invoice:
        raise NotFoundError("Invoice not found")
    existing_receipt = db.scalar(
        select(PaymentReceipt).where(
            PaymentReceipt.invoice_id == invoice.id,
            PaymentReceipt.reference == f"razorpay:{payload.payment_id}",
        )
    )
    if existing_receipt:
        return _receipt_response(existing_receipt)
    if invoice.status == "CANCELLED" or invoice.paid_amount >= invoice.total_amount:
        raise BadRequestError("This invoice has no outstanding balance", code="INVOICE_NOT_PAYABLE")
    prop = db.get(Property, invoice.property_id)
    if not prop:
        raise NotFoundError("Invoice property not found")
    amount, payment_method = verify_razorpay_payment(
        invoice,
        payload.order_id,
        payload.payment_id,
        payload.signature,
        prop,
    )
    balance = invoice.total_amount - invoice.paid_amount
    if amount > balance:
        raise ConflictError(
            "Captured payment exceeds the remaining invoice balance; contact support",
            code="PAYMENT_BALANCE_CHANGED",
        )
    receipt = PaymentReceipt(
        property_id=invoice.property_id,
        user_id=customer.id,
        invoice_id=invoice.id,
        amount=amount,
        payment_method=payment_method,
        reference=f"razorpay:{payload.payment_id}",
        received_by_user_id=customer.id,
    )
    invoice.paid_amount += amount
    invoice.status = "PAID" if invoice.paid_amount == invoice.total_amount else "PARTIALLY_PAID"
    db.add(receipt)
    write_audit_log(
        db,
        action="INVOICE_PAYMENT_RECEIVED",
        actor_user_id=customer.id,
        target_user_id=customer.id,
        property_id=invoice.property_id,
        details={
            "invoiceId": invoice.id,
            "amount": str(amount),
            "paymentMethod": payment_method,
            "paymentId": payload.payment_id,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(receipt)
    return _receipt_response(receipt)


@billing_router.post(
    "/invoices/{invoice_id}/payments",
    response_model=PaymentReceiptResponse,
    status_code=201,
)
def record_invoice_payment_endpoint(
    invoice_id: str,
    payload: PaymentRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    invoice = db.scalar(
        select(MonthlyInvoice)
        .where(MonthlyInvoice.id == invoice_id)
        .with_for_update()
    )
    if not invoice or (actor.role != Role.ADMIN and invoice.property_id not in property_scope):
        raise NotFoundError("Invoice not found")
    balance = invoice.total_amount - invoice.paid_amount
    if payload.amount > balance:
        raise BadRequestError("Payment exceeds the invoice balance", code="PAYMENT_EXCEEDS_BALANCE")
    receipt = PaymentReceipt(
        property_id=invoice.property_id,
        user_id=invoice.user_id,
        invoice_id=invoice.id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        reference=payload.reference,
        received_by_user_id=actor.id,
    )
    invoice.paid_amount += payload.amount
    invoice.status = (
        "PAID" if invoice.paid_amount == invoice.total_amount else "PARTIALLY_PAID"
    )
    db.add(receipt)
    write_audit_log(
        db,
        action="INVOICE_PAYMENT_RECEIVED",
        actor_user_id=actor.id,
        target_user_id=invoice.user_id,
        property_id=invoice.property_id,
        details={
            "invoiceId": invoice.id,
            "amount": str(payload.amount),
            "paymentMethod": payload.payment_method,
            "reference": payload.reference,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(receipt)
    return _receipt_response(receipt)


@billing_router.post(
    "/invoices/generate-monthly",
    response_model=InvoiceGenerationResponse,
)
def generate_monthly_invoices_endpoint(
    request: Request,
    billing_month: str | None = Query(default=None, alias="billingMonth"),
    property_id: str | None = Query(default=None, alias="propertyId"),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    if actor.role != Role.ADMIN:
        raise ForbiddenError("Only admins can generate monthly invoices")
    if billing_month and not MONTH_PATTERN.fullmatch(billing_month):
        raise BadRequestError("billingMonth must use YYYY-MM format")
    properties_query = select(Property).where(
        Property.is_deleted.is_(False),
        Property.status == "ACTIVE",
    )
    if property_id:
        if actor.role != Role.ADMIN and property_id not in property_scope:
            raise NotFoundError("Property not found")
        properties_query = properties_query.where(Property.id == property_id)
    properties = db.scalars(properties_query.order_by(Property.code)).all()
    if property_id and not properties:
        raise NotFoundError("Property not found")

    created_invoices: list[MonthlyInvoice] = []
    skipped_count = 0
    requested_month: date | None = None
    for prop in properties:
        month_value = billing_month or datetime.now(ZoneInfo(prop.timezone)).strftime("%Y-%m")
        try:
            month = date.fromisoformat(f"{month_value}-01")
        except ValueError as error:
            raise BadRequestError("billingMonth must be a valid calendar month") from error
        today = datetime.now(ZoneInfo(prop.timezone)).date()
        if month > today.replace(day=1):
            raise BadRequestError("Invoices cannot be generated for a future month")
        if requested_month is None:
            requested_month = month
        invoices, skipped = generate_monthly_invoices(db, prop, month)
        created_invoices.extend(invoices)
        skipped_count += skipped
        write_audit_log(
            db,
            action="MONTHLY_INVOICES_GENERATED",
            actor_user_id=actor.id,
            property_id=prop.id,
            details={
                "billingMonth": month_value,
                "createdCount": len(invoices),
                "skippedCount": skipped,
            },
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    db.commit()
    for invoice in created_invoices:
        db.refresh(invoice)
    return InvoiceGenerationResponse(
        billingMonth=requested_month or date.today().replace(day=1),
        createdCount=len(created_invoices),
        skippedCount=skipped_count,
        invoices=[_invoice_response(db, invoice) for invoice in created_invoices],
    )


@billing_router.post(
    "/utility-readings",
    response_model=UtilityMeterReadingResponse,
    status_code=201,
)
def create_utility_reading_endpoint(
    payload: UtilityReadingCreateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    prop = _scoped_property(db, actor, payload.property_id, property_scope)
    today = datetime.now(ZoneInfo(prop.timezone)).date()
    if (
        payload.period_start.day != 1
        or payload.period_end.day
        != calendar.monthrange(payload.period_end.year, payload.period_end.month)[1]
        or payload.period_start.month != payload.period_end.month
        or payload.period_start.year != payload.period_end.year
        or payload.period_end >= today
    ):
        raise BadRequestError(
            "Meter readings must cover one completed calendar month",
            code="INVALID_METER_PERIOD",
        )
    if payload.current_reading < payload.previous_reading:
        raise BadRequestError("Current meter reading cannot be below the previous reading")

    assignment = db.scalar(
        select(UnitAssignment).where(
            UnitAssignment.id == payload.unit_assignment_id,
            UnitAssignment.is_active.is_(True),
        )
    )
    unit = db.get(Unit, assignment.unit_id) if assignment else None
    if not assignment or not unit or unit.property_id != prop.id:
        raise NotFoundError("Active stay assignment not found in this property")
    config = db.scalar(
        select(PropertyFeeConfig).where(
            PropertyFeeConfig.property_id == prop.id,
            PropertyFeeConfig.fee_type == payload.fee_type,
            PropertyFeeConfig.is_active.is_(True),
            PropertyFeeConfig.pricing_basis == "METERED",
            PropertyFeeConfig.billing_timing == "ARREARS",
        )
    )
    if not config or config.rate_per_unit is None or not config.unit_of_measure:
        raise BadRequestError(
            "Configure this utility as metered and arrears-based before recording readings",
            code="METERED_FEE_NOT_CONFIGURED",
        )
    consumption = payload.current_reading - payload.previous_reading
    amount = (consumption * config.rate_per_unit).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    reading = UtilityMeterReading(
        property_id=prop.id,
        unit_assignment_id=assignment.id,
        fee_type=payload.fee_type,
        period_start=payload.period_start,
        period_end=payload.period_end,
        previous_reading=payload.previous_reading,
        current_reading=payload.current_reading,
        consumption=consumption,
        rate_per_unit=config.rate_per_unit,
        amount=amount,
        billing_status="QUEUED",
    )
    db.add(reading)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError(
            "A meter reading already exists for this assignment, utility, and month",
            code="METER_READING_EXISTS",
        ) from error
    write_audit_log(
        db,
        action="UTILITY_ARREARS_QUEUED",
        actor_user_id=actor.id,
        target_user_id=assignment.user_id,
        property_id=prop.id,
        details={
            "feeType": reading.fee_type,
            "periodStart": reading.period_start.isoformat(),
            "periodEnd": reading.period_end.isoformat(),
            "consumption": str(consumption),
            "unitOfMeasure": config.unit_of_measure,
            "amount": str(amount),
            "billingStatus": reading.billing_status,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(reading)
    return UtilityMeterReadingResponse(
        id=reading.id,
        feeType=reading.fee_type,
        periodStart=reading.period_start,
        periodEnd=reading.period_end,
        consumption=reading.consumption,
        unitOfMeasure=config.unit_of_measure,
        ratePerUnit=reading.rate_per_unit,
        amount=reading.amount,
        billingStatus=reading.billing_status,
        arrearsForPeriod=reading.period_end.strftime("%Y-%m"),
    )


@billing_router.get(
    "/properties/{property_id}/assignments",
    response_model=list[AssignmentOptionResponse],
)
def list_property_assignments_endpoint(
    property_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    assignments = db.scalars(
        select(UnitAssignment)
        .join(Unit, Unit.id == UnitAssignment.unit_id)
        .options(joinedload(UnitAssignment.user), joinedload(UnitAssignment.unit))
        .where(
            Unit.property_id == prop.id,
            UnitAssignment.is_active.is_(True),
        )
        .order_by(Unit.unit_number)
    ).all()
    return [
        AssignmentOptionResponse(
            id=assignment.id,
            userId=assignment.user_id,
            userName=assignment.user.full_name,
            unitNumber=assignment.unit.unit_number,
            billingStrategy=assignment.billing_strategy,
        )
        for assignment in assignments
    ]


@billing_router.get(
    "/properties/{property_id}/deposits",
    response_model=list[DepositResponse],
)
def list_property_deposits_endpoint(
    property_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    deposits = db.scalars(
        select(DepositEscrow)
        .where(DepositEscrow.property_id == prop.id)
        .order_by(DepositEscrow.created_at.desc())
        .limit(500)
    ).all()
    return [_deposit_response(deposit) for deposit in deposits]


@billing_router.get(
    "/properties/{property_id}/receipts",
    response_model=list[PaymentReceiptResponse],
)
def list_property_receipts_endpoint(
    property_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    receipts = db.scalars(
        select(PaymentReceipt)
        .where(PaymentReceipt.property_id == prop.id)
        .order_by(PaymentReceipt.received_at.desc())
        .limit(100)
    ).all()
    return [_receipt_response(receipt) for receipt in receipts]


@billing_router.post(
    "/deposits/{deposit_id}/payments",
    response_model=PaymentReceiptResponse,
    status_code=201,
)
def record_deposit_payment_endpoint(
    deposit_id: str,
    payload: PaymentRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk(actor)
    escrow = db.scalar(
        select(DepositEscrow)
        .where(DepositEscrow.id == deposit_id)
        .with_for_update()
    )
    if not escrow or (actor.role != Role.ADMIN and escrow.property_id not in property_scope):
        raise NotFoundError("Deposit escrow not found")
    balance = escrow.amount - escrow.collected_amount
    if payload.amount > balance:
        raise BadRequestError("Payment exceeds the security deposit balance")
    receipt = PaymentReceipt(
        property_id=escrow.property_id,
        user_id=escrow.user_id,
        deposit_escrow_id=escrow.id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        reference=payload.reference,
        received_by_user_id=actor.id,
    )
    escrow.collected_amount += payload.amount
    escrow.status = "HELD" if escrow.collected_amount == escrow.amount else "PARTIALLY_COLLECTED"
    write_audit_log(
        db,
        action="SECURITY_DEPOSIT_COLLECTED",
        actor_user_id=actor.id,
        target_user_id=escrow.user_id,
        property_id=escrow.property_id,
        details={
            "depositEscrowId": escrow.id,
            "amount": str(payload.amount),
            "paymentMethod": payload.payment_method,
            "reference": payload.reference,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return _receipt_response(receipt)
