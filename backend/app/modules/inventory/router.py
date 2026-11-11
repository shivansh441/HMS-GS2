import calendar
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import exists, not_, select, update
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
    PropertyType,
    Role,
    UnitStatus,
    UnitType,
)
from app.core.rate_limit import get_client_ip
from app.core.scoping import resolve_property_scope
from app.core.security import decode_access_token
from app.db.models import (
    AssignmentStatus,
    BillingStrategy,
    CustomerPersona,
    CustomerPropertyLink,
    PaymentReceipt,
    Property,
    PropertyFeeConfig,
    ReservationRequest,
    ReservationStatus,
    StayOccupant,
    StayRecord,
    Unit,
    UnitAssignment,
    User,
    UtilityMeterReading,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import (
    get_current_admin_user,
    get_current_customer,
    get_property_scope,
)
from app.modules.billing.service import ensure_deposit_escrow
from app.modules.inventory.schemas import (
    BulkUnitCreateRequest,
    BulkUnitCreateResponse,
    PropertyCreateRequest,
    PropertyFeeCreateRequest,
    PropertyFeeResponse,
    PropertyItemResponse,
    PropertyUpdateRequest,
    PublicPropertyResponse,
    PublicUnitResponse,
    StayAssignmentCreateRequest,
    StayAssignmentResponse,
    StayCheckInRequest,
    StayCheckOutRequest,
    StayHistoryItem,
    StayOccupantResponse,
    StayOccupantsUpdate,
    UnitCategory,
    UnitCreateRequest,
    UnitResponse,
    UnitStatusRequest,
    UtilityMeterReadingRequest,
    UtilityMeterReadingResponse,
)
from app.modules.inventory.service import (
    BED_LEVEL_TYPES,
    HOSTEL_TYPES,
    bulk_create_units,
    create_fee_config,
    create_property,
    create_unit,
    get_scoped_property,
    property_matrix,
    property_summary,
    property_summaries,
    require_admin,
    soft_delete_property,
    unit_public_record,
    update_property,
)

inventory_router = APIRouter(tags=["Property Inventory"])


def get_optional_inventory_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header", code="AUTH_REQUIRED")
    payload = decode_access_token(
        authorization[7:].strip(),
        expected_audience=["admin", "customer"],
    )
    user_id = payload.get("sub")
    user = db.get(User, user_id) if user_id else None
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("User inactive or not found", code="USER_INACTIVE")
    if user.role not in (Role.ADMIN, Role.STAFF, Role.CUSTOMER):
        raise UnauthorizedError("User is not authorized", code="INVALID_ROLE")
    return user


def _property_response(db: Session, prop: Property) -> PropertyItemResponse:
    return PropertyItemResponse.model_validate(property_summary(db, prop))


def _scoped_property(
    db: Session,
    actor: User,
    property_id: str,
    property_scope: set[str],
) -> Property:
    if actor.role != Role.ADMIN and property_id not in property_scope:
        raise NotFoundError("Property not found")
    return get_scoped_property(db, actor, property_id)


def _require_front_desk_or_admin(actor: User) -> None:
    if actor.role == Role.ADMIN:
        return
    if actor.staff_role != "FRONT_DESK":
        raise ForbiddenError("Only front-desk staff or admins can perform desk operations")


def _fee_response(config: PropertyFeeConfig, reveal_amount: bool) -> PropertyFeeResponse:
    return PropertyFeeResponse(
        id=config.id,
        feeType=config.fee_type,
        name=config.name,
        amount=config.amount if reveal_amount else None,
        isMandatory=config.is_mandatory if reveal_amount else None,
        isActive=config.is_active,
        pricingBasis=config.pricing_basis,
        billingTiming=config.billing_timing,
        ratePerUnit=config.rate_per_unit if reveal_amount else None,
        unitOfMeasure=config.unit_of_measure if reveal_amount else None,
    )


def _unit_response(unit: Unit, reveal_internal: bool) -> UnitResponse:
    return UnitResponse(
        id=unit.id,
        propertyId=unit.property_id,
        unitNumber=unit.unit_number,
        floor=unit.floor,
        type=unit.type,
        category=unit.category,
        sharingType=unit.sharing_type,
        capacity=unit.capacity,
        status=unit.status,
        parentId=unit.parent_id,
        defaultPricePerNight=unit.default_price_per_night,
        defaultRecurringMonthlyRate=unit.default_recurring_monthly_rate,
        depositAmount=unit.deposit_amount if reveal_internal else None,
        utilityPackageFee=unit.utility_package_fee if reveal_internal else None,
        features=unit.features or [],
        smartLockId=unit.smart_lock_id if reveal_internal else None,
        isActive=unit.is_active,
    )


@inventory_router.post("/properties", response_model=PropertyItemResponse, status_code=201)
@inventory_router.post("/admin/properties", response_model=PropertyItemResponse, status_code=201)
def create_property_endpoint(
    request: Request,
    payload: PropertyCreateRequest,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    require_admin(actor)
    prop = create_property(db, actor, payload)
    write_audit_log(
        db,
        action="PROPERTY_CREATED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={
            "entity": "property",
            "before": None,
            "after": {"code": prop.code, "name": prop.name, "type": prop.type, "city": prop.city},
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(prop)
    return _property_response(db, prop)


@inventory_router.get("/properties", response_model=list[PropertyItemResponse])
def list_properties_endpoint(
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    if not property_scope:
        return []
    properties = db.scalars(
        select(Property).where(
            Property.id.in_(property_scope),
            Property.is_deleted.is_(False),
        ).order_by(Property.code)
    ).all()
    return [
        PropertyItemResponse.model_validate(summary)
        for summary in property_summaries(db, list(properties))
    ]


@inventory_router.get("/public/properties", response_model=list[PublicPropertyResponse])
def list_public_properties_endpoint(
    city: str | None = Query(default=None, min_length=1, max_length=128),
    state: str | None = Query(default=None, min_length=1, max_length=128),
    location: str | None = Query(default=None, min_length=1, max_length=128),
    property_type: str | None = Query(default=None, alias="type", max_length=32),
    db: Session = Depends(get_db),
):
    query = select(Property).where(
        Property.is_deleted.is_(False),
        Property.status == "ACTIVE",
    )
    if city:
        query = query.where(Property.city.ilike(f"%{city.strip()}%"))
    if state:
        query = query.where(Property.state.ilike(f"%{state.strip()}%"))
    if location:
        location_term = f"%{location.strip()}%"
        query = query.where(
            Property.city.ilike(location_term)
            | Property.state.ilike(location_term)
            | Property.name.ilike(location_term)
        )
    if property_type:
        normalized_type = property_type.strip().upper()
        if normalized_type == "HOSTEL":
            query = query.where(Property.type != PropertyType.HOTEL.value)
        else:
            try:
                normalized_type = PropertyType(normalized_type).value
            except ValueError as error:
                raise BadRequestError("Invalid property type", code="INVALID_PROPERTY_TYPE") from error
            query = query.where(Property.type == normalized_type)
    properties = db.scalars(query.order_by(Property.city, Property.name)).all()
    return [
        PublicPropertyResponse(
            id=prop.id,
            code=prop.code,
            name=prop.name,
            type=prop.type,
            city=prop.city,
            state=prop.state,
            currency=prop.currency,
            facilities=prop.facilities or [],
        )
        for prop in properties
    ]


@inventory_router.get("/properties/{property_id}")
@inventory_router.get("/admin/properties/{property_id}")
def get_property_endpoint(
    property_id: str,
    include_unit_matrix: bool = Query(default=True),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    prop = _scoped_property(db, actor, property_id, property_scope)
    reveal_internal = actor.role == Role.ADMIN
    fees = (
        db.scalars(
            select(PropertyFeeConfig)
            .where(PropertyFeeConfig.property_id == prop.id)
            .order_by(PropertyFeeConfig.fee_type)
        ).all()
        if reveal_internal and prop.type in HOSTEL_TYPES
        else []
    )
    floors = property_matrix(db, prop, reveal_internal) if include_unit_matrix else []
    return {
        **property_summary(db, prop),
        "address": prop.address,
        "city": prop.city,
        "state": prop.state,
        "pincode": prop.pincode,
        "contactPhone": prop.contact_phone if reveal_internal else None,
        "contactEmail": prop.contact_email if reveal_internal else None,
        "facilities": prop.facilities or [],
        "unitMatrix": floors,
        "feeConfigs": [_fee_response(fee, reveal_internal).model_dump(by_alias=True) for fee in fees],
    }


@inventory_router.put("/properties/{property_id}", response_model=PropertyItemResponse)
@inventory_router.put("/admin/properties/{property_id}", response_model=PropertyItemResponse)
def update_property_endpoint(
    property_id: str,
    payload: PropertyUpdateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    require_admin(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    before = {
        "name": prop.name,
        "type": prop.type,
        "status": prop.status,
        "city": prop.city,
    }
    update_property(db, actor, prop, payload)
    write_audit_log(
        db,
        action="PROPERTY_UPDATED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={
            "entity": "property",
            "before": before,
            "after": {
                "name": prop.name,
                "type": prop.type,
                "status": prop.status,
                "city": prop.city,
            },
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(prop)
    return _property_response(db, prop)


@inventory_router.delete("/properties/{property_id}", status_code=204)
def soft_delete_property_endpoint(
    property_id: str,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    require_admin(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    before = {"code": prop.code, "name": prop.name, "isDeleted": prop.is_deleted}
    soft_delete_property(db, actor, prop)
    write_audit_log(
        db,
        action="PROPERTY_SOFT_DELETED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={"entity": "property", "before": before, "after": {"isDeleted": True}},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return None


@inventory_router.post(
    "/properties/{property_id}/fees",
    response_model=PropertyFeeResponse,
    status_code=201,
)
@inventory_router.post(
    "/properties/{property_id}/fee-configs",
    response_model=PropertyFeeResponse,
    status_code=201,
)
def create_property_fee_endpoint(
    property_id: str,
    payload: PropertyFeeCreateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    require_admin(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    existing_config = db.scalar(
        select(PropertyFeeConfig).where(
            PropertyFeeConfig.property_id == prop.id,
            PropertyFeeConfig.fee_type == payload.fee_type.value,
        )
    )
    before = (
        {
            "feeType": existing_config.fee_type,
            "name": existing_config.name,
            "amount": str(existing_config.amount),
            "isActive": existing_config.is_active,
        }
        if existing_config
        else None
    )
    config = create_fee_config(db, actor, prop, payload)
    write_audit_log(
        db,
        action="PROPERTY_FEE_CONFIGURED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={
            "entity": "property_fee_config",
            "before": before,
            "after": {
                "feeType": config.fee_type,
                "name": config.name,
                "amount": str(config.amount),
                "isActive": config.is_active,
                "pricingBasis": config.pricing_basis,
                "billingTiming": config.billing_timing,
                "ratePerUnit": str(config.rate_per_unit) if config.rate_per_unit is not None else None,
                "unitOfMeasure": config.unit_of_measure,
            },
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(config)
    return _fee_response(config, reveal_amount=True)


@inventory_router.get("/properties/{property_id}/fees", response_model=list[PropertyFeeResponse])
def list_property_fees_endpoint(
    property_id: str,
    request: Request,
    actor: User | None = Depends(get_optional_inventory_user),
    db: Session = Depends(get_db),
):
    if actor is None:
        raise UnauthorizedError("Authentication is required", code="AUTH_REQUIRED")
    if actor.role == Role.CUSTOMER:
        prop = db.scalar(
            select(Property).where(Property.id == property_id, Property.is_deleted.is_(False))
        )
    else:
        property_scope = resolve_property_scope(
            db,
            actor,
            request.headers.get("X-Property-Id"),
        )
        prop = _scoped_property(db, actor, property_id, property_scope)
    if prop is None:
        raise NotFoundError("Property not found")
    if prop.type not in HOSTEL_TYPES:
        return []
    if actor.role == Role.STAFF and actor.staff_role != "FRONT_DESK":
        return []
    configs = db.scalars(
        select(PropertyFeeConfig)
        .where(PropertyFeeConfig.property_id == prop.id, PropertyFeeConfig.is_active.is_(True))
        .order_by(PropertyFeeConfig.fee_type)
    ).all()
    return [_fee_response(config, reveal_amount=True).model_dump(by_alias=True) for config in configs]


@inventory_router.post(
    "/stay/assignments",
    response_model=StayAssignmentResponse,
    status_code=201,
)
def create_stay_assignment_endpoint(
    payload: StayAssignmentCreateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    unit = db.scalar(
        select(Unit)
        .where(Unit.id == payload.unit_id, Unit.is_active.is_(True))
        .with_for_update()
    )
    if not unit:
        raise NotFoundError("Available unit not found")
    prop = _scoped_property(db, actor, unit.property_id, property_scope)
    customer = db.get(User, payload.user_id)
    if not customer or customer.role != Role.CUSTOMER or customer.status != "ACTIVE":
        raise BadRequestError("Check-in requires an active customer account")
    if unit.status != UnitStatus.AVAILABLE.value:
        raise BadRequestError("Selected unit is not available", code="UNIT_UNAVAILABLE")
    reservation = None
    if payload.reservation_id:
        reservation = db.get(ReservationRequest, payload.reservation_id)
        if (
            not reservation
            or reservation.property_id != prop.id
            or reservation.primary_user_id not in (None, payload.user_id)
        ):
            raise NotFoundError("Matching reservation not found")
        if reservation.status != ReservationStatus.APPROVED.value:
            raise BadRequestError("Only approved reservations can be assigned")
        if (
            reservation.requested_category != unit.category
            or reservation.requested_type != unit.type
            or (
                reservation.requested_sharing_type
                and reservation.requested_sharing_type != unit.sharing_type
            )
        ):
            raise BadRequestError("Selected unit does not match the reservation")

    is_hostel = prop.type in BED_LEVEL_TYPES
    if is_hostel and unit.type != UnitType.BED.value:
        raise BadRequestError("Hostel walk-ins must be assigned to an available bed")
    if not is_hostel and unit.type not in (UnitType.ROOM.value, UnitType.SUITE.value):
        raise BadRequestError("Hotel walk-ins must be assigned to a room or suite")
    if is_hostel and payload.billing_strategy != BillingStrategy.RECURRING_MONTHLY.value:
        raise BadRequestError("Hostel assignments use recurring monthly billing")
    if not is_hostel and payload.billing_strategy != BillingStrategy.PER_NIGHT_STAY.value:
        raise BadRequestError("Hotel assignments use per-night billing")

    standard_rate = (
        unit.default_recurring_monthly_rate
        if payload.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
        else unit.default_price_per_night
    )
    if standard_rate is None and payload.agreed_rate is None:
        raise BadRequestError("Unit has no standard rate; provide an agreed rate for this walk-in")
    effective_rate = payload.agreed_rate if payload.agreed_rate is not None else standard_rate
    if (
        standard_rate is not None
        and effective_rate is not None
        and effective_rate != standard_rate
        and not (payload.rate_override_reason or "").strip()
    ):
        raise BadRequestError(
            "A rate override reason is required when the agreed rate differs from standard",
            code="RATE_OVERRIDE_REASON_REQUIRED",
        )
    if not payload.check_in_now and (
        payload.deposit_payment_amount > 0 or payload.deposit_payment_method is not None
    ):
        raise BadRequestError(
            "Deposit payments can only be recorded during check-in",
            code="DEPOSIT_PAYMENT_DURING_CHECK_IN",
        )
    now = datetime.now(timezone.utc)
    expected_check_in = payload.expected_check_in
    if expected_check_in.tzinfo is None:
        expected_check_in = expected_check_in.replace(tzinfo=timezone.utc)
    expected_check_out = payload.expected_check_out
    if expected_check_out and expected_check_out.tzinfo is None:
        expected_check_out = expected_check_out.replace(tzinfo=timezone.utc)

    claimed_status = (
        UnitStatus.OCCUPIED.value if payload.check_in_now else UnitStatus.RESERVED.value
    )
    claimed = db.execute(
        update(Unit)
        .where(Unit.id == unit.id, Unit.status == UnitStatus.AVAILABLE.value)
        .values(status=claimed_status)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise ConflictError("Selected unit is no longer available", code="UNIT_UNAVAILABLE")

    assignment = UnitAssignment(
        unit_id=unit.id,
        user_id=customer.id,
        reservation_request_id=reservation.id if reservation else None,
        billing_strategy=payload.billing_strategy,
        status=(
            AssignmentStatus.CHECKED_IN.value
            if payload.check_in_now
            else AssignmentStatus.RESERVED.value
        ),
        standard_rate=standard_rate,
        rate_override_reason=(
            payload.rate_override_reason.strip()
            if payload.rate_override_reason and payload.rate_override_reason.strip()
            else None
        ),
        actor_id=actor.id,
        agreed_monthly_rate=(
            payload.agreed_rate
            if payload.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
            else None
        ),
        agreed_price_per_night=(
            payload.agreed_rate
            if payload.billing_strategy == BillingStrategy.PER_NIGHT_STAY.value
            else None
        ),
        expected_check_in=expected_check_in,
        expected_check_out=expected_check_out,
        actual_check_in=now if payload.check_in_now else None,
        is_active=payload.check_in_now,
        notes=payload.notes,
    )
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
                source=CustomerLinkSource.OFFLINE_ONBOARD.value,
            )
        )
    if prop.type == "HOTEL":
        persona = CustomerPersona.HOTEL_GUEST.value
    else:
        persona = (
            CustomerPersona.HOSTELER.value
            if assignment.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
            else CustomerPersona.HOSTEL_GUEST.value
        )

    db.add(assignment)
    db.flush()
    if reservation:
        reservation.primary_user_id = customer.id
        reservation.status = ReservationStatus.CONVERTED.value
        reservation.converted_at = now
    escrow = ensure_deposit_escrow(db, prop, assignment) if payload.check_in_now else None
    if escrow:
        db.flush()
        if payload.deposit_payment_amount != escrow.amount:
            raise BadRequestError(
                "The configured security deposit must be collected in full at check-in",
                code="SECURITY_DEPOSIT_REQUIRED",
            )
        if payload.deposit_payment_method is None:
            raise BadRequestError(
                "Select a payment method for the security deposit",
                code="DEPOSIT_PAYMENT_METHOD_REQUIRED",
            )
        escrow.collected_amount = payload.deposit_payment_amount
        escrow.status = "HELD"
        db.add(
            PaymentReceipt(
                property_id=prop.id,
                user_id=customer.id,
                deposit_escrow_id=escrow.id,
                amount=payload.deposit_payment_amount,
                payment_method=payload.deposit_payment_method,
                reference=payload.deposit_payment_reference,
                received_by_user_id=actor.id,
            )
        )
    elif payload.check_in_now and (
        payload.deposit_payment_amount > 0 or payload.deposit_payment_method is not None
    ):
        raise BadRequestError(
            "This property has no active security deposit configuration",
            code="SECURITY_DEPOSIT_NOT_CONFIGURED",
        )
    stay_record = None
    if payload.check_in_now:
        stay_record = StayRecord(
            assignment_id=assignment.id,
            user_id=customer.id,
            property_id=prop.id,
            persona=persona,
            start_date=expected_check_in.date(),
            end_date=expected_check_out.date() if expected_check_out else None,
            is_active=True,
        )
        db.add(stay_record)
    write_audit_log(
        db,
        action="WALK_IN_STAY_ASSIGNED",
        actor_user_id=actor.id,
        target_user_id=customer.id,
        property_id=prop.id,
        details={
            "unitId": unit.id,
            "unitNumber": unit.unit_number,
            "billingStrategy": assignment.billing_strategy,
            "status": assignment.status,
            "standardRate": str(standard_rate) if standard_rate is not None else None,
            "agreedRate": str(payload.agreed_rate) if payload.agreed_rate is not None else None,
            "rateOverrideReason": assignment.rate_override_reason,
            "securityDepositCollected": str(payload.deposit_payment_amount),
            "depositPaymentMethod": payload.deposit_payment_method,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(assignment)
    return StayAssignmentResponse(
        id=assignment.id,
        unitId=assignment.unit_id,
        userId=assignment.user_id,
        billingStrategy=assignment.billing_strategy,
        status=assignment.status,
        agreedRate=(
            assignment.agreed_monthly_rate
            if assignment.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
            else assignment.agreed_price_per_night
        ),
        standardRate=assignment.standard_rate,
        rateOverrideReason=assignment.rate_override_reason,
        expectedCheckIn=assignment.expected_check_in,
        expectedCheckOut=assignment.expected_check_out,
        actualCheckIn=assignment.actual_check_in,
        actualCheckOut=assignment.actual_check_out,
        isActive=assignment.is_active,
        guestName=customer.full_name,
        guestEmail=customer.email,
        guestPhone=customer.phone,
        propertyId=prop.id,
        propertyName=prop.name,
        unitNumber=unit.unit_number,
        unitType=unit.type,
        unitCategory=unit.category,
        persona=persona,
        stayRecordId=stay_record.id if stay_record else None,
    )


def _stay_assignment_response(assignment: UnitAssignment) -> StayAssignmentResponse:
    unit = assignment.unit
    customer = assignment.user
    prop = unit.property
    stay = assignment.stay_record
    return StayAssignmentResponse(
        id=assignment.id,
        unitId=unit.id,
        userId=customer.id,
        billingStrategy=assignment.billing_strategy,
        status=assignment.status,
        agreedRate=(
            assignment.agreed_monthly_rate
            if assignment.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
            else assignment.agreed_price_per_night
        ),
        standardRate=assignment.standard_rate,
        rateOverrideReason=assignment.rate_override_reason,
        expectedCheckIn=assignment.expected_check_in,
        expectedCheckOut=assignment.expected_check_out,
        actualCheckIn=assignment.actual_check_in,
        actualCheckOut=assignment.actual_check_out,
        isActive=assignment.is_active,
        guestName=customer.full_name,
        guestEmail=customer.email,
        guestPhone=customer.phone,
        propertyId=prop.id,
        propertyName=prop.name,
        unitNumber=unit.unit_number,
        unitType=unit.type,
        unitCategory=unit.category,
        persona=stay.persona if stay else None,
        stayRecordId=stay.id if stay else None,
    )


@inventory_router.post(
    "/stay/assignments/{assignment_id}/check-in",
    response_model=StayAssignmentResponse,
)
def check_in_stay_assignment_endpoint(
    assignment_id: str,
    payload: StayCheckInRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    assignment = db.scalar(
        select(UnitAssignment)
        .options(selectinload(UnitAssignment.user), selectinload(UnitAssignment.unit))
        .where(UnitAssignment.id == assignment_id)
        .with_for_update()
    )
    if not assignment or assignment.unit.property_id not in property_scope:
        raise NotFoundError("Stay assignment not found")
    if assignment.status != AssignmentStatus.RESERVED.value:
        raise ConflictError("Only reserved assignments can be checked in")
    unit = assignment.unit
    prop = unit.property
    if unit.status != UnitStatus.RESERVED.value:
        raise ConflictError("The assigned unit is no longer reserved")

    claimed = db.execute(
        update(Unit)
        .where(Unit.id == unit.id, Unit.status == UnitStatus.RESERVED.value)
        .values(status=UnitStatus.OCCUPIED.value)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise ConflictError("The assigned unit is no longer ready for check-in")

    now = datetime.now(timezone.utc)
    assignment.actual_check_in = now
    assignment.status = AssignmentStatus.CHECKED_IN.value
    assignment.is_active = True
    persona = (
        CustomerPersona.HOTEL_GUEST.value
        if prop.type == "HOTEL"
        else (
            CustomerPersona.HOSTELER.value
            if assignment.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
            else CustomerPersona.HOSTEL_GUEST.value
        )
    )
    escrow = ensure_deposit_escrow(db, prop, assignment)
    if escrow:
        if payload.deposit_payment_amount != escrow.amount:
            raise BadRequestError(
                "The configured security deposit must be collected in full at check-in",
                code="SECURITY_DEPOSIT_REQUIRED",
            )
        if payload.deposit_payment_method is None:
            raise BadRequestError(
                "Select a payment method for the security deposit",
                code="DEPOSIT_PAYMENT_METHOD_REQUIRED",
            )
        escrow.collected_amount = payload.deposit_payment_amount
        escrow.status = "HELD"
        db.add(
            PaymentReceipt(
                property_id=prop.id,
                user_id=assignment.user_id,
                deposit_escrow_id=escrow.id,
                amount=payload.deposit_payment_amount,
                payment_method=payload.deposit_payment_method,
                reference=payload.deposit_payment_reference,
                received_by_user_id=actor.id,
            )
        )
    elif payload.deposit_payment_amount > 0 or payload.deposit_payment_method is not None:
        raise BadRequestError(
            "This property has no active security deposit configuration",
            code="SECURITY_DEPOSIT_NOT_CONFIGURED",
        )

    stay_record = StayRecord(
        assignment_id=assignment.id,
        user_id=assignment.user_id,
        property_id=prop.id,
        persona=persona,
        start_date=assignment.expected_check_in.date(),
        end_date=(
            assignment.expected_check_out.date()
            if assignment.expected_check_out
            else None
        ),
        is_active=True,
    )
    db.add(stay_record)
    write_audit_log(
        db,
        action="STAY_CHECKED_IN",
        actor_user_id=actor.id,
        target_user_id=assignment.user_id,
        property_id=prop.id,
        details={"assignmentId": assignment.id, "unitId": unit.id},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(assignment)
    return _stay_assignment_response(assignment)


@inventory_router.post(
    "/stay/assignments/{assignment_id}/check-out",
    response_model=StayAssignmentResponse,
)
def check_out_stay_assignment_endpoint(
    assignment_id: str,
    payload: StayCheckOutRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    assignment = db.scalar(
        select(UnitAssignment)
        .options(
            selectinload(UnitAssignment.user),
            selectinload(UnitAssignment.unit),
            selectinload(UnitAssignment.stay_record),
        )
        .where(UnitAssignment.id == assignment_id)
        .with_for_update()
    )
    if not assignment or assignment.unit.property_id not in property_scope:
        raise NotFoundError("Stay assignment not found")
    if assignment.status != AssignmentStatus.CHECKED_IN.value or not assignment.is_active:
        raise ConflictError("Only active checked-in assignments can be checked out")
    if not payload.folio_settled:
        raise BadRequestError("Settle the guest folio before check-out", code="FOLIO_NOT_SETTLED")
    if not payload.keycard_returned:
        raise BadRequestError("Confirm keycard return before check-out", code="KEYCARD_NOT_RETURNED")

    unit = assignment.unit
    claimed = db.execute(
        update(Unit)
        .where(Unit.id == unit.id, Unit.status == UnitStatus.OCCUPIED.value)
        .values(status=UnitStatus.DIRTY.value)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise ConflictError("The assigned unit is not occupied")

    now = datetime.now(timezone.utc)
    assignment.actual_check_out = now
    assignment.status = AssignmentStatus.CHECKED_OUT.value
    assignment.is_active = False
    if assignment.stay_record:
        assignment.stay_record.end_date = now.date()
        assignment.stay_record.final_amount_paid = payload.final_amount_paid
        assignment.stay_record.is_active = False
    write_audit_log(
        db,
        action="STAY_CHECKED_OUT",
        actor_user_id=actor.id,
        target_user_id=assignment.user_id,
        property_id=unit.property_id,
        details={
            "assignmentId": assignment.id,
            "unitId": unit.id,
            "finalAmountPaid": str(payload.final_amount_paid),
            "folioSettled": payload.folio_settled,
            "keycardReturned": payload.keycard_returned,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(assignment)
    return _stay_assignment_response(assignment)


@inventory_router.get(
    "/stay/assignments/active",
    response_model=list[StayAssignmentResponse],
)
def list_active_stay_assignments_endpoint(
    property_id: str | None = Query(default=None, alias="propertyId"),
    unit_type: str | None = Query(default=None, alias="unitType"),
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    if property_id and property_id not in property_scope:
        raise NotFoundError("Property not found")
    query = (
        select(UnitAssignment)
        .join(Unit, Unit.id == UnitAssignment.unit_id)
        .options(
            selectinload(UnitAssignment.user),
            selectinload(UnitAssignment.unit).selectinload(Unit.property),
            selectinload(UnitAssignment.stay_record),
        )
        .where(
            UnitAssignment.status == AssignmentStatus.CHECKED_IN.value,
            UnitAssignment.is_active.is_(True),
            Unit.property_id == property_id if property_id else Unit.property_id.in_(property_scope),
        )
        .order_by(UnitAssignment.actual_check_in.desc())
    )
    if unit_type:
        if unit_type not in {UnitType.BED.value, UnitType.ROOM.value, UnitType.SUITE.value}:
            raise BadRequestError("Invalid unit type")
        query = query.where(Unit.type == unit_type)
    assignments = db.scalars(query).all()
    return [_stay_assignment_response(assignment) for assignment in assignments]


@inventory_router.get(
    "/stay/assignments/{assignment_id}/occupants",
    response_model=list[StayOccupantResponse],
)
def list_stay_occupants_endpoint(
    assignment_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    assignment = db.scalar(
        select(UnitAssignment)
        .join(Unit, Unit.id == UnitAssignment.unit_id)
        .options(selectinload(UnitAssignment.stay_record).selectinload(StayRecord.additional_guests))
        .where(UnitAssignment.id == assignment_id)
    )
    if not assignment:
        raise NotFoundError("Stay assignment not found")
    _scoped_property(db, actor, assignment.unit.property_id, property_scope)
    return assignment.stay_record.additional_guests if assignment.stay_record else []


@inventory_router.put(
    "/stay/assignments/{assignment_id}/occupants",
    response_model=list[StayOccupantResponse],
)
def update_stay_occupants_endpoint(
    assignment_id: str,
    payload: StayOccupantsUpdate,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    assignment = db.scalar(
        select(UnitAssignment)
        .join(Unit, Unit.id == UnitAssignment.unit_id)
        .options(
            selectinload(UnitAssignment.unit),
            selectinload(UnitAssignment.stay_record).selectinload(StayRecord.additional_guests),
        )
        .where(UnitAssignment.id == assignment_id)
        .with_for_update()
    )
    if not assignment:
        raise NotFoundError("Stay assignment not found")
    _scoped_property(db, actor, assignment.unit.property_id, property_scope)
    if assignment.status != AssignmentStatus.CHECKED_IN.value or not assignment.stay_record:
        raise ConflictError("Occupants can only be updated for an active checked-in stay")
    if len(payload.occupants) > assignment.unit.capacity:
        raise BadRequestError(
            f"This unit can have at most {assignment.unit.capacity} occupant(s)",
            code="OCCUPANT_CAPACITY_EXCEEDED",
        )

    existing_by_id = {occupant.id: occupant for occupant in assignment.stay_record.additional_guests}
    submitted_ids = [occupant.id for occupant in payload.occupants if occupant.id]
    if len(submitted_ids) != len(set(submitted_ids)):
        raise BadRequestError("An occupant cannot be submitted more than once")
    if any(occupant_id not in existing_by_id for occupant_id in submitted_ids):
        raise BadRequestError("One or more occupants do not belong to this stay")

    updated_occupants: list[StayOccupant] = []
    for submitted in payload.occupants:
        existing = existing_by_id.get(submitted.id) if submitted.id else None
        document_type = submitted.id_document_type or (
            existing.id_document_type if existing else None
        )
        document_number = submitted.id_document_number
        if not existing and (not document_type or not document_number):
            raise BadRequestError("A government ID is required for each new occupant")
        if (
            existing
            and document_type != existing.id_document_type
            and not document_number
        ):
            raise BadRequestError("Provide the ID number when changing an occupant's ID type")

        encrypted_document = existing.id_document_number_encrypted if existing else None
        document_last4 = existing.id_document_last4 if existing else None
        if document_number:
            encrypted_document, document_last4, _ = process_id_document(document_number)

        occupant = existing or StayOccupant(stay_record=assignment.stay_record)
        occupant.full_name = submitted.full_name
        occupant.date_of_birth = submitted.date_of_birth
        occupant.gender = submitted.gender
        occupant.email = submitted.email
        occupant.phone = submitted.phone
        occupant.permanent_address = submitted.permanent_address
        occupant.id_document_type = document_type
        occupant.id_document_number_encrypted = encrypted_document
        occupant.id_document_last4 = document_last4
        updated_occupants.append(occupant)

    assignment.stay_record.additional_guests = updated_occupants
    assignment.stay_record.guest_count = max(1, len(updated_occupants))
    write_audit_log(
        db,
        action="STAY_OCCUPANTS_UPDATED",
        actor_user_id=actor.id,
        target_user_id=assignment.user_id,
        property_id=assignment.unit.property_id,
        details={"assignmentId": assignment.id, "occupantCount": len(updated_occupants)},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return updated_occupants


def _stay_history_rows(db: Session, account_id: str, scope: set[str] | None = None):
    query = (
        select(StayRecord, UnitAssignment, Unit, Property)
        .join(Property, Property.id == StayRecord.property_id)
        .outerjoin(UnitAssignment, UnitAssignment.id == StayRecord.assignment_id)
        .outerjoin(Unit, Unit.id == UnitAssignment.unit_id)
        .where(StayRecord.user_id == account_id)
        .order_by(StayRecord.created_at.desc())
    )
    if scope is not None:
        query = query.where(StayRecord.property_id.in_(scope))
    return db.execute(query).all()


def _stay_history_response(rows) -> list[StayHistoryItem]:
    result = []
    for stay, assignment, unit, prop in rows:
        result.append(
            StayHistoryItem(
                id=stay.id,
                assignmentId=stay.assignment_id,
                userId=stay.user_id,
                propertyId=stay.property_id,
                propertyName=prop.name,
                unitId=unit.id if unit else None,
                unitNumber=unit.unit_number if unit else None,
                unitType=unit.type if unit else None,
                unitCategory=unit.category if unit else None,
                persona=stay.persona,
                assignmentStatus=assignment.status if assignment else None,
                billingStrategy=assignment.billing_strategy if assignment else None,
                scheduledCheckIn=assignment.expected_check_in if assignment else None,
                scheduledCheckOut=assignment.expected_check_out if assignment else None,
                actualCheckIn=assignment.actual_check_in if assignment else None,
                actualCheckOut=assignment.actual_check_out if assignment else None,
                finalAmountPaid=stay.final_amount_paid,
                isActive=stay.is_active,
                createdAt=stay.created_at,
            )
        )
    return result


@inventory_router.get(
    "/stay/customers/{account_id}/history",
    response_model=list[StayHistoryItem],
)
def get_customer_stay_history_endpoint(
    account_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    if not db.get(User, account_id):
        raise NotFoundError("Customer not found")
    return _stay_history_response(_stay_history_rows(db, account_id, property_scope))


@inventory_router.get("/stay/me/history", response_model=list[StayHistoryItem])
def get_my_stay_history_endpoint(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    return _stay_history_response(_stay_history_rows(db, customer.id))


@inventory_router.post(
    "/properties/{property_id}/utility-meter-readings",
    response_model=UtilityMeterReadingResponse,
    status_code=201,
)
def create_utility_meter_reading_endpoint(
    property_id: str,
    payload: UtilityMeterReadingRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    _require_front_desk_or_admin(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    if payload.period_end <= payload.period_start:
        raise BadRequestError("Meter period end must be after its start date")
    if payload.period_end >= datetime.now(ZoneInfo(prop.timezone)).date():
        raise BadRequestError("Meter readings must cover a completed billing period")
    if (
        payload.period_start.day != 1
        or payload.period_end.day
        != calendar.monthrange(payload.period_end.year, payload.period_end.month)[1]
        or payload.period_start.month != payload.period_end.month
        or payload.period_start.year != payload.period_end.year
    ):
        raise BadRequestError(
            "Meter readings must cover one complete calendar month",
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
    if not assignment:
        raise NotFoundError("Active stay assignment not found")
    unit = db.get(Unit, assignment.unit_id)
    if not unit or unit.property_id != prop.id:
        raise NotFoundError("Stay assignment is not in this property")
    if (
        prop.type not in HOSTEL_TYPES
        or assignment.billing_strategy != "RECURRING_MONTHLY"
    ):
        raise BadRequestError(
            "Metered property fees only apply to hosteler stays in hostel properties",
            code="INVALID_FEE_ASSIGNMENT",
        )
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
            "An active arrears-based metered fee must be configured first",
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
        arrearsForPeriod=f"{reading.period_start:%Y-%m}",
    )


@inventory_router.post(
    "/properties/{property_id}/units",
    response_model=UnitResponse,
    status_code=201,
)
def create_unit_endpoint(
    property_id: str,
    payload: UnitCreateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    require_admin(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    unit = create_unit(db, actor, prop, payload)
    write_audit_log(
        db,
        action="INVENTORY_UNIT_CREATED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={
            "entity": "unit",
            "before": None,
            "after": {"unitNumber": unit.unit_number, "type": unit.type, "floor": unit.floor},
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(unit)
    return _unit_response(unit, reveal_internal=True)


@inventory_router.post(
    "/properties/{property_id}/units/bulk",
    response_model=BulkUnitCreateResponse,
    status_code=201,
)
def bulk_create_units_endpoint(
    property_id: str,
    payload: BulkUnitCreateRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    require_admin(actor)
    prop = _scoped_property(db, actor, property_id, property_scope)
    result = bulk_create_units(db, actor, prop, payload)
    if not payload.dry_run:
        write_audit_log(
            db,
            action="INVENTORY_UNITS_BULK_CREATED",
            actor_user_id=actor.id,
            property_id=prop.id,
            details={
                "entity": "unit_batch",
                "before": None,
                "after": {
                    "unitCount": result.unit_count,
                    "roomCount": result.room_count,
                    "bedCount": result.bed_count,
                    "codes": [unit["unitNumber"] for unit in result.rooms + result.beds],
                },
            },
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        db.commit()
    return result


@inventory_router.patch("/units/{unit_id}/status", response_model=UnitResponse)
def update_unit_status_endpoint(
    unit_id: str,
    payload: UnitStatusRequest,
    request: Request,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    require_admin(actor)
    unit = db.scalar(
        select(Unit).options(selectinload(Unit.children)).where(Unit.id == unit_id)
    )
    if not unit:
        raise NotFoundError("Unit not found")
    prop = _scoped_property(db, actor, unit.property_id, property_scope)
    if unit.type == UnitType.ROOM.value and any(child.status == UnitStatus.OCCUPIED.value for child in unit.children):
        raise BadRequestError("A room with occupied beds cannot have its status changed", code="INVALID_TRANSITION")
    before = unit.status
    if before == payload.status.value:
        return _unit_response(unit, reveal_internal=True)
    unit.status = payload.status.value
    write_audit_log(
        db,
        action="UNIT_STATUS_CHANGED",
        actor_user_id=actor.id,
        property_id=prop.id,
        details={
            "entity": "unit",
            "unitId": unit.id,
            "before": {"status": before},
            "after": {"status": unit.status},
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(unit)
    return _unit_response(unit, reveal_internal=True)


@inventory_router.get("/properties/{property_id}/units/matrix")
def get_unit_matrix_endpoint(
    property_id: str,
    actor: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    prop = _scoped_property(db, actor, property_id, property_scope)
    return {
        "propertyId": prop.id,
        "propertyCode": prop.code,
        "currency": prop.currency,
        "floors": property_matrix(db, prop, include_sensitive=actor.role == Role.ADMIN),
    }


@inventory_router.get("/public/units/search", response_model=list[PublicUnitResponse])
def search_public_units_endpoint(
    property_id: str | None = Query(default=None, alias="propertyId"),
    property_id_snake: str | None = Query(default=None, alias="property_id"),
    check_in: date | None = Query(default=None, alias="checkIn"),
    check_in_snake: date | None = Query(default=None, alias="check_in"),
    check_out: date | None = Query(default=None, alias="checkOut"),
    check_out_snake: date | None = Query(default=None, alias="check_out"),
    stay_type: str | None = Query(default=None, alias="stayType", pattern="^(NIGHTLY|MONTHLY)$"),
    category: UnitCategory | None = Query(default=None),
    min_price: Decimal | None = Query(default=None, alias="minPrice", ge=0),
    max_price: Decimal | None = Query(default=None, alias="maxPrice", ge=0),
    db: Session = Depends(get_db),
):
    property_id = property_id or property_id_snake
    check_in = check_in or check_in_snake
    check_out = check_out or check_out_snake
    if not property_id:
        raise BadRequestError("property_id is required", code="PROPERTY_REQUIRED")
    if check_out and not check_in:
        raise BadRequestError("check_in is required when check_out is provided", code="INVALID_DATE")
    if check_in and check_out and check_out <= check_in:
        raise BadRequestError("check_out must be after check_in", code="INVALID_DATE")
    if min_price is not None and max_price is not None and min_price > max_price:
        raise BadRequestError("minPrice cannot exceed maxPrice", code="INVALID_PRICE_RANGE")

    prop = db.scalar(
        select(Property).where(Property.id == property_id, Property.is_deleted.is_(False), Property.status == "ACTIVE")
    )
    if not prop:
        raise NotFoundError("Property not found")
    query = (
        select(Unit)
        .where(
            Unit.property_id == prop.id,
            Unit.is_active.is_(True),
            Unit.status == UnitStatus.AVAILABLE.value,
        )
        .order_by(Unit.floor, Unit.unit_number)
    )
    if category:
        query = query.where(Unit.category == category.value)
    if prop.type == "HOTEL":
        if stay_type == "MONTHLY":
            return []
        query = query.where(Unit.type.in_([UnitType.ROOM.value, UnitType.SUITE.value]))
    elif prop.type in BED_LEVEL_TYPES:
        if stay_type == "NIGHTLY":
            return []
        query = query.where(Unit.type == UnitType.BED.value)
    if check_in and check_in < datetime.now(ZoneInfo(prop.timezone)).date():
        raise BadRequestError("checkIn cannot be in the past", code="INVALID_DATE")
    if check_in:
        local_timezone = ZoneInfo(prop.timezone)
        arrival = datetime.combine(check_in, time.min, tzinfo=local_timezone)
        departure = datetime.combine(
            check_out or check_in + timedelta(days=1),
            time.min,
            tzinfo=local_timezone,
        )
        overlapping_assignment = exists(
            select(UnitAssignment.id).where(
                UnitAssignment.unit_id == Unit.id,
                UnitAssignment.status.in_(
                    [AssignmentStatus.RESERVED.value, AssignmentStatus.CHECKED_IN.value]
                ),
                UnitAssignment.actual_check_out.is_(None),
                UnitAssignment.expected_check_in < departure,
                (UnitAssignment.expected_check_out.is_(None))
                | (UnitAssignment.expected_check_out > arrival),
            )
        )
        query = query.where(not_(overlapping_assignment))
    if min_price is not None or max_price is not None:
        price_column = (
            Unit.default_price_per_night
            if prop.type == PropertyType.HOTEL.value
            else Unit.default_recurring_monthly_rate
        )
        query = query.where(price_column.is_not(None))
        if min_price is not None:
            query = query.where(price_column >= min_price)
        if max_price is not None:
            query = query.where(price_column <= max_price)
    units = db.scalars(query).all()
    return [unit_public_record(unit, prop) for unit in units]
