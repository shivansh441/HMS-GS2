import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.core.crypto import decrypt_data, process_id_document
from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import (
    AuditLog,
    CustomerOccupantProfile,
    DepositEscrow,
    Floor,
    MonthlyInvoice,
    PaymentReceipt,
    Property,
    PropertyFeeConfig,
    StayOccupant,
    StayRecord,
    Unit,
    UnitAssignment,
    User,
    UserPropertyAccess,
    UtilityMeterReading,
)
from app.modules.billing.service import generate_monthly_invoices


def _headers(db_session, email: str = "admin@havenstays.local") -> dict[str, str]:
    user = db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    token = create_access_token(subject=user.id, audience="admin", role=user.role)
    return {"Authorization": f"Bearer {token}"}


def _create_property(
    client: TestClient,
    headers: dict[str, str],
    property_type: str = "HOTEL",
) -> dict:
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": f"Inventory Test {suffix}",
            "type": property_type,
            "floors": 3,
            "address": "123 Test Street",
            "city": f"Test{suffix}",
            "state": "Test State",
            "pincode": "12345",
            "contactPhone": "1234567890",
            "currency": "INR",
            "timezone": "Asia/Kolkata",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_hostel_property_creates_active_assignment_priced_rent(client: TestClient, db_session):
    response = client.post(
        "/api/v1/properties",
        headers=_headers(db_session),
        json={
            "name": "New Hostel",
            "type": "HOSTEL_BOYS",
            "floors": 2,
            "address": "1 Hostel Road",
            "city": f"Hostel{uuid4().hex[:5]}",
            "state": "State",
            "pincode": "10000",
            "contactPhone": "1234567890",
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["code"].startswith("PROP-")

    fee = db_session.scalar(
        select(PropertyFeeConfig).where(PropertyFeeConfig.property_id == data["id"])
    )
    assert fee is not None
    assert fee.fee_type == "UNIT_FEE"
    assert fee.is_mandatory is True
    assert fee.amount == 0
    assert fee.is_active is True
    assert fee.pricing_basis == "ASSIGNMENT"
    assert fee.billing_timing == "AT_ASSIGNMENT"
    assert fee.amount == 0

    audit = db_session.scalar(
        select(AuditLog).where(
            AuditLog.property_id == data["id"],
            AuditLog.action == "PROPERTY_CREATED",
        )
    )
    assert audit is not None


def test_admin_can_list_all_properties_and_update_any_property(client: TestClient, db_session):
    headers = _headers(db_session)
    first_property = _create_property(client, headers)
    second_property = _create_property(client, headers, "HOSTEL_COED")

    scoped_headers = {**headers, "X-Property-Id": first_property["id"]}
    listing = client.get("/api/v1/admin/properties", headers=scoped_headers)
    assert listing.status_code == 200, listing.text
    listed_ids = {prop["id"] for prop in listing.json()}
    assert {first_property["id"], second_property["id"]} <= listed_ids

    update = client.put(
        f"/api/v1/admin/properties/{second_property['id']}",
        headers=scoped_headers,
        json={
            "name": "Updated Hostel",
            "type": "HOSTEL_COED",
            "status": "MAINTENANCE",
            "floors": 4,
            "address": "2 Updated Road",
            "city": "Updated City",
            "state": "Updated State",
            "pincode": "54321",
            "contactPhone": "9876543210",
            "contactEmail": "hostel@example.test",
            "facilities": ["Wi-Fi", "Laundry"],
            "currency": "INR",
            "timezone": "Asia/Kolkata",
        },
    )
    assert update.status_code == 200, update.text
    assert update.json()["name"] == "Updated Hostel"
    assert update.json()["status"] == "MAINTENANCE"

    detail = client.get(
        f"/api/v1/admin/properties/{second_property['id']}",
        headers=scoped_headers,
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["address"] == "2 Updated Road"
    assert detail.json()["facilities"] == ["Wi-Fi", "Laundry"]
    lightweight_detail = client.get(
        f"/api/v1/admin/properties/{second_property['id']}",
        headers=scoped_headers,
        params={"include_unit_matrix": "false"},
    )
    assert lightweight_detail.status_code == 200, lightweight_detail.text
    assert lightweight_detail.json()["unitMatrix"] == []
    assert lightweight_detail.json()["roomCount"] == detail.json()["roomCount"]
    assert lightweight_detail.json()["bedCount"] == detail.json()["bedCount"]

    audit = db_session.scalar(
        select(AuditLog).where(
            AuditLog.property_id == second_property["id"],
            AuditLog.action == "PROPERTY_UPDATED",
        )
    )
    assert audit is not None


def test_fee_config_addition_and_staff_redaction(client: TestClient, db_session):
    admin_headers = _headers(db_session)
    prop = _create_property(client, admin_headers, "HOSTEL_GIRLS")
    admin_detail = client.get(
        f"/api/v1/admin/properties/{prop['id']}",
        headers=admin_headers,
    )
    assert admin_detail.status_code == 200, admin_detail.text
    default_fee = next(
        fee for fee in admin_detail.json()["feeConfigs"] if fee["feeType"] == "UNIT_FEE"
    )
    assert default_fee["isActive"] is True
    assert default_fee["isMandatory"] is True
    assert default_fee["amount"] == 0
    assert default_fee["pricingBasis"] == "ASSIGNMENT"
    assert default_fee["billingTiming"] == "AT_ASSIGNMENT"

    response = client.post(
        f"/api/v1/properties/{prop['id']}/fees",
        headers=admin_headers,
        json={
            "feeType": "MESS_FEE",
            "name": "Monthly meals",
            "amount": "1250.00",
            "isMandatory": False,
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["amount"] == "1250.00"

    update_response = client.post(
        f"/api/v1/properties/{prop['id']}/fees",
        headers=admin_headers,
        json={
            "feeType": "MESS_FEE",
            "name": "Monthly meals",
            "amount": "1300.00",
            "isMandatory": False,
            "isActive": False,
        },
    )
    assert update_response.status_code == 201, update_response.text
    assert update_response.json()["isActive"] is False
    admin_detail = client.get(
        f"/api/v1/admin/properties/{prop['id']}",
        headers=admin_headers,
    )
    assert any(
        fee["feeType"] == "MESS_FEE" and fee["isActive"] is False
        for fee in admin_detail.json()["feeConfigs"]
    )
    active_fees = client.get(
        f"/api/v1/properties/{prop['id']}/fees",
        headers=admin_headers,
    )
    assert active_fees.status_code == 200, active_fees.text
    assert all(fee["isActive"] is True for fee in active_fees.json())

    staff = User(
        email=f"inventory-staff-{uuid4().hex[:8]}@example.test",
        full_name="Inventory Staff",
        password_hash="not-used",
        role=Role.STAFF,
        status="ACTIVE",
    )
    db_session.add(staff)
    db_session.flush()
    db_session.add(UserPropertyAccess(user_id=staff.id, property_id=prop["id"]))
    db_session.commit()
    staff_token = create_access_token(subject=staff.id, audience="admin", role="STAFF")
    staff_response = client.get(
        f"/api/v1/properties/{prop['id']}/fees",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert staff_response.status_code == 200
    assert staff_response.json() == []


def test_changing_property_from_hostel_deactivates_and_hides_fees(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    fee_response = client.post(
        f"/api/v1/properties/{prop['id']}/fees",
        headers=headers,
        json={
            "feeType": "SECURITY_DEPOSIT",
            "name": "Security Deposit",
            "amount": "5000.00",
            "isActive": True,
        },
    )
    assert fee_response.status_code == 201, fee_response.text

    update_response = client.put(
        f"/api/v1/admin/properties/{prop['id']}",
        headers=headers,
        json={
            "name": prop["name"],
            "type": "HOTEL",
            "status": "ACTIVE",
            "floors": 3,
            "address": "123 Test Street",
            "city": "Test City",
            "state": "Test State",
            "pincode": "12345",
            "contactPhone": "1234567890",
            "currency": "INR",
            "timezone": "Asia/Kolkata",
            "facilities": [],
        },
    )
    assert update_response.status_code == 200, update_response.text

    fee_list = client.get(
        f"/api/v1/properties/{prop['id']}/fees",
        headers=headers,
    )
    property_details = client.get(
        f"/api/v1/admin/properties/{prop['id']}",
        headers=headers,
    )
    assert fee_list.status_code == 200
    assert fee_list.json() == []
    assert property_details.status_code == 200
    assert property_details.json()["feeConfigs"] == []
    stored_fee = db_session.scalar(
        select(PropertyFeeConfig).where(
            PropertyFeeConfig.property_id == prop["id"],
            PropertyFeeConfig.fee_type == "SECURITY_DEPOSIT",
        )
    )
    assert stored_fee is not None
    assert stored_fee.is_active is False


def test_bulk_preview_create_collision_and_matrix(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    url = f"/api/v1/properties/{prop['id']}/units/bulk"
    payload = {
        "floors": [0, 3],
        "roomsPerFloor": 1,
        "bedsPerRoom": 2,
        "category": "CLASSIC",
        "dryRun": True,
    }
    preview = client.post(url, headers=headers, json=payload)
    assert preview.status_code == 201, preview.text
    preview_data = preview.json()
    assert preview_data["unitCount"] == 6
    assert preview_data["rooms"][0]["unitNumber"] == "001"
    assert [bed["unitNumber"] for bed in preview_data["beds"][:2]] == ["001-A", "001-B"]
    assert db_session.scalar(select(Unit.id).where(Unit.property_id == prop["id"])) is None

    payload["dryRun"] = False
    created = client.post(url, headers=headers, json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["unitCount"] == 6
    collision = client.post(url, headers=headers, json=payload)
    assert collision.status_code == 409
    assert collision.json()["error"]["code"] == "UNIT_CONFLICT"
    unit_count = db_session.scalar(
        select(func.count(Unit.id)).where(Unit.property_id == prop["id"])
    )
    assert unit_count == 6

    matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=headers,
    )
    assert matrix.status_code == 200, matrix.text
    floors = matrix.json()["floors"]
    assert [floor["floorNumber"] for floor in floors] == [0, 3]
    assert len(floors[0]["rooms"][0]["beds"]) == 2


def test_hostel_room_creation_generates_configured_child_beds(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")

    created = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "A101",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "sharingType": "TRIPLE",
            "capacity": 3,
            "bedsPerRoom": 3,
            "baseRateMonthly": "8500.00",
        },
    )
    assert created.status_code == 201, created.text

    matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=headers,
    )
    assert matrix.status_code == 200, matrix.text
    room = matrix.json()["floors"][0]["rooms"][0]
    assert room["unitNumber"] == "A101"
    assert room["category"] == "CLASSIC"
    assert room["capacity"] == 3
    assert [bed["unitNumber"] for bed in room["beds"]] == ["A101-A", "A101-B", "A101-C"]
    assert all(bed["sharingType"] == "TRIPLE" for bed in room["beds"])
    assert all(Decimal(bed["baseRateMonthly"]) == Decimal("8500.00") for bed in room["beds"])

    four_bed_room = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "A102",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "capacity": 4,
            "bedsPerRoom": 4,
            "baseRateMonthly": "9000.00",
        },
    )
    assert four_bed_room.status_code == 201, four_bed_room.text
    assert four_bed_room.json()["sharingType"] is None

    updated_matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=headers,
    )
    assert updated_matrix.status_code == 200, updated_matrix.text
    four_bed_room_data = updated_matrix.json()["floors"][0]["rooms"][1]
    assert four_bed_room_data["category"] == "CLASSIC"
    assert len(four_bed_room_data["beds"]) == 4
    assert all(bed["sharingType"] is None for bed in four_bed_room_data["beds"])
    assert all(
        Decimal(bed["baseRateMonthly"]) == Decimal("9000.00")
        for bed in four_bed_room_data["beds"]
    )


def test_property_summary_separates_hostel_rooms_and_available_beds(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    created = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "A101",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "capacity": 2,
            "bedsPerRoom": 2,
        },
    )
    assert created.status_code == 201, created.text

    full_details = client.get(
        f"/api/v1/admin/properties/{prop['id']}",
        headers=headers,
    )
    assert full_details.status_code == 200, full_details.text
    assert len(full_details.json()["unitMatrix"][0]["rooms"][0]["beds"]) == 2
    lightweight_details = client.get(
        f"/api/v1/admin/properties/{prop['id']}",
        headers=headers,
        params={"include_unit_matrix": "false"},
    )
    assert lightweight_details.status_code == 200, lightweight_details.text
    assert lightweight_details.json()["unitMatrix"] == []
    assert lightweight_details.json()["roomCount"] == 1
    assert lightweight_details.json()["bedCount"] == 2

    summary = client.get("/api/v1/admin/properties", headers=headers)
    assert summary.status_code == 200, summary.text
    property_summary = next(item for item in summary.json() if item["id"] == prop["id"])
    assert property_summary["unitCount"] == 3
    assert property_summary["roomCount"] == 1
    assert property_summary["bedCount"] == 2
    assert property_summary["availableBedCount"] == 2

    matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=headers,
    )
    bed_id = matrix.json()["floors"][0]["rooms"][0]["beds"][0]["id"]
    status_update = client.patch(
        f"/api/v1/units/{bed_id}/status",
        headers=headers,
        json={"status": "DIRTY"},
    )
    assert status_update.status_code == 200, status_update.text

    updated_summary = client.get("/api/v1/admin/properties", headers=headers)
    property_summary = next(item for item in updated_summary.json() if item["id"] == prop["id"])
    assert property_summary["roomCount"] == 1
    assert property_summary["bedCount"] == 2
    assert property_summary["availableBedCount"] == 1


def test_unit_status_and_staff_scope(client: TestClient, db_session):
    admin_headers = _headers(db_session)
    prop = _create_property(client, admin_headers)
    unit_response = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=admin_headers,
        json={
            "unitNumber": "501",
            "floor": 5,
            "type": "ROOM",
            "capacity": 2,
            "depositAmount": "500.00",
            "smartLockId": "lock-private-test",
        },
    )
    assert unit_response.status_code == 201, unit_response.text
    unit_id = unit_response.json()["id"]
    status_response = client.patch(
        f"/api/v1/units/{unit_id}/status",
        headers=admin_headers,
        json={"status": "OCCUPIED"},
    )
    assert status_response.status_code == 200, status_response.text
    assert status_response.json()["status"] == "OCCUPIED"
    room_matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=admin_headers,
    )
    assert room_matrix.status_code == 200, room_matrix.text
    assert room_matrix.json()["floors"][0]["rooms"][0]["status"] == "UNAVAILABLE"

    staff = User(
        email=f"inventory-empty-{uuid4().hex[:8]}@example.test",
        full_name="Unassigned Staff",
        password_hash="not-used",
        role=Role.STAFF,
        status="ACTIVE",
    )
    db_session.add(staff)
    db_session.commit()
    staff_token = create_access_token(subject=staff.id, audience="admin", role="STAFF")
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    assert client.get("/api/v1/properties", headers=staff_headers).json() == []
    assert client.get(
        f"/api/v1/properties/{prop['id']}",
        headers=staff_headers,
    ).status_code == 404

    denied = client.patch(
        f"/api/v1/units/{unit_id}/status",
        headers=staff_headers,
        json={"status": "AVAILABLE"},
    )
    assert denied.status_code == 403

    db_session.refresh(staff)
    db_session.add(UserPropertyAccess(user_id=staff.id, property_id=prop["id"]))
    db_session.commit()
    matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=staff_headers,
    )
    assert matrix.status_code == 200
    room = matrix.json()["floors"][0]["rooms"][0]
    assert "smartLockId" not in room
    assert "depositAmount" not in room
    assert "utilityPackageFee" not in room


def test_public_search_uses_restricted_unit_shape(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOTEL")
    created = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "304",
            "floor": 3,
            "type": "ROOM",
            "category": "DELUXE",
            "capacity": 2,
            "defaultPricePerNight": "150.00",
            "depositAmount": "1000.00",
            "smartLockId": "private-lock",
        },
    )
    assert created.status_code == 201, created.text
    result = client.get(
        "/api/v1/public/units/search",
        params={"propertyId": prop["id"], "stayType": "NIGHTLY", "category": "DELUXE"},
    )
    assert result.status_code == 200, result.text
    unit = result.json()[0]
    assert unit["unitNumber"] == "304"
    assert "id" not in unit
    assert "smartLockId" not in unit
    assert "depositAmount" not in unit
    assert "occupantName" not in unit


def test_public_search_filters_property_and_excludes_date_overlaps(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOTEL")
    created = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "DATE-101",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "capacity": 2,
            "defaultPricePerNight": "120.00",
        },
    )
    assert created.status_code == 201, created.text
    unit = db_session.get(Unit, created.json()["id"])
    assert unit is not None
    guest = User(
        email=f"availability-{uuid4().hex[:8]}@example.test",
        full_name="Availability Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    check_in = datetime.now(timezone.utc) + timedelta(days=10)
    check_out = check_in + timedelta(days=2)
    db_session.add(guest)
    db_session.flush()
    db_session.add(
        UnitAssignment(
            unit_id=unit.id,
            user_id=guest.id,
            status="RESERVED",
            expected_check_in=check_in,
            expected_check_out=check_out,
        )
    )
    db_session.commit()

    overlapping = client.get(
        "/api/v1/public/units/search",
        params={
            "property_id": prop["id"],
            "category": "CLASSIC",
            "check_in": (check_in + timedelta(days=1)).date().isoformat(),
            "check_out": (check_out + timedelta(days=1)).date().isoformat(),
        },
    )
    assert overlapping.status_code == 200, overlapping.text
    assert overlapping.json() == []

    available_after_checkout = client.get(
        "/api/v1/public/units/search",
        params={
            "property_id": prop["id"],
            "check_in": (check_out + timedelta(days=1)).date().isoformat(),
            "check_out": (check_out + timedelta(days=2)).date().isoformat(),
            "minPrice": "100",
            "maxPrice": "150",
        },
    )
    assert available_after_checkout.status_code == 200, available_after_checkout.text
    assert [item["unitNumber"] for item in available_after_checkout.json()] == ["DATE-101"]


def test_public_property_catalog_filters_type_and_location(client: TestClient, db_session):
    headers = _headers(db_session)
    hotel = _create_property(client, headers, "HOTEL")
    hostel = _create_property(client, headers, "HOSTEL_BOYS")

    hotels = client.get("/api/v1/public/properties", params={"type": "HOTEL"})
    assert hotels.status_code == 200, hotels.text
    assert hotel["id"] in {item["id"] for item in hotels.json()}
    assert all(item["type"] == "HOTEL" for item in hotels.json())
    hostel_record = db_session.get(Property, hostel["id"])
    assert hostel_record is not None

    hostels = client.get(
        "/api/v1/public/properties",
        params={"type": "HOSTEL", "location": hostel_record.city},
    )
    assert hostels.status_code == 200, hostels.text
    assert [item["id"] for item in hostels.json()] == [hostel["id"]]
    assert "facilities" in hostels.json()[0]


def test_sharing_rates_fee_rules_walk_in_rate_and_utility_arrears(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")

    bulk = client.post(
        f"/api/v1/properties/{prop['id']}/units/bulk",
        headers=headers,
        json={
            "floors": [0],
            "roomsPerFloor": 1,
            "bedsPerRoom": 2,
            "sharingType": "DOUBLE",
            "baseRateMonthly": "8500.00",
        },
    )
    assert bulk.status_code == 201, bulk.text

    public_units = client.get(
        "/api/v1/public/units/search",
        params={"propertyId": prop["id"], "stayType": "MONTHLY"},
    )
    assert public_units.status_code == 200, public_units.text
    assert len(public_units.json()) == 2
    assert all(unit["sharingType"] == "DOUBLE" for unit in public_units.json())
    assert all(unit["recurringMonthlyRate"] == "8500.00" for unit in public_units.json())
    assert "agreedRate" not in public_units.json()[0]

    dorm_room = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "D1",
            "floor": 1,
            "type": "ROOM",
            "category": "DORMITORY",
            "sharingType": "DORMITORY",
            "capacity": 4,
            "baseRateMonthly": "12000.00",
        },
    )
    assert dorm_room.status_code == 201, dorm_room.text
    dorm_bed = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "D1-A",
            "floor": 1,
            "parentId": dorm_room.json()["id"],
            "type": "BED",
            "category": "DORMITORY",
            "sharingType": "DORMITORY",
            "baseRateMonthly": "3000.00",
        },
    )
    assert dorm_bed.status_code == 201, dorm_bed.text

    mess = client.post(
        f"/api/v1/properties/{prop['id']}/fee-configs",
        headers=headers,
        json={
            "feeType": "MESS_FEE",
            "name": "Monthly Mess",
            "amount": "1250.00",
            "isMandatory": True,
            "isActive": True,
        },
    )
    assert mess.status_code == 201, mess.text
    assert mess.json()["pricingBasis"] == "FIXED_FLAT"
    assert mess.json()["billingTiming"] == "ADVANCE"

    security = client.post(
        f"/api/v1/properties/{prop['id']}/fee-configs",
        headers=headers,
        json={
            "feeType": "SECURITY_DEPOSIT",
            "name": "Security Deposit",
            "amount": "5000.00",
            "isMandatory": False,
            "isActive": True,
        },
    )
    assert security.status_code == 201, security.text
    assert security.json()["isMandatory"] is True

    invalid_hostel_rent = client.post(
        f"/api/v1/properties/{prop['id']}/fee-configs",
        headers=headers,
        json={
            "feeType": "UNIT_FEE",
            "name": "Hostel Rent",
            "amount": "5000.00",
            "isMandatory": True,
            "isActive": True,
        },
    )
    assert invalid_hostel_rent.status_code == 400
    assert invalid_hostel_rent.json()["error"]["code"] == "ASSIGNMENT_RATE_ON_PROPERTY"

    invalid_utility = client.post(
        f"/api/v1/properties/{prop['id']}/fee-configs",
        headers=headers,
        json={
            "feeType": "ELECTRICITY_FEE",
            "name": "Electricity",
            "amount": "0",
            "isActive": True,
            "pricingBasis": "METERED",
            "billingTiming": "ARREARS",
        },
    )
    assert invalid_utility.status_code == 400
    assert invalid_utility.json()["error"]["code"] == "METER_RATE_REQUIRED"

    utility = client.post(
        f"/api/v1/properties/{prop['id']}/fee-configs",
        headers=headers,
        json={
            "feeType": "ELECTRICITY_FEE",
            "name": "Electricity",
            "amount": "0",
            "isActive": True,
            "pricingBasis": "METERED",
            "billingTiming": "ARREARS",
            "ratePerUnit": "8.5",
            "unitOfMeasure": "kwh",
        },
    )
    assert utility.status_code == 201, utility.text
    assert utility.json()["unitOfMeasure"] == "KWH"
    assert utility.json()["billingTiming"] == "ARREARS"

    water = client.post(
        f"/api/v1/properties/{prop['id']}/fee-configs",
        headers=headers,
        json={
            "feeType": "WATER_CHARGE",
            "name": "Water Charge",
            "amount": "0",
            "isActive": True,
            "pricingBasis": "METERED",
            "billingTiming": "ARREARS",
            "ratePerUnit": "1.25",
            "unitOfMeasure": "liter",
        },
    )
    assert water.status_code == 201, water.text
    assert water.json()["isActive"] is True
    assert water.json()["pricingBasis"] == "METERED"
    assert water.json()["billingTiming"] == "ARREARS"
    assert water.json()["ratePerUnit"] == "1.2500"
    assert water.json()["unitOfMeasure"] == "LITER"

    bed = db_session.scalar(
        select(Unit).where(Unit.property_id == prop["id"], Unit.type == "BED")
    )
    assert bed is not None
    guest = User(
        email=f"walk-in-{uuid4().hex[:8]}@example.test",
        full_name="Walk-in Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(guest)
    db_session.commit()
    assignment_response = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": bed.id,
            "userId": guest.id,
            "expectedCheckIn": "2024-06-01T10:00:00Z",
            "billingStrategy": "RECURRING_MONTHLY",
            "agreedRate": "7600.00",
            "rateOverrideReason": "Negotiated long-stay rate",
            "depositPaymentAmount": "5000.00",
            "depositPaymentMethod": "CASH",
        },
    )
    assert assignment_response.status_code == 201, assignment_response.text
    assignment_data = assignment_response.json()
    assert assignment_data["agreedRate"] == "7600.00"
    assignment = db_session.get(UnitAssignment, assignment_data["id"])
    assert assignment is not None
    assert assignment.agreed_monthly_rate == 7600

    desk_staff = User(
        email=f"front-desk-{uuid4().hex[:8]}@example.test",
        full_name="Front Desk Staff",
        password_hash="not-used",
        role=Role.STAFF,
        staff_role="FRONT_DESK",
        status="ACTIVE",
    )
    second_guest = User(
        email=f"walk-in-second-{uuid4().hex[:8]}@example.test",
        full_name="Second Walk-in Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add_all([desk_staff, second_guest])
    db_session.flush()
    db_session.add(UserPropertyAccess(user_id=desk_staff.id, property_id=prop["id"]))
    db_session.commit()
    desk_headers = {
        "Authorization": f"Bearer {create_access_token(subject=desk_staff.id, audience='admin', role='STAFF')}"
    }
    available_bed = db_session.scalar(
        select(Unit).where(
            Unit.property_id == prop["id"],
            Unit.type == "BED",
            Unit.id != bed.id,
            Unit.status == "AVAILABLE",
        )
    )
    assert available_bed is not None
    staff_assignment = client.post(
        "/api/v1/stay/assignments",
        headers=desk_headers,
        json={
            "unitId": available_bed.id,
            "userId": second_guest.id,
            "expectedCheckIn": "2024-06-02T10:00:00Z",
            "billingStrategy": "RECURRING_MONTHLY",
            "agreedRate": "7000.00",
            "rateOverrideReason": "Returning resident rate",
            "depositPaymentAmount": "5000.00",
            "depositPaymentMethod": "UPI",
        },
    )
    assert staff_assignment.status_code == 201, staff_assignment.text
    assert staff_assignment.json()["agreedRate"] == "7000.00"

    meter_response = client.post(
        f"/api/v1/properties/{prop['id']}/utility-meter-readings",
        headers=headers,
        json={
            "unitAssignmentId": assignment.id,
            "feeType": "ELECTRICITY_FEE",
            "periodStart": "2024-05-01",
            "periodEnd": "2024-05-31",
            "previousReading": "100",
            "currentReading": "120",
        },
    )
    assert meter_response.status_code == 201, meter_response.text
    assert meter_response.json()["consumption"] == "20.000"
    assert meter_response.json()["amount"] == "170.00"
    assert meter_response.json()["billingStatus"] == "QUEUED"
    reading = db_session.get(UtilityMeterReading, meter_response.json()["id"])
    assert reading is not None
    assert reading.billing_status == "QUEUED"


def test_hostel_walk_in_rejects_exactly_one_night(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    prop_record = db_session.get(Property, prop["id"])
    assert prop_record is not None
    floor = Floor(property_id=prop_record.id, number=99, name="Ground")
    db_session.add(floor)
    db_session.flush()
    bed = Unit(
        property_id=prop_record.id,
        floor_id=floor.id,
        unit_number=f"BED-{uuid4().hex[:6]}",
        floor=99,
        type="BED",
        category="CLASSIC",
        capacity=1,
        default_recurring_monthly_rate=100,
        status="AVAILABLE",
    )
    guest = User(
        email=f"hostel-one-night-{uuid4().hex[:8]}@example.test",
        full_name="Hostel Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add_all([bed, guest])
    db_session.commit()

    response = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": bed.id,
            "userId": guest.id,
            "expectedCheckIn": "2026-11-06T14:00:00Z",
            "expectedCheckOut": "2026-11-07T14:00:00Z",
            "billingStrategy": "RECURRING_MONTHLY",
            "checkInNow": False,
        },
    )

    assert response.status_code == 400
    assert "exactly one night" in response.json()["error"]["message"].lower()


def test_unit_with_open_assignment_cannot_be_assigned_again(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers)
    prop_record = db_session.get(Property, prop["id"])
    assert prop_record is not None
    floor = Floor(property_id=prop_record.id, number=98, name="Ground")
    db_session.add(floor)
    db_session.flush()
    unit = Unit(
        property_id=prop_record.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{uuid4().hex[:6]}",
        floor=98,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=100,
        status="AVAILABLE",
    )
    guests = [
        User(
            email=f"double-assignment-{uuid4().hex[:8]}@example.test",
            full_name="Assignment Guest",
            password_hash="not-used",
            role=Role.CUSTOMER,
            status="ACTIVE",
        )
        for _ in range(2)
    ]
    db_session.add_all([unit, *guests])
    db_session.commit()

    assignment = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": unit.id,
            "userId": guests[0].id,
            "expectedCheckIn": "2026-11-17T14:00:00Z",
            "expectedCheckOut": "2026-11-19T11:00:00Z",
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": True,
        },
    )
    assert assignment.status_code == 201, assignment.text

    status_update = client.patch(
        f"/api/v1/units/{unit.id}/status",
        headers=headers,
        json={"status": "AVAILABLE"},
    )
    assert status_update.status_code == 409
    assert status_update.json()["error"]["code"] == "UNIT_ALREADY_ASSIGNED"

    db_session.execute(
        update(Unit).where(Unit.id == unit.id).values(status="AVAILABLE")
    )
    db_session.commit()
    duplicate = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": unit.id,
            "userId": guests[1].id,
            "expectedCheckIn": "2026-11-18T14:00:00Z",
            "expectedCheckOut": "2026-11-20T11:00:00Z",
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": True,
        },
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["error"]["code"] == "UNIT_ALREADY_ASSIGNED"


def test_active_additional_guest_cannot_be_assigned_to_another_room(
    client: TestClient, db_session
):
    headers = _headers(db_session)
    prop = _create_property(client, headers)
    property_record = db_session.get(Property, prop["id"])
    assert property_record is not None
    floor = Floor(property_id=property_record.id, number=1, name="Ground")
    db_session.add(floor)
    db_session.flush()
    current_room = Unit(
        property_id=property_record.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{uuid4().hex[:6]}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=Decimal("120.00"),
        status="AVAILABLE",
    )
    second_room = Unit(
        property_id=property_record.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{uuid4().hex[:6]}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=Decimal("150.00"),
        status="AVAILABLE",
    )
    primary_guest = User(
        email=f"primary-{uuid4().hex[:8]}@example.test",
        full_name="Primary Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    additional_guest = User(
        email=f"additional-{uuid4().hex[:8]}@example.test",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        full_name="Additional Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        customer_persona="HOTEL_GUEST",
        status="ACTIVE",
    )
    encrypted_id, last4, lookup_hash = process_id_document(
        f"ADDITIONAL-{uuid4().hex[:8]}"
    )
    additional_guest.id_document_type = "PASSPORT"
    additional_guest.id_document_number_encrypted = encrypted_id
    additional_guest.id_document_last4 = last4
    additional_guest.id_document_lookup_hash = lookup_hash
    db_session.add_all([current_room, second_room, primary_guest, additional_guest])
    db_session.commit()

    assignment = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": current_room.id,
            "userId": primary_guest.id,
            "expectedCheckIn": datetime.now(timezone.utc).isoformat(),
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": True,
        },
    )
    assert assignment.status_code == 201, assignment.text
    stay_record = db_session.scalar(
        select(StayRecord).where(
            StayRecord.assignment_id == assignment.json()["id"]
        )
    )
    assert stay_record is not None
    occupant_document = f"ADDITIONAL-{uuid4().hex[:8]}"
    encrypted_occupant_id, occupant_last4, _ = process_id_document(occupant_document)
    db_session.add(
        StayOccupant(
            stay_record=stay_record,
            full_name=additional_guest.full_name,
            id_document_type="PASSPORT",
            id_document_number_encrypted=encrypted_occupant_id,
            id_document_last4=occupant_last4,
        )
    )
    stay_record.guest_count = 2
    db_session.commit()

    active_assignments = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": property_record.id},
    )
    assert active_assignments.status_code == 200, active_assignments.text
    assert active_assignments.json()[0]["occupantUserIds"] == [
        primary_guest.id,
        additional_guest.id,
    ]

    second_assignment = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": second_room.id,
            "userId": additional_guest.id,
            "expectedCheckIn": datetime.now(timezone.utc).isoformat(),
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": True,
        },
    )
    assert second_assignment.status_code == 409, second_assignment.text
    assert second_assignment.json()["error"]["code"] == "CUSTOMER_ALREADY_ASSIGNED"


def test_customer_with_active_assignment_cannot_be_assigned_or_checked_in_again(
    client: TestClient, db_session
):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    for index in range(1, 4):
        response = client.post(
            f"/api/v1/properties/{prop['id']}/units",
            headers=headers,
            json={
                "unitNumber": f"HOSTEL-{uuid4().hex[:6]}-{index}",
                "floor": 1,
                "type": "ROOM",
                "category": "CLASSIC",
                "sharingType": "SINGLE",
                "capacity": 1,
                "bedsPerRoom": 1,
                "baseRateMonthly": "6000",
            },
        )
        assert response.status_code == 201, response.text
    beds = db_session.scalars(
        select(Unit)
        .where(Unit.property_id == prop["id"], Unit.type == "BED")
        .order_by(Unit.unit_number)
    ).all()
    assert len(beds) == 3
    customer = User(
        email=f"single-room-{uuid4().hex[:8]}@example.test",
        full_name="Single Room Resident",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(customer)
    db_session.commit()
    expected_check_in = datetime.now(timezone.utc).isoformat()

    reserved = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": beds[1].id,
            "userId": customer.id,
            "expectedCheckIn": expected_check_in,
            "billingStrategy": "RECURRING_MONTHLY",
            "checkInNow": False,
        },
    )
    assert reserved.status_code == 201, reserved.text
    occupied = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": beds[0].id,
            "userId": customer.id,
            "expectedCheckIn": expected_check_in,
            "billingStrategy": "RECURRING_MONTHLY",
            "checkInNow": True,
        },
    )
    assert occupied.status_code == 201, occupied.text
    active_assignments = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"includeHostelers": True},
    )
    assert active_assignments.status_code == 200, active_assignments.text
    assert occupied.json()["id"] in [item["id"] for item in active_assignments.json()]

    duplicate = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": beds[2].id,
            "userId": customer.id,
            "expectedCheckIn": expected_check_in,
            "billingStrategy": "RECURRING_MONTHLY",
            "checkInNow": True,
        },
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["error"]["code"] == "CUSTOMER_ALREADY_ASSIGNED"

    second_check_in = client.post(
        f"/api/v1/stay/assignments/{reserved.json()['id']}/check-in",
        headers=headers,
        json={},
    )
    assert second_check_in.status_code == 409, second_check_in.text
    assert second_check_in.json()["error"]["code"] == "CUSTOMER_ALREADY_ASSIGNED"

    checkout = client.post(
        f"/api/v1/stay/assignments/{occupied.json()['id']}/check-out",
        headers=headers,
        json={"folioSettled": True, "keycardReturned": True},
    )
    assert checkout.status_code == 200, checkout.text
    reassignment = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": beds[2].id,
            "userId": customer.id,
            "expectedCheckIn": expected_check_in,
            "billingStrategy": "RECURRING_MONTHLY",
            "checkInNow": True,
        },
    )
    assert reassignment.status_code == 201, reassignment.text


def test_preallocated_stay_check_in_and_check_out_lifecycle(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers)
    prop_record = db_session.get(Property, prop["id"])
    assert prop_record is not None
    floor = Floor(property_id=prop_record.id, number=1, name="Ground")
    db_session.add(floor)
    db_session.flush()
    unit = Unit(
        property_id=prop_record.id,
        floor_id=floor.id,
        unit_number=f"STAY-{uuid4().hex[:6]}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=120,
        status="AVAILABLE",
    )
    guest = User(
        email=f"stay-{uuid4().hex[:8]}@example.test",
        full_name="Stay Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    additional_guest = User(
        email=f"stay-additional-{uuid4().hex[:8]}@example.test",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        full_name="Additional Stay Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        customer_persona="HOTEL_GUEST",
        status="ACTIVE",
    )
    encrypted_id, last4, lookup_hash = process_id_document(
        f"ADDITIONAL-{uuid4().hex[:8]}"
    )
    additional_guest.id_document_type = "PASSPORT"
    additional_guest.id_document_number_encrypted = encrypted_id
    additional_guest.id_document_last4 = last4
    additional_guest.id_document_lookup_hash = lookup_hash
    db_session.add_all([unit, guest, additional_guest])
    db_session.commit()

    assignment_response = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": unit.id,
            "userId": guest.id,
            "expectedCheckIn": "2026-11-06T14:00:00Z",
            "expectedCheckOut": "2026-11-08T11:00:00Z",
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": False,
            "agreedRate": "100",
        },
    )
    assert assignment_response.status_code == 400
    assert assignment_response.json()["error"]["code"] == "RATE_OVERRIDE_REASON_REQUIRED"

    assignment_response = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": unit.id,
            "userId": guest.id,
            "expectedCheckIn": "2026-11-06T14:00:00Z",
            "expectedCheckOut": "2026-11-08T11:00:00Z",
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": False,
        },
    )
    assert assignment_response.status_code == 201, assignment_response.text
    assignment_data = assignment_response.json()
    assert assignment_data["status"] == "RESERVED"
    assert assignment_data["stayRecordId"] is None
    db_session.refresh(unit)
    assert unit.status == "RESERVED"

    active_before_checkin = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"], "unitType": "ROOM"},
    )
    assert active_before_checkin.status_code == 200
    assert assignment_data["id"] not in [item["id"] for item in active_before_checkin.json()]

    checkin = client.post(
        f"/api/v1/stay/assignments/{assignment_data['id']}/check-in",
        headers=headers,
        json={"guestUserIds": [additional_guest.id]},
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["status"] == "CHECKED_IN"
    db_session.refresh(unit)
    assert unit.status == "OCCUPIED"
    stay_record = db_session.scalar(
        select(StayRecord).where(StayRecord.assignment_id == assignment_data["id"])
    )
    assert stay_record is not None and stay_record.is_active
    db_session.refresh(stay_record)
    assert stay_record.user_id == guest.id
    assert len(stay_record.additional_guests) == 1
    assert stay_record.additional_guests[0].guest_user_id == additional_guest.id
    active_assignment = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert active_assignment.status_code == 200, active_assignment.text
    assert active_assignment.json()[0]["billToCollect"] == "120.00"
    assert active_assignment.json()[0]["guestCount"] == 2
    assert active_assignment.json()[0]["additionalGuestNames"] == [
        "Additional Stay Guest"
    ]
    assignment = db_session.get(UnitAssignment, assignment_data["id"])
    assert assignment is not None
    assignment.expected_check_out = datetime.now(timezone.utc) + timedelta(days=2)
    invoice = MonthlyInvoice(
        invoice_number=f"INV-{uuid4().hex[:8]}",
        property_id=prop["id"],
        unit_assignment_id=assignment.id,
        user_id=guest.id,
        billing_month=date.today().replace(day=1),
        due_date=date.today(),
        unit_fee=Decimal("120.00"),
        mess_fee=Decimal("0.00"),
        electricity_arrears=Decimal("0.00"),
        water_arrears=Decimal("0.00"),
        additional_fees=[],
        total_amount=Decimal("120.00"),
        paid_amount=Decimal("20.00"),
        status="PARTIALLY_PAID",
    )
    db_session.add(invoice)
    db_session.flush()
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    db_session.add(
        PaymentReceipt(
            property_id=prop["id"],
            user_id=guest.id,
            invoice_id=invoice.id,
            amount=Decimal("20.00"),
            payment_method="CASH",
            received_by_user_id=admin.id,
            received_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()
    active_stays = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert active_stays.status_code == 200
    assert [item["id"] for item in active_stays.json()] == [assignment_data["id"]]
    assert active_stays.json()[0]["currency"] == "INR"
    assert active_stays.json()[0]["billToCollect"] == "240.00"
    assert "paymentsReceived" not in active_stays.json()[0]

    stay_record.persona = "HOSTELER"
    db_session.commit()
    hosteler_stays = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert hosteler_stays.status_code == 200
    assert hosteler_stays.json() == []
    inventory_hosteler_stays = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"], "includeHostelers": True},
    )
    assert inventory_hosteler_stays.status_code == 200
    assert inventory_hosteler_stays.json() == []

    stay_record.persona = "TEMP_CUSTOMER"
    db_session.commit()
    excluded_stays = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert excluded_stays.status_code == 200
    assert excluded_stays.json() == []

    stay_record.persona = "HOTEL_GUEST"
    escrow = DepositEscrow(
        property_id=prop["id"],
        unit_assignment_id=assignment_data["id"],
        user_id=guest.id,
        amount=Decimal("50.00"),
        collected_amount=Decimal("50.00"),
        status="HELD",
    )
    db_session.add(escrow)
    db_session.flush()
    db_session.add(
        PaymentReceipt(
            property_id=prop["id"],
            user_id=guest.id,
            deposit_escrow_id=escrow.id,
            amount=Decimal("50.00"),
            payment_method="CASH",
            received_by_user_id=admin.id,
            received_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()
    summary = client.get(
        "/api/v1/stay/assignments/summary",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["totalActiveStays"] == 1
    assert summary.json()["checkInsToday"] == 1
    assert summary.json()["checkOutsToday"] == 0
    assert summary.json()["amountCollectedToday"] == [{"currency": "INR", "amount": "70.00"}]

    stay_record.persona = "HOSTELER"
    db_session.commit()
    hosteler_summary = client.get(
        "/api/v1/stay/assignments/summary",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert hosteler_summary.status_code == 200, hosteler_summary.text
    assert hosteler_summary.json()["totalActiveStays"] == 0
    assert hosteler_summary.json()["checkInsToday"] == 0
    assert hosteler_summary.json()["checkOutsToday"] == 0
    assert all(
        Decimal(amount["amount"]) == 0
        for amount in hosteler_summary.json()["amountCollectedToday"]
    )
    stay_record.persona = "HOTEL_GUEST"
    db_session.commit()

    occupant_document = f"A-{uuid4().hex[:8]}"
    occupants_response = client.put(
        f"/api/v1/stay/assignments/{assignment_data['id']}/occupants",
        headers=headers,
        json={
            "occupants": [
                {
                    "fullName": "Actual Occupant",
                    "email": f"actual-{uuid4().hex[:8]}@example.com",
                    "phone": f"+1555{uuid4().int % 10000000:07d}",
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": occupant_document,
                }
            ]
        },
    )
    assert occupants_response.status_code == 200, occupants_response.text


    assert occupants_response.json()[0]["idDocumentLast4"] == occupant_document[-4:].upper()
    occupant_record = db_session.scalar(
        select(StayOccupant).where(StayOccupant.stay_record_id == stay_record.id)
    )
    assert occupant_record is not None
    assert decrypt_data(occupant_record.id_document_number_encrypted) == occupant_document.upper()
    assert stay_record.guest_count == 2
    profile = db_session.scalar(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.owner_user_id == guest.id,
            CustomerOccupantProfile.full_name == "Actual Occupant",
        )
    )
    assert profile is not None

    profile_selection = client.put(
        f"/api/v1/stay/assignments/{assignment_data['id']}/occupants",
        headers=headers,
        json={"occupants": [{"profileId": profile.id, "fullName": "Ignored"}]},
    )
    assert profile_selection.status_code == 200, profile_selection.text
    assert profile_selection.json()[0]["profileId"] == profile.id

    occupant_record = db_session.scalar(
        select(StayOccupant).where(StayOccupant.stay_record_id == stay_record.id)
    )
    assert occupant_record is not None
    assert occupant_record.full_name == "Actual Occupant"
    assert stay_record.guest_count == 2

    over_capacity = client.put(
        f"/api/v1/stay/assignments/{assignment_data['id']}/occupants",
        headers=headers,
        json={
            "occupants": [
                {
                    "id": occupant_record.id,
                    "fullName": "Actual Occupant",
                    "idDocumentType": "PASSPORT",
                },
                {
                    "fullName": "Second Occupant",
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": f"B-{uuid4().hex[:8]}",
                },
            ]
        },
    )
    assert over_capacity.status_code == 400
    db_session.refresh(occupant_record)
    assert decrypt_data(occupant_record.id_document_number_encrypted) == occupant_document.upper()

    not_settled = client.post(
        f"/api/v1/stay/assignments/{assignment_data['id']}/check-out",
        headers=headers,
        json={"folioSettled": False, "keycardReturned": True},
    )
    assert not_settled.status_code == 400

    checkout = client.post(
        f"/api/v1/stay/assignments/{assignment_data['id']}/check-out",
        headers=headers,
        json={
            "folioSettled": True,
            "keycardReturned": True,
            "finalAmountPaid": "240",
        },
    )
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["status"] == "CHECKED_OUT"
    db_session.refresh(unit)
    db_session.refresh(stay_record)
    assert unit.status == "AVAILABLE"
    room_matrix_after_checkout = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=headers,
    )
    assert room_matrix_after_checkout.status_code == 200, room_matrix_after_checkout.text
    assert (
        room_matrix_after_checkout.json()["floors"][0]["rooms"][0]["status"]
        == "AVAILABLE"
    )
    assert stay_record.is_active is False
    assert stay_record.final_amount_paid == Decimal("240.00")
    summary_after_checkout = client.get(
        "/api/v1/stay/assignments/summary",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert summary_after_checkout.status_code == 200, summary_after_checkout.text
    assert summary_after_checkout.json()["totalActiveStays"] == 0
    assert summary_after_checkout.json()["checkOutsToday"] == 1
    assert summary_after_checkout.json()["amountCollectedToday"] == [
        {"currency": "INR", "amount": "310.00"}
    ]
    customer_token = create_access_token(
        subject=guest.id,
        audience="customer",
        role=Role.CUSTOMER,
    )
    history = client.get(
        "/api/v1/stay/me/history",
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert history.status_code == 200, history.text
    assert history.json()[0]["assignmentStatus"] == "CHECKED_OUT"
    assert history.json()[0]["finalAmountPaid"] == "240.00"


def test_hostel_active_assignment_is_available_to_inventory_only(
    client: TestClient, db_session
):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    room_response = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "HOSTEL-1",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "sharingType": "SINGLE",
            "capacity": 1,
            "bedsPerRoom": 1,
            "baseRateMonthly": "6000",
        },
    )
    assert room_response.status_code == 201, room_response.text
    bed = db_session.scalar(
        select(Unit).where(Unit.property_id == prop["id"], Unit.type == "BED")
    )
    assert bed is not None
    customer = User(
        email=f"hosteler-{uuid4().hex[:8]}@example.test",
        full_name="Hostel Resident",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(customer)
    db_session.commit()
    assignment_response = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": bed.id,
            "userId": customer.id,
            "expectedCheckIn": datetime.now(timezone.utc).isoformat(),
            "billingStrategy": "RECURRING_MONTHLY",
            "checkInNow": True,
        },
    )
    assert assignment_response.status_code == 201, assignment_response.text
    assignment_id = assignment_response.json()["id"]

    inventory_stays = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"], "includeHostelers": True},
    )
    assert inventory_stays.status_code == 200, inventory_stays.text
    assert [item["id"] for item in inventory_stays.json()] == [assignment_id]

    active_stays = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert active_stays.status_code == 400
    assert active_stays.json()["error"]["code"] == "HOTEL_STAYS_ONLY"
    summary = client.get(
        "/api/v1/stay/assignments/summary",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert summary.status_code == 400
    assert summary.json()["error"]["code"] == "HOTEL_STAYS_ONLY"


def test_property_soft_delete_hides_property(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers)
    response = client.delete(f"/api/v1/properties/{prop['id']}", headers=headers)
    assert response.status_code == 204
    hidden = client.get(f"/api/v1/properties/{prop['id']}", headers=headers)
    assert hidden.status_code == 404
    assert client.get("/api/v1/properties", headers=headers).status_code == 200
    stored = db_session.get(Property, prop["id"])
    assert stored is not None
    assert stored.is_deleted is True


def test_admin_can_edit_and_delete_unassigned_room(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_BOYS")
    created = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "EDIT-101",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "sharingType": "DOUBLE",
            "capacity": 2,
            "bedsPerRoom": 2,
            "baseRateMonthly": "9000.00",
        },
    )
    assert created.status_code == 201, created.text
    room_id = created.json()["id"]

    updated = client.put(
        f"/api/v1/units/{room_id}",
        headers=headers,
        json={
            "unitNumber": "EDIT-201",
            "floor": 2,
            "category": "CLASSIC",
            "sharingType": "SINGLE",
            "capacity": 1,
            "bedsPerRoom": 1,
            "baseRateMonthly": "9500.00",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["unitNumber"] == "EDIT-201"
    assert updated.json()["floor"] == 2
    assert updated.json()["capacity"] == 1

    matrix = client.get(
        f"/api/v1/properties/{prop['id']}/units/matrix",
        headers=headers,
    )
    rooms = [room for floor in matrix.json()["floors"] for room in floor["rooms"]]
    edited_room = next(room for room in rooms if room["id"] == room_id)
    assert edited_room["unitNumber"] == "EDIT-201"
    assert len(edited_room["beds"]) == 1
    assert edited_room["beds"][0]["unitNumber"] == "EDIT-201-A"

    deleted = client.delete(f"/api/v1/units/{room_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    assert db_session.get(Unit, room_id) is None


def test_hotel_room_can_be_changed_to_suite(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOTEL")
    created = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "SUITE-101",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "capacity": 2,
            "defaultPricePerNight": "180.00",
        },
    )
    assert created.status_code == 201, created.text

    updated = client.put(
        f"/api/v1/units/{created.json()['id']}",
        headers=headers,
        json={
            "unitNumber": "SUITE-101",
            "floor": 1,
            "type": "SUITE",
            "category": "DELUXE",
            "capacity": 2,
            "defaultPricePerNight": "240.00",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["type"] == "SUITE"
    assert updated.json()["category"] == "DELUXE"


def test_hotel_room_change_moves_party_after_one_day_and_preserves_billing(
    client: TestClient, db_session
):
    headers = _headers(db_session)
    prop = _create_property(client, headers)
    property_record = db_session.get(Property, prop["id"])
    assert property_record is not None
    floor = Floor(property_id=property_record.id, number=1, name="Ground")
    db_session.add(floor)
    db_session.flush()
    current_room = Unit(
        property_id=property_record.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{uuid4().hex[:6]}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=Decimal("120.00"),
        status="AVAILABLE",
    )
    undersized_room = Unit(
        property_id=property_record.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{uuid4().hex[:6]}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=1,
        default_price_per_night=Decimal("180.00"),
        status="AVAILABLE",
    )
    target_suite = Unit(
        property_id=property_record.id,
        floor_id=floor.id,
        unit_number=f"SUITE-{uuid4().hex[:6]}",
        floor=1,
        type="SUITE",
        category="DELUXE",
        capacity=2,
        default_price_per_night=Decimal("240.00"),
        status="AVAILABLE",
    )
    guest = User(
        email=f"room-change-{uuid4().hex[:8]}@example.test",
        full_name="Room Change Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add_all([current_room, undersized_room, target_suite, guest])
    db_session.commit()

    assigned = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": current_room.id,
            "userId": guest.id,
            "expectedCheckIn": datetime.now(timezone.utc).isoformat(),
            "billingStrategy": "PER_NIGHT_STAY",
            "checkInNow": False,
        },
    )
    assert assigned.status_code == 201, assigned.text
    assignment_id = assigned.json()["id"]
    checkin = client.post(
        f"/api/v1/stay/assignments/{assignment_id}/check-in",
        headers=headers,
        json={},
    )
    assert checkin.status_code == 200, checkin.text

    occupant_document = f"MOVE-{uuid4().hex[:8]}"
    occupants = client.put(
        f"/api/v1/stay/assignments/{assignment_id}/occupants",
        headers=headers,
        json={
            "occupants": [
                {
                    "fullName": "Additional Room Change Guest",
                    "email": f"additional-{uuid4().hex[:8]}@example.test",
                    "phone": f"+1555{uuid4().int % 10000000:07d}",
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": occupant_document,
                }
            ]
        },
    )
    assert occupants.status_code == 200, occupants.text
    source_stay = db_session.scalar(
        select(StayRecord).where(StayRecord.assignment_id == assignment_id)
    )
    assert source_stay is not None
    original_occupant = source_stay.additional_guests[0]

    too_small = client.post(
        f"/api/v1/stay/assignments/{assignment_id}/change-room",
        headers=headers,
        json={"newUnitId": undersized_room.id},
    )
    assert too_small.status_code == 400
    assert too_small.json()["error"]["code"] == "OCCUPANT_CAPACITY_EXCEEDED"

    requested_at = datetime.now(ZoneInfo(property_record.timezone))
    scheduled = client.post(
        f"/api/v1/stay/assignments/{assignment_id}/change-room",
        headers=headers,
        json={"newUnitId": target_suite.id},
    )
    assert scheduled.status_code == 200, scheduled.text
    old_checkout = datetime.fromisoformat(scheduled.json()["expectedCheckOut"])
    if old_checkout.tzinfo is None:
        old_checkout = old_checkout.replace(tzinfo=ZoneInfo(property_record.timezone))
    target_assignment = db_session.scalar(
        select(UnitAssignment).where(UnitAssignment.unit_id == target_suite.id)
    )
    assert target_assignment is not None
    assert target_assignment.user_id == guest.id
    assert target_assignment.standard_rate == Decimal("240.00")
    target_checkin = target_assignment.expected_check_in
    if target_checkin.tzinfo is None:
        target_checkin = target_checkin.replace(tzinfo=ZoneInfo(property_record.timezone))
    assert target_checkin == old_checkout
    assert abs((old_checkout - requested_at).total_seconds() - 86400) < 10

    active_before_move = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": property_record.id},
    )
    assert active_before_move.status_code == 200, active_before_move.text
    assert active_before_move.json()[0]["billToCollect"] == "120.00"
    assert active_before_move.json()[0]["guestEmail"] == guest.email

    target_assignment.expected_check_in = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()
    checkout = client.post(
        f"/api/v1/stay/assignments/{assignment_id}/check-out",
        headers=headers,
        json={
            "folioSettled": True,
            "keycardReturned": True,
            "finalAmountPaid": "120.00",
        },
    )
    assert checkout.status_code == 200, checkout.text
    moved = client.post(
        f"/api/v1/stay/assignments/{target_assignment.id}/check-in",
        headers=headers,
        json={},
    )
    assert moved.status_code == 200, moved.text

    moved_stay = db_session.scalar(
        select(StayRecord).where(StayRecord.assignment_id == target_assignment.id)
    )
    assert moved_stay is not None
    assert moved_stay.user_id == guest.id
    assert moved_stay.guest_count == 2
    assert len(moved_stay.additional_guests) == 1
    assert moved_stay.additional_guests[0].full_name == original_occupant.full_name
    assert moved_stay.additional_guests[0].id_document_last4 == original_occupant.id_document_last4
    db_session.refresh(source_stay)
    assert source_stay.is_active is False
    assert len(source_stay.additional_guests) == 1

    active_after_move = client.get(
        "/api/v1/stay/assignments/active",
        headers=headers,
        params={"propertyId": property_record.id},
    )
    assert active_after_move.status_code == 200, active_after_move.text
    assert active_after_move.json()[0]["guestEmail"] == guest.email
    assert active_after_move.json()[0]["guestCount"] == 2
    assert active_after_move.json()[0]["billToCollect"] == "240.00"


def test_room_change_is_scheduled_for_next_month_and_keeps_fee_periods(client: TestClient, db_session):
    headers = _headers(db_session)
    prop = _create_property(client, headers, "HOSTEL_COED")
    room_ids = []
    for room_number in ("MOVE-101", "MOVE-102"):
        response = client.post(
            f"/api/v1/properties/{prop['id']}/units",
            headers=headers,
            json={
                "unitNumber": room_number,
                "floor": 1,
                "type": "ROOM",
                "category": "CLASSIC",
                "sharingType": "DOUBLE",
                "capacity": 2,
                "bedsPerRoom": 2,
                "baseRateMonthly": "9000.00" if room_number == "MOVE-101" else "10500.00",
            },
        )
        assert response.status_code == 201, response.text
        room_ids.append(response.json()["id"])
    beds = db_session.scalars(
        select(Unit)
        .where(Unit.parent_id.in_(room_ids), Unit.type == "BED")
        .order_by(Unit.unit_number)
    ).all()
    guest = User(
        email=f"move-{uuid4().hex[:8]}@example.test",
        full_name="Room Change Guest",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(guest)
    db_session.commit()
    assigned = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": beds[0].id,
            "userId": guest.id,
            "expectedCheckIn": datetime.now(timezone.utc).isoformat(),
            "billingStrategy": "RECURRING_MONTHLY",
        },
    )
    assert assigned.status_code == 201, assigned.text
    assignment_id = assigned.json()["id"]
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    escrow = DepositEscrow(
        property_id=prop["id"],
        unit_assignment_id=assignment_id,
        user_id=guest.id,
        amount=Decimal("5000.00"),
        collected_amount=Decimal("5000.00"),
        status="HELD",
    )
    db_session.add(escrow)
    db_session.flush()
    receipt = PaymentReceipt(
        property_id=prop["id"],
        user_id=guest.id,
        deposit_escrow_id=escrow.id,
        amount=Decimal("5000.00"),
        payment_method="CASH",
        received_by_user_id=admin.id,
    )
    db_session.add(receipt)
    db_session.commit()

    deleted_assigned_room = client.delete(
        f"/api/v1/units/{room_ids[0]}",
        headers=headers,
    )
    assert deleted_assigned_room.status_code == 409

    scheduled = client.post(
        f"/api/v1/stay/assignments/{assignment_id}/change-room",
        headers=headers,
        json={"newUnitId": beds[2].id},
    )
    assert scheduled.status_code == 200, scheduled.text
    scheduled_room_changes = client.get(
        f"/api/v1/stay/assignments/scheduled?propertyId={prop['id']}",
        headers=headers,
    )
    assert scheduled_room_changes.status_code == 200, scheduled_room_changes.text
    assert any(item["unitId"] == beds[2].id for item in scheduled_room_changes.json())
    old_checkout = datetime.fromisoformat(scheduled.json()["expectedCheckOut"])
    property_record = db_session.get(Property, prop["id"])
    assert property_record is not None
    today = datetime.now(ZoneInfo(property_record.timezone)).date()
    expected_month_end = date(
        today.year,
        today.month,
        calendar.monthrange(today.year, today.month)[1],
    )
    assert old_checkout.date() == expected_month_end

    pending_assignment = db_session.scalar(
        select(UnitAssignment).where(
            UnitAssignment.user_id == guest.id,
            UnitAssignment.unit_id == beds[2].id,
        )
    )
    assert pending_assignment is not None
    expected_next_month = (
        date(today.year + 1, 1, 1)
        if today.month == 12
        else date(today.year, today.month + 1, 1)
    )
    assert pending_assignment.expected_check_in.date() == expected_next_month
    assert pending_assignment.status == "RESERVED"
    assert pending_assignment.is_active is False
    assert pending_assignment.agreed_monthly_rate == Decimal("10500.00")
    target_bed = db_session.get(Unit, beds[2].id)
    assert target_bed is not None
    db_session.refresh(target_bed)
    assert target_bed.status == "RESERVED"

    current_month = today.replace(day=1)
    current_invoices, _ = generate_monthly_invoices(db_session, property_record, current_month)
    assert [invoice.unit_assignment_id for invoice in current_invoices] == [assignment_id]

    pending_assignment.expected_check_in = datetime.now(timezone.utc)
    db_session.commit()
    premature_checkin = client.post(
        f"/api/v1/stay/assignments/{pending_assignment.id}/check-in",
        headers=headers,
        json={"depositPaymentAmount": "5000.00", "depositPaymentMethod": "CASH"},
    )
    assert premature_checkin.status_code == 409
    source_checkout = client.post(
        f"/api/v1/stay/assignments/{assignment_id}/check-out",
        headers=headers,
        json={"folioSettled": True, "keycardReturned": True},
    )
    assert source_checkout.status_code == 200, source_checkout.text
    checkin = client.post(
        f"/api/v1/stay/assignments/{pending_assignment.id}/check-in",
        headers=headers,
        json={"depositPaymentAmount": "5000.00", "depositPaymentMethod": "CASH"},
    )
    assert checkin.status_code == 200, checkin.text
    db_session.refresh(escrow)
    assert escrow.unit_assignment_id == pending_assignment.id
    assert db_session.scalar(
        select(func.count(PaymentReceipt.id)).where(PaymentReceipt.deposit_escrow_id == escrow.id)
    ) == 1
    db_session.refresh(target_bed)
    assert target_bed.status == "OCCUPIED"
    db_session.commit()
    next_month_invoices, _ = generate_monthly_invoices(db_session, property_record, expected_next_month)
    assert [invoice.unit_assignment_id for invoice in next_month_invoices] == [pending_assignment.id]
