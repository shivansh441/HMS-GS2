from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.db.models import AuditLog, SecurityAlert, User


def _headers(db_session, email: str = "admin@havenstays.local") -> dict[str, str]:
    user = db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    token = create_access_token(subject=user.id, audience="admin", role=user.role)
    return {"Authorization": f"Bearer {token}"}


def test_mutating_requests_are_audited_and_redact_credentials(client: TestClient, db_session):
    headers = _headers(db_session)
    attempted_email = f"missing-{uuid4().hex}@example.test"
    response = client.post(
        "/api/v1/auth/login",
        headers={"X-Forwarded-For": "198.51.100.40"},
        json={
            "identifier": attempted_email,
            "password": "do-not-store-this",
            "contactPhone": "555-0100",
        },
    )
    assert response.status_code == 401
    log = db_session.scalar(
        select(AuditLog)
        .where(
            AuditLog.client_ip == "198.51.100.40",
            AuditLog.request_method == "POST",
            AuditLog.request_url == "/api/v1/auth/login",
        )
        .order_by(AuditLog.created_at.desc())
    )
    assert log is not None
    assert log.action == "FAILED_LOGIN"
    assert log.status_code == 401
    assert log.payload_diff["request"]["password"] == "[REDACTED]"
    assert log.payload_diff["request"]["identifier"] == "[REDACTED]"
    assert log.payload_diff["request"]["contactPhone"] == "[REDACTED]"
    assert log.actor_email == attempted_email
    assert "do-not-store-this" not in log.details
    assert attempted_email not in log.details
    assert "555-0100" not in log.details

    audit_response = client.get(
        "/api/v1/audit/logs",
        headers=headers,
        params={"action": "FAILED_LOGIN", "client_ip": "198.51.100.40"},
    )
    assert audit_response.status_code == 200, audit_response.text
    assert audit_response.json()["items"][0]["clientIp"] == "198.51.100.40"


def test_failed_login_detector_and_alert_resolution(client: TestClient, db_session):
    source_ip = f"198.51.100.{100 + len(db_session.new)}"
    for index in range(6):
        response = client.post(
            "/api/v1/auth/login",
            headers={"X-Forwarded-For": source_ip},
            json={
                "identifier": f"missing-{uuid4().hex}-{index}@example.test",
                "password": "WrongPassword123!",
            },
        )
        assert response.status_code == 401

    alert = db_session.scalar(
        select(SecurityAlert)
        .where(
            SecurityAlert.alert_type == "BRUTE_FORCE_LOGIN_ATTEMPTS",
            SecurityAlert.source_ip == source_ip,
            SecurityAlert.is_resolved.is_(False),
        )
        .order_by(SecurityAlert.created_at.desc())
    )
    assert alert is not None
    assert alert.severity == "HIGH"

    headers = _headers(db_session)
    alerts_response = client.get(
        "/api/v1/audit/alerts",
        headers=headers,
        params={"severity": "HIGH", "is_resolved": "false"},
    )
    assert alerts_response.status_code == 200, alerts_response.text
    assert any(item["id"] == alert.id for item in alerts_response.json())

    resolved_response = client.patch(
        f"/api/v1/audit/alerts/{alert.id}/resolve",
        headers=headers,
        json={"resolutionNote": "Reviewed source activity and confirmed test alert."},
    )
    assert resolved_response.status_code == 200, resolved_response.text
    assert resolved_response.json()["isResolved"] is True
    assert resolved_response.json()["resolutionNote"] == "Reviewed source activity and confirmed test alert."
    assert resolved_response.json()["resolvedBy"] is not None

    summary_response = client.get("/api/v1/audit/summary", headers=headers)
    assert summary_response.status_code == 200, summary_response.text
    assert summary_response.json()["totalEvents"] >= 6
    assert summary_response.json()["recentPrivilegedOverrides"] >= 0


def test_non_admin_property_scope_violation_creates_alert(client: TestClient, db_session):
    admin_headers = _headers(db_session)
    suffix = uuid4().hex[:8]
    property_response = client.post(
        "/api/v1/properties",
        headers=admin_headers,
        json={
            "name": f"Audit Scope {suffix}",
            "type": "HOTEL",
            "floors": 1,
            "address": "1 Audit Road",
            "city": f"Audit{suffix}",
            "state": "Test State",
            "pincode": "10000",
            "contactPhone": "1234567890",
            "timezone": "Asia/Kolkata",
        },
    )
    assert property_response.status_code == 201, property_response.text
    staff = db_session.scalar(select(User).where(User.role == "STAFF"))
    assert staff is not None
    staff_token = create_access_token(subject=staff.id, audience="admin", role=staff.role)
    source_ip = "198.51.100.220"
    response = client.get(
        f"/api/v1/admin/properties/{property_response.json()['id']}",
        headers={
            "Authorization": f"Bearer {staff_token}",
            "X-Property-Id": property_response.json()["id"],
            "X-Forwarded-For": source_ip,
        },
    )
    assert response.status_code == 403
    alert = db_session.scalar(
        select(SecurityAlert).where(
            SecurityAlert.alert_type == "UNAUTHORIZED_ACCESS_ATTEMPT",
            SecurityAlert.source_ip == source_ip,
        )
    )
    assert alert is not None
    assert alert.user_id == staff.id
