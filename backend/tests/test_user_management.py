import re
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.crypto import decrypt_data
from app.core.permissions import Role
from app.core.security import create_access_token, decode_access_token
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
            "role": "STAFF",
            "staffRole": "FRONT_DESK",
            "propertyIds": [prop.id],
        },
    )
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["role"] == "STAFF"
    assert data["status"] == "PENDING_ACTIVATION"
    assert data["propertyIds"] == [prop.id]

    detail = client.get(f"/api/v1/admin/users/{data['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["email"] == email
    assert detail.json()["propertyIds"] == [prop.id]

    edited = client.patch(
        f"/api/v1/admin/users/{data['id']}",
        headers=headers,
        json={"fullName": "Updated Staff Member", "staffRole": "MAINTENANCE"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["full_name"] == "Updated Staff Member"
    assert edited.json()["staffRole"] == "MAINTENANCE"

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
            "role": "CUSTOMER",
            "propertyIds": [prop.id],
            "customerPersona": "HOTEL_GUEST",
            "gender": "FEMALE",
            "idDocumentType": "PASSPORT",
            "idDocumentNumber": "A1234567",
            "emergencyContactName": None,
            "initialStayPropertyId": prop.id,
            "stayStartDate": "2026-10-27",
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    assert created.json()["customerPersona"] == "HOTEL_GUEST"
    assert created.json()["gender"] == "FEMALE"
    assert created.json()["idDocumentLast4"] == "4567"
    assert created.json()["initialStay"] == {
        "propertyId": prop.id,
        "startDate": "2026-10-27",
        "endDate": None,
    }
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
