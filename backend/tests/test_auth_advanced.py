import json
from datetime import datetime, timezone

import pyotp
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.rate_limit import rate_limiter
from app.core.security import create_access_token
from app.db.models import OutboxMessage, SessionModel, User, VerificationToken


def test_lockout_and_progressive_backoff(client: TestClient, db_session):
    """5 failed logins locks account for 15 min; returns 423 with Retry-After header"""
    email = "guest.alice@example.com"
    for _ in range(5):
        res = client.post("/api/v1/auth/login", json={"identifier": email, "password": "WrongPassword123!"})
        assert res.status_code == 401

    # 6th attempt should be locked with status 423
    res_locked = client.post("/api/v1/auth/login", json={"identifier": email, "password": "WrongPassword123!"})
    assert res_locked.status_code == 423
    assert res_locked.json()["error"]["code"] == "ACCOUNT_LOCKED"
    assert "retry-after" in res_locked.headers

    # Reset locked status for other tests
    u = db_session.scalar(select(User).where(User.email == email))
    u.failed_login_count = 0
    u.locked_until = None
    u.lockout_count = 0
    db_session.commit()


def test_admin_lockout_applies_progressive_backoff_and_notifies(client: TestClient, db_session):
    email = "admin@havenstays.com"
    user = db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.failed_login_count = 0
    user.lockout_count = 0
    user.locked_until = None
    db_session.commit()

    try:
        for _ in range(5):
            response = client.post(
                "/api/v1/admin/auth/login",
                json={"identifier": email, "password": "WrongPassword123!"},
            )
            assert response.status_code == 401

        db_session.refresh(user)
        assert user.lockout_count == 1
        assert user.locked_until is not None
        locked_until = user.locked_until.replace(tzinfo=timezone.utc)
        assert (locked_until - datetime.now(timezone.utc)).total_seconds() > 14 * 60
        assert db_session.scalar(
            select(OutboxMessage).where(
                OutboxMessage.destination == email,
                OutboxMessage.subject == "Security Notice: Account locked",
            )
        ) is not None

        user.failed_login_count = 4
        user.locked_until = datetime.now(timezone.utc)
        db_session.commit()
        rate_limiter.clear()

        response = client.post(
            "/api/v1/admin/auth/login",
            json={"identifier": email, "password": "WrongPassword123!"},
        )
        assert response.status_code == 401
        db_session.refresh(user)
        assert user.lockout_count == 2
        assert user.locked_until is not None
        locked_until = user.locked_until.replace(tzinfo=timezone.utc)
        assert (locked_until - datetime.now(timezone.utc)).total_seconds() > 29 * 60
    finally:
        user.failed_login_count = 0
        user.lockout_count = 0
        user.locked_until = None
        db_session.commit()


def test_admin_can_issue_reset_link_to_staff_user(client: TestClient, db_session):
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.com"))
    target = db_session.scalar(select(User).where(User.email == "staff.desk@havenstays.local"))
    assert admin is not None
    assert target is not None
    token = create_access_token(subject=admin.id, audience="admin", role=admin.role)

    response = client.post(
        f"/api/v1/admin/users/{target.id}/issue-reset-link",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    reset_token = db_session.scalar(
        select(VerificationToken)
        .where(
            VerificationToken.user_id == target.id,
            VerificationToken.token_type == "PASSWORD_RESET",
            VerificationToken.is_used.is_(False),
        )
        .order_by(VerificationToken.created_at.desc())
    )
    assert reset_token is not None
    db_session.refresh(reset_token)
    outbox_message = db_session.scalar(
        select(OutboxMessage)
        .where(
            OutboxMessage.destination == target.email,
            OutboxMessage.subject == "Haven Stays - Password Reset Instructions",
        )
        .order_by(OutboxMessage.created_at.desc())
    )
    assert outbox_message is not None
    assert "mode=reset" in outbox_message.body
    reset_token.is_used = True
    db_session.commit()


def test_admin_forgot_password_uses_admin_reset_route(client: TestClient, db_session):
    target = db_session.scalar(select(User).where(User.email == "staff.desk@havenstays.local"))
    assert target is not None

    response = client.post(
        "/api/v1/admin/auth/forgot-password",
        json={"identifier": target.email},
    )
    assert response.status_code == 200

    outbox_message = db_session.scalar(
        select(OutboxMessage)
        .where(
            OutboxMessage.destination == target.email,
            OutboxMessage.subject == "Haven Stays - Password Reset Instructions",
        )
        .order_by(OutboxMessage.created_at.desc())
    )
    assert outbox_message is not None
    assert "mode=reset" in outbox_message.body


def test_no_account_enumeration(client: TestClient):
    """Missing account returns identical generic 401 or 202 without leaking existence"""
    # Login non-existent account
    res = client.post("/api/v1/auth/login", json={"identifier": "nonexistent@example.com", "password": "AnyPassword123!"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"

    # Forgot password non-existent account
    res_fp = client.post("/api/v1/auth/forgot-password", json={"identifier": "nonexistent@example.com"})
    assert res_fp.status_code == 200

    # Resend verification non-existent account
    res_rv = client.post("/api/v1/auth/resend-verification", json={"email": "nonexistent@example.com"})
    assert res_rv.status_code == 200


def test_otp_flow_and_max_attempts(client: TestClient):
    """OTP generation, outbox delivery, and invalidation on 3 wrong attempts"""
    target = "otp.test@example.com"
    req_res = client.post("/api/v1/auth/otp/request", json={"target": target, "channel": "EMAIL", "purpose": "LOGIN"})
    assert req_res.status_code == 200

    outbox_res = client.get(f"/api/v1/dev/outbox?destination={target}")
    assert outbox_res.status_code == 200
    msgs = outbox_res.json()
    assert len(msgs) >= 1
    # Subject format: "Your Haven Stays Passcode: 123456"
    code = msgs[0]["subject"].split(":")[-1].strip()
    assert len(code) == 6

    # 2 wrong attempts
    client.post("/api/v1/auth/otp/verify", json={"target": target, "code": "000000", "purpose": "LOGIN"})
    client.post("/api/v1/auth/otp/verify", json={"target": target, "code": "000000", "purpose": "LOGIN"})

    # Valid code on 3rd attempt succeeds
    good_res = client.post("/api/v1/auth/otp/verify", json={"target": target, "code": code, "purpose": "LOGIN"})
    assert good_res.status_code == 200
    assert "accessToken" in good_res.json()


def test_magic_link_flow_with_nonce(client: TestClient):
    """Magic link generation binds to browser nonce cookie; verifies and issues session"""
    email = "resident.bob@example.com"
    req_res = client.post("/api/v1/auth/magic-link/request", json={"email": email})
    assert req_res.status_code == 200
    assert "ml_nonce" in client.cookies

    outbox_res = client.get(f"/api/v1/dev/outbox?destination={email}")
    outbox = outbox_res.json()
    assert len(outbox) >= 1
    raw_token = outbox[0]["body"].split("token=")[1].strip()

    # Verifying without nonce cookie fails
    client_no_cookie = TestClient(client.app)
    bad_res = client_no_cookie.post("/api/v1/auth/magic-link/verify", json={"token": raw_token})
    assert bad_res.status_code == 401

    # Verifying with nonce cookie succeeds
    ver_res = client.post("/api/v1/auth/magic-link/verify", json={"token": raw_token})
    assert ver_res.status_code == 200
    assert "accessToken" in ver_res.json()


def test_csrf_protection_and_token_reuse_detection(client: TestClient):
    """CSRF requires X-Requested-With: haven; rotated refresh token reuse triggers family revocation"""
    login_res = client.post("/api/v1/auth/login", json={
        "identifier": "guest.alice@example.com",
        "password": "AliceGuest2026!#"
    })
    assert login_res.status_code == 200
    assert "hs_cust_rt" in client.cookies
    initial_rt = client.cookies["hs_cust_rt"]

    # 1. Refresh without CSRF header is rejected
    no_csrf_res = client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:3000"})
    assert no_csrf_res.status_code == 403

    # 2. Refresh with custom header succeeds and rotates cookie
    refresh_res = client.post("/api/v1/auth/refresh", headers={
        "X-Requested-With": "haven",
        "Origin": "http://localhost:3000"
    })
    assert refresh_res.status_code == 200
    rotated_rt = client.cookies["hs_cust_rt"]
    assert rotated_rt != initial_rt

    # 3. Reusing the old initial_rt triggers family revocation
    client.cookies.set("hs_cust_rt", initial_rt)
    reuse_res = client.post("/api/v1/auth/refresh", headers={
        "X-Requested-With": "haven",
        "Origin": "http://localhost:3000"
    })
    assert reuse_res.status_code == 401
    assert reuse_res.json()["error"]["code"] == "TOKEN_REUSE_DETECTED"


def test_admin_user_mutations_and_scoping(client: TestClient, db_session):
    """Admin actions: force-logout, reset-mfa, suspend, reactivate with scoping and role checks"""
    # Admin token
    sa = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    sa_token = create_access_token(subject=sa.id, audience="admin", role="ADMIN")
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # Staff on HQ-01 token
    staff = db_session.scalar(select(User).where(User.email == "staff.desk@havenstays.local"))
    staff_token = create_access_token(subject=staff.id, audience="admin", role="STAFF")
    staff_headers = {"Authorization": f"Bearer {staff_token}"}

    # Alice is in HQ-01
    alice = db_session.scalar(select(User).where(User.email == "guest.alice@example.com"))

    # Julian Thorne (guest.hostel@gmail.com) is in HQ-02 only
    julian = db_session.scalar(select(User).where(User.email == "guest.hostel@gmail.com"))

    # Staff mutations are forbidden even for out-of-scope users.
    res_out = client.post(f"/api/v1/admin/users/{julian.id}/force-logout", headers=staff_headers)
    assert res_out.status_code == 403

    # Staff cannot modify an Admin.
    res_sa = client.post(f"/api/v1/admin/users/{sa.id}/force-logout", headers=staff_headers)
    assert res_sa.status_code == 403

    # Admin suspends Alice -> status SUSPENDED
    res_susp = client.post(f"/api/v1/admin/users/{alice.id}/suspend", headers=sa_headers, json={"reason": "Investigation"})
    assert res_susp.status_code == 200
    db_session.refresh(alice)
    assert alice.status == "SUSPENDED"

    # Alice login blocked while suspended
    login_blocked = client.post("/api/v1/auth/login", json={"identifier": alice.email, "password": "AliceGuest2026!#"})
    assert login_blocked.status_code == 401

    # Admin reactivates Alice -> status ACTIVE
    res_react = client.post(f"/api/v1/admin/users/{alice.id}/reactivate", headers=sa_headers)
    assert res_react.status_code == 200
    db_session.refresh(alice)
    assert alice.status == "ACTIVE"


def test_admin_login_skips_mfa_enrollment_when_not_required(client: TestClient, db_session, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_MFA_REQUIRED", False)
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    admin.mfa_enabled = False
    admin.mfa_secret_encrypted = None
    db_session.commit()

    login_res = client.post("/api/v1/admin/auth/login", json={
        "identifier": "admin@havenstays.local",
        "password": "Admin2026!#",
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["mfaEnrollmentRequired"] is False
    assert login_data["mfaRequired"] is False
    assert login_data["accessToken"]


def test_admin_forced_mfa_enrollment_uses_restricted_token(client: TestClient, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_MFA_REQUIRED", True)
    login_res = client.post("/api/v1/admin/auth/login", json={
        "identifier": "admin@havenstays.local",
        "password": "Admin2026!#",
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["mfaEnrollmentRequired"] is True
    enroll_headers = {"Authorization": f"Bearer {login_data['enrollToken']}"}

    enroll_res = client.post("/api/v1/admin/auth/mfa/enroll", headers=enroll_headers)
    assert enroll_res.status_code == 200
    enrollment = enroll_res.json()
    code = pyotp.TOTP(enrollment["secret"]).now()

    confirm_res = client.post(
        "/api/v1/admin/auth/mfa/confirm",
        headers=enroll_headers,
        params={"secret": enrollment["secret"]},
        json={"code": code},
    )
    assert confirm_res.status_code == 200
    assert len(confirm_res.json()["recoveryCodes"]) == 10

    restricted_res = client.get("/api/v1/admin/me", headers=enroll_headers)
    assert restricted_res.status_code == 401
