import re
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pycountry
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import (
    AppException,
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.permissions import (
    FeeType,
    PropertyType,
    Role,
    SharingType,
    UnitCategory,
    UnitStatus,
    UnitType,
)
from app.core.scoping import get_allowed_property_ids
from app.db.models import Floor, Property, PropertyFeeConfig, Unit, User
from app.modules.inventory.schemas import (
    BulkUnitCreateRequest,
    BulkUnitCreateResponse,
    PropertyCreateRequest,
    PropertyFeeCreateRequest,
    PropertyUpdateRequest,
    UnitCreateRequest,
)

HOSTEL_TYPES = {PropertyType.HOSTEL_BOYS.value, PropertyType.HOSTEL_GIRLS.value, PropertyType.HOSTEL_COED.value}
BED_LEVEL_TYPES = HOSTEL_TYPES | {PropertyType.CO_LIVING.value}


def require_admin(actor: User) -> None:
    if actor.role != Role.ADMIN:
        raise ForbiddenError("Only admins can modify property inventory", code="ADMIN_REQUIRED")


def get_scoped_property(db: Session, actor: User, property_id: str) -> Property:
    if actor.role != Role.ADMIN and property_id not in get_allowed_property_ids(db, actor):
        raise NotFoundError("Property not found")
    property_record = db.scalar(
        select(Property).where(Property.id == property_id, Property.is_deleted.is_(False))
    )
    if not property_record:
        raise NotFoundError("Property not found")
    return property_record


def validate_timezone_and_currency(timezone_name: str, currency: str) -> None:
    try:
        ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise BadRequestError("Unknown IANA time zone", code="INVALID_TIMEZONE") from error
    if pycountry.currencies.get(alpha_3=currency.upper()) is None:
        raise BadRequestError("Unsupported ISO 4217 currency", code="INVALID_CURRENCY")


def _property_code(db: Session, city: str) -> str:
    city_letters = re.sub(r"[^A-Z]", "", city.upper())
    city_code = (city_letters + "XXX")[:3]
    prefix = f"PROP-{city_code}-"
    existing_codes = db.scalars(select(Property.code).where(Property.code.like(f"{prefix}%"))).all()
    sequence = 1
    for code in existing_codes:
        match = re.fullmatch(re.escape(prefix) + r"(\d{3})", code)
        if match:
            sequence = max(sequence, int(match.group(1)) + 1)
    if sequence > 999:
        raise ConflictError("Property code sequence is exhausted for this city", code="CODE_SEQUENCE_EXHAUSTED")
    return f"{prefix}{sequence:03d}"


def create_property(
    db: Session,
    actor: User,
    payload: PropertyCreateRequest,
) -> Property:
    require_admin(actor)
    validate_timezone_and_currency(payload.timezone, payload.currency.upper())
    prop = Property(
        code=_property_code(db, payload.city),
        name=payload.name,
        type=payload.type.value,
        status="ACTIVE",
        floors=payload.floors,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        contact_phone=payload.contact_phone,
        contact_email=payload.contact_email,
        facilities=payload.facilities,
        currency=payload.currency.upper(),
        timezone=payload.timezone,
    )
    db.add(prop)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError(
            "Generated property code already exists; retry the request",
            code="PROPERTY_CODE_CONFLICT",
        ) from error
    if prop.type in HOSTEL_TYPES:
        db.add(
            PropertyFeeConfig(
                property_id=prop.id,
                fee_type=FeeType.UNIT_FEE.value,
                name="Hostel Rent",
                amount=Decimal("0"),
                is_mandatory=True,
                is_active=True,
                pricing_basis="ASSIGNMENT",
                billing_timing="AT_ASSIGNMENT",
            )
        )
    return prop


def update_property(
    db: Session,
    actor: User,
    prop: Property,
    payload: PropertyUpdateRequest,
) -> Property:
    require_admin(actor)
    validate_timezone_and_currency(payload.timezone, payload.currency.upper())
    prop.name = payload.name
    prop.type = payload.type.value
    prop.status = payload.status.value
    prop.floors = payload.floors
    prop.address = payload.address
    prop.city = payload.city
    prop.state = payload.state
    prop.pincode = payload.pincode
    prop.contact_phone = payload.contact_phone
    prop.contact_email = payload.contact_email
    prop.facilities = payload.facilities
    prop.currency = payload.currency.upper()
    prop.timezone = payload.timezone
    return prop


def property_summary(db: Session, prop: Property) -> dict[str, Any]:
    floor_count = db.scalar(select(func.count(Floor.id)).where(Floor.property_id == prop.id)) or 0
    unit_count = db.scalar(
        select(func.count(Unit.id)).where(Unit.property_id == prop.id, Unit.is_active.is_(True))
    ) or 0
    return {
        "id": prop.id,
        "code": prop.code,
        "name": prop.name,
        "type": prop.type,
        "status": prop.status,
        "timezone": prop.timezone,
        "currency": prop.currency,
        "floors": prop.floors,
        "floorCount": floor_count,
        "unitCount": unit_count,
        "createdAt": prop.created_at,
    }


def _floor_record(db: Session, prop: Property, number: int) -> Floor:
    floor = db.scalar(
        select(Floor).where(Floor.property_id == prop.id, Floor.number == number)
    )
    if floor:
        return floor
    floor = Floor(property_id=prop.id, number=number, name=f"Floor {number}")
    db.add(floor)
    db.flush()
    return floor


def _validate_unit_type(prop: Property, unit_type: str, category: str, capacity: int) -> None:
    if prop.type == PropertyType.HOTEL.value and unit_type == UnitType.BED.value:
        raise BadRequestError("BED units are not allowed in hotels", code="INVALID_UNIT_TYPE")
    if prop.type in BED_LEVEL_TYPES and unit_type == UnitType.SUITE.value:
        raise BadRequestError("SUITE units are not allowed in bed-level properties", code="INVALID_UNIT_TYPE")
    if category == UnitCategory.DORMITORY.value and unit_type != UnitType.BED.value and capacity < 4:
        raise BadRequestError("DORMITORY units require capacity for at least four beds", code="INVALID_DORMITORY")


def _create_unit_record(
    db: Session,
    prop: Property,
    payload: UnitCreateRequest,
) -> Unit:
    capacity = payload.beds_per_room if payload.beds_per_room is not None else payload.capacity
    _validate_unit_type(prop, payload.type.value, payload.category.value, capacity)
    if payload.beds_per_room is not None and (
        prop.type not in BED_LEVEL_TYPES or payload.type != UnitType.ROOM
    ):
        raise BadRequestError(
            "bedsPerRoom is only valid for hostel rooms",
            code="INVALID_BED_COUNT",
        )
    sharing_type = payload.sharing_type
    monthly_rate = payload.base_rate_monthly or payload.default_recurring_monthly_rate
    if (
        payload.base_rate_monthly is not None
        and payload.default_recurring_monthly_rate is not None
        and payload.base_rate_monthly != payload.default_recurring_monthly_rate
    ):
        raise BadRequestError("baseRateMonthly and defaultRecurringMonthlyRate must match")
    if prop.type in BED_LEVEL_TYPES and payload.type == UnitType.ROOM:
        expected_capacity = {
            SharingType.SINGLE: 1,
            SharingType.DOUBLE: 2,
            SharingType.TRIPLE: 3,
        }
        if sharing_type is None:
            sharing_type = (
                SharingType.DORMITORY
                if payload.category == UnitCategory.DORMITORY
                else {
                    1: SharingType.SINGLE,
                    2: SharingType.DOUBLE,
                    3: SharingType.TRIPLE,
                }.get(capacity)
            )
        if sharing_type == SharingType.DORMITORY:
            if capacity < 4:
                raise BadRequestError("Dormitory sharing requires capacity for at least four beds")
        elif sharing_type is not None and capacity != expected_capacity[sharing_type]:
            raise BadRequestError(
                f"{sharing_type.value.title()} sharing requires capacity {expected_capacity[sharing_type]}"
            )
    elif payload.type == UnitType.BED:
        if sharing_type is None and payload.parent_id:
            parent_for_sharing = db.scalar(select(Unit).where(Unit.id == payload.parent_id))
            if parent_for_sharing:
                sharing_type = SharingType(parent_for_sharing.sharing_type) if parent_for_sharing.sharing_type else None
        if sharing_type is None and payload.category == UnitCategory.DORMITORY:
            sharing_type = SharingType.DORMITORY
    floor = _floor_record(db, prop, payload.floor)
    parent: Unit | None = None
    if payload.parent_id:
        parent = db.scalar(
            select(Unit).where(
                Unit.id == payload.parent_id,
                Unit.property_id == prop.id,
                Unit.is_active.is_(True),
            )
        )
        if not parent:
            raise NotFoundError("Parent unit not found")
    if payload.type == UnitType.BED:
        if not parent or parent.type != UnitType.ROOM.value:
            raise BadRequestError("A BED must have a ROOM parent in the same property", code="INVALID_PARENT")
        if parent.floor != payload.floor:
            raise BadRequestError("A BED must be on the same floor as its ROOM parent", code="INVALID_PARENT")
    elif parent:
        raise BadRequestError("Only BED units can have a parent", code="INVALID_PARENT")
    unit = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        parent_id=payload.parent_id,
        unit_number=payload.unit_number,
        floor=payload.floor,
        type=payload.type.value,
        category=payload.category.value,
        sharing_type=sharing_type.value if sharing_type else None,
        capacity=capacity,
        default_price_per_night=payload.default_price_per_night,
        default_recurring_monthly_rate=monthly_rate,
        deposit_amount=payload.deposit_amount,
        utility_package_fee=payload.utility_package_fee,
        features=payload.features,
        smart_lock_id=payload.smart_lock_id,
        notes=payload.notes,
    )
    db.add(unit)
    return unit


def create_unit(db: Session, actor: User, prop: Property, payload: UnitCreateRequest) -> Unit:
    require_admin(actor)
    unit = _create_unit_record(db, prop, payload)
    try:
        db.flush()
        if payload.beds_per_room is not None:
            monthly_rate = payload.base_rate_monthly or payload.default_recurring_monthly_rate
            for bed_number in range(1, payload.beds_per_room + 1):
                db.add(
                    Unit(
                        property_id=prop.id,
                        floor_id=unit.floor_id,
                        parent_id=unit.id,
                        unit_number=f"{unit.unit_number}-{_bed_code(bed_number)}",
                        floor=unit.floor,
                        type=UnitType.BED.value,
                        category=unit.category,
                        sharing_type=unit.sharing_type,
                        capacity=1,
                        default_recurring_monthly_rate=monthly_rate,
                    )
                )
            db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError(
            f"Unit code or smart-lock ID already exists in this property: {payload.unit_number}",
            code="UNIT_CONFLICT",
        ) from error
    return unit


def _floor_code(floor_number: int, room_number: int) -> str:
    room_part = f"{room_number:02d}"
    if floor_number < 0:
        return f"B{abs(floor_number)}-{room_part}"
    return f"{floor_number}{room_part}"


def _bed_code(index: int) -> str:
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def bulk_create_units(
    db: Session,
    actor: User,
    prop: Property,
    payload: BulkUnitCreateRequest,
) -> BulkUnitCreateResponse:
    require_admin(actor)
    floors = payload.floors if isinstance(payload.floors, list) else list(range(1, payload.floors + 1))
    if prop.type == PropertyType.HOTEL.value and payload.beds_per_room:
        raise BadRequestError("Hotel properties cannot contain BED units", code="INVALID_UNIT_TYPE")
    if prop.type == PropertyType.HOTEL.value and payload.type == UnitType.BED:
        raise BadRequestError("Hotel properties cannot contain BED units", code="INVALID_UNIT_TYPE")
    if payload.type == UnitType.BED:
        raise BadRequestError(
            "Bulk generation creates rooms and optional child beds; create standalone beds individually",
            code="INVALID_BULK_SHAPE",
        )
    if payload.beds_per_room and payload.type != UnitType.ROOM:
        raise BadRequestError("Only ROOM units can have generated child beds", code="INVALID_BULK_SHAPE")
    generated_type = UnitType.ROOM.value if payload.beds_per_room else payload.type.value
    _validate_unit_type(
        prop,
        generated_type,
        payload.category.value,
        max(payload.capacity, payload.beds_per_room),
    )
    if payload.category == UnitCategory.DORMITORY and payload.beds_per_room < 4:
        raise BadRequestError("DORMITORY requires at least four beds per room", code="INVALID_DORMITORY")
    if (
        payload.base_rate_monthly is not None
        and payload.default_recurring_monthly_rate is not None
        and payload.base_rate_monthly != payload.default_recurring_monthly_rate
    ):
        raise BadRequestError("baseRateMonthly and defaultRecurringMonthlyRate must match")
    monthly_rate = payload.base_rate_monthly or payload.default_recurring_monthly_rate
    sharing_type = payload.sharing_type
    if prop.type in BED_LEVEL_TYPES:
        sharing_type = sharing_type or (
            SharingType.DORMITORY
            if payload.category == UnitCategory.DORMITORY or payload.beds_per_room >= 4
            else {
                1: SharingType.SINGLE,
                2: SharingType.DOUBLE,
                3: SharingType.TRIPLE,
            }.get(payload.beds_per_room or payload.capacity)
        )
        if sharing_type is None:
            raise BadRequestError("Hostel inventory requires a sharing type")
        if sharing_type == SharingType.DORMITORY and payload.beds_per_room < 4:
            raise BadRequestError("Dormitory sharing requires at least four beds per room")
        if sharing_type != SharingType.DORMITORY:
            expected_beds = {
                SharingType.SINGLE: 1,
                SharingType.DOUBLE: 2,
                SharingType.TRIPLE: 3,
            }[sharing_type]
            if payload.beds_per_room and payload.beds_per_room != expected_beds:
                raise BadRequestError(
                    f"{sharing_type.value.title()} sharing requires {expected_beds} beds per room"
                )

    room_previews: list[dict[str, Any]] = []
    bed_previews: list[dict[str, Any]] = []
    for floor_number in floors:
        for room_offset in range(payload.rooms_per_floor):
            room_number = payload.starting_room_number + room_offset
            room_code = _floor_code(floor_number, room_number)
            room_previews.append({"unitNumber": room_code, "floor": floor_number})
            for bed_number in range(1, payload.beds_per_room + 1):
                bed_previews.append(
                    {
                        "unitNumber": f"{room_code}-{_bed_code(bed_number)}",
                        "floor": floor_number,
                        "parentUnitNumber": room_code,
                    }
                )
    candidate_codes = [item["unitNumber"] for item in room_previews + bed_previews]
    if len(candidate_codes) > 500:
        raise BadRequestError("Bulk request cannot create more than 500 units", code="BATCH_TOO_LARGE")
    existing_codes = set(
        db.scalars(
            select(Unit.unit_number).where(
                Unit.property_id == prop.id,
                Unit.unit_number.in_(candidate_codes),
            )
        ).all()
    ) if candidate_codes else set()
    collisions = sorted(existing_codes)
    if collisions:
        raise AppException(
            status_code=409,
            code="UNIT_CONFLICT",
            message="Some generated unit codes already exist",
            details=[{"unitNumber": code} for code in collisions],
        )
    room_count = len(room_previews)
    bed_count = len(bed_previews)
    unit_count = room_count + bed_count
    if payload.dry_run:
        return BulkUnitCreateResponse(
            dryRun=True,
            floorCount=len(floors),
            roomCount=room_count,
            bedCount=bed_count,
            unitCount=unit_count,
            rooms=room_previews,
            beds=bed_previews,
        )

    created_rooms: dict[str, Unit] = {}
    created_units: list[Unit] = []
    try:
        for item in room_previews:
            floor_number = item["floor"]
            unit_type = payload.type.value if not payload.beds_per_room else UnitType.ROOM.value
            room = Unit(
                property_id=prop.id,
                floor_id=_floor_record(db, prop, floor_number).id,
                unit_number=item["unitNumber"],
                floor=floor_number,
                type=unit_type,
                category=payload.category.value,
                sharing_type=sharing_type.value if sharing_type else None,
                capacity=max(payload.capacity, payload.beds_per_room),
                default_price_per_night=payload.default_price_per_night,
                default_recurring_monthly_rate=monthly_rate,
                deposit_amount=payload.deposit_amount,
                utility_package_fee=payload.utility_package_fee,
                features=payload.features,
            )
            db.add(room)
            db.flush()
            created_rooms[item["unitNumber"]] = room
            created_units.append(room)
        for item in bed_previews:
            parent = created_rooms.get(item["parentUnitNumber"])
            bed = Unit(
                property_id=prop.id,
                floor_id=_floor_record(db, prop, item["floor"]).id,
                parent_id=parent.id if parent else None,
                unit_number=item["unitNumber"],
                floor=item["floor"],
                type=UnitType.BED.value,
                category=payload.category.value,
                sharing_type=sharing_type.value if sharing_type else None,
                capacity=1,
                default_recurring_monthly_rate=monthly_rate,
                deposit_amount=payload.deposit_amount,
                utility_package_fee=payload.utility_package_fee,
                features=payload.features,
            )
            db.add(bed)
            created_units.append(bed)
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError("Bulk unit creation collided with existing inventory", code="UNIT_CONFLICT") from error
    return BulkUnitCreateResponse(
        dryRun=False,
        floorCount=len(floors),
        roomCount=room_count,
        bedCount=bed_count,
        unitCount=unit_count,
        rooms=room_previews,
        beds=bed_previews,
    )


def create_fee_config(
    db: Session,
    actor: User,
    prop: Property,
    payload: PropertyFeeCreateRequest,
) -> PropertyFeeConfig:
    require_admin(actor)
    if prop.type not in HOSTEL_TYPES:
        raise BadRequestError("Fee configurations are available only for hostel properties", code="INVALID_PROPERTY_TYPE")
    electricity_fee = payload.fee_type == FeeType.ELECTRICITY_FEE
    water_charge = payload.fee_type == FeeType.WATER_CHARGE
    assignment_fee = payload.fee_type == FeeType.UNIT_FEE
    fixed_property_fee = payload.fee_type in (
        FeeType.MESS_FEE,
        FeeType.SECURITY_DEPOSIT,
    )
    expected_basis = (
        "ASSIGNMENT" if assignment_fee
        else "METERED" if electricity_fee
        else "CONFIG_ONLY" if water_charge
        else "FIXED_FLAT"
    )
    expected_timing = (
        "AT_ASSIGNMENT" if assignment_fee
        else "ARREARS" if electricity_fee
        else "NONE" if water_charge
        else "ADVANCE"
    )
    if payload.pricing_basis and payload.pricing_basis != expected_basis:
        raise BadRequestError(
            f"{payload.fee_type.value} must use {expected_basis} pricing",
            code="INVALID_FEE_PRICING",
        )
    if payload.billing_timing and payload.billing_timing != expected_timing:
        raise BadRequestError(
            f"{payload.fee_type.value} must be billed {expected_timing.lower()}",
            code="INVALID_FEE_TIMING",
        )
    if electricity_fee and (
        payload.rate_per_unit is None
        or payload.rate_per_unit <= 0
        or not payload.unit_of_measure
    ):
        raise BadRequestError(
            "Metered utility fees require a rate per unit and unit of measure",
            code="METER_RATE_REQUIRED",
        )
    if not electricity_fee and (payload.rate_per_unit is not None or payload.unit_of_measure):
        raise BadRequestError(
            "Rate per unit and unit of measure are only valid for metered electricity",
            code="INVALID_METER_RATE",
        )
    if assignment_fee and payload.amount != 0:
        raise BadRequestError(
            "Hostel Rent is priced on each stay assignment, not on the property fee config",
            code="ASSIGNMENT_RATE_ON_PROPERTY",
        )
    if (electricity_fee or water_charge) and payload.amount != 0:
        raise BadRequestError(
            "This fee is not configured with a property-level flat amount",
            code="UTILITY_NOT_BILLED_IN_ADVANCE",
        )
    mandatory = (
        payload.fee_type in (FeeType.UNIT_FEE, FeeType.SECURITY_DEPOSIT)
        or (fixed_property_fee and payload.is_mandatory)
    )
    if (
        payload.fee_type in (FeeType.MESS_FEE, FeeType.SECURITY_DEPOSIT)
        and payload.is_active
        and payload.amount <= 0
    ):
        raise BadRequestError(
            "An active fixed fee must have an amount greater than zero",
            code="INVALID_FIXED_FEE",
        )
    config = db.scalar(
        select(PropertyFeeConfig).where(
            PropertyFeeConfig.property_id == prop.id,
            PropertyFeeConfig.fee_type == payload.fee_type.value,
        )
    )
    if config:
        config.name = payload.name
        config.amount = payload.amount
        config.is_mandatory = mandatory or payload.is_mandatory
        config.is_active = True if assignment_fee else payload.is_active
        config.pricing_basis = expected_basis
        config.billing_timing = expected_timing
        config.rate_per_unit = payload.rate_per_unit
        config.unit_of_measure = payload.unit_of_measure.upper() if payload.unit_of_measure else None
    else:
        config = PropertyFeeConfig(
            property_id=prop.id,
            fee_type=payload.fee_type.value,
            name=payload.name,
            amount=payload.amount,
            is_mandatory=mandatory or payload.is_mandatory,
            is_active=True if assignment_fee else payload.is_active,
            pricing_basis=expected_basis,
            billing_timing=expected_timing,
            rate_per_unit=payload.rate_per_unit,
            unit_of_measure=payload.unit_of_measure.upper() if payload.unit_of_measure else None,
        )
        db.add(config)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ConflictError(
            "Fee configuration already exists for this property and fee type",
            code="PROPERTY_FEE_CONFLICT",
        ) from error
    return config


def soft_delete_property(db: Session, actor: User, prop: Property) -> None:
    require_admin(actor)
    prop.is_deleted = True


def unit_public_record(unit: Unit, prop: Property) -> dict[str, Any]:
    return {
        "propertyCode": prop.code,
        "propertyName": prop.name,
        "unitNumber": unit.unit_number,
        "floor": unit.floor,
        "type": unit.type,
        "category": unit.category,
        "sharingType": unit.sharing_type,
        "capacity": unit.capacity,
        "currency": prop.currency,
        "pricePerNight": unit.default_price_per_night,
        "recurringMonthlyRate": unit.default_recurring_monthly_rate,
        "baseRateMonthly": unit.default_recurring_monthly_rate,
        "features": unit.features or [],
        "status": UnitStatus.AVAILABLE.value,
    }


def unit_status_summary(unit: Unit) -> str:
    children = [child for child in unit.children if child.is_active]
    if not children:
        return unit.status
    occupied = sum(child.status == UnitStatus.OCCUPIED.value for child in children)
    if occupied == 0:
        return UnitStatus.AVAILABLE.value
    if occupied == len(children):
        return UnitStatus.OCCUPIED.value
    return "PARTIAL"


def property_matrix(db: Session, prop: Property, include_sensitive: bool) -> list[dict[str, Any]]:
    units = db.scalars(
        select(Unit)
        .options(selectinload(Unit.children))
        .where(Unit.property_id == prop.id, Unit.is_active.is_(True))
        .order_by(Unit.floor, Unit.unit_number)
    ).all()
    floors: dict[int, dict[str, Any]] = {}
    for unit in units:
        floor: dict[str, Any] = floors.setdefault(
            unit.floor,
            {"floorNumber": unit.floor, "rooms": []},
        )
        if unit.type == UnitType.BED.value:
            continue
        room: dict[str, Any] = {
            "id": unit.id,
            "unitNumber": unit.unit_number,
            "type": unit.type,
            "category": unit.category,
            "sharingType": unit.sharing_type,
            "capacity": unit.capacity,
            "baseRateMonthly": unit.default_recurring_monthly_rate,
            "defaultPricePerNight": unit.default_price_per_night,
            "status": unit_status_summary(unit),
            "beds": [],
        }
        if include_sensitive:
            room.update(
                {
                    "smartLockId": unit.smart_lock_id,
                    "depositAmount": unit.deposit_amount,
                    "utilityPackageFee": unit.utility_package_fee,
                }
            )
        for bed in unit.children:
            if not bed.is_active:
                continue
            bed_data: dict[str, Any] = {
                "id": bed.id,
                "unitNumber": bed.unit_number,
                "status": bed.status,
                "category": bed.category,
                "sharingType": bed.sharing_type or unit.sharing_type,
                "baseRateMonthly": bed.default_recurring_monthly_rate,
                "defaultPricePerNight": bed.default_price_per_night,
            }
            if include_sensitive:
                bed_data.update(
                    {
                        "smartLockId": bed.smart_lock_id,
                        "depositAmount": bed.deposit_amount,
                        "utilityPackageFee": bed.utility_package_fee,
                    }
                )
            room["beds"].append(bed_data)
        floor["rooms"].append(room)
    return [floors[number] for number in sorted(floors)]
