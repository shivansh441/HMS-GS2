import re
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import decrypt_data
from app.core.permissions import Role
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_token,
    verify_password,
)
from app.db.models import (
    AuditLog,
    CustomerOccupantProfile,
    CustomerPropertyLink,
    Floor,
    OutboxMessage,
    Property,
    StayRecord,
    User,
    Unit,
    VerificationToken,
)


def _admin_headers(db_session) -> dict[str, str]:
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    token = create_access_token(subject=admin.id, audience="admin", role=Role.ADMIN.value)
    return {"Authorization": f"Bearer {token}"}


def _create_property(db_session, name: str, property_type: str = "HOTEL") -> Property:
    suffix = uuid4().hex[:8]
    prop = Property(
        code=f"USR-{suffix.upper()}",
        name=name,
        type=property_type,
        status="ACTIVE",
    )
    db_session.add(prop)
    db_session.commit()
    return prop


def test_admin_user_directory_sorts_users_before_pagination(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    token = uuid4().hex[:10]
    sort_users = [
        User(
            email=f"sort-{token}-alpha@example.com",
            full_name="Alpha Sort",
            role=Role.CUSTOMER.value,
            status="ACTIVE",
            password_hash="unused",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ),
        User(
            email=f"sort-{token}-middle@example.com",
            full_name="Middle Sort",
            role=Role.CUSTOMER.value,
            status="ACTIVE",
            password_hash="unused",
            created_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
        ),
        User(
            email=f"sort-{token}-zulu@example.com",
            full_name="Zulu Sort",
            role=Role.CUSTOMER.value,
            status="ACTIVE",
            password_hash="unused",
            created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        ),
    ]
    db_session.add_all(sort_users)
    db_session.commit()

    expected_order = {
        "A_TO_Z": ["alpha", "middle", "zulu"],
        "Z_TO_A": ["zulu", "middle", "alpha"],
        "NEWEST": ["middle", "zulu", "alpha"],
        "OLDEST": ["alpha", "zulu", "middle"],
    }
    for sort_by, suffixes in expected_order.items():
        sorted_suffixes = []
        for offset in (0, 2):
            response = client.get(
                "/api/v1/admin/users",
                headers=headers,
                params={
                    "role": "CUSTOMER",
                    "search": token,
                    "sortBy": sort_by,
                    "limit": 2,
                    "offset": offset,
                },
            )
            assert response.status_code == 200, response.text
            sorted_suffixes.extend(
                user["email"].split("-")[-1].split("@")[0]
                for user in response.json()["items"]
            )
        assert sorted_suffixes == suffixes


def test_admin_can_create_view_and_update_staff_account(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    prop = _create_property(db_session, "Staff Assignment Property")
    suffix = uuid4().hex[:8]
    email = f"staff-{suffix}@example.com"

    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "fullName": "New Staff Member",
            "phone": "+15550001111",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "AADHAAR",
            "idDocumentNumber": "123456789012",
            "role": "STAFF",
            "staffRole": "FRONT_DESK",
            "propertyIds": [prop.id],
            "permanentAddress": "12 Staff Street",
        },
    )
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["role"] == "STAFF"
    assert data["date_of_birth"] == "1990-01-01"
    assert "username" not in data
    assert data["status"] == "PENDING_ACTIVATION"
    assert data["propertyIds"] == [prop.id]
    assert data["permanentAddress"] == "12 Staff Street"

    detail = client.get(f"/api/v1/admin/users/{data['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["email"] == email
    assert detail.json()["propertyIds"] == [prop.id]

    edited = client.patch(
        f"/api/v1/admin/users/{data['id']}",
        headers=headers,
        json={
            "fullName": "Updated Staff Member",
            "staffRole": "MAINTENANCE",
            "dateOfBirth": "1991-04-04",
            "permanentAddress": "24 Updated Street",
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["full_name"] == "Updated Staff Member"
    assert edited.json()["staffRole"] == "MAINTENANCE"
    assert edited.json()["date_of_birth"] == "1991-04-04"
    assert edited.json()["permanentAddress"] == "24 Updated Street"

    invite = db_session.scalar(
        select(OutboxMessage).where(OutboxMessage.destination == email)
    )
    assert invite is not None
    token = re.search(r"token=([A-Za-z0-9_-]+)", invite.body)
    assert token is not None
    token_record = db_session.scalar(
        select(VerificationToken).where(VerificationToken.user_id == data["id"])
    )
    assert token_record is not None

    activated = client.post(
        "/api/v1/auth/activate",
        json={"token": token.group(1), "newPassword": "StrongPass123!"},
    )
    assert activated.status_code == 200, activated.text
    access_claims = decode_access_token(activated.json()["accessToken"], "admin")
    assert access_claims["sub"] == data["id"]

    audit = db_session.scalar(
        select(AuditLog).where(
            AuditLog.target_user_id == data["id"],
            AuditLog.action == "USER_UPDATED",
        )
    )
    assert audit is not None


def test_admin_detail_includes_profile_and_masked_government_id(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    target = User(
        email=f"admin-detail-{uuid4().hex[:8]}@example.com",
        full_name="Admin Detail",
        phone="+15550001112",
        gender="FEMALE",
        role=Role.ADMIN,
        status="ACTIVE",
        password_hash="unused",
        id_document_type="AADHAAR",
        id_document_last4="9012",
    )
    db_session.add(target)
    db_session.commit()

    response = client.get(f"/api/v1/admin/users/{target.id}", headers=headers)

    assert response.status_code == 200, response.text
    details = response.json()
    assert details["full_name"] == "Admin Detail"
    assert details["email"] == target.email
    assert details["phone"] == "+15550001112"
    assert details["gender"] == "FEMALE"
    assert details["idDocumentType"] == "AADHAAR"
    assert details["idDocumentLast4"] == "9012"


def test_admin_user_creation_requires_government_id(client: TestClient, db_session):
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"missing-id-{uuid4().hex[:8]}@example.com",
            "fullName": "Missing Government ID",
            "phone": "+15550009991",
            "role": "ADMIN",
        },
    )
    assert response.status_code == 422


def test_admin_user_creation_requires_date_of_birth(client: TestClient, db_session):
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"missing-dob-{uuid4().hex[:8]}@example.com",
            "fullName": "Missing Date of Birth",
            "phone": "+15550009992",
            "idDocumentType": "PAN",
            "idDocumentNumber": "ABCDE1234F",
            "role": "ADMIN",
        },
    )
    assert response.status_code == 422


def test_admin_can_create_customer_and_assign_properties(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    prop = _create_property(db_session, "Customer Assignment Property")
    suffix = uuid4().hex[:8]
    email = f"customer-{suffix}@example.com"

    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "fullName": "New Customer",
            "phone": "+15550002222",
            "dateOfBirth": "1990-01-01",
            "role": "CUSTOMER",
            "propertyIds": [prop.id],
            "customerPersona": "HOTEL_GUEST",
            "gender": "FEMALE",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "emergencyContactPhone": "+15550003333",
            "initialStayPropertyId": prop.id,
            "stayStartDate": "2026-10-27",
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    assert created.json()["customerPersona"] == "HOTEL_GUEST"
    assert created.json()["gender"] == "FEMALE"
    assert created.json()["idDocumentLast4"] == "4567"
    assert created.json()["emergencyContactPhone"] == "+15550003333"
    assert created.json()["initialStay"] == {
        "propertyId": prop.id,
        "startDate": "2026-10-27",
        "endDate": None,
        "guestCount": 1,
        "additionalGuests": [],
    }
    initial_password = created.json()["initialPassword"]
    assert isinstance(initial_password, str) and len(initial_password) >= 32
    assert created.json()["status"] == "ACTIVE"
    assert created.json()["activationUrl"] is None
    created_user = db_session.get(User, user_id)
    assert created_user is not None
    assert verify_password(initial_password, created_user.password_hash)
    assert created_user.id_document_number_encrypted != "A1234567"
    assert decrypt_data(created_user.id_document_number_encrypted) == "A1234567"
    assert db_session.scalar(
        select(VerificationToken).where(VerificationToken.user_id == user_id)
    ) is None
    assert db_session.scalar(
        select(OutboxMessage).where(
            OutboxMessage.destination == "new-customer@example.com"
        )
    ) is None
    detail = client.get(
        f"/api/v1/admin/users/{user_id}",
        headers=headers,
    )
    assert detail.status_code == 200, detail.text
    assert "initialPassword" not in detail.json()
    stay = db_session.scalar(select(StayRecord).where(StayRecord.user_id == user_id))
    assert stay is not None
    assert stay.persona == "HOTEL_GUEST"

    link = db_session.scalar(
        select(CustomerPropertyLink).where(
            CustomerPropertyLink.user_id == user_id,
            CustomerPropertyLink.property_id == prop.id,
        )
    )
    assert link is not None

    hostel = _create_property(db_session, "Customer Hostel Assignment", "HOSTEL_COED")
    edited = client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=headers,
        json={
            "propertyIds": [hostel.id],
            "customerPersona": "HOSTELER",
            "emergencyContactPhone": "+15550004444",
            "initialStayPropertyId": hostel.id,
            "permanentAddress": "12 Example Road",
            "occupation": "Designer",
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["propertyIds"] == [hostel.id]
    assert edited.json()["customerPersona"] == "HOSTELER"
    assert edited.json()["permanentAddress"] == "12 Example Road"
    assert edited.json()["occupation"] == "Designer"
    assert edited.json()["emergencyContactPhone"] == "+15550004444"
    db_session.refresh(stay)
    assert stay.persona == "HOSTELER"
    assert stay.property_id == hostel.id

    changed_to_temporary = client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=headers,
        json={"customerPersona": "TEMP_CUSTOMER"},
    )
    assert changed_to_temporary.status_code == 200, changed_to_temporary.text
    assert changed_to_temporary.json()["customerPersona"] == "TEMP_CUSTOMER"
    db_session.refresh(stay)
    assert stay.persona == "HOSTELER"
    assert stay.property_id == hostel.id

    filtered = client.get(
        "/api/v1/admin/users",
        headers=headers,
        params={"guest_subtype": "HOSTELER"},
    )
    assert filtered.status_code == 200, filtered.text
    assert any(item["id"] == user_id for item in filtered.json()["items"])


def test_admin_created_customer_can_sign_in_and_be_assigned_to_a_room(client, db_session):
    headers = _admin_headers(db_session)
    prop = _create_property(db_session, "Immediately Active Customer")
    suffix = uuid4().hex[:8]
    email = f"immediate-{suffix}@example.com"
    phone = f"+1555{uuid4().int % 10000000:07d}"
    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "fullName": "Immediately Active Customer",
            "phone": phone,
            "dateOfBirth": "1990-01-01",
            "role": "CUSTOMER",
            "customerPersona": "TEMP_CUSTOMER",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": f"P{suffix}",
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    initial_password = created.json()["initialPassword"]

    login = client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": initial_password},
    )
    assert login.status_code == 200, login.text

    floor = Floor(property_id=prop.id, number=1, name="Ground Floor")
    db_session.add(floor)
    db_session.flush()
    unit = Unit(
        property_id=prop.id,
        floor_id=floor.id,
        unit_number=f"ROOM-{suffix}",
        default_price_per_night=100,
        status="AVAILABLE",
    )
    db_session.add(unit)
    db_session.commit()

    assignment = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": unit.id,
            "userId": user_id,
            "expectedCheckIn": datetime.now(timezone.utc).isoformat(),
            "checkInNow": True,
            "billingStrategy": "PER_NIGHT_STAY",
        },
    )
    assert assignment.status_code == 201, assignment.text


def test_emergency_contact_number_is_saved_for_every_customer_type(client, db_session):
    headers = _admin_headers(db_session)
    test_cases = (
        ("HOTEL_GUEST", "HOTEL"),
        ("HOSTELER", "HOSTEL_COED"),
        ("TEMP_CUSTOMER", None),
    )

    for persona, property_type in test_cases:
        prop = (
            _create_property(db_session, f"{persona} Contact", property_type)
            if property_type
            else None
        )
        suffix = uuid4().hex[:8]
        emergency_phone = f"+1555{uuid4().int % 10000000:07d}"
        payload = {
            "email": f"{persona.lower()}-{suffix}@example.com",
            "fullName": f"{persona} Guest",
            "phone": f"+1666{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "role": "CUSTOMER",
            "customerPersona": persona,
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": f"P{suffix}",
            "emergencyContactPhone": emergency_phone,
        }
        if prop:
            payload.update(
                initialStayPropertyId=prop.id,
                stayStartDate="2026-11-10",
            )
        response = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json=payload,
        )

        assert response.status_code == 201, response.text
        assert response.json()["emergencyContactPhone"] == emergency_phone
        assert "emergencyContactName" not in response.json()


def test_hosteler_and_temporary_customer_cannot_have_additional_occupants(client, db_session):
    hostel = _create_property(db_session, "Group Guest Hostel", "HOSTEL_COED")
    headers = _admin_headers(db_session)
    for persona in ("HOSTELER", "TEMP_CUSTOMER"):
        payload = {
            "email": f"{persona.lower()}-{uuid4().hex[:8]}@example.com",
            "fullName": f"Primary {persona}",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "AADHAAR",
            "idDocumentNumber": "123456789012",
            "role": "CUSTOMER",
            "customerPersona": persona,
            "emergencyContactPhone": "+15550005555",
            "guestCount": 2,
            "additionalGuests": [
                {
                    "fullName": "Additional Guest",
                    "dateOfBirth": "2004-01-01",
                    "idDocumentType": "PAN",
                    "idDocumentNumber": "ABCDE1234F",
                }
            ],
        }
        if persona == "HOSTELER":
            payload.update(
                initialStayPropertyId=hostel.id,
                stayStartDate="2026-11-10",
            )
        response = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json=payload,
        )
        assert response.status_code == 422

    invalid_count = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": f"count-{uuid4().hex[:8]}@example.com",
            "fullName": "Invalid Guest Count",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "CUSTOMER",
            "customerPersona": "HOSTELER",
            "initialStayPropertyId": hostel.id,
            "stayStartDate": "2026-11-10",
            "guestCount": 2,
            "additionalGuests": [],
        },
    )
    assert invalid_count.status_code == 422


def test_hotel_guest_can_add_occupants(client, db_session):
    hotel = _create_property(db_session, "Group Guest Hotel", "HOTEL")
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"hotel-group-{uuid4().hex[:8]}@example.com",
            "fullName": "Primary Hotel Guest",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "CUSTOMER",
            "customerPersona": "HOTEL_GUEST",
            "initialStayPropertyId": hotel.id,
            "stayStartDate": "2026-11-10",
            "guestCount": 2,
            "additionalGuests": [],
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["initialStay"]["guestCount"] == 2
    assert response.json()["initialStay"]["additionalGuests"] == []

    updated = client.patch(
        f"/api/v1/admin/users/{response.json()['id']}",
        headers=_admin_headers(db_session),
        json={"guestCount": 3},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["initialStay"]["guestCount"] == 3

    response_with_occupants = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"hotel-group-details-{uuid4().hex[:8]}@example.com",
            "fullName": "Hotel Guest With Occupant Details",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "CUSTOMER",
            "customerPersona": "HOTEL_GUEST",
            "initialStayPropertyId": hotel.id,
            "stayStartDate": "2026-11-10",
            "guestCount": 2,
            "additionalGuests": [
                {
                    "fullName": "Additional Guest",
                    "dateOfBirth": "2004-01-01",
                    "email": f"additional-{uuid4().hex[:8]}@example.com",
                    "phone": f"+1555{uuid4().int % 10000000:07d}",
                    "idDocumentType": "AADHAAR",
                    "idDocumentNumber": "234567890123",
                }
            ],
        },
    )
    assert response_with_occupants.status_code == 201, response_with_occupants.text
    assert response_with_occupants.json()["initialStay"]["guestCount"] == 2
    assert len(response_with_occupants.json()["initialStay"]["additionalGuests"]) == 1
    assert (
        response_with_occupants.json()["initialStay"]["additionalGuests"][0]["fullName"]
        == "Additional Guest"
    )
    existing_occupant = response_with_occupants.json()["initialStay"]["additionalGuests"][0]
    primary_user_id = response_with_occupants.json()["id"]
    profile = db_session.scalar(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.owner_user_id == primary_user_id
        )
    )
    assert profile is not None
    assert profile.full_name == "Additional Guest"
    assert profile.id_document_last4 == "0123"

    edited = client.patch(
        f"/api/v1/admin/users/{response_with_occupants.json()['id']}",
        headers=_admin_headers(db_session),
        json={
            "guestCount": 3,
            "additionalGuests": [
                {
                    "id": existing_occupant["id"],
                    "fullName": "Edited Additional Guest",
                    "dateOfBirth": "2004-01-01",
                    "idDocumentType": "AADHAAR",
                },
                {
                    "fullName": "New Additional Guest",
                    "dateOfBirth": "2005-02-02",
                    "email": f"new-additional-{uuid4().hex[:8]}@example.com",
                    "phone": f"+1555{uuid4().int % 10000000:07d}",
                    "idDocumentType": "PAN",
                    "idDocumentNumber": "ABCDE1234F",
                },
            ],
        },
    )
    assert edited.status_code == 200, edited.text
    edited_occupants = edited.json()["initialStay"]["additionalGuests"]
    assert len(edited_occupants) == 2
    assert edited_occupants[0]["id"] == existing_occupant["id"]
    assert edited_occupants[0]["fullName"] == "Edited Additional Guest"
    assert edited_occupants[0]["idDocumentLast4"] == existing_occupant["idDocumentLast4"]
    assert edited_occupants[1]["fullName"] == "New Additional Guest"
    assert edited_occupants[1]["idDocumentLast4"] == "234F"
    db_session.refresh(profile)
    assert profile.full_name == "Edited Additional Guest"
    assert db_session.scalar(
        select(CustomerOccupantProfile.id).where(
            CustomerOccupantProfile.owner_user_id == primary_user_id,
            CustomerOccupantProfile.full_name == "New Additional Guest",
        )
    ) is not None

    removed = client.patch(
        f"/api/v1/admin/users/{response_with_occupants.json()['id']}",
        headers=_admin_headers(db_session),
        json={"guestCount": 1, "additionalGuests": []},
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["initialStay"]["additionalGuests"] == []
    assert db_session.scalar(
        select(CustomerOccupantProfile.id).where(
            CustomerOccupantProfile.owner_user_id == primary_user_id,
            CustomerOccupantProfile.id == profile.id,
        )
    ) is not None


def test_repeat_stay_preserves_occupant_history_and_reuses_guest_accounts(
    client, db_session
):
    headers = _admin_headers(db_session)
    prop = _create_property(db_session, "Repeat Stay Hotel")
    suffix = uuid4().hex[:8]
    primary_email = f"repeat-primary-{suffix}@example.com"
    additional_email = f"repeat-guest-{suffix}@example.com"
    additional_phone = f"+1555{uuid4().int % 10000000:07d}"
    first_start = date.today() + timedelta(days=10)
    second_start = date.today() + timedelta(days=30)
    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": primary_email,
            "fullName": "Repeat Stay Primary",
            "phone": f"+1666{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": f"PRIMARY-{suffix}",
            "role": "CUSTOMER",
            "customerPersona": "HOTEL_GUEST",
            "initialStayPropertyId": prop.id,
            "stayStartDate": first_start.isoformat(),
            "guestCount": 2,
            "additionalGuests": [
                {
                    "fullName": "Returning Additional Guest",
                    "dateOfBirth": "1992-02-02",
                    "email": additional_email,
                    "phone": additional_phone,
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": f"RETURNING-{suffix}",
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    primary_user_id = created.json()["id"]
    first_stay = db_session.scalar(
        select(StayRecord).where(
            StayRecord.user_id == primary_user_id,
            StayRecord.start_date == first_start,
        )
    )
    assert first_stay is not None
    first_guest_id = first_stay.additional_guests[0].guest_user_id
    assert first_guest_id is not None

    repeat = client.post(
        f"/api/v1/admin/users/{primary_user_id}/stays",
        headers=headers,
        json={
            "propertyId": prop.id,
            "startDate": second_start.isoformat(),
            "guestCount": 3,
            "additionalGuests": [
                {
                    "fullName": "Returning Additional Guest",
                    "dateOfBirth": "1992-02-02",
                    "email": additional_email,
                    "phone": additional_phone,
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": f"RETURNING-{suffix}",
                },
                {
                    "fullName": "New Additional Guest",
                    "dateOfBirth": "1994-04-04",
                    "email": f"repeat-new-{suffix}@example.com",
                    "phone": f"+1777{uuid4().int % 10000000:07d}",
                    "idDocumentType": "PAN",
                    "idDocumentNumber": f"NEW-{suffix}",
                },
            ],
        },
    )
    assert repeat.status_code == 201, repeat.text
    second_stay = db_session.scalar(
        select(StayRecord).where(
            StayRecord.user_id == primary_user_id,
            StayRecord.start_date == second_start,
        )
    )
    assert second_stay is not None
    assert second_stay.id != first_stay.id
    assert [guest.guest_user_id for guest in second_stay.additional_guests][0] == first_guest_id
    assert second_stay.additional_guests[1].guest_user_id != first_guest_id
    db_session.refresh(first_stay)
    assert len(first_stay.additional_guests) == 1
    assert first_stay.additional_guests[0].full_name == "Returning Additional Guest"
    assert db_session.scalar(
        select(StayRecord.id).where(
            StayRecord.user_id == primary_user_id,
            StayRecord.start_date == first_start,
        )
    ) == first_stay.id

    changed_contact = client.post(
        f"/api/v1/admin/users/{primary_user_id}/stays",
        headers=headers,
        json={
            "propertyId": prop.id,
            "startDate": (second_start + timedelta(days=30)).isoformat(),
            "guestCount": 2,
            "additionalGuests": [
                {
                    "fullName": "Returning Additional Guest",
                    "dateOfBirth": "1992-02-02",
                    "email": f"changed-{suffix}@example.com",
                    "phone": additional_phone,
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": f"RETURNING-{suffix}",
                }
            ],
        },
    )
    assert changed_contact.status_code == 409
    assert changed_contact.json()["error"]["code"] == "GUEST_IDENTITY_CONFLICT"

    reused_contact = client.post(
        f"/api/v1/admin/users/{primary_user_id}/stays",
        headers=headers,
        json={
            "propertyId": prop.id,
            "startDate": (second_start + timedelta(days=60)).isoformat(),
            "guestCount": 2,
            "additionalGuests": [
                {
                    "fullName": "Different Guest",
                    "dateOfBirth": "1995-05-05",
                    "email": additional_email,
                    "phone": f"+1777{uuid4().int % 10000000:07d}",
                    "idDocumentType": "PASSPORT",
                    "idDocumentNumber": f"DIFFERENT-{suffix}",
                }
            ],
        },
    )
    assert reused_contact.status_code == 409
    assert reused_contact.json()["error"]["code"] == "GUEST_CONTACT_IN_USE"

    db_session.expire_all()
    assert db_session.scalar(
        select(StayRecord.id).where(
            StayRecord.user_id == primary_user_id,
            StayRecord.start_date == second_start + timedelta(days=30),
        )
    ) is None
    assert db_session.scalar(
        select(StayRecord.id).where(
            StayRecord.user_id == primary_user_id,
            StayRecord.start_date == second_start + timedelta(days=60),
        )
    ) is None


def test_resending_invite_rotates_token_and_uses_admin_activation_page(client, db_session):
    headers = _admin_headers(db_session)
    prop = _create_property(db_session, "Resend Invite Property")
    email = f"resend-{uuid4().hex[:8]}@example.com"
    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "fullName": "Pending Staff Member",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "STAFF",
            "staffRole": "FRONT_DESK",
            "propertyIds": [prop.id],
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    old_token = created.json()["activationUrl"].split("token=", 1)[1]
    assert created.json()["activationUrl"].startswith(
        f"{settings.ADMIN_PANEL_URL.rstrip('/')}/?token="
    )

    resent = client.post(
        f"/api/v1/admin/users/{user_id}/resend-invite",
        headers=headers,
    )
    assert resent.status_code == 200, resent.text
    assert "new activation link" in resent.json()["message"].lower()
    activation_url = resent.json()["activationUrl"]
    assert activation_url.startswith(f"{settings.ADMIN_PANEL_URL.rstrip('/')}/?token=")
    newest_message = db_session.scalar(
        select(OutboxMessage)
        .where(OutboxMessage.destination == email)
        .order_by(OutboxMessage.created_at.desc())
    )
    assert newest_message is not None
    new_token_match = re.search(r"token=([A-Za-z0-9_-]+)", newest_message.body)
    assert new_token_match is not None
    new_token = new_token_match.group(1)
    assert new_token != old_token
    assert activation_url.endswith(f"token={new_token}")
    assert activation_url in newest_message.body

    old_record = db_session.scalar(
        select(VerificationToken).where(
            VerificationToken.token_hash == hash_token(old_token)
        )
    )
    assert old_record is not None and old_record.is_used
    rejected = client.post(
        "/api/v1/auth/activate",
        json={"token": old_token, "newPassword": "StrongPass123!"},
    )
    assert rejected.status_code == 401
    activated = client.post(
        "/api/v1/auth/activate",
        json={"token": new_token, "newPassword": "StrongPass123!"},
    )
    assert activated.status_code == 200, activated.text


def test_admin_can_deactivate_users_and_only_primary_admin_can_manage_admins(client, db_session):
    primary_admin = db_session.scalar(
        select(User)
        .where(User.role == Role.ADMIN)
        .order_by(User.created_at, User.id)
        .limit(1)
    )
    assert primary_admin is not None
    primary_token = create_access_token(
        subject=primary_admin.id,
        audience="admin",
        role=Role.ADMIN.value,
    )
    headers = {"Authorization": f"Bearer {primary_token}"}
    target_customer = User(
        email=f"action-customer-{uuid4().hex[:8]}@example.com",
        full_name="Action Customer",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    target_admin = User(
        email=f"action-admin-{uuid4().hex[:8]}@example.com",
        full_name="Action Admin",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        password_hash="unused",
        role=Role.ADMIN,
        status="ACTIVE",
    )
    secondary_admin = User(
        email=f"secondary-admin-{uuid4().hex[:8]}@example.com",
        full_name="Secondary Admin",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        password_hash="unused",
        role=Role.ADMIN,
        status="ACTIVE",
    )
    db_session.add_all([target_customer, target_admin, secondary_admin])
    db_session.commit()
    secondary_token = create_access_token(
        subject=secondary_admin.id,
        audience="admin",
        role=Role.ADMIN.value,
    )
    secondary_headers = {"Authorization": f"Bearer {secondary_token}"}

    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 200
    assert response.json()["primaryAdminId"] == primary_admin.id

    deactivated = client.post(
        f"/api/v1/admin/users/{target_customer.id}/deactivate",
        headers=headers,
    )
    assert deactivated.status_code == 200, deactivated.text
    db_session.refresh(target_customer)
    assert target_customer.status == "INACTIVE"

    secondary_deactivation = client.post(
        f"/api/v1/admin/users/{target_admin.id}/deactivate",
        headers=secondary_headers,
    )
    assert secondary_deactivation.status_code == 403
    primary_force_logout = client.post(
        f"/api/v1/admin/users/{target_admin.id}/force-logout",
        headers=headers,
    )
    assert primary_force_logout.status_code == 200, primary_force_logout.text

    secondary_force_logout = client.post(
        f"/api/v1/admin/users/{target_admin.id}/force-logout",
        headers=secondary_headers,
    )
    assert secondary_force_logout.status_code == 403


def test_admin_can_soft_delete_users_and_cannot_delete_self(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    target = User(
        email=f"archived-{uuid4().hex[:8]}@example.com",
        full_name="Archived User",
        phone=f"+1555{uuid4().int % 10000000:07d}",
        password_hash="unused",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(target)
    db_session.commit()

    archived = client.delete(f"/api/v1/admin/users/{target.id}", headers=headers)
    assert archived.status_code == 204, archived.text
    db_session.refresh(target)
    assert target.status == "ARCHIVED"

    audit = db_session.scalar(
        select(AuditLog).where(
            AuditLog.target_user_id == target.id,
            AuditLog.action == "USER_ARCHIVED",
        )
    )
    assert audit is not None

    repeated = client.delete(f"/api/v1/admin/users/{target.id}", headers=headers)
    assert repeated.status_code == 400

    self_delete = client.delete(f"/api/v1/admin/users/{admin.id}", headers=headers)
    assert self_delete.status_code == 403


def test_customer_type_must_match_initial_stay_property_type(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    hostel = _create_property(db_session, "Subtype Mismatch Hostel", "HOSTEL_BOYS")
    response = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": f"mismatch-{uuid4().hex[:8]}@example.com",
            "fullName": "Mismatched Guest",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "CUSTOMER",
            "customerPersona": "HOTEL_GUEST",
            "initialStayPropertyId": hostel.id,
            "stayStartDate": "2026-10-27",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "GUEST_PROPERTY_TYPE_MISMATCH"


def test_guest_creation_requires_customer_type_and_initial_stay(client: TestClient, db_session):
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"missing-guest-details-{uuid4().hex[:8]}@example.com",
            "fullName": "Guest Missing Stay Details",
            "phone": "+15550007777",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "VOTER_ID",
            "idDocumentNumber": "ABC1234567",
            "role": "CUSTOMER",
        },
    )
    assert response.status_code == 400
    assert "customer type" in response.json()["error"]["message"].lower()


def test_temporary_customer_can_be_created_without_property_or_stay(client, db_session):
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"temporary-{uuid4().hex[:8]}@example.com",
            "fullName": "Temporary Customer",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "CUSTOMER",
            "customerPersona": "TEMP_CUSTOMER",
        },
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["customerPersona"] == "TEMP_CUSTOMER"
    assert data["propertyIds"] == []
    assert data["initialStay"] is None
    assert db_session.scalar(
        select(StayRecord).where(StayRecord.user_id == data["id"])
    ) is None
    assert db_session.scalar(
        select(CustomerPropertyLink).where(
            CustomerPropertyLink.user_id == data["id"]
        )
    ) is None


def test_hosteler_stay_cannot_be_exactly_one_night(client, db_session):
    hostel = _create_property(db_session, "One Night Hostel", "HOSTEL_COED")
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"one-night-{uuid4().hex[:8]}@example.com",
            "fullName": "One Night Hosteler",
            "phone": f"+1555{uuid4().int % 10000000:07d}",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "role": "CUSTOMER",
            "customerPersona": "HOSTELER",
            "initialStayPropertyId": hostel.id,
            "stayStartDate": "2026-11-10",
            "stayEndDate": "2026-11-11",
        },
    )

    assert response.status_code == 400
    assert "exactly one night" in response.json()["error"]["message"].lower()


def test_admin_can_create_admin_account_with_global_property_access(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    suffix = uuid4().hex[:8]
    email = f"admin-{suffix}@example.com"
    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "fullName": "Additional Administrator",
            "phone": "+15550003333",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PAN",
            "idDocumentNumber": "ABCDE1234F",
            "role": "ADMIN",
        },
    )
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["role"] == "ADMIN"
    assert data["propertyIds"]

    invite = db_session.scalar(
        select(OutboxMessage).where(OutboxMessage.destination == email)
    )
    assert invite is not None
    token = re.search(r"token=([A-Za-z0-9_-]+)", invite.body)
    assert token is not None
    activated = client.post(
        "/api/v1/auth/activate",
        json={"token": token.group(1), "newPassword": "StrongPass123!"},
    )
    assert activated.status_code == 200, activated.text
    claims = decode_access_token(activated.json()["accessToken"], "admin")
    assert claims["sub"] == data["id"]


def test_staff_cannot_create_or_edit_accounts(client: TestClient, db_session):
    staff = db_session.scalar(select(User).where(User.email == "staff.desk@havenstays.local"))
    assert staff is not None
    token = create_access_token(subject=staff.id, audience="admin", role=Role.STAFF.value)
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": f"blocked-{uuid4().hex[:8]}@example.com",
            "fullName": "Unauthorized User",
            "phone": "+15550004444",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "PAN",
            "idDocumentNumber": "ABCDE1234F",
            "role": "CUSTOMER",
        },
    )
    assert create_response.status_code == 403

    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    update_response = client.patch(
        f"/api/v1/admin/users/{admin.id}",
        headers=headers,
        json={"fullName": "Unauthorized Change"},
    )
    assert update_response.status_code == 403


def test_staff_creation_requires_property_assignment(client: TestClient, db_session):
    response = client.post(
        "/api/v1/admin/users",
        headers=_admin_headers(db_session),
        json={
            "email": f"unassigned-{uuid4().hex[:8]}@example.com",
            "fullName": "Unassigned Staff",
            "phone": "+15550005555",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "AADHAAR",
            "idDocumentNumber": "123456789012",
            "role": "STAFF",
            "staffRole": "FRONT_DESK",
        },
    )
    assert response.status_code == 400


def test_admin_created_customer_can_sign_in_with_customer_audience(
    client: TestClient, db_session
):
    headers = _admin_headers(db_session)
    suffix = uuid4().hex[:8]
    email = f"activation-{suffix}@example.com"
    created = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": email,
            "fullName": "Customer Activation",
            "phone": "+15550006666",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "VOTER_ID",
            "idDocumentNumber": "ABC1234567",
            "role": "CUSTOMER",
            "customerPersona": "HOSTELER",
            "initialStayPropertyId": _create_property(
                db_session, "Long-term Home", "HOSTEL_BOYS"
            ).id,
            "stayStartDate": "2026-10-27",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "ACTIVE"
    initial_password = created.json()["initialPassword"]
    invite = db_session.scalar(
        select(OutboxMessage).where(OutboxMessage.destination == email)
    )
    assert invite is None
    login = client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": initial_password},
    )
    assert login.status_code == 200, login.text
    claims = decode_access_token(login.json()["accessToken"], "customer")
    assert claims["sub"] == created.json()["id"]
