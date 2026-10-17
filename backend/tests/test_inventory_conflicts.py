"""Tests for inventory conflict prevention, stay conventions, and multi-property isolation."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import (
    Booking,
    BookingSource,
    BookingStatus,
    InventoryAllocation,
)
from app.models.guest import Guest
from app.models.inventory import AccommodationTier, Room, RoomType
from app.models.property import Property, PropertyType, PublicationStatus


@pytest.mark.asyncio
async def test_stay_convention_non_overlapping_turnover(db_session: AsyncSession) -> None:
    """Verify hospitality standard [check_in, check_out) convention.

    Guest 1 checks out on Oct 5.
    Guest 2 checks in on Oct 5.
    Both may assign the same room because checkout is exclusive.
    """
    prop = Property(
        name="Turnover Test Hotel",
        code="TO-01",
        slug="turnover-test-hotel",
        property_type=PropertyType.HOTEL,
        currency="USD",
        timezone="UTC",
        address="100 Main St",
        city="Denver",
        country="USA",
    )
    db_session.add(prop)
    await db_session.flush()

    rt = RoomType(
        property_id=prop.id,
        name="Deluxe King",
        slug="deluxe-king",
        code="DLX-K",
        accommodation_tier=AccommodationTier.HOTEL_ROOM,
    )
    db_session.add(rt)
    await db_session.flush()

    room = Room(property_id=prop.id, room_type_id=rt.id, room_number="201")
    db_session.add(room)
    await db_session.flush()

    guest1 = Guest(email="guest1@example.com", first_name="John", last_name="Doe")
    guest2 = Guest(email="guest2@example.com", first_name="Jane", last_name="Smith")
    db_session.add_all([guest1, guest2])
    await db_session.flush()

    # Stay 1: Oct 1 -> Oct 5
    d1_in, d1_out = date(2026, 10, 1), date(2026, 10, 5)
    alloc1 = InventoryAllocation(
        property_id=prop.id,
        room_id=room.id,
        check_in_date=d1_in,
        check_out_date=d1_out,
        is_active=True,
    )
    # Stay 2: Oct 5 -> Oct 8 (Begins on Stay 1 departure date)
    d2_in, d2_out = date(2026, 10, 5), date(2026, 10, 8)
    alloc2 = InventoryAllocation(
        property_id=prop.id,
        room_id=room.id,
        check_in_date=d2_in,
        check_out_date=d2_out,
        is_active=True,
    )
    db_session.add_all([alloc1, alloc2])
    await db_session.commit()

    # Concurrency query check using standard half-open interval overlap logic:
    # Overlap occurs iff (alloc.check_in_date < candidate_out) AND (alloc.check_out_date > candidate_in)
    # For Stay 2 against Stay 1: (Oct 1 < Oct 8) is TRUE, BUT (Oct 5 > Oct 5) is FALSE!
    # Therefore NO OVERLAP!
    result = await db_session.execute(
        select(InventoryAllocation).where(
            InventoryAllocation.room_id == room.id,
            InventoryAllocation.is_active,
            InventoryAllocation.check_in_date < d2_out,
            InventoryAllocation.check_out_date > d2_in,
            InventoryAllocation.id != alloc2.id,
        )
    )
    conflicts = result.scalars().all()
    assert len(conflicts) == 0, "Same day turnover should NOT trigger conflict"


@pytest.mark.asyncio
async def test_stay_convention_overlapping_conflict_detected(db_session: AsyncSession) -> None:
    """Verify that an overlapping date range IS detected as a conflict."""
    prop = Property(
        name="Conflict Test Hotel",
        code="CONF-01",
        slug="conflict-test-hotel",
        property_type=PropertyType.HOTEL,
        currency="USD",
        timezone="UTC",
        address="200 Broadway",
        city="New York",
        country="USA",
    )
    db_session.add(prop)
    await db_session.flush()

    rt = RoomType(
        property_id=prop.id,
        name="King Room",
        slug="king-room",
        code="KNG",
        accommodation_tier=AccommodationTier.HOTEL_ROOM,
    )
    db_session.add(rt)
    await db_session.flush()

    room = Room(property_id=prop.id, room_type_id=rt.id, room_number="301")
    db_session.add(room)
    await db_session.flush()

    # Existing allocation: Oct 1 -> Oct 5
    existing_in, existing_out = date(2026, 10, 1), date(2026, 10, 5)
    existing_alloc = InventoryAllocation(
        property_id=prop.id,
        room_id=room.id,
        check_in_date=existing_in,
        check_out_date=existing_out,
        is_active=True,
    )
    db_session.add(existing_alloc)
    await db_session.commit()

    # Candidate 1: Oct 2 -> Oct 6 (Overlaps Oct 2, 3, 4)
    cand1_in, cand1_out = date(2026, 10, 2), date(2026, 10, 6)
    result1 = await db_session.execute(
        select(InventoryAllocation).where(
            InventoryAllocation.room_id == room.id,
            InventoryAllocation.is_active,
            InventoryAllocation.check_in_date < cand1_out,
            InventoryAllocation.check_out_date > cand1_in,
        )
    )
    conflicts1 = result1.scalars().all()
    assert len(conflicts1) == 1, "Candidate spanning Oct 2-6 must conflict with Oct 1-5"

    # Candidate 2: Oct 4 -> Oct 5 (Overlaps Oct 4)
    cand2_in, cand2_out = date(2026, 10, 4), date(2026, 10, 5)
    result2 = await db_session.execute(
        select(InventoryAllocation).where(
            InventoryAllocation.room_id == room.id,
            InventoryAllocation.is_active,
            InventoryAllocation.check_in_date < cand2_out,
            InventoryAllocation.check_out_date > cand2_in,
        )
    )
    conflicts2 = result2.scalars().all()
    assert len(conflicts2) == 1, "Candidate spanning Oct 4-5 must conflict with Oct 1-5"


@pytest.mark.asyncio
async def test_expired_temporary_holds_do_not_block_inventory(db_session: AsyncSession) -> None:
    """Verify that expired temporary holds (PENDING + hold_expires_at in past) do not consume inventory."""
    prop = Property(
        name="Hold Test Hostel",
        code="HLD-01",
        slug="hold-test-hostel",
        property_type=PropertyType.HOSTEL,
        currency="USD",
        timezone="UTC",
        address="55 Beach Rd",
        city="Miami",
        country="USA",
    )
    db_session.add(prop)
    await db_session.flush()

    guest = Guest(email="hold.guest@example.com", first_name="Hold", last_name="Customer")
    db_session.add(guest)
    await db_session.flush()

    now = datetime.now(UTC)

    # Booking 1: Expired hold (was held for 15 minutes, expired 10 minutes ago)
    expired_booking = Booking(
        booking_reference="GS-HLD-EXPIRED",
        property_id=prop.id,
        guest_id=guest.id,
        booking_source=BookingSource.PUBLIC_WEBSITE,
        booking_status=BookingStatus.PENDING,
        check_in_date=date(2026, 11, 1),
        check_out_date=date(2026, 11, 5),
        currency="USD",
        base_amount=Decimal("100.00"),
        total_amount=Decimal("100.00"),
        hold_expires_at=now - timedelta(minutes=10),
    )
    # Booking 2: Active confirmed booking
    confirmed_booking = Booking(
        booking_reference="GS-HLD-ACTIVE",
        property_id=prop.id,
        guest_id=guest.id,
        booking_source=BookingSource.PUBLIC_WEBSITE,
        booking_status=BookingStatus.CONFIRMED,
        check_in_date=date(2026, 11, 10),
        check_out_date=date(2026, 11, 15),
        currency="USD",
        base_amount=Decimal("150.00"),
        total_amount=Decimal("150.00"),
    )
    db_session.add_all([expired_booking, confirmed_booking])
    await db_session.commit()

    # Query active inventory blockers:
    # A booking actively blocks inventory IF:
    # 1. Status is CONFIRMED or CHECKED_IN
    # OR 2. Status is PENDING AND hold_expires_at > CURRENT_TIME
    active_blockers_query = select(Booking).where(
        Booking.property_id == prop.id,
        or_(
            Booking.booking_status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
            and_(
                Booking.booking_status == BookingStatus.PENDING,
                Booking.hold_expires_at > now,
            ),
        ),
    )
    result = await db_session.execute(active_blockers_query)
    active_blockers = result.scalars().all()

    assert len(active_blockers) == 1
    assert active_blockers[0].booking_reference == "GS-HLD-ACTIVE"


@pytest.mark.asyncio
async def test_public_discovery_filters(db_session: AsyncSession) -> None:
    """Verify that public search results only return published, bookable, and active properties."""
    p_published = Property(
        name="Publicly Visible Hotel",
        code="PUB-01",
        slug="publicly-visible-hotel",
        property_type=PropertyType.HOTEL,
        publication_status=PublicationStatus.PUBLISHED,
        is_bookable=True,
        currency="USD",
        timezone="UTC",
        address="100 First St",
        city="Seattle",
        country="USA",
    )
    p_draft = Property(
        name="Draft Hotel Under Construction",
        code="DFT-02",
        slug="draft-hotel-under-construction",
        property_type=PropertyType.HOTEL,
        publication_status=PublicationStatus.DRAFT,
        is_bookable=False,
        currency="USD",
        timezone="UTC",
        address="200 Second St",
        city="Seattle",
        country="USA",
    )
    p_unpublished = Property(
        name="Unpublished Seasonal Hostel",
        code="UNP-03",
        slug="unpublished-seasonal-hostel",
        property_type=PropertyType.HOSTEL,
        publication_status=PublicationStatus.UNPUBLISHED,
        is_bookable=True,
        currency="USD",
        timezone="UTC",
        address="300 Third St",
        city="Seattle",
        country="USA",
    )
    db_session.add_all([p_published, p_draft, p_unpublished])
    await db_session.commit()

    # Public Discovery Query
    public_query = select(Property).where(
        Property.publication_status == PublicationStatus.PUBLISHED,
        Property.is_bookable,
        Property.is_active,
    )
    result = await db_session.execute(public_query)
    public_properties = result.scalars().all()

    slugs = [p.slug for p in public_properties]
    assert "publicly-visible-hotel" in slugs
    assert "draft-hotel-under-construction" not in slugs
    assert "unpublished-seasonal-hostel" not in slugs
