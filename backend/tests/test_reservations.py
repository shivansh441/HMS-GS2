from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.core.crypto import decrypt_data
from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import (
    Floor,
    Property,
    ReservationOccupant,
    ReservationRequest,
    StayRecord,
    Unit,
    UnitAssignment,
    User,
)


def _admin_headers(db_session) -> dict[str, str]:
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    token = create_access_token(subject=admin.id, audience="admin", role=admin.role)
    return {"Authorization": f"Bearer {token}"}


def _reservation_payload(property_id: str) -> dict:
    check_in = date.today() + timedelta(days=14)
    check_out = check_in + timedelta(days=2)
    return {
        "propertyId": property_id,
        "guestName": "Reservation Guest",
        "mobile": f"+1555{uuid4().int % 10000000:07d}",
        "email": f"{uuid4().hex}@example.com",
        "requestedCategory": "CLASSIC",
        "requestedType": "ROOM",
        "requestedQuantity": 1,
        "numberOfAdults": 2,
        "numberOfChildren": 0,
        "expectedCheckIn": check_in.isoformat(),
        "expectedCheckOut": check_out.isoformat(),
        "occupants": [
            {
                "isPrimary": True,
                "firstName": "Reservation",
                "lastName": "Guest",
                "idType": "PASSPORT",
                "idNumber": "A123456",
            },
            {
                "firstName": "Second",
                "lastName": "Guest",
                "idType": "AADHAAR",
                "idNumber": "123456789012",
            },
        ],
    }


def test_public_reservation_intake_returns_tracking_code(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    response = client.post("/api/v1/reservations", json=_reservation_payload(prop.id))

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["requestCode"].startswith("RES-")
    assert data["status"] == "PENDING"
    assert data["propertyId"] == prop.id
    occupant = db_session.scalar(
        select(ReservationOccupant).where(
            ReservationOccupant.reservation_request_id == data["id"]
        )
    )
    assert occupant is not None
    assert occupant.id_type == "PASSPORT"
    assert occupant.id_number_encrypted != "A123456"
    assert decrypt_data(occupant.id_number_encrypted) == "A123456"


def test_customer_can_create_multiple_bookings_for_same_date(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    customer = User(
        email=f"booker-{uuid4().hex[:8]}@example.com",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        full_name="Repeat Booker",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
        id_document_type="PASSPORT",
        id_document_number_encrypted="encrypted-id",
    )
    db_session.add(customer)
    db_session.commit()
    token = create_access_token(subject=customer.id, audience="customer", role=Role.CUSTOMER.value)
    headers = {"Authorization": f"Bearer {token}"}
    payload = _reservation_payload(prop.id)
    payload["email"] = customer.email
    payload["mobile"] = customer.phone
    payload["occupants"] = []

    first = client.post("/api/v1/reservations", headers=headers, json=payload)
    second = client.post("/api/v1/reservations", headers=headers, json=payload)

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["id"] != second.json()["id"]
    assert first.json()["primaryUserId"] == customer.id
    assert second.json()["primaryUserId"] == customer.id


def test_reservation_can_defer_actual_occupant_details(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    payload = _reservation_payload(prop.id)
    payload["occupants"] = []

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 201

    payload = _reservation_payload(prop.id)
    payload["occupants"].pop()
    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 201


def test_customer_without_government_id_cannot_book(client, db_session):
    customer = User(
        email=f"{uuid4().hex}@example.com",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(customer)
    db_session.commit()
    token = create_access_token(
        subject=customer.id,
        audience="customer",
        role=Role.CUSTOMER,
    )
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None

    response = client.post(
        "/api/v1/reservations",
        headers={"Authorization": f"Bearer {token}"},
        json=_reservation_payload(prop.id),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "GOVERNMENT_ID_REQUIRED"


def test_admin_reservation_pipeline_filters_status_and_paginates(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    created = client.post("/api/v1/reservations", json=_reservation_payload(prop.id))
    assert created.status_code == 201, created.text

    response = client.get(
        "/api/v1/reservations",
        headers=_admin_headers(db_session),
        params={"propertyId": prop.id, "status": "PENDING,APPROVED", "limit": 1, "offset": 0},
    )

    assert response.status_code == 200, response.text
    assert response.json()["limit"] == 1
    assert response.json()["total"] >= 1
    assert all(item["status"] in {"PENDING", "APPROVED"} for item in response.json()["items"])


def test_reservation_rejects_checkout_before_checkin(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    payload = _reservation_payload(prop.id)
    payload["expectedCheckOut"] = payload["expectedCheckIn"]

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 422


def test_reservation_status_requires_rejection_reason(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    created = client.post("/api/v1/reservations", json=_reservation_payload(prop.id))
    assert created.status_code == 201, created.text

    response = client.patch(
        f"/api/v1/reservations/{created.json()['id']}/status",
        headers=_admin_headers(db_session),
        json={"status": "REJECTED"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "REJECTION_REASON_REQUIRED"


def test_hostel_reservation_sharing_type_limits_available_beds(client, db_session):
    prop = Property(
        code=f"RES-{uuid4().hex[:8]}",
        name="Reservation Hostel",
        type="HOSTEL_BOYS",
        status="ACTIVE",
    )
    db_session.add(prop)
    db_session.flush()
    floor = Floor(property_id=prop.id, number=1, name="Ground")
    db_session.add(floor)
    db_session.flush()
    room = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        unit_number="R-1",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        sharing_type="DOUBLE",
        capacity=2,
        status="AVAILABLE",
    )
    db_session.add(room)
    db_session.flush()
    double_bed = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        parent_id=room.id,
        unit_number="R-1-A",
        floor=1,
        type="BED",
        category="CLASSIC",
        sharing_type="DOUBLE",
        capacity=1,
        default_recurring_monthly_rate=100,
        status="AVAILABLE",
    )
    single_bed = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        parent_id=room.id,
        unit_number="R-1-B",
        floor=1,
        type="BED",
        category="CLASSIC",
        sharing_type="SINGLE",
        capacity=1,
        default_recurring_monthly_rate=100,
        status="AVAILABLE",
    )
    db_session.add_all([double_bed, single_bed])
    db_session.commit()

    payload = _reservation_payload(prop.id)
    payload["requestedType"] = "BED"
    payload["requestedSharingType"] = "DOUBLE"
    created = client.post("/api/v1/reservations", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["requestedSharingType"] == "DOUBLE"
    reservation_id = created.json()["id"]
    admin_headers = _admin_headers(db_session)
    assert client.patch(
        f"/api/v1/reservations/{reservation_id}/status",
        headers=admin_headers,
        json={"status": "APPROVED"},
    ).status_code == 200

    available = client.get(
        f"/api/v1/reservations/{reservation_id}/available-units",
        headers=admin_headers,
    )
    assert available.status_code == 200, available.text
    assert [unit["id"] for unit in available.json()] == [double_bed.id]

    conversion = client.post(
        f"/api/v1/reservations/{reservation_id}/convert",
        headers=admin_headers,
        json={"unitId": single_bed.id, "agreedRate": "100"},
    )
    assert conversion.status_code == 409


def test_conversion_claims_unit_and_creates_assignment_and_stay(client, db_session):
    prop = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert prop is not None
    floor = db_session.scalar(
        select(Unit.floor_id).where(Unit.property_id == prop.id).limit(1)
    )
    if not floor:
        from app.db.models import Floor

        floor_record = Floor(property_id=prop.id, number=97, name="Reservation test floor")
        db_session.add(floor_record)
        db_session.flush()
        floor = floor_record.id
    units = [
        Unit(
            property_id=prop.id,
            floor_id=floor,
            unit_number=f"R-{uuid4().hex[:8]}",
            floor=97,
            type="ROOM",
            category="CLASSIC",
            capacity=2,
            default_price_per_night=100,
            status="AVAILABLE",
        )
        for _ in range(2)
    ]
    db_session.add_all(units)
    db_session.commit()

    payload = _reservation_payload(prop.id)
    payload["requestedQuantity"] = 2
    created = client.post("/api/v1/reservations", json=payload)
    assert created.status_code == 201, created.text
    reservation_id = created.json()["id"]
    admin_headers = _admin_headers(db_session)
    approved = client.patch(
        f"/api/v1/reservations/{reservation_id}/status",
        headers=admin_headers,
        json={"status": "APPROVED"},
    )
    assert approved.status_code == 200, approved.text

    response = client.post(
        f"/api/v1/reservations/{reservation_id}/convert",
        headers=admin_headers,
        json={
            "unitId": units[0].id,
            "additionalUnitIds": [units[1].id],
            "initialDeposit": "25.00",
            "paymentConfirmed": True,
        },
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["reservation"]["status"] == "CONVERTED"
    assert result["unitIds"] == [units[0].id, units[1].id]
    customer = db_session.get(User, result["userId"])
    assert customer is not None
    assert customer.customer_persona is None
    for unit in units:
        db_session.refresh(unit)
        assert unit.status == "OCCUPIED"
    assignments = [db_session.get(UnitAssignment, assignment_id) for assignment_id in result["assignmentIds"]]
    stay = db_session.get(StayRecord, result["stayRecordId"])
    assert all(
        assignment is not None and assignment.reservation_request_id == reservation_id
        for assignment in assignments
    )
    assert stay is not None and stay.property_id == prop.id

    reservation = db_session.get(ReservationRequest, reservation_id)
    assert reservation is not None
    assert reservation.converted_at is not None
