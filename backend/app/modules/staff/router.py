import calendar
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.crypto import process_id_document
from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import Role, StaffRole, UserStatus
from app.core.security import generate_one_time_token, hash_password
from app.db.models import (
    PaymentMode,
    PaymentStatus,
    Property,
    StaffAttendance,
    StaffProfile,
    StaffSalaryDisbursement,
    User,
    UserPropertyAccess,
    VerificationToken,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.auth.schemas import GovernmentIdType
from app.modules.auth.service import revoke_all_user_sessions
from app.modules.notifier.service import notifier

staff_router = APIRouter(tags=["Staff & Payroll"])


class StaffCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    email: EmailStr
    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    phone: str = Field(min_length=5, max_length=32)
    date_of_birth: date = Field(alias="dateOfBirth")
    id_document_type: GovernmentIdType = Field(alias="idDocumentType")
    id_document_number: str = Field(alias="idDocumentNumber", min_length=2, max_length=128)
    staff_role: StaffRole = Field(default=StaffRole.FRONT_DESK, alias="staffRole")
    designation: str = Field(min_length=1, max_length=100)
    department: str = Field(min_length=1, max_length=100)
    property_id: str = Field(alias="propertyId", min_length=1, max_length=36)
    base_monthly_salary: Decimal = Field(
        alias="baseMonthlySalary", gt=0, max_digits=10, decimal_places=2
    )
    joining_date: datetime = Field(alias="joiningDate")

    @model_validator(mode="after")
    def validate_date_of_birth(self):
        if self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class StaffUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    designation: str | None = Field(default=None, min_length=1, max_length=100)
    department: str | None = Field(default=None, min_length=1, max_length=100)
    base_monthly_salary: Decimal | None = Field(
        default=None, alias="baseMonthlySalary", gt=0, max_digits=10, decimal_places=2
    )
    is_active: bool | None = Field(default=None, alias="isActive")


class AttendanceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    year: int = Field(ge=2000, le=9999)
    month: int = Field(ge=1, le=12)
    worked_days: int = Field(alias="workedDays", ge=0)


class DisbursementRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    staff_id: str = Field(alias="staffId", min_length=1, max_length=36)
    year: int = Field(ge=2000, le=9999)
    month: int = Field(ge=1, le=12)
    payment_status: PaymentStatus = Field(
        default=PaymentStatus.PENDING, alias="paymentStatus"
    )
    payment_mode: PaymentMode | None = Field(default=None, alias="paymentMode")
    transaction_reference: str | None = Field(
        default=None, alias="transactionReference", max_length=100
    )


class StaffItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str = Field(alias="userId")
    full_name: str = Field(alias="fullName")
    email: str | None
    phone: str | None
    date_of_birth: date | None = Field(alias="dateOfBirth")
    staff_role: str | None = Field(alias="staffRole")
    designation: str
    department: str
    property_id: str = Field(alias="propertyId")
    property_name: str = Field(alias="propertyName")
    base_monthly_salary: Decimal = Field(alias="baseMonthlySalary")
    joining_date: datetime = Field(alias="joiningDate")
    is_active: bool = Field(alias="isActive")
    worked_days: int | None = Field(alias="workedDays")
    total_days: int = Field(alias="totalDays")
    payable_salary: Decimal | None = Field(alias="payableSalary")
    payment_status: PaymentStatus | None = Field(alias="paymentStatus")
    payment_mode: PaymentMode | None = Field(alias="paymentMode")
    transaction_reference: str | None = Field(alias="transactionReference")
    payment_date: datetime | None = Field(alias="paymentDate")


class StaffListResponse(BaseModel):
    items: list[StaffItem]
    total: int
    year: int
    month: int


class StaffCreateResponse(StaffItem):
    activation_url: str = Field(alias="activationUrl")


class AttendanceResponse(BaseModel):
    id: str
    staff_id: str = Field(alias="staffId")
    year: int
    month: int
    worked_days: int = Field(alias="workedDays")
    total_days: int = Field(alias="totalDays")
    payable_salary: Decimal = Field(alias="payableSalary")


class DisbursementResponse(BaseModel):
    id: str
    staff_id: str = Field(alias="staffId")
    year: int
    month: int
    payable_salary: Decimal = Field(alias="payableSalary")
    payment_status: PaymentStatus = Field(alias="paymentStatus")
    payment_mode: PaymentMode | None = Field(alias="paymentMode")
    transaction_reference: str | None = Field(alias="transactionReference")
    payment_date: datetime | None = Field(alias="paymentDate")


def _require_admin(actor: User) -> None:
    if actor.role != Role.ADMIN:
        raise ForbiddenError("Only admins can manage staff and payroll", code="ADMIN_REQUIRED")


def _get_scoped_staff(
    db: Session,
    staff_id: str,
    property_scope: set[str],
    *,
    for_update: bool = False,
) -> StaffProfile:
    query = select(StaffProfile).where(
        StaffProfile.id == staff_id,
        StaffProfile.property_id.in_(property_scope),
    )
    if for_update:
        query = query.with_for_update()
    profile = db.scalar(query)
    if not profile:
        raise NotFoundError("Staff profile not found")
    return profile


def _salary(base_salary: Decimal, worked_days: int, total_days: int) -> Decimal:
    return (base_salary * worked_days / total_days).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _staff_response(
    profile: StaffProfile,
    year: int,
    month: int,
    total_days: int,
    attendance: StaffAttendance | None,
    disbursement: StaffSalaryDisbursement | None,
) -> StaffItem:
    payable = (
        _salary(profile.base_monthly_salary, attendance.worked_days, total_days)
        if attendance
        else None
    )
    return StaffItem(
        id=profile.id,
        userId=profile.user_id,
        fullName=profile.user.full_name or "",
        email=profile.user.email,
        phone=profile.user.phone,
        dateOfBirth=profile.user.date_of_birth,
        staffRole=profile.user.staff_role,
        designation=profile.designation,
        department=profile.department,
        propertyId=profile.property_id,
        propertyName=profile.property.name,
        baseMonthlySalary=profile.base_monthly_salary,
        joiningDate=profile.joining_date,
        isActive=profile.is_active,
        workedDays=attendance.worked_days if attendance else None,
        totalDays=total_days,
        payableSalary=(
            disbursement.payable_salary
            if disbursement and disbursement.payment_status == PaymentStatus.PAID
            else payable
        ),
        paymentStatus=disbursement.payment_status if disbursement else None,
        paymentMode=disbursement.payment_mode if disbursement else None,
        transactionReference=disbursement.transaction_reference if disbursement else None,
        paymentDate=disbursement.payment_date if disbursement else None,
    )


@staff_router.post(
    "/staff",
    response_model=StaffCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a staff account and profile",
)
def create_staff(
    payload: StaffCreateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    email = str(payload.email).strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise ConflictError("An account with this email already exists", code="EMAIL_IN_USE")
    if db.scalar(select(User.id).where(User.phone == payload.phone)):
        raise ConflictError("An account with this phone number already exists", code="PHONE_IN_USE")
    if payload.property_id not in property_scope:
        raise NotFoundError("Property not found")
    prop = db.scalar(
        select(Property).where(
            Property.id == payload.property_id,
            Property.is_deleted.is_(False),
        )
    )
    if not prop:
        raise NotFoundError("Property not found")

    encrypted_id, id_last4, id_lookup_hash = process_id_document(payload.id_document_number)
    joining_date = payload.joining_date
    if joining_date.tzinfo is None:
        joining_date = joining_date.replace(tzinfo=timezone.utc)
    user = User(
        email=email,
        full_name=payload.full_name,
        phone=payload.phone,
        date_of_birth=payload.date_of_birth,
        id_document_type=payload.id_document_type,
        id_document_number_encrypted=encrypted_id,
        id_document_last4=id_last4,
        id_document_lookup_hash=id_lookup_hash,
        password_hash=hash_password(secrets.token_urlsafe(48)),
        role=Role.STAFF.value,
        staff_role=payload.staff_role.value,
        created_by_id=actor.id,
        status=UserStatus.PENDING_ACTIVATION.value,
    )
    db.add(user)
    db.flush()
    profile = StaffProfile(
        user_id=user.id,
        designation=payload.designation,
        department=payload.department,
        property_id=prop.id,
        base_monthly_salary=payload.base_monthly_salary,
        joining_date=joining_date,
        is_active=True,
    )
    db.add(profile)
    db.add(UserPropertyAccess(user_id=user.id, property_id=prop.id))

    raw_token, token_hash = generate_one_time_token()
    db.add(
        VerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type="ACTIVATION",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    activation_url = f"{settings.ADMIN_PANEL_URL.rstrip('/')}/?token={raw_token}"
    notifier.send_notification(
        db=db,
        channel="EMAIL",
        destination=user.email or "",
        subject="Invitation to Haven Stays",
        body=f"You have been invited to Haven Stays. Complete your account setup here: {activation_url}",
    )
    write_audit_log(
        db,
        action="STAFF_PROFILE_CREATED",
        actor_user_id=actor.id,
        target_user_id=user.id,
        property_id=prop.id,
        details={
            "designation": profile.designation,
            "department": profile.department,
            "baseMonthlySalary": str(profile.base_monthly_salary),
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(profile)
    return StaffCreateResponse(
        **_staff_response(profile, date.today().year, date.today().month, 1, None, None).model_dump(),
        activationUrl=activation_url,
    )


@staff_router.get(
    "/staff",
    response_model=StaffListResponse,
    summary="List staff profiles and monthly attendance/payroll",
)
def list_staff(
    property_id: str | None = Query(default=None, alias="propertyId", min_length=1, max_length=36),
    year: int | None = Query(default=None, ge=2000, le=9999),
    month: int | None = Query(default=None, ge=1, le=12),
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    if (year is None) != (month is None):
        raise BadRequestError("Provide both year and month, or neither")
    now = datetime.now(timezone.utc)
    selected_year = year or now.year
    selected_month = month or now.month
    total_days = calendar.monthrange(selected_year, selected_month)[1]
    if property_id and property_id not in property_scope:
        raise NotFoundError("Property not found")

    query = (
        select(StaffProfile)
        .options(joinedload(StaffProfile.user), joinedload(StaffProfile.property))
        .where(
            StaffProfile.property_id == property_id
            if property_id
            else StaffProfile.property_id.in_(property_scope)
        )
        .order_by(StaffProfile.department, StaffProfile.designation, StaffProfile.id)
    )
    profiles = db.scalars(query).unique().all()
    profile_ids = [profile.id for profile in profiles]
    attendance_rows = (
        db.scalars(
            select(StaffAttendance).where(
                StaffAttendance.staff_id.in_(profile_ids),
                StaffAttendance.year == selected_year,
                StaffAttendance.month == selected_month,
            )
        ).all()
        if profile_ids
        else []
    )
    payroll_rows = (
        db.scalars(
            select(StaffSalaryDisbursement).where(
                StaffSalaryDisbursement.staff_id.in_(profile_ids),
                StaffSalaryDisbursement.year == selected_year,
                StaffSalaryDisbursement.month == selected_month,
            )
        ).all()
        if profile_ids
        else []
    )
    attendance_by_staff = {row.staff_id: row for row in attendance_rows}
    payroll_by_staff = {row.staff_id: row for row in payroll_rows}
    return StaffListResponse(
        items=[
            _staff_response(
                profile,
                selected_year,
                selected_month,
                total_days,
                attendance_by_staff.get(profile.id),
                payroll_by_staff.get(profile.id),
            )
            for profile in profiles
        ],
        total=len(profiles),
        year=selected_year,
        month=selected_month,
    )


@staff_router.put(
    "/staff/{staff_id}",
    response_model=StaffItem,
    summary="Update a staff profile",
)
def update_staff(
    staff_id: str,
    payload: StaffUpdateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    profile = _get_scoped_staff(db, staff_id, property_scope, for_update=True)
    fields = payload.model_fields_set
    if "designation" in fields and payload.designation is not None:
        profile.designation = payload.designation
    if "department" in fields and payload.department is not None:
        profile.department = payload.department
    if "base_monthly_salary" in fields and payload.base_monthly_salary is not None:
        profile.base_monthly_salary = payload.base_monthly_salary
    if "is_active" in fields and payload.is_active is not None:
        profile.is_active = payload.is_active
        if payload.is_active is False and profile.user.status == UserStatus.ACTIVE.value:
            profile.user.status = UserStatus.SUSPENDED.value
            revoke_all_user_sessions(db, profile.user_id, reason="STAFF_PROFILE_DEACTIVATED")
        elif payload.is_active is True and profile.user.status == UserStatus.SUSPENDED.value:
            profile.user.status = UserStatus.ACTIVE.value

    write_audit_log(
        db,
        action="STAFF_PROFILE_UPDATED",
        actor_user_id=actor.id,
        target_user_id=profile.user_id,
        property_id=profile.property_id,
        details={key: str(value) for key, value in payload.model_dump(exclude_unset=True).items()},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(profile)
    now = datetime.now(timezone.utc)
    return _staff_response(
        profile,
        now.year,
        now.month,
        calendar.monthrange(now.year, now.month)[1],
        None,
        None,
    )


@staff_router.post(
    "/staff/{staff_id}/attendance",
    response_model=AttendanceResponse,
    summary="Record monthly staff attendance",
)
def record_attendance(
    staff_id: str,
    payload: AttendanceRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    profile = _get_scoped_staff(db, staff_id, property_scope, for_update=True)
    total_days = calendar.monthrange(payload.year, payload.month)[1]
    if payload.worked_days > total_days:
        raise BadRequestError(
            f"Worked days cannot exceed {total_days} for {payload.year}-{payload.month:02d}",
            code="WORKED_DAYS_EXCEED_MONTH",
        )
    attendance = db.scalar(
        select(StaffAttendance)
        .where(
            StaffAttendance.staff_id == profile.id,
            StaffAttendance.year == payload.year,
            StaffAttendance.month == payload.month,
        )
        .with_for_update()
    )
    if attendance:
        attendance.worked_days = payload.worked_days
    else:
        attendance = StaffAttendance(
            staff_id=profile.id,
            year=payload.year,
            month=payload.month,
            worked_days=payload.worked_days,
        )
        db.add(attendance)
    write_audit_log(
        db,
        action="STAFF_ATTENDANCE_RECORDED",
        actor_user_id=actor.id,
        target_user_id=profile.user_id,
        property_id=profile.property_id,
        details={
            "year": payload.year,
            "month": payload.month,
            "workedDays": payload.worked_days,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(attendance)
    return AttendanceResponse(
        id=attendance.id,
        staffId=attendance.staff_id,
        year=attendance.year,
        month=attendance.month,
        workedDays=attendance.worked_days,
        totalDays=total_days,
        payableSalary=_salary(profile.base_monthly_salary, attendance.worked_days, total_days),
    )


@staff_router.post(
    "/payroll/disburse",
    response_model=DisbursementResponse,
    summary="Calculate and record staff salary disbursement",
)
def disburse_salary(
    payload: DisbursementRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    profile = _get_scoped_staff(db, payload.staff_id, property_scope, for_update=True)
    attendance = db.scalar(
        select(StaffAttendance)
        .where(
            StaffAttendance.staff_id == profile.id,
            StaffAttendance.year == payload.year,
            StaffAttendance.month == payload.month,
        )
        .with_for_update()
    )
    if not attendance:
        raise BadRequestError("Record attendance before calculating payroll", code="ATTENDANCE_REQUIRED")
    total_days = calendar.monthrange(payload.year, payload.month)[1]
    payable_salary = _salary(profile.base_monthly_salary, attendance.worked_days, total_days)
    payment_mode = payload.payment_mode
    transaction_reference = (
        payload.transaction_reference.strip() if payload.transaction_reference else None
    )
    if payload.payment_status == PaymentStatus.PAID:
        if payment_mode is None:
            raise BadRequestError("Select a payment mode to mark salary as paid")
    elif payment_mode is not None or transaction_reference is not None:
        raise BadRequestError("Payment details can only be recorded for a paid disbursement")

    disbursement = db.scalar(
        select(StaffSalaryDisbursement)
        .where(
            StaffSalaryDisbursement.staff_id == profile.id,
            StaffSalaryDisbursement.year == payload.year,
            StaffSalaryDisbursement.month == payload.month,
        )
        .with_for_update()
    )
    if disbursement and disbursement.payment_status == PaymentStatus.PAID:
        raise ConflictError("This month's salary has already been paid", code="SALARY_ALREADY_PAID")
    if not disbursement:
        disbursement = StaffSalaryDisbursement(
            staff_id=profile.id,
            year=payload.year,
            month=payload.month,
            payable_salary=payable_salary,
            payment_status=PaymentStatus.PENDING,
        )
        db.add(disbursement)
    disbursement.payable_salary = payable_salary
    disbursement.payment_status = payload.payment_status
    disbursement.payment_mode = payment_mode
    disbursement.transaction_reference = transaction_reference
    disbursement.payment_date = (
        datetime.now(timezone.utc)
        if payload.payment_status == PaymentStatus.PAID
        else None
    )
    write_audit_log(
        db,
        action="STAFF_SALARY_DISBURSED" if payload.payment_status == PaymentStatus.PAID else "STAFF_PAYROLL_CALCULATED",
        actor_user_id=actor.id,
        target_user_id=profile.user_id,
        property_id=profile.property_id,
        details={
            "year": payload.year,
            "month": payload.month,
            "workedDays": attendance.worked_days,
            "payableSalary": str(payable_salary),
            "paymentStatus": payload.payment_status.value,
            "paymentMode": payment_mode.value if payment_mode else None,
            "transactionReference": transaction_reference,
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(disbursement)
    return DisbursementResponse(
        id=disbursement.id,
        staffId=disbursement.staff_id,
        year=disbursement.year,
        month=disbursement.month,
        payableSalary=disbursement.payable_salary,
        paymentStatus=disbursement.payment_status,
        paymentMode=disbursement.payment_mode,
        transactionReference=disbursement.transaction_reference,
        paymentDate=disbursement.payment_date,
    )
