"""Inventory endpoints for room types, rooms, beds, maintenance blocks, and availability queries."""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_active_user,
    get_current_user,
    get_db,
    require_roles,
    verify_property_scope,
)
from app.core.exceptions import (
    EntityNotFoundError,
    PermissionDeniedError,
    PropertyAccessViolationError,
    ResourceConflictError,
    ValidationError,
)
from app.core.security import UserRole
from app.models.booking import (
    Booking,
    BookingStatus,
    InventoryAllocation,
    InventoryAllocationType,
)
from app.models.inventory import (
    Bed,
    BedType,
    Floor,
    Room,
    RoomOperationalStatus,
    RoomType,
)
from app.models.property import Property, PublicationStatus
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.inventory import (
    BedCreate,
    BedRead,
    BedUpdate,
    CalendarMatrixResponse,
    CalendarRowItem,
    DailyUnitStatus,
    InventorySummaryResponse,
    MaintenanceBlockRequest,
    MaintenanceBlockResponse,
    PropertyAvailabilityResponse,
    RoomAdminDetail,
    RoomCreate,
    RoomRead,
    RoomTypeAdminRead,
    RoomTypeAvailabilitySummary,
    RoomTypeCreate,
    RoomTypeUpdate,
    RoomUpdate,
)
from app.services.availability_service import (
    atomic_allocate_inventory,
    calculate_property_availability,
    validate_stay_date_range,
)

router = APIRouter(prefix="/inventory", tags=["Inventory & Availability"])


# -------------------------------------------------------------------------
# Room Types Endpoints
# -------------------------------------------------------------------------


@router.get(
    "/room-types",
    response_model=ApiResponse[list[RoomTypeAdminRead]],
    status_code=status.HTTP_200_OK,
    summary="List room types for a property",
)
async def list_room_types(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[list[RoomTypeAdminRead]]:
    """List all room types for an authorized property."""
    await verify_property_scope(property_id, session, current_user)

    result = await session.execute(
        select(RoomType)
        .where(RoomType.property_id == property_id, RoomType.is_active.is_(True))
        .order_by(RoomType.name.asc())
    )
    room_types = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[RoomTypeAdminRead.model_validate(rt) for rt in room_types],
        message="Room types retrieved.",
    )


@router.post(
    "/room-types",
    response_model=ApiResponse[RoomTypeAdminRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create room type",
)
async def create_room_type(
    payload: RoomTypeCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[RoomTypeAdminRead]:
    """Create a new accommodation room type.
    Requires Property Manager or Super Admin role.
    """
    await verify_property_scope(payload.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can create room types.")

    # Check duplicate code or slug within property
    existing = await session.execute(
        select(RoomType).where(
            RoomType.property_id == payload.property_id,
            or_(
                RoomType.code == payload.code.upper(),
                RoomType.slug == payload.slug.lower(),
            ),
        )
    )
    if existing.scalar_one_or_none():
        raise ResourceConflictError("RoomType", f"code '{payload.code}' or slug '{payload.slug}' already exists in this property")

    new_rt = RoomType(
        property_id=payload.property_id,
        name=payload.name,
        slug=payload.slug.lower(),
        code=payload.code.upper(),
        accommodation_tier=payload.accommodation_tier,
        description=payload.description,
        base_capacity_adults=payload.base_capacity_adults,
        max_capacity_adults=payload.max_capacity_adults,
        max_capacity_children=payload.max_capacity_children,
        is_dormitory=payload.is_dormitory,
        gender_policy=payload.gender_policy,
        base_price_amount=payload.base_price_amount,
        amenities=payload.amenities,
        is_published=payload.is_published,
    )
    session.add(new_rt)
    await session.commit()
    await session.refresh(new_rt)

    return ApiResponse(
        success=True,
        data=RoomTypeAdminRead.model_validate(new_rt),
        message="Room type created successfully.",
    )


@router.put(
    "/room-types/{room_type_id}",
    response_model=ApiResponse[RoomTypeAdminRead],
    status_code=status.HTTP_200_OK,
    summary="Update room type",
)
async def update_room_type(
    room_type_id: str,
    payload: RoomTypeUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[RoomTypeAdminRead]:
    """Update room type details."""
    result = await session.execute(select(RoomType).where(RoomType.id == room_type_id))
    rt = result.scalar_one_or_none()
    if not rt:
        raise EntityNotFoundError("RoomType", room_type_id)

    await verify_property_scope(rt.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can update room types.")

    update_dict = payload.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(rt, k, v)

    await session.commit()
    await session.refresh(rt)
    return ApiResponse(
        success=True,
        data=RoomTypeAdminRead.model_validate(rt),
        message="Room type updated.",
    )


@router.delete(
    "/room-types/{room_type_id}",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Safely deactivate room type",
)
async def delete_room_type(
    room_type_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[dict]:
    """Safely deactivate a room type if no active rooms exist."""
    result = await session.execute(select(RoomType).where(RoomType.id == room_type_id))
    rt = result.scalar_one_or_none()
    if not rt:
        raise EntityNotFoundError("RoomType", room_type_id)

    await verify_property_scope(rt.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can deactivate room types.")

    # Check for active rooms
    active_rooms = await session.execute(
        select(Room).where(Room.room_type_id == room_type_id, Room.is_active.is_(True))
    )
    if active_rooms.scalars().first():
        raise ValidationError(
            "Cannot deactivate room type: Active rooms are currently assigned to this type."
        )

    rt.is_active = False
    await session.commit()
    return ApiResponse(
        success=True,
        data={"id": room_type_id, "is_active": False},
        message="Room type deactivated.",
    )


# -------------------------------------------------------------------------
# Rooms Endpoints
# -------------------------------------------------------------------------


@router.get(
    "/rooms",
    response_model=ApiResponse[list[RoomAdminDetail]],
    status_code=status.HTTP_200_OK,
    summary="List physical rooms with filters and beds",
)
async def list_rooms(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    room_type_id: str | None = Query(default=None),
    operational_status: RoomOperationalStatus | None = Query(default=None),
    floor_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> ApiResponse[list[RoomAdminDetail]]:
    """List all physical rooms for an authorized property."""
    await verify_property_scope(property_id, session, current_user)

    query = (
        select(Room)
        .options(
            selectinload(Room.beds),
            selectinload(Room.room_type),
            selectinload(Room.floor),
        )
        .where(Room.property_id == property_id, Room.is_active.is_(True))
    )

    if room_type_id:
        query = query.where(Room.room_type_id == room_type_id)
    if operational_status:
        query = query.where(Room.operational_status == operational_status)
    if floor_id:
        query = query.where(Room.floor_id == floor_id)
    if q:
        query = query.where(Room.room_number.ilike(f"%{q}%"))

    query = query.order_by(Room.room_number.asc())
    result = await session.execute(query)
    rooms = result.scalars().all()

    details = []
    for r in rooms:
        rt = r.room_type
        details.append(
            RoomAdminDetail(
                id=r.id,
                property_id=r.property_id,
                room_type_id=r.room_type_id,
                floor_id=r.floor_id,
                room_number=r.room_number,
                operational_status=r.operational_status,
                cleanliness_status=r.cleanliness_status,
                keycard_code=r.keycard_code,
                notes=r.notes,
                is_active=r.is_active,
                created_at=r.created_at,
                updated_at=r.updated_at,
                room_type_name=rt.name if rt else "Unknown",
                room_type_code=rt.code if rt else "UNK",
                accommodation_tier=rt.accommodation_tier if rt else "hotel_room",
                is_dormitory=rt.is_dormitory if rt else False,
                capacity_adults=rt.max_capacity_adults if rt else 2,
                floor_name=r.floor.name if r.floor else None,
                beds=[BedRead.model_validate(b) for b in r.beds if b.is_active],
            )
        )

    return ApiResponse(
        success=True,
        data=details,
        message="Rooms retrieved successfully.",
    )


@router.post(
    "/rooms",
    response_model=ApiResponse[RoomAdminDetail],
    status_code=status.HTTP_201_CREATED,
    summary="Create physical room",
)
async def create_room(
    payload: RoomCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[RoomAdminDetail]:
    """Create a new room. If room type is a hostel dormitory and initial_bed_count is specified,
    automatically provisions corresponding physical bed entities.
    """
    await verify_property_scope(payload.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can create rooms.")

    # Verify room type belongs to property
    rt_res = await session.execute(
        select(RoomType).where(
            RoomType.id == payload.room_type_id,
            RoomType.property_id == payload.property_id,
        )
    )
    room_type = rt_res.scalar_one_or_none()
    if not room_type:
        raise ValidationError("Invalid room_type_id: Room type does not belong to this property.")

    # Check unique room number within property
    existing = await session.execute(
        select(Room).where(
            Room.property_id == payload.property_id,
            Room.room_number == payload.room_number.strip(),
        )
    )
    if existing.scalar_one_or_none():
        raise ResourceConflictError("Room", f"Room number '{payload.room_number}' already exists in this property.")

    new_room = Room(
        property_id=payload.property_id,
        room_type_id=payload.room_type_id,
        floor_id=payload.floor_id,
        room_number=payload.room_number.strip(),
        operational_status=payload.operational_status,
        cleanliness_status=payload.cleanliness_status,
        keycard_code=payload.keycard_code,
        notes=payload.notes,
    )
    session.add(new_room)
    await session.flush()

    # If hostel dorm, optionally auto-provision beds
    created_beds = []
    if room_type.is_dormitory:
        bed_count = payload.initial_bed_count or room_type.max_capacity_adults
        prefix = payload.initial_bed_prefix or "Bed"
        for i in range(1, bed_count + 1):
            bed_label = f"{prefix} {i}" if bed_count > 1 else f"{new_room.room_number}-1"
            bed_type = BedType.BUNK_BOTTOM if (i % 2 == 1) else BedType.BUNK_TOP
            bed = Bed(
                property_id=payload.property_id,
                room_id=new_room.id,
                bed_label=bed_label,
                bed_type=bed_type,
                locker_number=f"L-{new_room.room_number}-{i}",
                operational_status=RoomOperationalStatus.AVAILABLE,
            )
            session.add(bed)
            created_beds.append(bed)

    await session.commit()
    await session.refresh(new_room)

    return ApiResponse(
        success=True,
        data=RoomAdminDetail(
            id=new_room.id,
            property_id=new_room.property_id,
            room_type_id=new_room.room_type_id,
            floor_id=new_room.floor_id,
            room_number=new_room.room_number,
            operational_status=new_room.operational_status,
            cleanliness_status=new_room.cleanliness_status,
            keycard_code=new_room.keycard_code,
            notes=new_room.notes,
            is_active=new_room.is_active,
            created_at=new_room.created_at,
            updated_at=new_room.updated_at,
            room_type_name=room_type.name,
            room_type_code=room_type.code,
            accommodation_tier=room_type.accommodation_tier,
            is_dormitory=room_type.is_dormitory,
            capacity_adults=room_type.max_capacity_adults,
            floor_name=None,
            beds=[BedRead.model_validate(b) for b in created_beds],
        ),
        message="Room created successfully.",
    )


@router.get(
    "/rooms/{room_id}",
    response_model=ApiResponse[RoomAdminDetail],
    status_code=status.HTTP_200_OK,
    summary="Get single room details with beds",
)
async def get_room(
    room_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[RoomAdminDetail]:
    """Retrieve full room details including child beds and operational status."""
    result = await session.execute(
        select(Room)
        .options(
            selectinload(Room.beds),
            selectinload(Room.room_type),
            selectinload(Room.floor),
        )
        .where(Room.id == room_id)
    )
    room = result.scalar_one_or_none()
    if not room:
        raise EntityNotFoundError("Room", room_id)

    await verify_property_scope(room.property_id, session, current_user)

    rt = room.room_type
    return ApiResponse(
        success=True,
        data=RoomAdminDetail(
            id=room.id,
            property_id=room.property_id,
            room_type_id=room.room_type_id,
            floor_id=room.floor_id,
            room_number=room.room_number,
            operational_status=room.operational_status,
            cleanliness_status=room.cleanliness_status,
            keycard_code=room.keycard_code,
            notes=room.notes,
            is_active=room.is_active,
            created_at=room.created_at,
            updated_at=room.updated_at,
            room_type_name=rt.name if rt else "Unknown",
            room_type_code=rt.code if rt else "UNK",
            accommodation_tier=rt.accommodation_tier if rt else "hotel_room",
            is_dormitory=rt.is_dormitory if rt else False,
            capacity_adults=rt.max_capacity_adults if rt else 2,
            floor_name=room.floor.name if room.floor else None,
            beds=[BedRead.model_validate(b) for b in room.beds if b.is_active],
        ),
        message="Room details retrieved.",
    )


@router.put(
    "/rooms/{room_id}",
    response_model=ApiResponse[RoomRead],
    status_code=status.HTTP_200_OK,
    summary="Update room details",
)
async def update_room(
    room_id: str,
    payload: RoomUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[RoomRead]:
    """Update room attributes."""
    result = await session.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise EntityNotFoundError("Room", room_id)

    await verify_property_scope(room.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
        UserRole.FRONT_DESK,
    ):
        raise PermissionDeniedError("Lacks permission to update room configuration.")

    # Check duplicate room number if changed
    if payload.room_number and payload.room_number != room.room_number:
        dup = await session.execute(
            select(Room).where(
                Room.property_id == room.property_id,
                Room.room_number == payload.room_number.strip(),
                Room.id != room.id,
            )
        )
        if dup.scalar_one_or_none():
            raise ResourceConflictError("Room", f"Room number '{payload.room_number}' is already taken.")

    update_dict = payload.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(room, k, v)

    await session.commit()
    await session.refresh(room)
    return ApiResponse(
        success=True,
        data=RoomRead.model_validate(room),
        message="Room updated.",
    )


@router.patch(
    "/rooms/{room_id}/status",
    response_model=ApiResponse[RoomRead],
    status_code=status.HTTP_200_OK,
    summary="Update room operational and cleanliness status",
)
async def update_room_status(
    room_id: str,
    operational_status: RoomOperationalStatus | None = None,
    cleanliness_status: str | None = None,
    session: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore
    current_user: Annotated[User, Depends(get_current_user)] = None,  # type: ignore
) -> ApiResponse[RoomRead]:
    """Fast status transition for front desk and housekeeping teams."""
    result = await session.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise EntityNotFoundError("Room", room_id)

    await verify_property_scope(room.property_id, session, current_user)
    if operational_status:
        room.operational_status = operational_status
    if cleanliness_status:
        room.cleanliness_status = cleanliness_status  # type: ignore

    await session.commit()
    await session.refresh(room)
    return ApiResponse(
        success=True,
        data=RoomRead.model_validate(room),
        message=f"Room status updated to {room.operational_status.value}.",
    )


@router.post(
    "/rooms/{room_id}/block",
    response_model=ApiResponse[MaintenanceBlockResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Block room for maintenance",
)
async def block_room_for_maintenance(
    room_id: str,
    payload: MaintenanceBlockRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[MaintenanceBlockResponse]:
    """Place a maintenance lock on a physical room for a specific date window."""
    result = await session.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise EntityNotFoundError("Room", room_id)

    await verify_property_scope(room.property_id, session, current_user)

    alloc = await atomic_allocate_inventory(
        session=session,
        property_id=room.property_id,
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        allocation_type=InventoryAllocationType.MAINTENANCE_BLOCK,
        room_id=room.id,
        notes=payload.notes,
        user_id=current_user.id,
    )
    await session.commit()

    return ApiResponse(
        success=True,
        data=MaintenanceBlockResponse(
            id=alloc.id,
            property_id=alloc.property_id,
            room_id=alloc.room_id,
            check_in_date=alloc.check_in_date,
            check_out_date=alloc.check_out_date,
            allocation_type=alloc.allocation_type.value,
            notes=alloc.notes,
            created_at=alloc.created_at,
        ),
        message="Room blocked for maintenance.",
    )


@router.delete(
    "/rooms/{room_id}",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Safely deactivate room",
)
async def delete_room(
    room_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[dict]:
    """Soft deactivates a room. Validates that no future active allocations exist."""
    result = await session.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise EntityNotFoundError("Room", room_id)

    await verify_property_scope(room.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can deactivate rooms.")

    # Check for active future allocations
    active_allocs = await session.execute(
        select(InventoryAllocation).where(
            InventoryAllocation.room_id == room_id,
            InventoryAllocation.is_active.is_(True),
            InventoryAllocation.check_out_date >= date.today(),
        )
    )
    if active_allocs.scalars().first():
        raise ValidationError(
            "Cannot deactivate room: Active reservations or maintenance blocks exist."
        )

    room.is_active = False
    await session.commit()
    return ApiResponse(
        success=True,
        data={"id": room_id, "is_active": False},
        message="Room deactivated safely.",
    )


# -------------------------------------------------------------------------
# Beds Endpoints (Hostels)
# -------------------------------------------------------------------------


@router.get(
    "/beds",
    response_model=ApiResponse[list[BedRead]],
    status_code=status.HTTP_200_OK,
    summary="List beds for a room or property",
)
async def list_beds(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    room_id: str | None = Query(default=None),
) -> ApiResponse[list[BedRead]]:
    """List physical beds in hostel dormitory rooms."""
    await verify_property_scope(property_id, session, current_user)

    query = select(Bed).where(Bed.property_id == property_id, Bed.is_active.is_(True))
    if room_id:
        query = query.where(Bed.room_id == room_id)

    query = query.order_by(Bed.bed_label.asc())
    result = await session.execute(query)
    beds = result.scalars().all()

    return ApiResponse(
        success=True,
        data=[BedRead.model_validate(b) for b in beds],
        message="Beds retrieved.",
    )


@router.post(
    "/beds",
    response_model=ApiResponse[BedRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create a bed in a dormitory room",
)
async def create_bed(
    payload: BedCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[BedRead]:
    """Add a physical bed to a hostel dormitory room."""
    await verify_property_scope(payload.property_id, session, current_user)
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can configure beds.")

    # Verify room belongs to property and is dormitory
    room_res = await session.execute(
        select(Room)
        .options(selectinload(Room.room_type))
        .where(Room.id == payload.room_id, Room.property_id == payload.property_id)
    )
    room = room_res.scalar_one_or_none()
    if not room:
        raise ValidationError("Room not found or does not belong to target property.")
    if not room.room_type.is_dormitory:
        raise ValidationError("Cannot add individual beds to a non-dormitory private hotel room.")

    # Check duplicate bed label in room
    existing = await session.execute(
        select(Bed).where(
            Bed.room_id == payload.room_id,
            Bed.bed_label == payload.bed_label.strip(),
            Bed.is_active.is_(True),
        )
    )
    if existing.scalar_one_or_none():
        raise ResourceConflictError("Bed", f"Bed label '{payload.bed_label}' already exists in room {room.room_number}.")

    new_bed = Bed(
        property_id=payload.property_id,
        room_id=payload.room_id,
        bed_label=payload.bed_label.strip(),
        bed_type=payload.bed_type,
        locker_number=payload.locker_number,
        operational_status=payload.operational_status,
    )
    session.add(new_bed)
    await session.commit()
    await session.refresh(new_bed)

    return ApiResponse(
        success=True,
        data=BedRead.model_validate(new_bed),
        message="Bed added to dormitory.",
    )


@router.put(
    "/beds/{bed_id}",
    response_model=ApiResponse[BedRead],
    status_code=status.HTTP_200_OK,
    summary="Update bed details",
)
async def update_bed(
    bed_id: str,
    payload: BedUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[BedRead]:
    """Update bed label, type, locker, or operational status."""
    result = await session.execute(select(Bed).where(Bed.id == bed_id))
    bed = result.scalar_one_or_none()
    if not bed:
        raise EntityNotFoundError("Bed", bed_id)

    await verify_property_scope(bed.property_id, session, current_user)

    update_dict = payload.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(bed, k, v)

    await session.commit()
    await session.refresh(bed)
    return ApiResponse(
        success=True,
        data=BedRead.model_validate(bed),
        message="Bed updated.",
    )


@router.patch(
    "/beds/{bed_id}/status",
    response_model=ApiResponse[BedRead],
    status_code=status.HTTP_200_OK,
    summary="Quick update bed operational status",
)
async def update_bed_status(
    bed_id: str,
    operational_status: RoomOperationalStatus,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[BedRead]:
    """Update bed operational status."""
    result = await session.execute(select(Bed).where(Bed.id == bed_id))
    bed = result.scalar_one_or_none()
    if not bed:
        raise EntityNotFoundError("Bed", bed_id)

    await verify_property_scope(bed.property_id, session, current_user)
    bed.operational_status = operational_status
    await session.commit()
    await session.refresh(bed)

    return ApiResponse(
        success=True,
        data=BedRead.model_validate(bed),
        message=f"Bed status updated to {bed.operational_status.value}.",
    )


@router.post(
    "/beds/{bed_id}/block",
    response_model=ApiResponse[MaintenanceBlockResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Block bed for maintenance",
)
async def block_bed_for_maintenance(
    bed_id: str,
    payload: MaintenanceBlockRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[MaintenanceBlockResponse]:
    """Place a maintenance lock on a single hostel bed."""
    result = await session.execute(select(Bed).where(Bed.id == bed_id))
    bed = result.scalar_one_or_none()
    if not bed:
        raise EntityNotFoundError("Bed", bed_id)

    await verify_property_scope(bed.property_id, session, current_user)

    alloc = await atomic_allocate_inventory(
        session=session,
        property_id=bed.property_id,
        check_in_date=payload.check_in_date,
        check_out_date=payload.check_out_date,
        allocation_type=InventoryAllocationType.MAINTENANCE_BLOCK,
        bed_id=bed.id,
        notes=payload.notes,
        user_id=current_user.id,
    )
    await session.commit()

    return ApiResponse(
        success=True,
        data=MaintenanceBlockResponse(
            id=alloc.id,
            property_id=alloc.property_id,
            bed_id=alloc.bed_id,
            check_in_date=alloc.check_in_date,
            check_out_date=alloc.check_out_date,
            allocation_type=alloc.allocation_type.value,
            notes=alloc.notes,
            created_at=alloc.created_at,
        ),
        message="Bed blocked for maintenance.",
    )


@router.delete(
    "/beds/{bed_id}",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Safely deactivate bed",
)
async def delete_bed(
    bed_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[dict]:
    """Deactivates a bed if no active allocations exist."""
    result = await session.execute(select(Bed).where(Bed.id == bed_id))
    bed = result.scalar_one_or_none()
    if not bed:
        raise EntityNotFoundError("Bed", bed_id)

    await verify_property_scope(bed.property_id, session, current_user)

    active_allocs = await session.execute(
        select(InventoryAllocation).where(
            InventoryAllocation.bed_id == bed_id,
            InventoryAllocation.is_active.is_(True),
            InventoryAllocation.check_out_date >= date.today(),
        )
    )
    if active_allocs.scalars().first():
        raise ValidationError(
            "Cannot deactivate bed: Active reservations or maintenance blocks exist."
        )

    bed.is_active = False
    await session.commit()
    return ApiResponse(
        success=True,
        data={"id": bed_id, "is_active": False},
        message="Bed deactivated safely.",
    )


# -------------------------------------------------------------------------
# Availability Engine & Telemetry Endpoints
# -------------------------------------------------------------------------


@router.get(
    "/availability",
    response_model=ApiResponse[PropertyAvailabilityResponse],
    status_code=status.HTTP_200_OK,
    summary="Query property availability for stay dates",
)
async def query_availability(
    property_id: str,
    check_in_date: date,
    check_out_date: date,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    room_type_id: str | None = Query(default=None),
) -> ApiResponse[PropertyAvailabilityResponse]:
    """Calculate precise availability for requested check-in and check-out dates.
    Enforces inclusive check-in, exclusive check-out semantics.
    """
    await verify_property_scope(property_id, session, current_user)

    data = await calculate_property_availability(
        session=session,
        property_id=property_id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        room_type_id=room_type_id,
    )
    return ApiResponse(
        success=True,
        data=data,
        message=f"Availability calculated for {data.total_nights} night(s).",
    )


@router.get(
    "/summary",
    response_model=ApiResponse[InventorySummaryResponse],
    status_code=status.HTTP_200_OK,
    summary="Get property inventory telemetry summary",
)
async def get_inventory_summary(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[InventorySummaryResponse]:
    """Retrieve operational inventory breakdown (rooms, beds, occupancy)."""
    await verify_property_scope(property_id, session, current_user)

    today = date.today()
    tomorrow = today + timedelta(days=1)
    avail = await calculate_property_availability(
        session=session,
        property_id=property_id,
        check_in_date=today,
        check_out_date=tomorrow,
    )

    # Calculate aggregate numbers
    total_rooms = 0
    total_beds = 0
    rooms_avail = 0
    rooms_occ = 0
    rooms_maint = 0
    beds_avail = 0
    beds_occ = 0
    beds_maint = 0

    for u in avail.units:
        if u.unit_type == "bed":
            total_beds += 1
            if u.is_available:
                beds_avail += 1
            elif u.operational_status in (
                RoomOperationalStatus.MAINTENANCE,
                RoomOperationalStatus.OUT_OF_ORDER,
            ):
                beds_maint += 1
            else:
                beds_occ += 1
        else:
            total_rooms += 1
            if u.is_available:
                rooms_avail += 1
            elif u.operational_status in (
                RoomOperationalStatus.MAINTENANCE,
                RoomOperationalStatus.OUT_OF_ORDER,
            ):
                rooms_maint += 1
            else:
                rooms_occ += 1

    total_capacity = total_rooms + total_beds
    total_occupied = rooms_occ + beds_occ
    occupancy_rate = (
        round((total_occupied / total_capacity) * 100) if total_capacity > 0 else 0
    )

    return ApiResponse(
        success=True,
        data=InventorySummaryResponse(
            property_id=property_id,
            total_active_rooms=total_rooms,
            total_active_beds=total_beds,
            rooms_available=rooms_avail,
            rooms_occupied=rooms_occ,
            rooms_maintenance=rooms_maint,
            beds_available=beds_avail,
            beds_occupied=beds_occ,
            beds_maintenance=beds_maint,
            occupancy_rate_percentage=occupancy_rate,
            room_types_breakdown=avail.room_types,
        ),
        message="Inventory operational summary loaded.",
    )


@router.get(
    "/calendar",
    response_model=ApiResponse[CalendarMatrixResponse],
    status_code=status.HTTP_200_OK,
    summary="Get interactive availability calendar matrix",
)
async def get_inventory_calendar(
    property_id: str,
    start_date: date,
    end_date: date,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[CalendarMatrixResponse]:
    """Retrieve day-by-day status grid for visual availability calendar."""
    await verify_property_scope(property_id, session, current_user)
    validate_stay_date_range(start_date, end_date)

    days_count = (end_date - start_date).days
    date_list = [start_date + timedelta(days=i) for i in range(days_count)]

    # Fetch rooms and beds
    rooms_res = await session.execute(
        select(Room)
        .options(
            selectinload(Room.beds),
            selectinload(Room.room_type),
            selectinload(Room.floor),
        )
        .where(Room.property_id == property_id, Room.is_active.is_(True))
        .order_by(Room.room_number.asc())
    )
    rooms = rooms_res.scalars().all()

    # Fetch all allocations across the full window
    allocs_res = await session.execute(
        select(InventoryAllocation)
        .where(
            InventoryAllocation.property_id == property_id,
            InventoryAllocation.is_active.is_(True),
            InventoryAllocation.check_in_date < end_date,
            InventoryAllocation.check_out_date > start_date,
        )
    )
    allocations = allocs_res.scalars().all()

    rows: list[CalendarRowItem] = []

    for room in rooms:
        rt = room.room_type
        if not rt:
            continue

        if rt.is_dormitory:
            for bed in [b for b in room.beds if b.is_active]:
                daily_statuses: list[DailyUnitStatus] = []
                for d in date_list:
                    d_next = d + timedelta(days=1)
                    # Check allocation for this single night
                    matching = [
                        a
                        for a in allocations
                        if (a.bed_id == bed.id or a.room_id == room.id)
                        and a.check_in_date < d_next
                        and a.check_out_date > d
                    ]
                    if room.operational_status in (
                        RoomOperationalStatus.MAINTENANCE,
                        RoomOperationalStatus.OUT_OF_ORDER,
                    ) or bed.operational_status in (
                        RoomOperationalStatus.MAINTENANCE,
                        RoomOperationalStatus.OUT_OF_ORDER,
                    ):
                        st = "maintenance"
                    elif any(
                        a.allocation_type == InventoryAllocationType.MAINTENANCE_BLOCK
                        for a in matching
                    ):
                        st = "blocked"
                    elif matching:
                        st = "reserved"
                    else:
                        st = "available"

                    daily_statuses.append(DailyUnitStatus(date=d, status=st))

                rows.append(
                    CalendarRowItem(
                        unit_id=bed.id,
                        unit_type="bed",
                        identifier=f"{room.room_number} - {bed.bed_label}",
                        room_number=room.room_number,
                        room_type_name=rt.name,
                        floor_name=room.floor.name if room.floor else None,
                        days=daily_statuses,
                    )
                )
        else:
            daily_statuses = []
            for d in date_list:
                d_next = d + timedelta(days=1)
                matching = [
                    a
                    for a in allocations
                    if a.room_id == room.id
                    and a.check_in_date < d_next
                    and a.check_out_date > d
                ]
                if room.operational_status in (
                    RoomOperationalStatus.MAINTENANCE,
                    RoomOperationalStatus.OUT_OF_ORDER,
                ):
                    st = "maintenance"
                elif any(
                    a.allocation_type == InventoryAllocationType.MAINTENANCE_BLOCK
                    for a in matching
                ):
                    st = "blocked"
                elif matching:
                    st = "reserved"
                else:
                    st = "available"

                daily_statuses.append(DailyUnitStatus(date=d, status=st))

            rows.append(
                CalendarRowItem(
                    unit_id=room.id,
                    unit_type="room",
                    identifier=room.room_number,
                    room_number=room.room_number,
                    room_type_name=rt.name,
                    floor_name=room.floor.name if room.floor else None,
                    days=daily_statuses,
                )
            )

    return ApiResponse(
        success=True,
        data=CalendarMatrixResponse(
            property_id=property_id,
            start_date=start_date,
            end_date=end_date,
            total_days=days_count,
            rows=rows,
        ),
        message="Calendar availability matrix loaded.",
    )
