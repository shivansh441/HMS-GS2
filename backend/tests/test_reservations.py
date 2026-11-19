from datetime import date, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.core.crypto import decrypt_data, process_id_document
from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import (
    CustomerPersona,
    CustomerOccupantProfile,
    Floor,
    Property,
    ReservationOccupant,
    ReservationRequest,
    StayRecord,
    StayOccupant,
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
                "email": f"{uuid4().hex}@example.com",
                "phone": f"+1555{uuid4().int % 10000000:07d}",
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


def test_hostel_reservations_cannot_assign_multiple_beds_to_one_customer(
    client, db_session
):
    headers = _admin_headers(db_session)
    suffix = uuid4().hex[:8]
    property_response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": f"Hostel Reservation {suffix}",
            "type": "HOSTEL_COED",
            "floors": 1,
            "address": "1 Hostel Lane",
            "city": f"Hostel{suffix}",
            "state": "Test State",
            "pincode": "10000",
            "contactPhone": "1234567890",
            "timezone": "Asia/Kolkata",
        },
    )
    assert property_response.status_code == 201, property_response.text
    property_id = property_response.json()["id"]

    multiple_beds = _reservation_payload(property_id)
    multiple_beds.update(
        {
            "requestedType": "BED",
            "requestedQuantity": 3,
            "requestedSharingType": "SINGLE",
        }
    )
    rejected = client.post("/api/v1/reservations", json=multiple_beds)
    assert rejected.status_code == 400, rejected.text
    assert rejected.json()["error"]["code"] == "HOSTEL_SINGLE_BED_PER_CUSTOMER"

    legacy_payload = _reservation_payload(property_id)
    legacy_payload.update(
        {"requestedType": "BED", "requestedSharingType": "SINGLE"}
    )
    legacy_response = client.post("/api/v1/reservations", json=legacy_payload)
    assert legacy_response.status_code == 201, legacy_response.text
    reservation = db_session.get(ReservationRequest, legacy_response.json()["id"])
    assert reservation is not None
    reservation.requested_quantity = 3
    db_session.commit()
    approved = client.patch(
        f"/api/v1/reservations/{reservation.id}/status",
        headers=headers,
        json={"status": "APPROVED"},
    )
    assert approved.status_code == 200, approved.text

    conversion = client.post(
        f"/api/v1/reservations/{reservation.id}/convert",
        headers=headers,
        json={"unitId": "legacy-unit"},
    )
    assert conversion.status_code == 400, conversion.text
    assert conversion.json()["error"]["code"] == "HOSTEL_SINGLE_BED_PER_CUSTOMER"


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


def test_saved_occupant_profiles_are_owner_scoped_and_snapshotted_on_conversion(
    client, db_session
):
    suffix = uuid4().hex[:8]
    prop = Property(
        code=f"GROUP-{suffix.upper()}",
        name="Group Booking Hotel",
        type="HOTEL",
        status="ACTIVE",
    )
    db_session.add(prop)
    db_session.flush()
    floor = Floor(property_id=prop.id, number=1, name="Ground Floor")
    db_session.add(floor)
    db_session.flush()
    unit = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{suffix}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=100,
        status="AVAILABLE",
    )
    db_session.add(unit)

    customer = User(
        email=f"group-booker-{suffix}@example.com",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        full_name="Group Booker",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    main_id = process_id_document("PRIMARY-1122")
    customer.id_document_type = "PASSPORT"
    customer.id_document_number_encrypted = main_id[0]
    customer.id_document_lookup_hash = main_id[2]
    db_session.add(customer)
    db_session.commit()
    customer_headers = {
        "Authorization": f"Bearer {create_access_token(subject=customer.id, audience='customer', role=Role.CUSTOMER.value)}"
    }

    profile_response = client.post(
        "/api/v1/customer/occupants",
        headers=customer_headers,
        json={
            "fullName": "Saved Occupant",
            "dateOfBirth": "2012-06-15",
            "age": 14,
            "email": f"saved-{uuid4().hex[:8]}@example.com",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "OCCUPANT-3344",
        },
    )
    assert profile_response.status_code == 201, profile_response.text
    profile = profile_response.json()
    assert profile["idDocumentLast4"] == "3344"
    assert "idDocumentNumber" not in profile
    assert "idDocumentNumberEncrypted" not in profile
    assert profile["id"] in {
        item["id"]
        for item in client.get(
            "/api/v1/customer/occupants",
            headers=customer_headers,
        ).json()
    }
    updated_profile = client.patch(
        f"/api/v1/customer/occupants/{profile['id']}",
        headers=customer_headers,
        json={"idDocumentType": "PASSPORT"},
    )
    assert updated_profile.status_code == 200, updated_profile.text
    assert updated_profile.json()["idDocumentType"] == "PASSPORT"

    other_customer = User(
        email=f"other-group-booker-{suffix}@example.com",
        phone=f"+1666{uuid4().int % 10000000:07d}",
        full_name="Other Booker",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    other_id = process_id_document("OTHER-5566")
    other_customer.id_document_type = "PASSPORT"
    other_customer.id_document_number_encrypted = other_id[0]
    other_customer.id_document_lookup_hash = other_id[2]
    db_session.add(other_customer)
    db_session.commit()
    other_headers = {
        "Authorization": f"Bearer {create_access_token(subject=other_customer.id, audience='customer', role=Role.CUSTOMER.value)}"
    }
    unauthorized_profile_booking = _reservation_payload(prop.id)
    unauthorized_profile_booking.update(
        {
            "email": other_customer.email,
            "mobile": other_customer.phone,
            "numberOfAdults": 2,
            "occupants": [],
            "occupantProfileIds": [profile["id"]],
        }
    )
    rejected = client.post(
        "/api/v1/reservations",
        headers=other_headers,
        json=unauthorized_profile_booking,
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "OCCUPANT_PROFILE_NOT_OWNED"

    reservation_payload = _reservation_payload(prop.id)
    reservation_payload.update(
        {
            "email": customer.email,
            "mobile": customer.phone,
            "numberOfAdults": 2,
            "occupants": [],
            "occupantProfileIds": [profile["id"]],
        }
    )
    created = client.post(
        "/api/v1/reservations",
        headers=customer_headers,
        json=reservation_payload,
    )
    assert created.status_code == 201, created.text
    reservation_id = created.json()["id"]
    admin_headers = _admin_headers(db_session)
    approved = client.patch(
        f"/api/v1/reservations/{reservation_id}/status",
        headers=admin_headers,
        json={"status": "APPROVED"},
    )
    assert approved.status_code == 200, approved.text
    conversion = client.post(
        f"/api/v1/reservations/{reservation_id}/convert",
        headers=admin_headers,
        json={"unitId": unit.id},
    )
    assert conversion.status_code == 200, conversion.text

    stay = db_session.get(StayRecord, conversion.json()["stayRecordId"])
    assert stay is not None
    assert stay.user_id == customer.id
    assert stay.guest_count == 2
    occupant = db_session.scalar(
        select(StayOccupant).where(StayOccupant.stay_record_id == stay.id)
    )
    assert occupant is not None
    assert occupant.profile_id == profile["id"]
    assert occupant.guest_user_id is not None
    guest_account = db_session.get(User, occupant.guest_user_id)
    assert guest_account is not None
    assert guest_account.customer_persona == "HOTEL_GUEST"
    assert occupant.full_name == "Saved Occupant"
    assert decrypt_data(occupant.id_document_number_encrypted) == "OCCUPANT-3344"
    assert db_session.scalar(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.owner_user_id == customer.id,
            CustomerOccupantProfile.id == profile["id"],
        )
    ) is not None


def test_saved_occupant_group_cannot_exceed_room_capacity(client, db_session):
    suffix = uuid4().hex[:8]
    prop = Property(
        code=f"CAP-{suffix.upper()}",
        name="Capacity Hotel",
        type="HOTEL",
        status="ACTIVE",
    )
    db_session.add(prop)
    db_session.flush()
    floor = Floor(property_id=prop.id, number=1, name="Ground Floor")
    db_session.add(floor)
    db_session.flush()
    unit = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{suffix}",
        floor=1,
        type="ROOM",
        category="CLASSIC",
        capacity=2,
        default_price_per_night=100,
        status="AVAILABLE",
    )
    db_session.add(unit)
    customer = User(
        email=f"capacity-booker-{suffix}@example.com",
        phone=f"+1777{uuid4().int % 10000000:07d}",
        full_name="Capacity Booker",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    main_id = process_id_document("CAP-PRIMARY-1")
    customer.id_document_type = "PASSPORT"
    customer.id_document_number_encrypted = main_id[0]
    customer.id_document_lookup_hash = main_id[2]
    db_session.add(customer)
    db_session.commit()
    customer_headers = {
        "Authorization": f"Bearer {create_access_token(subject=customer.id, audience='customer', role=Role.CUSTOMER.value)}"
    }

    profile_ids = []
    for index in range(2):
        response = client.post(
            "/api/v1/customer/occupants",
            headers=customer_headers,
            json={
                "fullName": f"Saved Occupant {index + 1}",
                "age": 30 + index,
                "email": f"capacity-occupant-{suffix}-{index}@example.com",
                "phone": f"+1888{uuid4().int % 10000000:07d}",
                "idDocumentType": "PASSPORT",
                "idDocumentNumber": f"CAP-OCCUPANT-{suffix}-{index}",
            },
        )
        assert response.status_code == 201, response.text
        profile_ids.append(response.json()["id"])

    payload = _reservation_payload(prop.id)
    payload.update(
        {
            "email": customer.email,
            "mobile": customer.phone,
            "numberOfAdults": 3,
            "occupants": [],
            "occupantProfileIds": profile_ids,
        }
    )
    created = client.post(
        "/api/v1/reservations",
        headers=customer_headers,
        json=payload,
    )
    assert created.status_code == 201, created.text
    reservation_id = created.json()["id"]
    admin_headers = _admin_headers(db_session)
    approved = client.patch(
        f"/api/v1/reservations/{reservation_id}/status",
        headers=admin_headers,
        json={"status": "APPROVED"},
    )
    assert approved.status_code == 200, approved.text
    conversion = client.post(
        f"/api/v1/reservations/{reservation_id}/convert",
        headers=admin_headers,
        json={"unitId": unit.id},
    )
    assert conversion.status_code == 400
    assert conversion.json()["error"]["code"] == "OCCUPANT_CAPACITY_EXCEEDED"


def test_staff_hotel_reservations_recheck_additional_guest_occupancy_on_conversion(
    client, db_session
):
    suffix = uuid4().hex[:8]
    prop = Property(
        code=f"LEAD-{suffix.upper()}",
        name="Lead Reservation Hotel",
        type="HOTEL",
        status="ACTIVE",
    )
    db_session.add(prop)
    db_session.flush()
    floor = Floor(property_id=prop.id, number=1, name="Ground Floor")
    db_session.add(floor)
    db_session.flush()
    units = [
        Unit(
            property_id=prop.id,
            floor_id=floor.id,
            unit_number=f"ROOM-{suffix}-{index}",
            floor=1,
            type="ROOM",
            category="CLASSIC",
            capacity=2,
            default_price_per_night=100,
            status="AVAILABLE",
        )
        for index in range(1, 3)
    ]

    def create_hotel_guest(
        name: str,
        persona: CustomerPersona = CustomerPersona.HOTEL_GUEST,
    ):
        guest_suffix = uuid4().hex[:8]
        document = process_id_document(f"LEAD-{guest_suffix}")
        guest = User(
            email=f"{guest_suffix}@example.com",
            phone=f"+1555{uuid4().int % 10000000:07d}",
            full_name=name,
            password_hash="unused",
            role=Role.CUSTOMER,
            status="ACTIVE",
            customer_persona=persona.value,
            id_document_type="PASSPORT",
            id_document_number_encrypted=document[0],
            id_document_last4=document[1],
            id_document_lookup_hash=document[2],
        )
        db_session.add(guest)
        return guest

    primary_guest = create_hotel_guest("Primary Lead Guest")
    second_primary_guest = create_hotel_guest("Second Lead Guest")
    additional_guest = create_hotel_guest("Additional Lead Guest")
    db_session.add_all(units)
    db_session.commit()
    headers = _admin_headers(db_session)

    def create_lead(main_guest: User):
        payload = _reservation_payload(prop.id)
        payload.update(
            {
                "primaryGuestUserId": main_guest.id,
                "guestUserIds": [additional_guest.id],
                "guestName": main_guest.full_name,
                "mobile": main_guest.phone,
                "email": main_guest.email,
                "numberOfAdults": 2,
                "occupants": [],
                "channelOrigin": "WALK_IN",
            }
        )
        return client.post("/api/v1/reservations", headers=headers, json=payload)

    first = create_lead(primary_guest)
    second = create_lead(second_primary_guest)
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    first_reservation = db_session.get(ReservationRequest, first.json()["id"])
    assert first_reservation is not None
    assert first_reservation.primary_user_id == primary_guest.id
    occupant = db_session.scalar(
        select(ReservationOccupant).where(
            ReservationOccupant.reservation_request_id == first_reservation.id
        )
    )
    assert occupant is not None
    assert occupant.guest_user_id == additional_guest.id

    for reservation_id in (first.json()["id"], second.json()["id"]):
        approved = client.patch(
            f"/api/v1/reservations/{reservation_id}/status",
            headers=headers,
            json={"status": "APPROVED"},
        )
        assert approved.status_code == 200, approved.text

    first_conversion = client.post(
        f"/api/v1/reservations/{first.json()['id']}/convert",
        headers=headers,
        json={"unitId": units[0].id},
    )
    assert first_conversion.status_code == 200, first_conversion.text
    stay = db_session.get(StayRecord, first_conversion.json()["stayRecordId"])
    assert stay is not None
    stay_occupant = db_session.scalar(
        select(StayOccupant).where(StayOccupant.stay_record_id == stay.id)
    )
    assert stay_occupant is not None
    assert stay_occupant.guest_user_id == additional_guest.id

    second_conversion = client.post(
        f"/api/v1/reservations/{second.json()['id']}/convert",
        headers=headers,
        json={"unitId": units[1].id},
    )
    assert second_conversion.status_code == 409, second_conversion.text
    assert second_conversion.json()["error"]["code"] == "GUEST_ALREADY_ASSIGNED"


def test_staff_cannot_add_guest_accounts_to_hostel_or_duplicate_them(client, db_session):
    headers = _admin_headers(db_session)
    suffix = uuid4().hex[:8]
    prop = Property(
        code=f"HOST-{suffix.upper()}",
        name="Lead Reservation Hostel",
        type="HOSTEL_COED",
        status="ACTIVE",
    )
    db_session.add(prop)
    hostel_guest = User(
        email=f"hosteler-{suffix}@example.com",
        phone=f"+1666{uuid4().int % 10000000:07d}",
        full_name="Hostel Lead Guest",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
        customer_persona=CustomerPersona.HOSTELER.value,
    )
    additional_guest = User(
        email=f"additional-{suffix}@example.com",
        phone=f"+1777{uuid4().int % 10000000:07d}",
        full_name="Additional Hotel Guest",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
        customer_persona=CustomerPersona.HOTEL_GUEST.value,
        id_document_type="PASSPORT",
        id_document_number_encrypted=process_id_document(f"HOST-{suffix}")[0],
    )
    db_session.add_all([prop, hostel_guest, additional_guest])
    db_session.commit()

    hostel_payload = _reservation_payload(prop.id)
    hostel_payload.update(
        {
            "primaryGuestUserId": hostel_guest.id,
            "guestUserIds": [additional_guest.id],
            "guestName": hostel_guest.full_name,
            "mobile": hostel_guest.phone,
            "requestedType": "BED",
            "requestedSharingType": "SINGLE",
            "numberOfAdults": 2,
            "occupants": [],
        }
    )
    hostel_response = client.post(
        "/api/v1/reservations", headers=headers, json=hostel_payload
    )
    assert hostel_response.status_code == 400, hostel_response.text
    assert hostel_response.json()["error"]["code"] == "HOSTEL_SINGLE_OCCUPANT_PER_BED"

    hotel = db_session.scalar(select(Property).where(Property.code == "HQ-01"))
    assert hotel is not None
    duplicate_payload = _reservation_payload(hotel.id)
    duplicate_payload.update(
        {
            "primaryGuestUserId": hostel_guest.id,
            "guestUserIds": [hostel_guest.id, hostel_guest.id],
            "numberOfAdults": 3,
            "occupants": [],
        }
    )
    duplicate_response = client.post(
        "/api/v1/reservations", headers=headers, json=duplicate_payload
    )
    assert duplicate_response.status_code == 422, duplicate_response.text


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
    one_night_payload = {
        **payload,
        "expectedCheckOut": (
            date.fromisoformat(payload["expectedCheckIn"]) + timedelta(days=1)
        ).isoformat(),
    }
    one_night = client.post("/api/v1/reservations", json=one_night_payload)
    assert one_night.status_code == 422

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
    assert customer.customer_persona == "TEMP_CUSTOMER"
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
