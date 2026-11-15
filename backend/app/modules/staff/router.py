import calendar
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import Role, UserStatus
from app.db.models import (
    PaymentMode,
    PaymentStatus,
    Property,
    StaffAdvance,
    StaffAttendance,
    StaffProfile,
    StaffSalaryDisbursement,
    User,
    UserPropertyAccess,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_property_scope

staff_router = APIRouter(tags=["Staff & Payroll"])


class StaffAssignmentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    user_id: str = Field(alias="userId", min_length=1, max_length=36)
    base_monthly_salary: Decimal = Field(
        alias="baseMonthlySalary", gt=0, max_digits=10, decimal_places=2
    )


class StaffAssignmentItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId", min_length=1, max_length=36)
    base_monthly_salary: Decimal = Field(
        alias="baseMonthlySalary", gt=0, max_digits=10, decimal_places=2
    )


class StaffSalaryUpdateItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    staff_id: str = Field(alias="staffId", min_length=1, max_length=36)
    base_monthly_salary: Decimal = Field(
        alias="baseMonthlySalary", gt=0, max_digits=10, decimal_places=2
    )


class StaffAdvanceIssueItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    staff_id: str = Field(alias="staffId", min_length=1, max_length=36)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class StaffAssignmentBatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assignments: list[StaffAssignmentItem] = Field(default_factory=list, max_length=100)
    salary_updates: list[StaffSalaryUpdateItem] = Field(
        default_factory=list, alias="salaryUpdates", max_length=100
    )
    advance_issues: list[StaffAdvanceIssueItem] = Field(
        default_factory=list, alias="advanceIssues", max_length=100
    )


class AttendanceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    year: int = Field(ge=2000, le=9999)
    month: int = Field(ge=1, le=12)
    worked_days: int = Field(alias="workedDays", ge=0)


class StaffAttendanceBatchItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    staff_id: str = Field(alias="staffId", min_length=1, max_length=36)
    worked_days: int = Field(alias="workedDays", ge=0)


class StaffAttendanceBatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    year: int = Field(ge=2000, le=9999)
    month: int = Field(ge=1, le=12)
    items: list[StaffAttendanceBatchItem] = Field(min_length=1, max_length=100)


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
    advance_deduction: Decimal = Field(
        default=Decimal("0.00"),
        alias="advanceDeduction",
        ge=0,
        max_digits=10,
        decimal_places=2,
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
    assigned_property_names: list[str] = Field(
        default_factory=list, alias="assignedPropertyNames"
    )
    all_properties: bool = Field(default=False, alias="allProperties")
    base_monthly_salary: Decimal = Field(alias="baseMonthlySalary")
    joining_date: datetime = Field(alias="joiningDate")
    advance_balance: Decimal = Field(alias="advanceBalance")
    worked_days: int | None = Field(alias="workedDays")
    total_days: int = Field(alias="totalDays")
    payable_salary: Decimal | None = Field(alias="payableSalary")
    payment_status: PaymentStatus | None = Field(alias="paymentStatus")
    advance_deduction: Decimal = Field(alias="advanceDeduction")
    paid_amount: Decimal | None = Field(alias="paidAmount")
    payment_mode: PaymentMode | None = Field(alias="paymentMode")
    transaction_reference: str | None = Field(alias="transactionReference")
    payment_date: datetime | None = Field(alias="paymentDate")


class StaffListResponse(BaseModel):
    items: list[StaffItem]
    total: int
    year: int
    month: int


class EligibleStaffUser(BaseModel):
    id: str
    full_name: str = Field(alias="fullName")
    email: str | None
    phone: str | None
    role: str
    staff_role: str | None = Field(alias="staffRole")

    model_config = ConfigDict(populate_by_name=True)


class EligibleStaffUsersResponse(BaseModel):
    items: list[EligibleStaffUser]
    total: int


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
    advance_deduction: Decimal = Field(alias="advanceDeduction")
    advance_balance: Decimal = Field(alias="advanceBalance")
    paid_amount: Decimal | None = Field(alias="paidAmount")
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


def _advance_balances(db: Session, staff_ids: list[str]) -> dict[str, Decimal]:
    if not staff_ids:
        return {}
    issued = db.execute(
        select(StaffAdvance.staff_id, func.sum(StaffAdvance.amount))
        .where(StaffAdvance.staff_id.in_(staff_ids))
        .group_by(StaffAdvance.staff_id)
    ).all()
    deducted = db.execute(
        select(StaffSalaryDisbursement.staff_id, func.sum(StaffSalaryDisbursement.advance_deduction))
        .where(
            StaffSalaryDisbursement.staff_id.in_(staff_ids),
            StaffSalaryDisbursement.payment_status == PaymentStatus.PAID,
        )
        .group_by(StaffSalaryDisbursement.staff_id)
    ).all()
    issued_by_staff = {staff_id: amount for staff_id, amount in issued}
    deducted_by_staff = {staff_id: amount for staff_id, amount in deducted}
    return {
        staff_id: issued_by_staff.get(staff_id, Decimal("0.00"))
        - deducted_by_staff.get(staff_id, Decimal("0.00"))
        for staff_id in staff_ids
    }


def _staff_response(
    profile: StaffProfile,
    year: int,
    month: int,
    total_days: int,
    attendance: StaffAttendance | None,
    disbursement: StaffSalaryDisbursement | None,
    assigned_property_names: list[str],
    all_properties: bool,
    advance_balance: Decimal = Decimal("0.00"),
) -> StaffItem:
    payable = (
        disbursement.payable_salary
        if disbursement
        else (
            _salary(profile.base_monthly_salary, attendance.worked_days, total_days)
            if attendance
            else None
        )
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
        assignedPropertyNames=assigned_property_names,
        allProperties=all_properties,
        baseMonthlySalary=profile.base_monthly_salary,
        joiningDate=profile.joining_date,
        advanceBalance=advance_balance,
        workedDays=attendance.worked_days if attendance else None,
        totalDays=total_days,
        payableSalary=payable,
        paymentStatus=disbursement.payment_status if disbursement else None,
        advanceDeduction=disbursement.advance_deduction if disbursement else Decimal("0.00"),
        paidAmount=disbursement.paid_amount if disbursement else None,
        paymentMode=disbursement.payment_mode if disbursement else None,
        transactionReference=disbursement.transaction_reference if disbursement else None,
        paymentDate=disbursement.payment_date if disbursement else None,
    )


def _assigned_property_details(
    db: Session,
    profiles: list[StaffProfile],
) -> dict[str, tuple[list[str], bool]]:
    if not profiles:
        return {}
    user_ids = [profile.user_id for profile in profiles]
    properties = db.scalars(
        select(Property)
        .where(Property.is_deleted.is_(False))
        .order_by(Property.name, Property.id)
    ).all()
    property_names = {prop.id: prop.name for prop in properties}
    all_property_ids = set(property_names)
    access_rows = db.execute(
        select(UserPropertyAccess.user_id, UserPropertyAccess.property_id)
        .where(
            UserPropertyAccess.user_id.in_(user_ids),
            UserPropertyAccess.property_id.in_(all_property_ids),
        )
    ).all()
    assigned_ids_by_user: dict[str, set[str]] = {}
    for user_id, property_id in access_rows:
        assigned_ids_by_user.setdefault(user_id, set()).add(property_id)

    details = {}
    for profile in profiles:
        assigned_ids = assigned_ids_by_user.get(profile.user_id, set()).copy()
        if profile.property_id in property_names:
            assigned_ids.add(profile.property_id)
        is_admin = profile.user.role == Role.ADMIN.value
        if is_admin:
            assigned_ids = all_property_ids
        assigned_names = [
            property_names[property_id]
            for property_id in sorted(
                assigned_ids,
                key=lambda property_id: (property_names.get(property_id, "").casefold(), property_id),
            )
            if property_id in property_names
        ]
        all_assigned = is_admin or (
            bool(all_property_ids) and all_property_ids.issubset(assigned_ids)
        )
        if not assigned_names and profile.property.name:
            assigned_names = [profile.property.name]
        details[profile.user_id] = (assigned_names, all_assigned)
    return details


@staff_router.get(
    "/staff/eligible-users",
    response_model=EligibleStaffUsersResponse,
    summary="List existing staff and admin accounts without payroll profiles",
)
def list_eligible_staff_users(
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    has_profile = select(StaffProfile.id).where(StaffProfile.user_id == User.id).exists()
    has_scoped_property = (
        select(UserPropertyAccess.id)
        .where(
            UserPropertyAccess.user_id == User.id,
            UserPropertyAccess.property_id.in_(property_scope),
        )
        .exists()
    )
    has_no_properties = (
        ~select(UserPropertyAccess.id)
        .where(UserPropertyAccess.user_id == User.id)
        .exists()
    )
    users = db.scalars(
        select(User)
        .where(
            User.role.in_((Role.STAFF.value, Role.ADMIN.value)),
            User.status != UserStatus.ARCHIVED.value,
            ~has_profile,
            or_(
                User.role == Role.ADMIN.value,
                has_scoped_property,
                has_no_properties,
            ),
        )
        .order_by(User.full_name, User.id)
    ).all()
    return EligibleStaffUsersResponse(
        items=[
            EligibleStaffUser(
                id=user.id,
                fullName=user.full_name or "",
                email=user.email,
                phone=user.phone,
                role=user.role,
                staffRole=user.staff_role,
            )
            for user in users
        ],
        total=len(users),
    )


def _assign_salary_profile(
    db: Session,
    user: User,
    base_monthly_salary: Decimal,
    property_scope: set[str],
    actor: User,
    request: Request,
) -> StaffProfile:
    if user.status == UserStatus.ARCHIVED.value:
        raise NotFoundError("User account not found")
    if user.role not in (Role.STAFF.value, Role.ADMIN.value):
        raise BadRequestError("Only staff and administrator accounts can be assigned to payroll")
    if user.staff_profile:
        raise ConflictError("This account already has a payroll profile", code="PAYROLL_PROFILE_EXISTS")

    property_id = None
    if user.role == Role.STAFF.value:
        property_id = db.scalar(
            select(UserPropertyAccess.property_id)
            .where(
                UserPropertyAccess.user_id == user.id,
                UserPropertyAccess.property_id.in_(property_scope),
            )
            .order_by(UserPropertyAccess.property_id)
            .limit(1)
        )
    property_id = property_id or sorted(property_scope)[0]
    prop = db.scalar(
        select(Property).where(
            Property.id == property_id,
            Property.is_deleted.is_(False),
        )
    )
    if not prop:
        raise NotFoundError("Property not found")

    is_staff = user.role == Role.STAFF.value
    if is_staff:
        designation = (
            user.staff_role.replace("_", " ").title() if user.staff_role else "Staff"
        )
        department = "Staff"
    else:
        designation = "Administrator"
        department = "Administration"
    profile = StaffProfile(
        user_id=user.id,
        designation=designation,
        department=department,
        property_id=prop.id,
        base_monthly_salary=base_monthly_salary,
        joining_date=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(profile)
    if is_staff and not db.scalar(
        select(UserPropertyAccess.id).where(
            UserPropertyAccess.user_id == user.id,
            UserPropertyAccess.property_id == prop.id,
        )
    ):
        db.add(UserPropertyAccess(user_id=user.id, property_id=prop.id))
    db.flush()
    write_audit_log(
        db,
        action="STAFF_PAYROLL_PROFILE_ASSIGNED",
        actor_user_id=actor.id,
        target_user_id=user.id,
        property_id=prop.id,
        details={
            "designation": profile.designation,
            "department": profile.department,
            "joiningDate": profile.joining_date.isoformat(),
            "baseMonthlySalary": str(profile.base_monthly_salary),
        },
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return profile


@staff_router.post(
    "/staff/assign",
    response_model=StaffItem,
    status_code=status.HTTP_201_CREATED,
    summary="Assign an existing staff or admin account to payroll",
)
def assign_staff_salary(
    payload: StaffAssignmentRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    if not property_scope:
        raise NotFoundError("Property not found")

    user = db.scalar(select(User).where(User.id == payload.user_id).with_for_update())
    if not user:
        raise NotFoundError("User account not found")
    profile = _assign_salary_profile(
        db,
        user,
        payload.base_monthly_salary,
        property_scope,
        actor,
        request,
    )
    db.commit()
    db.refresh(profile)
    assigned_properties = _assigned_property_details(db, [profile])[profile.user_id]
    now = datetime.now(timezone.utc)
    return _staff_response(
        profile,
        now.year,
        now.month,
        calendar.monthrange(now.year, now.month)[1],
        None,
        None,
        *assigned_properties,
    )


@staff_router.post(
    "/staff/assign/bulk",
    response_model=list[StaffItem],
    status_code=status.HTTP_201_CREATED,
    summary="Assign payroll profiles, update salaries, or issue staff advances",
)
def assign_staff_salaries(
    payload: StaffAssignmentBatchRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    if not property_scope:
        raise NotFoundError("Property not found")
    user_ids = [assignment.user_id for assignment in payload.assignments]
    salary_staff_ids = [salary_update.staff_id for salary_update in payload.salary_updates]
    advance_staff_ids = [advance.staff_id for advance in payload.advance_issues]
    staff_ids = list(dict.fromkeys([*salary_staff_ids, *advance_staff_ids]))
    if not user_ids and not staff_ids:
        raise BadRequestError("Select accounts, salary updates, or advances to apply")
    if len(user_ids) != len(set(user_ids)):
        raise BadRequestError(
            "Select each account only once",
            code="DUPLICATE_STAFF_ASSIGNMENT",
        )
    if len(salary_staff_ids) != len(set(salary_staff_ids)):
        raise BadRequestError(
            "Select each assigned staff member only once",
            code="DUPLICATE_STAFF_SALARY_UPDATE",
        )
    if len(advance_staff_ids) != len(set(advance_staff_ids)):
        raise BadRequestError(
            "Issue at most one advance per staff member per request",
            code="DUPLICATE_STAFF_ADVANCE",
        )

    users_by_id = {}
    if user_ids:
        users = db.scalars(
            select(User)
            .where(User.id.in_(user_ids))
            .order_by(User.id)
            .with_for_update()
        ).all()
        users_by_id = {user.id: user for user in users}
    for assignment in payload.assignments:
        user = users_by_id.get(assignment.user_id)
        if not user:
            raise NotFoundError("User account not found")
        if user.status == UserStatus.ARCHIVED.value:
            raise NotFoundError("User account not found")
        if user.role not in (Role.STAFF.value, Role.ADMIN.value):
            raise BadRequestError(
                "Only staff and administrator accounts can be assigned to payroll"
            )
        if user.staff_profile:
            raise ConflictError(
                "This account already has a payroll profile",
                code="PAYROLL_PROFILE_EXISTS",
            )

    profiles_by_id = {}
    if staff_ids:
        profiles = db.scalars(
            select(StaffProfile)
            .where(
                StaffProfile.id.in_(staff_ids),
                StaffProfile.property_id.in_(property_scope),
            )
            .order_by(StaffProfile.id)
            .with_for_update()
        ).all()
        profiles_by_id = {profile.id: profile for profile in profiles}
        if len(profiles_by_id) != len(staff_ids):
            raise NotFoundError("Staff profile not found")

    changed_profiles = []
    for salary_update in payload.salary_updates:
        profile = profiles_by_id[salary_update.staff_id]
        previous_salary = profile.base_monthly_salary
        profile.base_monthly_salary = salary_update.base_monthly_salary
        write_audit_log(
            db,
            action="STAFF_BASE_SALARY_UPDATED",
            actor_user_id=actor.id,
            target_user_id=profile.user_id,
            property_id=profile.property_id,
            details={
                "previousBaseMonthlySalary": str(previous_salary),
                "baseMonthlySalary": str(salary_update.base_monthly_salary),
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        changed_profiles.append(profile)

    new_profiles = []
    for assignment in payload.assignments:
        user = users_by_id[assignment.user_id]
        new_profiles.append(
            _assign_salary_profile(
                db,
                user,
                assignment.base_monthly_salary,
                property_scope,
                actor,
                request,
            )
        )

    affected_profile_ids = {profile.id for profile in changed_profiles}
    for advance_issue in payload.advance_issues:
        profile = profiles_by_id[advance_issue.staff_id]
        db.add(
            StaffAdvance(
                staff_id=profile.id,
                amount=advance_issue.amount,
                created_by_user_id=actor.id,
            )
        )
        write_audit_log(
            db,
            action="STAFF_ADVANCE_ISSUED",
            actor_user_id=actor.id,
            target_user_id=profile.user_id,
            property_id=profile.property_id,
            details={"amount": str(advance_issue.amount)},
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        if profile.id not in affected_profile_ids:
            changed_profiles.append(profile)
            affected_profile_ids.add(profile.id)

    profiles = list(
        {
            profile.id: profile
            for profile in [*changed_profiles, *new_profiles]
        }.values()
    )
    db.commit()
    now = datetime.now(timezone.utc)
    total_days = calendar.monthrange(now.year, now.month)[1]
    for profile in profiles:
        db.refresh(profile)
    assigned_properties = _assigned_property_details(db, profiles)
    advance_balances = _advance_balances(db, [profile.id for profile in profiles])
    return [
        _staff_response(
            profile,
            now.year,
            now.month,
            total_days,
            None,
            None,
            *assigned_properties[profile.user_id],
            advance_balance=advance_balances[profile.id],
        )
        for profile in profiles
    ]


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
    next_month = selected_month % 12 + 1
    next_month_year = selected_year + selected_month // 12
    next_month_start = datetime(
        next_month_year,
        next_month,
        1,
        tzinfo=timezone.utc,
    )
    if property_id and property_id not in property_scope:
        raise NotFoundError("Property not found")

    query = (
        select(StaffProfile)
        .options(joinedload(StaffProfile.user), joinedload(StaffProfile.property))
        .where(
            StaffProfile.property_id == property_id
            if property_id
            else StaffProfile.property_id.in_(property_scope),
            StaffProfile.joining_date < next_month_start,
        )
        .order_by(StaffProfile.department, StaffProfile.designation, StaffProfile.id)
    )
    profiles = db.scalars(query).unique().all()
    assigned_properties = _assigned_property_details(db, profiles)
    profile_ids = [profile.id for profile in profiles]
    advance_balances = _advance_balances(db, profile_ids)
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
                *assigned_properties[profile.user_id],
                advance_balance=advance_balances[profile.id],
            )
            for profile in profiles
        ],
        total=len(profiles),
        year=selected_year,
        month=selected_month,
    )


@staff_router.post(
    "/staff/attendance/bulk",
    response_model=list[AttendanceResponse],
    summary="Record attendance and calculate payroll for multiple staff",
)
def record_attendance_bulk(
    payload: StaffAttendanceBatchRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    property_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    _require_admin(actor)
    if not property_scope:
        raise NotFoundError("Property not found")
    staff_ids = [item.staff_id for item in payload.items]
    if len(staff_ids) != len(set(staff_ids)):
        raise BadRequestError(
            "Select each staff member only once",
            code="DUPLICATE_STAFF_ATTENDANCE",
        )

    total_days = calendar.monthrange(payload.year, payload.month)[1]
    if any(item.worked_days > total_days for item in payload.items):
        raise BadRequestError(
            f"Worked days cannot exceed {total_days} for {payload.year}-{payload.month:02d}",
            code="WORKED_DAYS_EXCEED_MONTH",
        )

    profiles = db.scalars(
        select(StaffProfile)
        .where(
            StaffProfile.id.in_(staff_ids),
            StaffProfile.property_id.in_(property_scope),
        )
        .order_by(StaffProfile.id)
        .with_for_update()
    ).all()
    profiles_by_id = {profile.id: profile for profile in profiles}
    if len(profiles_by_id) != len(staff_ids):
        raise NotFoundError("Staff profile not found")

    attendance_rows = db.scalars(
        select(StaffAttendance)
        .where(
            StaffAttendance.staff_id.in_(staff_ids),
            StaffAttendance.year == payload.year,
            StaffAttendance.month == payload.month,
        )
        .with_for_update()
    ).all()
    attendance_by_staff = {attendance.staff_id: attendance for attendance in attendance_rows}
    disbursement_rows = db.scalars(
        select(StaffSalaryDisbursement)
        .where(
            StaffSalaryDisbursement.staff_id.in_(staff_ids),
            StaffSalaryDisbursement.year == payload.year,
            StaffSalaryDisbursement.month == payload.month,
        )
        .with_for_update()
    ).all()
    disbursement_by_staff = {
        disbursement.staff_id: disbursement for disbursement in disbursement_rows
    }
    if any(
        disbursement.payment_status == PaymentStatus.PAID
        for disbursement in disbursement_rows
    ):
        raise ConflictError(
            "This month's salary has already been paid",
            code="SALARY_ALREADY_PAID",
        )

    responses = []
    for item in payload.items:
        profile = profiles_by_id[item.staff_id]
        attendance = attendance_by_staff.get(profile.id)
        if attendance:
            attendance.worked_days = item.worked_days
        else:
            attendance = StaffAttendance(
                staff_id=profile.id,
                year=payload.year,
                month=payload.month,
                worked_days=item.worked_days,
            )
            db.add(attendance)

        payable_salary = _salary(profile.base_monthly_salary, item.worked_days, total_days)
        disbursement = disbursement_by_staff.get(profile.id)
        if disbursement:
            disbursement.payable_salary = payable_salary
            disbursement.payment_status = PaymentStatus.PENDING
            disbursement.payment_mode = None
            disbursement.transaction_reference = None
            disbursement.payment_date = None
        else:
            db.add(
                StaffSalaryDisbursement(
                    staff_id=profile.id,
                    year=payload.year,
                    month=payload.month,
                    payable_salary=payable_salary,
                    payment_status=PaymentStatus.PENDING,
                )
            )

        write_audit_log(
            db,
            action="STAFF_ATTENDANCE_RECORDED",
            actor_user_id=actor.id,
            target_user_id=profile.user_id,
            property_id=profile.property_id,
            details={
                "year": payload.year,
                "month": payload.month,
                "workedDays": item.worked_days,
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        write_audit_log(
            db,
            action="STAFF_PAYROLL_CALCULATED",
            actor_user_id=actor.id,
            target_user_id=profile.user_id,
            property_id=profile.property_id,
            details={
                "year": payload.year,
                "month": payload.month,
                "workedDays": item.worked_days,
                "payableSalary": str(payable_salary),
                "paymentStatus": PaymentStatus.PENDING.value,
                "paymentMode": None,
                "transactionReference": None,
            },
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        responses.append((attendance, payable_salary))

    db.flush()
    result = [
        AttendanceResponse(
            id=attendance.id,
            staffId=attendance.staff_id,
            year=attendance.year,
            month=attendance.month,
            workedDays=attendance.worked_days,
            totalDays=total_days,
            payableSalary=payable_salary,
        )
        for attendance, payable_salary in responses
    ]
    db.commit()
    return result


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
    payable_salary = (
        disbursement.payable_salary
        if disbursement
        else _salary(profile.base_monthly_salary, attendance.worked_days, total_days)
    )
    advance_balance = _advance_balances(db, [profile.id])[profile.id]
    advance_deduction = payload.advance_deduction
    if payload.payment_status != PaymentStatus.PAID and advance_deduction:
        raise BadRequestError("Advance deductions can only be applied when marking salary as paid")
    if advance_deduction > advance_balance:
        raise BadRequestError(
            "Advance deduction cannot exceed the outstanding advance balance",
            code="ADVANCE_DEDUCTION_EXCEEDS_BALANCE",
        )
    if advance_deduction > payable_salary:
        raise BadRequestError(
            "Advance deduction cannot exceed the payable salary",
            code="ADVANCE_DEDUCTION_EXCEEDS_SALARY",
        )
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
    disbursement.advance_deduction = (
        advance_deduction if payload.payment_status == PaymentStatus.PAID else Decimal("0.00")
    )
    disbursement.paid_amount = (
        payable_salary - advance_deduction
        if payload.payment_status == PaymentStatus.PAID
        else None
    )
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
            "advanceDeduction": str(disbursement.advance_deduction),
            "paidAmount": str(disbursement.paid_amount) if disbursement.paid_amount is not None else None,
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
        advanceDeduction=disbursement.advance_deduction,
        advanceBalance=advance_balance - disbursement.advance_deduction,
        paidAmount=disbursement.paid_amount,
        paymentStatus=disbursement.payment_status,
        paymentMode=disbursement.payment_mode,
        transactionReference=disbursement.transaction_reference,
        paymentDate=disbursement.payment_date,
    )
