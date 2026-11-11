import secrets
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.crypto import process_id_document
from app.core.errors import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.permissions import (
    CustomerLinkSource,
    Role,
    UnitStatus,
)
from app.core.scoping import resolve_property_scope
from app.core.security import decode_access_token, hash_password
from app.db.models import (
    AssignmentStatus,
    BillingStrategy,
    ChannelOrigin,
    CustomerPersona,
    CustomerPropertyLink,
    PaymentReceipt,
    Property,
    ReservationOccupant,
    ReservationRequest,
    ReservationStatus,
    StayRecord,
    Unit,
    UnitAssignment,
    User,
)
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.billing.service import ensure_deposit_escrow
from app.modules.inventory.service import BED_LEVEL_TYPES
from app.modules.reservations.schemas import (
    AvailableReservationUnit,
    ReservationConversionResponse,
    ReservationConvertRequest,
    ReservationCreateRequest,
    ReservationListResponse,
    ReservationOccupantPayload,
    ReservationResponse,
    ReservationStatusRequest,
)

reservations_router = APIRouter(prefix="/reservations", tags=["Reservations"])


def _reservation_response(reservation: ReservationRequest) -> ReservationResponse:
    return ReservationResponse(
        id=reservation.id,
        requestCode=reservation.request_code,
        propertyId=reservation.property_id,
        primaryUserId=reservation.primary_user_id,
        guestName=reservation.guest_name,
        mobile=reservation.mobile,
        email=reservation.email,
        requestedCategory=reservation.requested_category,
        requestedType=reservation.requested_type,
        requestedSharingType=reservation.requested_sharing_type,
        requestedQuantity=reservation.requested_quantity,
        numberOfAdults=reservation.number_of_adults,
        numberOfChildren=reservation.number_of_children,
        expectedCheckIn=reservation.expected_check_in,
        expectedCheckOut=reservation.expected_check_out,
        channelOrigin=reservation.channel_origin,
        status=reservation.status,
        rejectionReason=reservation.rejection_reason,
        convertedAt=reservation.converted_at,
        createdAt=reservation.created_at,
        updatedAt=reservation.updated_at,
    )


def _require_front_desk_or_admin(actor: User) -> None:
    if actor.role == Role.ADMIN:
        return
    if actor.role != Role.STAFF or actor.staff_role != "FRONT_DESK":
        raise ForbiddenError("Only front-desk staff or admins can manage reservations")


def _optional_reservation_user(request: Request, db: Session) -> User | None:
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header", code="AUTH_REQUIRED")
    try:
        payload = decode_access_token(
            authorization[7:].strip(), expected_audience=["admin", "customer"]
        )
    except UnauthorizedError:
        raise
    user_id = payload.get("sub")
    user = db.get(User, user_id) if user_id else None
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("User inactive or not found", code="USER_INACTIVE")
    if user.role not in (Role.ADMIN, Role.STAFF, Role.CUSTOMER):
        raise UnauthorizedError("User is not authorized", code="INVALID_ROLE")
    return user


def _make_request_code(db: Session) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    for _ in range(5):
        code = f"RES-{today}-{secrets.token_hex(2).upper()}"
        if not db.scalar(
            select(ReservationRequest.id).where(ReservationRequest.request_code == code)
        ):
            return code
    raise ConflictError("Unable to generate a unique reservation code; retry the request")


def _add_occupant(
    reservation: ReservationRequest,
    occupant: ReservationOccupantPayload,
) -> None:
    reservation.occupants.append(
        ReservationOccupant(
            is_primary=occupant.is_primary,
            first_name=occupant.first_name,
            last_name=occupant.last_name,
            age=occupant.age,
            gender=occupant.gender,
            email=str(occupant.email) if occupant.email else None,
            phone=occupant.phone,
            id_type=occupant.id_type,
            id_number_encrypted=process_id_document(occupant.id_number)[0],
        )
    )


@reservations_router.post("", response_model=ReservationResponse, status_code=201)
def create_reservation(
    payload: ReservationCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    actor = _optional_reservation_user(request, db)
    if actor and actor.role == Role.CUSTOMER and (
        not actor.id_document_type or not actor.id_document_number_encrypted
    ):
        raise ForbiddenError(
            "Add a government ID to your customer profile before booking",
            code="GOVERNMENT_ID_REQUIRED",
        )
    prop = db.scalar(
        select(Property).where(
            Property.id == payload.property_id,
            Property.is_deleted.is_(False),
            Property.status == "ACTIVE",
        )
    )
    if not prop:
        raise NotFoundError("Active property not found")
    if actor and actor.role in (Role.ADMIN, Role.STAFF):
        if actor.role == Role.STAFF and actor.staff_role != "FRONT_DESK":
            raise ForbiddenError("Only front-desk staff can enter reservations")
        if payload.property_id not in resolve_property_scope(
            db, actor, request.headers.get("X-Property-Id")
        ):
            raise NotFoundError("Property not found")
    primary_user_id = actor.id if actor and actor.role == Role.CUSTOMER else None
    reservation = ReservationRequest(
        request_code=_make_request_code(db),
        property_id=prop.id,
        primary_user_id=primary_user_id,
        guest_name=payload.guest_name,
        mobile=payload.mobile,
        email=str(payload.email) if payload.email else None,
        requested_category=payload.requested_category.value,
        requested_type=payload.requested_type.value,
        requested_sharing_type=(
            payload.requested_sharing_type.value
            if payload.requested_sharing_type
            else None
        ),
        requested_quantity=payload.requested_quantity,
        number_of_adults=payload.number_of_adults,
        number_of_children=payload.number_of_children,
        expected_check_in=payload.expected_check_in,
        expected_check_out=payload.expected_check_out,
        channel_origin=(
            payload.channel_origin.value
            if actor and actor.role in (Role.ADMIN, Role.STAFF)
            else ChannelOrigin.PUBLIC_WEB.value
        ),
        status=ReservationStatus.PENDING.value,
    )
    for occupant in payload.occupants:
        _add_occupant(reservation, occupant)
    db.add(reservation)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError("Reservation could not be saved; retry the request") from error
    db.refresh(reservation)
    return _reservation_response(reservation)


@reservations_router.get("", response_model=ReservationListResponse)
def list_reservations(
    property_id: str | None = Query(default=None, alias="propertyId"),
    statuses: str | None = Query(default=None, alias="status"),
    date_from: date | None = Query(default=None, alias="dateFrom"),
    date_to: date | None = Query(default=None, alias="dateTo"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    del actor
    filters = []
    if property_id:
        if property_id not in property_scope:
            raise NotFoundError("Property not found")
        filters.append(ReservationRequest.property_id == property_id)
    elif property_scope:
        filters.append(ReservationRequest.property_id.in_(property_scope))
    else:
        return ReservationListResponse(items=[], total=0, limit=limit, offset=offset)
    if statuses:
        parsed_statuses = {item.strip().upper() for item in statuses.split(",") if item.strip()}
        allowed_statuses = {status.value for status in ReservationStatus}
        if not parsed_statuses or not parsed_statuses.issubset(allowed_statuses):
            raise BadRequestError("One or more reservation statuses are invalid")
        filters.append(ReservationRequest.status.in_(parsed_statuses))
    if date_from and date_to and date_to < date_from:
        raise BadRequestError("dateTo must be on or after dateFrom")
    if date_from:
        filters.append(ReservationRequest.expected_check_in >= date_from)
    if date_to:
        filters.append(ReservationRequest.expected_check_in <= date_to)
    query = select(ReservationRequest).where(*filters)
    total = db.scalar(
        select(func.count(ReservationRequest.id)).where(*filters)
    ) or 0
    reservations = db.scalars(
        query.order_by(ReservationRequest.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return ReservationListResponse(
        items=[_reservation_response(item) for item in reservations],
        total=total,
        limit=limit,
        offset=offset,
    )


@reservations_router.patch("/{reservation_id}/status", response_model=ReservationResponse)
def update_reservation_status(
    reservation_id: str,
    payload: ReservationStatusRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    reservation = db.scalar(
        select(ReservationRequest)
        .where(ReservationRequest.id == reservation_id)
        .with_for_update()
    )
    if not reservation or reservation.property_id not in property_scope:
        raise NotFoundError("Reservation not found")
    transitions = {
        ReservationStatus.PENDING.value: {
            ReservationStatus.APPROVED.value,
            ReservationStatus.WAITLISTED.value,
            ReservationStatus.REJECTED.value,
            ReservationStatus.CANCELLED.value,
            ReservationStatus.NO_SHOW.value,
        },
        ReservationStatus.APPROVED.value: {
            ReservationStatus.REJECTED.value,
            ReservationStatus.CANCELLED.value,
            ReservationStatus.NO_SHOW.value,
        },
        ReservationStatus.WAITLISTED.value: {
            ReservationStatus.APPROVED.value,
            ReservationStatus.REJECTED.value,
            ReservationStatus.CANCELLED.value,
        },
    }
    new_status = payload.status.value
    if new_status not in transitions.get(reservation.status, set()):
        raise ConflictError(
            f"Cannot change reservation status from {reservation.status} to {new_status}"
        )
    if payload.status == ReservationStatus.REJECTED and not payload.rejection_reason:
        raise BadRequestError("A rejection reason is required", code="REJECTION_REASON_REQUIRED")
    reservation.status = new_status
    reservation.rejection_reason = (
        payload.rejection_reason if payload.status == ReservationStatus.REJECTED else None
    )
    db.commit()
    db.refresh(reservation)
    return _reservation_response(reservation)


@reservations_router.get(
    "/{reservation_id}/available-units",
    response_model=list[AvailableReservationUnit],
)
def list_available_reservation_units(
    reservation_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    del actor
    reservation = db.get(ReservationRequest, reservation_id)
    if not reservation or reservation.property_id not in property_scope:
        raise NotFoundError("Reservation not found")
    if reservation.status != ReservationStatus.APPROVED.value:
        raise ConflictError("Only approved reservations can be converted")
    units_query = (
        select(Unit)
        .where(
            Unit.property_id == reservation.property_id,
            Unit.category == reservation.requested_category,
            Unit.status == UnitStatus.AVAILABLE.value,
            Unit.is_active.is_(True),
            Unit.type == reservation.requested_type,
        )
        .order_by(Unit.floor, Unit.unit_number)
    )
    if reservation.requested_sharing_type:
        units_query = units_query.where(
            or_(
                Unit.sharing_type == reservation.requested_sharing_type,
                (
                    Unit.sharing_type.is_(None)
                    & Unit.parent_id.in_(
                        select(Unit.id).where(
                            Unit.sharing_type == reservation.requested_sharing_type
                        )
                    )
                ),
            )
        )
    units = db.scalars(units_query).all()
    return [
        AvailableReservationUnit(
            id=unit.id,
            propertyId=unit.property_id,
            unitNumber=unit.unit_number,
            type=unit.type,
            category=unit.category,
            sharingType=unit.sharing_type,
            capacity=unit.capacity,
            floor=unit.floor,
            defaultPricePerNight=unit.default_price_per_night,
            defaultRecurringMonthlyRate=unit.default_recurring_monthly_rate,
            depositAmount=unit.deposit_amount,
        )
        for unit in units
    ]


def _get_or_create_guest(
    db: Session,
    reservation: ReservationRequest,
) -> User:
    if reservation.primary_user_id:
        customer = db.get(User, reservation.primary_user_id)
        if (
            not customer
            or customer.role != Role.CUSTOMER
            or customer.status != "ACTIVE"
        ):
            raise ConflictError("Reservation's linked guest account is not active")
        return customer

    identity_filters = [User.phone == reservation.mobile]
    if reservation.email:
        identity_filters.append(User.email == reservation.email)
    matches = db.scalars(
        select(User).where(
            User.role == Role.CUSTOMER,
            or_(*identity_filters),
        )
    ).all()
    if matches:
        matching = next(
            (
                user
                for user in matches
                if user.email == reservation.email and user.phone == reservation.mobile
            ),
            None,
        )
        if matching is None:
            raise ConflictError(
                "Guest details match an existing account inconsistently; verify the guest account before conversion"
            )
        if matching.status != "ACTIVE":
            raise ConflictError("Matching guest account is not active")
        customer = matching
    else:
        customer = User(
            email=reservation.email,
            phone=reservation.mobile,
            full_name=reservation.guest_name,
            password_hash=hash_password(secrets.token_urlsafe(48)),
            role=Role.CUSTOMER.value,
            status="ACTIVE",
        )
        db.add(customer)
        db.flush()

    return customer


@reservations_router.post(
    "/{reservation_id}/convert",
    response_model=ReservationConversionResponse,
)
def convert_reservation(
    reservation_id: str,
    payload: ReservationConvertRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    reservation = db.scalar(
        select(ReservationRequest)
        .options(selectinload(ReservationRequest.occupants))
        .where(ReservationRequest.id == reservation_id)
        .with_for_update()
    )
    if not reservation or reservation.property_id not in property_scope:
        raise NotFoundError("Reservation not found")
    if reservation.status != ReservationStatus.APPROVED.value:
        raise ConflictError("Only approved reservations can be converted")
    prop = db.get(Property, reservation.property_id)
    if not prop:
        raise NotFoundError("Property not found")

    selected_unit_ids = [payload.unit_id, *payload.additional_unit_ids]
    if len(set(selected_unit_ids)) != len(selected_unit_ids):
        raise BadRequestError("A physical unit cannot be selected more than once")
    if len(selected_unit_ids) != reservation.requested_quantity:
        raise BadRequestError(
            f"Select exactly {reservation.requested_quantity} unit(s) for this reservation"
        )
    units_query = (
        select(Unit)
        .where(
            Unit.id.in_(selected_unit_ids),
            Unit.property_id == prop.id,
            Unit.category == reservation.requested_category,
            Unit.type == reservation.requested_type,
            Unit.status == UnitStatus.AVAILABLE.value,
            Unit.is_active.is_(True),
        )
        .order_by(Unit.id)
        .with_for_update()
    )
    if reservation.requested_sharing_type:
        units_query = units_query.where(
            or_(
                Unit.sharing_type == reservation.requested_sharing_type,
                (
                    Unit.sharing_type.is_(None)
                    & Unit.parent_id.in_(
                        select(Unit.id).where(
                            Unit.sharing_type == reservation.requested_sharing_type
                        )
                    )
                ),
            )
        )
    units = db.scalars(units_query).all()
    if len(units) != reservation.requested_quantity:
        raise ConflictError("One or more selected units are unavailable for this reservation")
    available_unit_ids = {unit.id for unit in units}
    if any(unit_id not in available_unit_ids for unit_id in selected_unit_ids):
        raise ConflictError("One or more selected units are unavailable for this reservation")

    hostel = prop.type in BED_LEVEL_TYPES
    billing_strategy = (
        BillingStrategy.RECURRING_MONTHLY.value
        if hostel
        else BillingStrategy.PER_NIGHT_STAY.value
    )
    if payload.agreed_rate is None and any(
        (
            unit.default_recurring_monthly_rate
            if hostel
            else unit.default_price_per_night
        )
        is None
        for unit in units
    ):
        raise BadRequestError(
            "Unit has no standard rate; provide an agreed rate",
            code="AGREED_RATE_REQUIRED",
        )
    standard_rates = [
        unit.default_recurring_monthly_rate
        if hostel
        else unit.default_price_per_night
        for unit in units
    ]
    if (
        payload.agreed_rate is not None
        and any(
            standard_rate is not None and payload.agreed_rate != standard_rate
            for standard_rate in standard_rates
        )
        and not (payload.rate_override_reason or "").strip()
    ):
        raise BadRequestError(
            "A rate override reason is required when the agreed rate differs from standard",
            code="RATE_OVERRIDE_REASON_REQUIRED",
        )
    customer = _get_or_create_guest(db, reservation)
    existing_link = db.scalar(
        select(CustomerPropertyLink.id).where(
            CustomerPropertyLink.user_id == customer.id,
            CustomerPropertyLink.property_id == prop.id,
        )
    )
    if not existing_link:
        db.add(
            CustomerPropertyLink(
                user_id=customer.id,
                property_id=prop.id,
                source=CustomerLinkSource.BOOKING.value,
            )
        )

    expected_check_in = datetime.combine(
        reservation.expected_check_in, time.min, tzinfo=timezone.utc
    )
    expected_check_out = (
        datetime.combine(reservation.expected_check_out, time.min, tzinfo=timezone.utc)
        if reservation.expected_check_out
        else None
    )
    notes = (
        f"Reservation {reservation.request_code}; initial deposit "
        f"{payload.initial_deposit:.2f}; payment confirmed "
        f"{'yes' if payload.payment_confirmed else 'no'}"
    )
    if payload.payment_reference:
        notes += f"; payment reference {payload.payment_reference}"
    # Conditional update ensures only one concurrent conversion can claim this unit.
    claimed = db.execute(
        update(Unit)
        .where(
            Unit.id.in_(selected_unit_ids),
            Unit.status == UnitStatus.AVAILABLE.value,
        )
        .values(status=UnitStatus.OCCUPIED.value)
    )
    if claimed.rowcount != reservation.requested_quantity:
        db.rollback()
        raise ConflictError("One or more selected units are no longer available")
    units_by_id = {unit.id: unit for unit in units}
    assignments = [
        UnitAssignment(
            unit_id=unit_id,
            user_id=customer.id,
            reservation_request_id=reservation.id,
            billing_strategy=billing_strategy,
            status=AssignmentStatus.CHECKED_IN.value,
            standard_rate=(
                units_by_id[unit_id].default_recurring_monthly_rate
                if hostel
                else units_by_id[unit_id].default_price_per_night
            ),
            rate_override_reason=(
                payload.rate_override_reason.strip()
                if payload.rate_override_reason
                and payload.rate_override_reason.strip()
                else None
            ),
            actor_id=actor.id,
            agreed_monthly_rate=payload.agreed_rate if hostel else None,
            agreed_price_per_night=payload.agreed_rate if not hostel else None,
            expected_check_in=expected_check_in,
            expected_check_out=expected_check_out,
            actual_check_in=datetime.now(timezone.utc),
            is_active=True,
            notes=(
                notes
                if index == 0
                else f"Reservation {reservation.request_code}; additional allocated unit"
            ),
        )
        for index, unit_id in enumerate(selected_unit_ids)
    ]
    db.add_all(assignments)

    if prop.type == "HOTEL":
        persona = CustomerPersona.HOTEL_GUEST.value
    elif billing_strategy == BillingStrategy.RECURRING_MONTHLY.value:
        persona = CustomerPersona.HOSTELER.value
    else:
        persona = CustomerPersona.HOSTEL_GUEST.value
    db.flush()
    escrows = [
        escrow
        for assignment in assignments
        if (escrow := ensure_deposit_escrow(db, prop, assignment)) is not None
    ]
    if escrows:
        required_deposit = sum(
            (escrow.amount for escrow in escrows), start=Decimal("0")
        )
        if payload.initial_deposit != required_deposit or not payload.payment_confirmed:
            raise BadRequestError(
                f"Collect the configured security deposit of {required_deposit:.2f} at check-in",
                code="SECURITY_DEPOSIT_REQUIRED",
            )
        if payload.payment_method is None:
            raise BadRequestError(
                "Select a payment method for the security deposit",
                code="DEPOSIT_PAYMENT_METHOD_REQUIRED",
            )
        db.flush()
        for escrow in escrows:
            escrow.collected_amount = escrow.amount
            escrow.status = "HELD"
            db.add(
                PaymentReceipt(
                    property_id=prop.id,
                    user_id=customer.id,
                    deposit_escrow_id=escrow.id,
                    amount=escrow.amount,
                    payment_method=payload.payment_method,
                    reference=payload.payment_reference,
                    received_by_user_id=actor.id,
                )
            )
    stays = [
        StayRecord(
            assignment_id=assignment.id,
            user_id=customer.id,
            property_id=prop.id,
            persona=persona,
            start_date=reservation.expected_check_in,
            end_date=reservation.expected_check_out,
            is_active=True,
        )
        for assignment in assignments
    ]
    db.add_all(stays)
    reservation.primary_user_id = customer.id
    reservation.status = ReservationStatus.CONVERTED.value
    reservation.converted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reservation)
    for stay in stays:
        db.refresh(stay)
    for assignment in assignments:
        db.refresh(assignment)
    return ReservationConversionResponse(
        reservation=_reservation_response(reservation),
        assignmentId=assignments[0].id,
        assignmentIds=[assignment.id for assignment in assignments],
        stayRecordId=stays[0].id,
        userId=customer.id,
        unitId=selected_unit_ids[0],
        unitIds=selected_unit_ids,
    )
