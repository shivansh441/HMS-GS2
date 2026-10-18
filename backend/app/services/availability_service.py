"""Centralized availability service for hotel room suites and hostel bed inventory."""

from datetime import UTC, date, datetime
from typing import Sequence

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ResourceConflictError, ValidationError
from app.models.booking import (
    Booking,
    BookingStatus,
    InventoryAllocation,
    InventoryAllocationType,
)
from app.models.inventory import (
    AccommodationTier,
    Bed,
    Room,
    RoomOperationalStatus,
    RoomType,
)
from app.models.property import Property, PublicationStatus
from app.schemas.inventory import (
    AvailabilityUnitItem,
    CalendarMatrixResponse,
    CalendarRowItem,
    DailyUnitStatus,
    InventorySummaryResponse,
    PropertyAvailabilityResponse,
    RoomTypeAvailabilitySummary,
)


def validate_stay_date_range(check_in_date: date, check_out_date: date) -> int:
    """Validate standard hospitality [check_in, check_out) half-open date interval.
    Check-in date is inclusive, check-out date is exclusive.
    Returns total nights.
    """
    if check_out_date <= check_in_date:
        raise ValidationError(
            f"Invalid date range: check_out_date ({check_out_date}) must be strictly after check_in_date ({check_in_date})."
        )
    return (check_out_date - check_in_date).days


def has_interval_overlap(
    alloc_in: date, alloc_out: date, candidate_in: date, candidate_out: date
) -> bool:
    """Half-open interval overlap check [check_in, check_out).
    Two stays overlap iff alloc_in < candidate_out AND alloc_out > candidate_in.
    Same-day turnover (alloc_out == candidate_in) evaluates to False.
    """
    return alloc_in < candidate_out and alloc_out > candidate_in


async def get_active_allocations_for_dates(
    session: AsyncSession,
    property_id: str,
    check_in_date: date,
    check_out_date: date,
    room_id: str | None = None,
    bed_id: str | None = None,
    exclude_allocation_id: str | None = None,
) -> Sequence[InventoryAllocation]:
    """Retrieve active allocations overlapping the candidate stay window.
    Applies standard half-open interval overlap condition and respects booking lifecycle states.
    """
    query = (
        select(InventoryAllocation)
        .outerjoin(InventoryAllocation.booking_item)
        .outerjoin(Booking, Booking.id == InventoryAllocation.booking_item.has())  # type: ignore
        .where(
            InventoryAllocation.property_id == property_id,
            InventoryAllocation.is_active.is_(True),
            InventoryAllocation.check_in_date < check_out_date,
            InventoryAllocation.check_out_date > check_in_date,
        )
    )

    if room_id:
        query = query.where(InventoryAllocation.room_id == room_id)
    if bed_id:
        query = query.where(InventoryAllocation.bed_id == bed_id)
    if exclude_allocation_id:
        query = query.where(InventoryAllocation.id != exclude_allocation_id)

    result = await session.execute(query)
    allocations = result.scalars().all()

    now = datetime.now(UTC)
    blocking_allocations = []
    for alloc in allocations:
        # Maintenance blocks are always active locks
        if alloc.allocation_type == InventoryAllocationType.MAINTENANCE_BLOCK:
            blocking_allocations.append(alloc)
            continue

        # If attached to a booking, check status
        if alloc.booking_item and alloc.booking_item.booking:
            booking = alloc.booking_item.booking
            if booking.booking_status in (
                BookingStatus.CONFIRMED,
                BookingStatus.CHECKED_IN,
            ):
                blocking_allocations.append(alloc)
            elif booking.booking_status == BookingStatus.PENDING:
                # Check hold expiration
                if not booking.hold_expires_at or booking.hold_expires_at > now:
                    blocking_allocations.append(alloc)
        else:
            # Standalone reservation lock without parent booking (e.g. manual front-desk lock)
            blocking_allocations.append(alloc)

    return blocking_allocations


async def calculate_property_availability(
    session: AsyncSession,
    property_id: str,
    check_in_date: date,
    check_out_date: date,
    room_type_id: str | None = None,
) -> PropertyAvailabilityResponse:
    """Calculate availability breakdown for all room types and units in a property."""
    total_nights = validate_stay_date_range(check_in_date, check_out_date)

    # Load room types
    rt_query = select(RoomType).where(
        RoomType.property_id == property_id,
        RoomType.is_active.is_(True),
    )
    if room_type_id:
        rt_query = rt_query.where(RoomType.id == room_type_id)
    rt_res = await session.execute(rt_query)
    room_types = rt_res.scalars().all()

    # Load physical rooms with beds
    rooms_query = (
        select(Room)
        .options(selectinload(Room.beds), selectinload(Room.room_type))
        .where(
            Room.property_id == property_id,
            Room.is_active.is_(True),
        )
    )
    if room_type_id:
        rooms_query = rooms_query.where(Room.room_type_id == room_type_id)
    rooms_res = await session.execute(rooms_query)
    rooms = rooms_res.scalars().all()

    # Load overlapping allocations for the property
    overlapping_allocs = await get_active_allocations_for_dates(
        session=session,
        property_id=property_id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
    )

    blocked_room_ids = {a.room_id for a in overlapping_allocs if a.room_id}
    blocked_bed_ids = {a.bed_id for a in overlapping_allocs if a.bed_id}

    units: list[AvailabilityUnitItem] = []
    rt_stats: dict[str, dict[str, int]] = {
        rt.id: {
            "total": 0,
            "available": 0,
            "occupied": 0,
            "maintenance": 0,
        }
        for rt in room_types
    }

    for room in rooms:
        rt = room.room_type
        if not rt or rt.id not in rt_stats:
            continue

        room_is_maint = room.operational_status in (
            RoomOperationalStatus.MAINTENANCE,
            RoomOperationalStatus.OUT_OF_ORDER,
        )

        if rt.is_dormitory:
            # Hostel Dormitory -> Bed-level inventory
            active_beds = [b for b in room.beds if b.is_active]
            for bed in active_beds:
                rt_stats[rt.id]["total"] += 1
                bed_is_maint = room_is_maint or bed.operational_status in (
                    RoomOperationalStatus.MAINTENANCE,
                    RoomOperationalStatus.OUT_OF_ORDER,
                )
                bed_is_allocated = bed.id in blocked_bed_ids or room.id in blocked_room_ids

                if bed_is_maint:
                    rt_stats[rt.id]["maintenance"] += 1
                    status_reason = "Bed or Room under maintenance"
                    is_avail = False
                elif bed_is_allocated:
                    rt_stats[rt.id]["occupied"] += 1
                    status_reason = "Bed reserved or occupied for requested dates"
                    is_avail = False
                else:
                    rt_stats[rt.id]["available"] += 1
                    status_reason = None
                    is_avail = True

                units.append(
                    AvailabilityUnitItem(
                        id=bed.id,
                        unit_type="bed",
                        identifier=bed.bed_label,
                        room_number=room.room_number,
                        room_id=room.id,
                        room_type_id=rt.id,
                        room_type_name=rt.name,
                        accommodation_tier=rt.accommodation_tier,
                        is_dormitory=True,
                        base_price_per_night=rt.base_price_amount,
                        operational_status=bed.operational_status,
                        is_available=is_avail,
                        conflict_reason=status_reason,
                    )
                )
        else:
            # Hotel Private Suite -> Room-level inventory
            rt_stats[rt.id]["total"] += 1
            room_is_allocated = room.id in blocked_room_ids

            if room_is_maint:
                rt_stats[rt.id]["maintenance"] += 1
                status_reason = "Room under maintenance or out of order"
                is_avail = False
            elif room_is_allocated:
                rt_stats[rt.id]["occupied"] += 1
                status_reason = "Room reserved or occupied for requested dates"
                is_avail = False
            else:
                rt_stats[rt.id]["available"] += 1
                status_reason = None
                is_avail = True

            units.append(
                AvailabilityUnitItem(
                    id=room.id,
                    unit_type="room",
                    identifier=room.room_number,
                    room_number=room.room_number,
                    room_id=room.id,
                    room_type_id=rt.id,
                    room_type_name=rt.name,
                    accommodation_tier=rt.accommodation_tier,
                    is_dormitory=False,
                    base_price_per_night=rt.base_price_amount,
                    operational_status=room.operational_status,
                    is_available=is_avail,
                    conflict_reason=status_reason,
                )
            )

    summaries: list[RoomTypeAvailabilitySummary] = []
    for rt in room_types:
        counts = rt_stats[rt.id]
        summaries.append(
            RoomTypeAvailabilitySummary(
                room_type_id=rt.id,
                room_type_name=rt.name,
                slug=rt.slug,
                accommodation_tier=rt.accommodation_tier,
                is_dormitory=rt.is_dormitory,
                base_price_per_night=rt.base_price_amount,
                total_units=counts["total"],
                available_units=counts["available"],
                occupied_or_reserved_units=counts["occupied"],
                blocked_or_maintenance_units=counts["maintenance"],
            )
        )

    return PropertyAvailabilityResponse(
        property_id=property_id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        total_nights=total_nights,
        is_stay_valid=True,
        room_types=summaries,
        units=units,
    )


async def atomic_allocate_inventory(
    session: AsyncSession,
    property_id: str,
    check_in_date: date,
    check_out_date: date,
    allocation_type: InventoryAllocationType,
    room_id: str | None = None,
    bed_id: str | None = None,
    booking_item_id: str | None = None,
    notes: str | None = None,
    user_id: str | None = None,
) -> InventoryAllocation:
    """Atomic inventory allocation with PostgreSQL SELECT ... FOR UPDATE row-level locking.
    Prevents race conditions and double bookings.
    """
    validate_stay_date_range(check_in_date, check_out_date)

    if not room_id and not bed_id:
        raise ValidationError("Either room_id or bed_id must be provided for allocation.")

    # Lock target inventory row
    if room_id:
        room_res = await session.execute(
            select(Room).where(Room.id == room_id).with_for_update()
        )
        target_room = room_res.scalar_one_or_none()
        if not target_room:
            raise ValidationError(f"Room '{room_id}' not found.")
        if target_room.property_id != property_id:
            raise ValidationError("Room does not belong to the target property.")
        if (
            allocation_type != InventoryAllocationType.MAINTENANCE_BLOCK
            and target_room.operational_status in (
                RoomOperationalStatus.MAINTENANCE,
                RoomOperationalStatus.OUT_OF_ORDER,
            )
        ):
            raise ResourceConflictError(
                "Room", f"Room {target_room.room_number} is currently under maintenance."
            )

    if bed_id:
        bed_res = await session.execute(
            select(Bed).where(Bed.id == bed_id).with_for_update()
        )
        target_bed = bed_res.scalar_one_or_none()
        if not target_bed:
            raise ValidationError(f"Bed '{bed_id}' not found.")
        if target_bed.property_id != property_id:
            raise ValidationError("Bed does not belong to the target property.")
        if (
            allocation_type != InventoryAllocationType.MAINTENANCE_BLOCK
            and target_bed.operational_status in (
                RoomOperationalStatus.MAINTENANCE,
                RoomOperationalStatus.OUT_OF_ORDER,
            )
        ):
            raise ResourceConflictError(
                "Bed", f"Bed {target_bed.bed_label} is currently under maintenance."
            )

    # Re-verify availability inside the transaction
    conflicts = await get_active_allocations_for_dates(
        session=session,
        property_id=property_id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        room_id=room_id,
        bed_id=bed_id,
    )

    if conflicts:
        target_desc = f"Room {room_id}" if room_id else f"Bed {bed_id}"
        conflict = conflicts[0]
        raise ResourceConflictError(
            "InventoryAllocation",
            f"Concurrency conflict: {target_desc} already has active allocation "
            f"({conflict.check_in_date} -> {conflict.check_out_date}) overlapping candidate window "
            f"({check_in_date} -> {check_out_date}).",
        )

    # Safe to create allocation
    new_alloc = InventoryAllocation(
        property_id=property_id,
        room_id=room_id,
        bed_id=bed_id,
        booking_item_id=booking_item_id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        allocation_type=allocation_type,
        notes=notes,
        created_by_user_id=user_id,
        is_active=True,
    )
    session.add(new_alloc)
    await session.flush()
    return new_alloc
