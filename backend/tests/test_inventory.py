from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.crypto import decrypt_data
from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import (
    AuditLog,
    Floor,
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
    db_session.add_all([unit, guest])
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
        json={},
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["status"] == "CHECKED_IN"
    db_session.refresh(unit)
    assert unit.status == "OCCUPIED"
    stay_record = db_session.scalar(
        select(StayRecord).where(StayRecord.assignment_id == assignment_data["id"])
    )
    assert stay_record is not None and stay_record.is_active

    occupants_response = client.put(
        f"/api/v1/stay/assignments/{assignment_data['id']}/occupants",
        headers=headers,
        json={
            "occupants": [
                {
                    "fullName": "Actual Occupant",
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": "A1234567",
                }
            ]
        },
    )
    assert occupants_response.status_code == 200, occupants_response.text
    assert occupants_response.json()[0]["idDocumentLast4"] == "4567"
    occupant_record = db_session.scalar(
        select(StayOccupant).where(StayOccupant.stay_record_id == stay_record.id)
    )
    assert occupant_record is not None
    assert decrypt_data(occupant_record.id_document_number_encrypted) == "A1234567"
    assert stay_record.guest_count == 1

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
                    "idDocumentNumber": "B9876543",
                },
                {
                    "fullName": "Third Occupant",
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": "C7654321",
                },
            ]
        },
    )
    assert over_capacity.status_code == 400
    db_session.refresh(occupant_record)
    assert decrypt_data(occupant_record.id_document_number_encrypted) == "A1234567"

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
    assert unit.status == "DIRTY"
    assert stay_record.is_active is False
    assert stay_record.final_amount_paid == Decimal("240.00")
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
