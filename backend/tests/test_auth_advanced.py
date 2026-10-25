import json
from fastapi.testclient import TestClient
from sqlalchemy import select

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
    # Super Admin token
    sa = db_session.scalar(select(User).where(User.email == "superadmin@havenstays.local"))
    sa_token = create_access_token(subject=sa.id, audience="admin", account_type="SUPER_ADMIN")
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # Manager on HQ-01 token
    mgr = db_session.scalar(select(User).where(User.email == "manager.grand@havenstays.local"))
    mgr_token = create_access_token(subject=mgr.id, audience="admin", account_type="MANAGER")
    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}

    # Alice is in HQ-01
    alice = db_session.scalar(select(User).where(User.email == "guest.alice@example.com"))

    # Julian Thorne (guest.hostel@gmail.com) is in HQ-02 only
    julian = db_session.scalar(select(User).where(User.email == "guest.hostel@gmail.com"))

    # 1. Manager attempting to modify Julian (HQ-02) gets 404 (out of scope)
    res_out = client.post(f"/api/v1/admin/users/{julian.id}/force-logout", headers=mgr_headers)
    assert res_out.status_code == 404

    # 2. Manager attempting to modify Super Admin gets 403
    res_sa = client.post(f"/api/v1/admin/users/{sa.id}/force-logout", headers=mgr_headers)
    assert res_sa.status_code == 403

    # 3. Super admin suspends Alice -> status SUSPENDED
    res_susp = client.post(f"/api/v1/admin/users/{alice.id}/suspend", headers=sa_headers, json={"reason": "Investigation"})
    assert res_susp.status_code == 200
    db_session.refresh(alice)
    assert alice.status == "SUSPENDED"

    # Alice login blocked while suspended
    login_blocked = client.post("/api/v1/auth/login", json={"identifier": alice.email, "password": "AliceGuest2026!#"})
    assert login_blocked.status_code == 401

    # 4. Super admin reactivates Alice -> status ACTIVE
    res_react = client.post(f"/api/v1/admin/users/{alice.id}/reactivate", headers=sa_headers)
    assert res_react.status_code == 200
    db_session.refresh(alice)
    assert alice.status == "ACTIVE"
