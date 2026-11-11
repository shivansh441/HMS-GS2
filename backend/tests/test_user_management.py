import re
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import decrypt_data
from app.core.permissions import Role
from app.core.security import create_access_token, decode_access_token, hash_token
from app.db.models import (
    AuditLog,
    CustomerPropertyLink,
    OutboxMessage,
    Property,
    StayRecord,
    User,
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
    assert created.json()["activationUrl"].startswith(
        f"{settings.PUBLIC_WEBSITE_URL.rstrip('/')}/activate?token="
    )
    created_user = db_session.get(User, user_id)
    assert created_user is not None
    assert created_user.id_document_number_encrypted != "A1234567"
    assert decrypt_data(created_user.id_document_number_encrypted) == "A1234567"
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

    filtered = client.get(
        "/api/v1/admin/users",
        headers=headers,
        params={"guest_subtype": "HOSTELER"},
    )
    assert filtered.status_code == 200, filtered.text
    assert any(item["id"] == user_id for item in filtered.json()["items"])


def test_emergency_contact_number_is_saved_for_every_customer_type(client, db_session):
    headers = _admin_headers(db_session)
    test_cases = (
        ("HOTEL_GUEST", "HOTEL"),
        ("HOSTEL_GUEST", "HOSTEL_COED"),
        ("HOSTELER", "HOSTEL_COED"),
    )

    for persona, property_type in test_cases:
        prop = _create_property(db_session, f"{persona} Contact", property_type)
        suffix = uuid4().hex[:8]
        emergency_phone = f"+1555{uuid4().int % 10000000:07d}"
        response = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "email": f"{persona.lower()}-{suffix}@example.com",
                "fullName": f"{persona} Guest",
                "phone": f"+1666{uuid4().int % 10000000:07d}",
                "dateOfBirth": "1990-01-01",
                "role": "CUSTOMER",
                "customerPersona": persona,
                "idDocumentType": "PASSPORT",
                "idDocumentNumber": f"P{suffix}",
                "emergencyContactPhone": emergency_phone,
                "initialStayPropertyId": prop.id,
                "stayStartDate": "2026-11-10",
            },
        )

        assert response.status_code == 201, response.text
        assert response.json()["emergencyContactPhone"] == emergency_phone
        assert "emergencyContactName" not in response.json()


def test_hostel_guest_and_hosteler_cannot_have_additional_occupants(client, db_session):
    hostel = _create_property(db_session, "Group Guest Hostel", "HOSTEL_COED")
    headers = _admin_headers(db_session)
    for persona in ("HOSTEL_GUEST", "HOSTELER"):
        response = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "email": f"{persona.lower()}-{uuid4().hex[:8]}@example.com",
                "fullName": f"Primary {persona}",
                "phone": f"+1555{uuid4().int % 10000000:07d}",
                "dateOfBirth": "1990-01-01",
                "idDocumentType": "AADHAAR",
                "idDocumentNumber": "123456789012",
                "role": "CUSTOMER",
                "customerPersona": persona,
                "initialStayPropertyId": hostel.id,
                "stayStartDate": "2026-11-10",
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
            },
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

    removed = client.patch(
        f"/api/v1/admin/users/{response_with_occupants.json()['id']}",
        headers=_admin_headers(db_session),
        json={"guestCount": 1, "additionalGuests": []},
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["initialStay"]["additionalGuests"] == []


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


def test_guest_subtype_must_match_initial_stay_property_type(client: TestClient, db_session):
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


def test_guest_creation_requires_subtype_and_initial_stay(client: TestClient, db_session):
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
    assert "guest subtype" in response.json()["error"]["message"].lower()


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


def test_customer_activation_uses_customer_audience(client: TestClient, db_session):
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
    claims = decode_access_token(activated.json()["accessToken"], "customer")
    assert claims["sub"] == created.json()["id"]
