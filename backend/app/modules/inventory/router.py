from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.permissions import (
    CustomerLinkSource,
    Role,
    UnitStatus,
    UnitType,
)
from app.core.rate_limit import get_client_ip
from app.core.scoping import resolve_property_scope
from app.core.security import decode_access_token
from app.db.models import (
    BillingStrategy,
    CustomerPersona,
    CustomerPropertyLink,
    Property,
    PropertyFeeConfig,
    StayRecord,
    Unit,
    UnitAssignment,
    User,
    UtilityMeterReading,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_property_scope
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
    UnitCategory,
    UnitCreateRequest,
    UnitResponse,
    UnitStatusRequest,
    UtilityMeterReadingRequest,
    UtilityMeterReadingResponse,
)
from app.modules.inventory.service import (
    BED_LEVEL_TYPES,
    bulk_create_units,
    create_fee_config,
    create_property,
    create_unit,
    get_scoped_property,
    property_matrix,
    property_summary,
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
    return [_property_response(db, prop) for prop in properties]


@inventory_router.get("/public/properties", response_model=list[PublicPropertyResponse])
def list_public_properties_endpoint(db: Session = Depends(get_db)):
    properties = db.scalars(
        select(Property)
        .where(Property.is_deleted.is_(False), Property.status == "ACTIVE")
        .order_by(Property.city, Property.name)
    ).all()
    return [
        PublicPropertyResponse(
            id=prop.id,
            code=prop.code,
            name=prop.name,
            type=prop.type,
            city=prop.city,
            state=prop.state,
            currency=prop.currency,
        )
        for prop in properties
    ]


@inventory_router.get("/properties/{property_id}")
@inventory_router.get("/admin/properties/{property_id}")
def get_property_endpoint(
    property_id: str,
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
        if reveal_internal
        else []
    )
    floors = property_matrix(db, prop, reveal_internal)
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
    if actor.role == Role.STAFF:
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
        select(Unit).where(Unit.id == payload.unit_id, Unit.is_active.is_(True))
    )
    if not unit:
        raise NotFoundError("Available unit not found")
    prop = _scoped_property(db, actor, unit.property_id, property_scope)
    customer = db.get(User, payload.user_id)
    if not customer or customer.role != Role.CUSTOMER or customer.status != "ACTIVE":
        raise BadRequestError("Check-in requires an active customer account")
    if unit.status != UnitStatus.AVAILABLE.value:
        raise BadRequestError("Selected unit is not available", code="UNIT_UNAVAILABLE")
    if payload.expected_check_out and payload.expected_check_out <= payload.expected_check_in:
        raise BadRequestError("Expected check-out must be after check-in")

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
    now = datetime.now(timezone.utc)
    expected_check_in = payload.expected_check_in
    if expected_check_in.tzinfo is None:
        expected_check_in = expected_check_in.replace(tzinfo=timezone.utc)
    expected_check_out = payload.expected_check_out
    if expected_check_out and expected_check_out.tzinfo is None:
        expected_check_out = expected_check_out.replace(tzinfo=timezone.utc)

    assignment = UnitAssignment(
        unit_id=unit.id,
        user_id=customer.id,
        billing_strategy=payload.billing_strategy,
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
        actual_check_in=now,
        is_active=True,
        notes=payload.notes,
    )
    unit.status = UnitStatus.OCCUPIED.value
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
    if customer.customer_persona:
        persona = customer.customer_persona
    elif prop.type == "HOTEL":
        persona = CustomerPersona.HOTEL_GUEST.value
    else:
        persona = CustomerPersona.HOSTELER.value
    db.add(assignment)
    db.flush()
    db.add(
        StayRecord(
            user_id=customer.id,
            property_id=prop.id,
            persona=persona,
            start_date=expected_check_in.date(),
            end_date=expected_check_out.date() if expected_check_out else None,
        )
    )
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
            "standardRate": str(standard_rate) if standard_rate is not None else None,
            "agreedRate": str(payload.agreed_rate) if payload.agreed_rate is not None else None,
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
        agreedRate=(
            assignment.agreed_monthly_rate
            if assignment.billing_strategy == BillingStrategy.RECURRING_MONTHLY.value
            else assignment.agreed_price_per_night
        ),
        expectedCheckIn=assignment.expected_check_in,
        expectedCheckOut=assignment.expected_check_out,
        isActive=assignment.is_active,
    )


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
    property_id: str = Query(alias="propertyId"),
    check_in: date | None = Query(default=None, alias="checkIn"),
    stay_type: str | None = Query(default=None, alias="stayType", pattern="^(NIGHTLY|MONTHLY)$"),
    category: UnitCategory | None = Query(default=None),
    db: Session = Depends(get_db),
):
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
    units = db.scalars(query).all()
    return [unit_public_record(unit, prop) for unit in units]
