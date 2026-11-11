from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.core.crypto import decrypt_data
from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import User


def _customer_headers(user: User) -> dict[str, str]:
    token = create_access_token(subject=user.id, audience="customer", role=user.role)
    return {"Authorization": f"Bearer {token}"}


def test_customer_profile_uploads_encrypted_identity_document(
    client: TestClient,
    db_session,
    monkeypatch,
    tmp_path,
):
    user = User(
        email=f"portal-{uuid4().hex[:8]}@example.test",
        full_name="Portal Customer",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(user)
    db_session.commit()
    monkeypatch.setattr(settings, "ID_DOCUMENT_STORAGE_DIR", str(tmp_path))
    headers = _customer_headers(user)

    profile = client.get("/api/v1/customer/profile", headers=headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["idDocumentFilePresent"] is False
    assert "idDocumentNumberEncrypted" not in profile.json()

    updated = client.patch(
        "/api/v1/customer/profile",
        headers=headers,
        json={"firstName": "Updated", "lastName": "Resident"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["fullName"] == "Updated Resident"

    upload = client.post(
        "/api/v1/customer/profile/id-document",
        headers=headers,
        data={"documentType": "PASSPORT", "documentNumber": "A123456789"},
        files={"file": ("passport.pdf", b"%PDF-1.7\nprivate scan", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["idDocumentFilePresent"] is True
    assert upload.json()["idDocumentType"] == "PASSPORT"
    assert upload.json()["idDocumentLast4"] == "6789"

    db_session.refresh(user)
    assert user.id_document_number_encrypted != "A123456789"
    assert decrypt_data(user.id_document_number_encrypted) == "A123456789"
    encrypted_scan = (tmp_path / f"{user.id}.enc").read_bytes()
    assert b"private scan" not in encrypted_scan

    history = client.get("/api/v1/customer/stays/history", headers=headers)
    assert history.status_code == 200, history.text
    assert history.json() == []


def test_customer_profile_requires_customer_role(client: TestClient, db_session):
    user = db_session.scalar(select(User).where(User.role == Role.ADMIN.value))
    assert user is not None
    headers = _customer_headers(user)

    response = client.get("/api/v1/customer/profile", headers=headers)

    assert response.status_code == 403
