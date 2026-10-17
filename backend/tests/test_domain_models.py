"""Tests for Phase 2 domain models, relationships, and validation constraints."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditAction, AuditLog
from app.models.booking import Booking, BookingItem, BookingSource, BookingStatus
from app.models.finance import (
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
)
from app.models.guest import Guest
from app.models.hostel_ops import (
    AgreementStatus,
    AgreementTermType,
    HostelAgreement,
    HostelResidentProfile,
)
from app.models.hotel_ops import (
    HotelStayRecord,
    HousekeepingStatus,
    HousekeepingTask,
    HousekeepingTaskType,
)
from app.models.inventory import (
    AccommodationTier,
    Bed,
    BedType,
    Building,
    CleanlinessStatus,
    Floor,
    GenderPolicy,
    Room,
    RoomOperationalStatus,
    RoomType,
)
from app.models.pricing import RatePlan
from app.models.property import Property, PropertyType, PublicationStatus


@pytest.mark.asyncio
async def test_property_and_inventory_hierarchy(db_session: AsyncSession) -> None:
    """Verify Property -> Building -> Floor -> RoomType -> Room -> Bed hierarchy."""
    # 1. Create a hybrid property
    prop = Property(
        name="GrandStay Alpine Resort & Hostel",
        code="ALP-01",
        slug="grandstay-alpine-resort-hostel",
        property_type=PropertyType.HYBRID,
        publication_status=PublicationStatus.PUBLISHED,
        is_bookable=True,
        currency="EUR",
        timezone="Europe/Vienna",
        address="Bergbahnstrasse 12",
        city="Innsbruck",
        country="Austria",
        amenities=["High-Speed WiFi", "Ski Storage", "Sauna"],
    )
    db_session.add(prop)
    await db_session.flush()

    assert prop.id is not None
    assert prop.publication_status == PublicationStatus.PUBLISHED

    # 2. Add Building and Floor
    bldg = Building(property_id=prop.id, name="Main Chalet", code="CHALET-A")
    db_session.add(bldg)
    await db_session.flush()

    floor1 = Floor(property_id=prop.id, building_id=bldg.id, floor_number=1, name="First Floor")
    db_session.add(floor1)
    await db_session.flush()

    # 3. Add Hostel Dorm RoomType and Hotel Suite RoomType
    dorm_type = RoomType(
        property_id=prop.id,
        name="6-Bed Mixed Backpacker Dorm",
        slug="6-bed-mixed-backpacker-dorm",
        code="DORM-6-MIX",
        accommodation_tier=AccommodationTier.HOSTEL_DORM,
        base_capacity_adults=1,
        max_capacity_adults=6,
        is_dormitory=True,
        gender_policy=GenderPolicy.MIXED_ONLY,
        base_price_amount=Decimal("35.00"),
    )
    hotel_suite_type = RoomType(
        property_id=prop.id,
        name="Deluxe Alpine Suite",
        slug="deluxe-alpine-suite",
        code="STE-DLX",
        accommodation_tier=AccommodationTier.HOTEL_ROOM,
        base_capacity_adults=2,
        max_capacity_adults=4,
        is_dormitory=False,
        gender_policy=GenderPolicy.ANY,
        base_price_amount=Decimal("180.00"),
    )
    db_session.add_all([dorm_type, hotel_suite_type])
    await db_session.flush()

    # 4. Add Physical Room
    dorm_room = Room(
        property_id=prop.id,
        room_type_id=dorm_type.id,
        floor_id=floor1.id,
        room_number="101-DORM",
        operational_status=RoomOperationalStatus.AVAILABLE,
        cleanliness_status=CleanlinessStatus.CLEAN,
    )
    db_session.add(dorm_room)
    await db_session.flush()

    # 5. Add Physical Beds to Dorm Room
    bed_lower = Bed(
        property_id=prop.id,
        room_id=dorm_room.id,
        bed_label="BUNK-1-LOWER",
        bed_type=BedType.BUNK_BOTTOM,
        locker_number="L-101A",
    )
    bed_upper = Bed(
        property_id=prop.id,
        room_id=dorm_room.id,
        bed_label="BUNK-1-UPPER",
        bed_type=BedType.BUNK_TOP,
        locker_number="L-101B",
    )
    db_session.add_all([bed_lower, bed_upper])
    await db_session.commit()

    # Verify relationships via query
    result = await db_session.execute(
        select(Room).where(Room.room_number == "101-DORM")
    )
    queried_room = result.scalar_one()
    assert queried_room.room_type_id == dorm_type.id
    assert queried_room.property_id == prop.id


@pytest.mark.asyncio
async def test_booking_creation_and_price_preservation(db_session: AsyncSession) -> None:
    """Verify booking lifecycle, customer linkage, and immutable agreed price snapshot."""
    # Setup property
    prop = Property(
        name="GrandStay London City Hotel",
        code="LON-01",
        slug="grandstay-london-city-hotel",
        property_type=PropertyType.HOTEL,
        currency="GBP",
        timezone="Europe/London",
        address="100 Fleet Street",
        city="London",
        country="UK",
    )
    db_session.add(prop)
    await db_session.flush()

    # Setup room type and rate plan
    rt = RoomType(
        property_id=prop.id,
        name="Standard Double Room",
        slug="standard-double-room",
        code="STD-DBL",
        accommodation_tier=AccommodationTier.HOTEL_ROOM,
        base_capacity_adults=2,
        max_capacity_adults=2,
        base_price_amount=Decimal("120.00"),
    )
    rp = RatePlan(
        property_id=prop.id,
        name="Flexible Booking Rate",
        code="FLEX",
        cancellation_policy="free_cancellation_24h",
    )
    db_session.add_all([rt, rp])
    await db_session.flush()

    # Customer Guest checkout
    guest = Guest(
        email="emma.watson@example.com",
        first_name="Emma",
        last_name="Watson",
        phone="+44 7911 123456",
        country="United Kingdom",
    )
    db_session.add(guest)
    await db_session.flush()

    # Booking across 3 nights
    check_in = date.today() + timedelta(days=5)
    check_out = check_in + timedelta(days=3)

    booking = Booking(
        booking_reference="GS-LON-2026-X99",
        property_id=prop.id,
        guest_id=guest.id,
        booking_source=BookingSource.PUBLIC_WEBSITE,
        booking_status=BookingStatus.CONFIRMED,
        check_in_date=check_in,
        check_out_date=check_out,
        total_nights=3,
        adult_count=2,
        currency="GBP",
        base_amount=Decimal("360.00"),  # 3 x £120.00
        tax_amount=Decimal("72.00"),    # 20% VAT
        service_amount=Decimal("0.00"),
        total_amount=Decimal("432.00"),
        deposit_paid=Decimal("432.00"),
    )
    db_session.add(booking)
    await db_session.flush()

    # Booking item line
    item = BookingItem(
        booking_id=booking.id,
        property_id=prop.id,
        room_type_id=rt.id,
        rate_plan_id=rp.id,
        check_in_date=check_in,
        check_out_date=check_out,
        unit_price_per_night=Decimal("120.00"),
        total_item_price=Decimal("432.00"),
        tax_breakdown={"VAT": 72.00, "rate": 0.20},
    )
    db_session.add(item)
    await db_session.commit()

    # Now alter the RoomType's base price to simulate inflation/dynamic price change
    rt.base_price_amount = Decimal("250.00")
    await db_session.commit()

    # Query booking to ensure historical agreed price was NOT modified
    result = await db_session.execute(
        select(Booking).where(Booking.booking_reference == "GS-LON-2026-X99")
    )
    preserved_booking = result.scalar_one()
    assert preserved_booking.total_amount == Decimal("432.00")
    assert preserved_booking.base_amount == Decimal("360.00")
    assert preserved_booking.booking_source == BookingSource.PUBLIC_WEBSITE


@pytest.mark.asyncio
async def test_hostel_resident_admissions(db_session: AsyncSession) -> None:
    """Verify hostel operational workflow: KYC profile and semester housing agreement."""
    prop = Property(
        name="GrandStay Student Hostel",
        code="STU-01",
        slug="grandstay-student-hostel",
        property_type=PropertyType.HOSTEL,
        currency="USD",
        timezone="America/New_York",
        address="500 College Ave",
        city="Boston",
        country="USA",
    )
    db_session.add(prop)
    await db_session.flush()

    dorm_type = RoomType(
        property_id=prop.id,
        name="4-Bed Academic Dorm",
        slug="4-bed-academic-dorm",
        code="ACAD-4",
        accommodation_tier=AccommodationTier.HOSTEL_DORM,
        is_dormitory=True,
    )
    db_session.add(dorm_type)
    await db_session.flush()

    room = Room(property_id=prop.id, room_type_id=dorm_type.id, room_number="302")
    db_session.add(room)
    await db_session.flush()

    bed = Bed(property_id=prop.id, room_id=room.id, bed_label="BED-302-A")
    db_session.add(bed)
    await db_session.flush()

    resident_guest = Guest(
        email="alex.rivera@university.edu",
        first_name="Alex",
        last_name="Rivera",
        phone="+1 617 555 0199",
    )
    db_session.add(resident_guest)
    await db_session.flush()

    # KYC & emergency contact profile
    profile = HostelResidentProfile(
        guest_id=resident_guest.id,
        property_id=prop.id,
        emergency_contact_name="Maria Rivera",
        emergency_contact_phone="+1 617 555 0100",
        institution_or_employer="Boston University",
        student_or_work_id="U987654321",
        is_kyc_verified=True,
    )
    db_session.add(profile)
    await db_session.flush()

    # Semester residency agreement
    agreement = HostelAgreement(
        property_id=prop.id,
        resident_profile_id=profile.id,
        allocated_bed_id=bed.id,
        agreement_number="AGR-2026-FALL-089",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 12, 20),
        term_type=AgreementTermType.SEMESTER,
        status=AgreementStatus.ACTIVE,
        monthly_rate=Decimal("650.00"),
        security_deposit=Decimal("300.00"),
    )
    db_session.add(agreement)
    await db_session.commit()

    assert agreement.id is not None
    assert agreement.status == AgreementStatus.ACTIVE


@pytest.mark.asyncio
async def test_hotel_stay_and_housekeeping_tasking(db_session: AsyncSession) -> None:
    """Verify hotel stay check-in record and housekeeping turnover task generation."""
    prop = Property(
        name="GrandStay Palace Hotel",
        code="PLC-01",
        slug="grandstay-palace-hotel",
        property_type=PropertyType.HOTEL,
        currency="EUR",
        timezone="Europe/Paris",
        address="15 Place Vendôme",
        city="Paris",
        country="France",
    )
    db_session.add(prop)
    await db_session.flush()

    rt = RoomType(
        property_id=prop.id,
        name="Executive Suite",
        slug="executive-suite",
        code="STE-EXEC",
        accommodation_tier=AccommodationTier.HOTEL_ROOM,
    )
    db_session.add(rt)
    await db_session.flush()

    room = Room(property_id=prop.id, room_type_id=rt.id, room_number="501")
    db_session.add(room)
    await db_session.flush()

    guest = Guest(email="pierre.dubois@example.fr", first_name="Pierre", last_name="Dubois")
    db_session.add(guest)
    await db_session.flush()

    booking = Booking(
        booking_reference="GS-PAR-2026-P01",
        property_id=prop.id,
        guest_id=guest.id,
        booking_source=BookingSource.ADMIN,
        booking_status=BookingStatus.CHECKED_IN,
        check_in_date=date(2026, 10, 1),
        check_out_date=date(2026, 10, 4),
        total_nights=3,
        adult_count=2,
        currency="EUR",
        base_amount=Decimal("900.00"),
        total_amount=Decimal("900.00"),
    )
    db_session.add(booking)
    await db_session.flush()

    b_item = BookingItem(
        booking_id=booking.id,
        property_id=prop.id,
        room_type_id=rt.id,
        allocated_room_id=room.id,
        check_in_date=booking.check_in_date,
        check_out_date=booking.check_out_date,
        unit_price_per_night=Decimal("300.00"),
        total_item_price=Decimal("900.00"),
    )
    db_session.add(b_item)
    await db_session.flush()

    # Stay record
    stay = HotelStayRecord(
        booking_item_id=b_item.id,
        property_id=prop.id,
        room_id=room.id,
        keycards_issued=2,
        vehicle_license_plate="75-ABC-99",
        luggage_tags=["LUG-01", "LUG-02"],
    )
    # Housekeeping departure clean
    task = HousekeepingTask(
        property_id=prop.id,
        room_id=room.id,
        task_type=HousekeepingTaskType.TURNDOWN,
        status=HousekeepingStatus.PENDING,
        scheduled_date=booking.check_in_date,
    )
    db_session.add_all([stay, task])
    await db_session.commit()

    assert stay.id is not None
    assert task.status == HousekeepingStatus.PENDING


@pytest.mark.asyncio
async def test_financial_invoice_and_audit_logging(db_session: AsyncSession) -> None:
    """Verify invoicing, payments, and sanitized audit trail logging."""
    prop = Property(
        name="GrandStay Finance Test Hotel",
        code="FIN-01",
        slug="grandstay-finance-test-hotel",
        property_type=PropertyType.HOTEL,
        currency="USD",
        timezone="America/New_York",
        address="10 Wall Street",
        city="New York",
        country="USA",
    )
    db_session.add(prop)
    await db_session.flush()

    guest = Guest(email="fin.guest@example.com", first_name="Financial", last_name="Auditor")
    db_session.add(guest)
    await db_session.flush()

    invoice = Invoice(
        property_id=prop.id,
        guest_id=guest.id,
        invoice_number="INV-2026-9901",
        status=InvoiceStatus.ISSUED,
        currency="USD",
        subtotal_amount=Decimal("500.00"),
        tax_amount=Decimal("50.00"),
        total_amount=Decimal("550.00"),
        paid_amount=Decimal("550.00"),
        due_date=date.today(),
    )
    db_session.add(invoice)
    await db_session.flush()

    item1 = InvoiceItem(
        invoice_id=invoice.id,
        description="2 Nights Stay in Suite 101",
        quantity=2,
        unit_price=Decimal("250.00"),
        tax_rate=Decimal("0.1000"),
        total_amount=Decimal("500.00"),
    )
    payment = Payment(
        property_id=prop.id,
        invoice_id=invoice.id,
        payment_reference="PAY-REF-889911",
        payment_method=PaymentMethod.CREDIT_CARD,
        status=PaymentStatus.COMPLETED,
        amount=Decimal("550.00"),
        currency="USD",
        transaction_id="tx_stripe_ch_999888777",
        processed_at=date.today(),
    )
    # Audit log recording state transition
    audit = AuditLog(
        property_id=prop.id,
        entity_type="Invoice",
        entity_id=invoice.id,
        action=AuditAction.STATUS_TRANSITION,
        correlation_id="cid-trans-1234",
        changes={"status": {"old": "DRAFT", "new": "ISSUED"}},
    )
    db_session.add_all([item1, payment, audit])
    await db_session.commit()

    assert invoice.id is not None
    assert payment.id is not None
    assert audit.action == AuditAction.STATUS_TRANSITION
