from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import (
    AuditLog,
    Property,
    PropertyFeeConfig,
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
        username=f"inventory_staff_{uuid4().hex[:8]}",
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
        username=f"inventory_empty_{uuid4().hex[:8]}",
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
            "pricingBasis": "CONFIG_ONLY",
            "billingTiming": "NONE",
        },
    )
    assert water.status_code == 201, water.text
    assert water.json()["isActive"] is True
    assert water.json()["pricingBasis"] == "CONFIG_ONLY"
    assert water.json()["ratePerUnit"] is None
    assert water.json()["unitOfMeasure"] is None

    bed = db_session.scalar(
        select(Unit).where(Unit.property_id == prop["id"], Unit.type == "BED")
    )
    assert bed is not None
    guest = User(
        email=f"walk-in-{uuid4().hex[:8]}@example.test",
        username=f"walk_in_{uuid4().hex[:8]}",
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
        username=f"front_desk_{uuid4().hex[:8]}",
        full_name="Front Desk Staff",
        password_hash="not-used",
        role=Role.STAFF,
        staff_role="FRONT_DESK",
        status="ACTIVE",
    )
    second_guest = User(
        email=f"walk-in-second-{uuid4().hex[:8]}@example.test",
        username=f"walk_in_second_{uuid4().hex[:8]}",
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
