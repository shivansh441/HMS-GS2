from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.db.models import Property, User


def test_health_and_readiness(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    res = client.get("/ready")
    assert res.status_code == 200
    assert res.json()["status"] == "ready"

def test_customer_registration_and_login_flow(client: TestClient):
    # 1. Register customer
    reg_payload = {
        "email": "brandnew.guest@havenstays.com",
        "password": "StrongPassword123!@",
        "full_name": "New Guest",
        "account_type": "HOTEL_GUEST"
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 202

    # Fetch token from dev outbox
    outbox_res = client.get("/api/v1/dev/outbox?destination=brandnew.guest@havenstays.com")
    assert outbox_res.status_code == 200
    outbox = outbox_res.json()
    assert len(outbox) >= 1
    raw_token = outbox[0]["body"].split("token=")[1].strip()

    # 2. Verify email
    ver_res = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    assert "accessToken" in ver_data
    token = ver_data["accessToken"]

    # 3. GET /me profile
    me_res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "brandnew.guest@havenstays.com"

    # 4. GET /me/overview (Registered no booking state)
    overview_res = client.get("/api/v1/me/overview", headers={"Authorization": f"Bearer {token}"})
    assert overview_res.status_code == 200
    overview_data = overview_res.json()
    assert overview_data["stage"] == "REGISTERED_NO_BOOKING"
    assert overview_data["bookingsCount"] == 0

    # 5. Sign in
    login_res = client.post("/api/v1/auth/login", json={
        "email": "brandnew.guest@havenstays.com",
        "password": "StrongPassword123!@"
    })
    assert login_res.status_code == 200
    assert "accessToken" in login_res.json()

def test_customer_token_rejected_on_admin_routes(client: TestClient):
    """Audience separation test: customer token must be rejected on /admin/* routes"""
    login_res = client.post("/api/v1/auth/login", json={
        "email": "guest.nobooking1@gmail.com",
        "password": "CustomerPass123!@"
    })
    if login_res.status_code != 200:
        # Register or grab valid customer
        client.post("/api/v1/auth/register", json={
            "email": "aud.test@customer.com",
            "password": "CustomerPass123!@",
            "account_type": "HOTEL_GUEST"
        })
        login_res = client.post("/api/v1/auth/login", json={
            "email": "aud.test@customer.com",
            "password": "CustomerPass123!@"
        })

    token = login_res.json()["accessToken"]

    # Attempt to access admin routes
    res = client.get("/api/v1/admin/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code in (401, 403)

    res2 = client.get("/api/v1/admin/properties", headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code in (401, 403)

    res3 = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert res3.status_code in (401, 403)

def test_admin_mfa_step(client: TestClient):
    """Admin login requires MFA step when enforced"""
    res = client.post("/api/v1/admin/auth/login", json={
        "identifier": "admin@havenstays.com",
        "password": "AdminSecurePass123!"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["requiresMfa"] is True
    assert "mfaChallengeToken" in data

def test_manager_scoping_and_cross_property_access(client: TestClient, db_session):
    """
    Manager on HQ-01 only:
    - sees only HQ-01 in GET /admin/properties
    - accessing out-of-scope user returns 404 (not 403)
    - invalid X-Property-Id returns 403
    - no-booking user does NOT appear for Manager
    """
    # Manager on HQ-01
    mgr_res = client.post("/api/v1/admin/auth/login", json={
        "identifier": "manager.hq01@havenstays.com",
        "password": "ManagerSecurePass123!"
    })
    assert mgr_res.status_code == 200
    mgr_token = mgr_res.json()["accessToken"]
    headers = {"Authorization": f"Bearer {mgr_token}"}

    # 1. Properties: should only return 1 property (HQ-01)
    props_res = client.get("/api/v1/admin/properties", headers=headers)
    assert props_res.status_code == 200
    props = props_res.json()
    assert len(props) == 1
    assert props[0]["code"] == "HQ-01"

    # Retrieve HQ-02 ID from DB
    hq02 = db_session.scalar(select(Property).where(Property.code == "HQ-02"))
    assert hq02 is not None

    # 2. Sending invalid or out-of-scope X-Property-Id (HQ-02) returns 403
    res_forbidden = client.get("/api/v1/admin/users", headers={
        "Authorization": f"Bearer {mgr_token}",
        "X-Property-Id": hq02.id
    })
    assert res_forbidden.status_code == 403

    # 3. Cross-property read returns 404
    # Julian Thorne is linked only to HQ-02
    hostel_guest = db_session.scalar(select(User).where(User.email == "guest.hostel@gmail.com"))
    assert hostel_guest is not None

    cross_res = client.get(f"/api/v1/admin/users/{hostel_guest.id}", headers=headers)
    assert cross_res.status_code == 404
    assert cross_res.json()["error"]["code"] == "NOT_FOUND"

    # 4. No-booking user should NOT appear in Manager's user list
    users_res = client.get("/api/v1/admin/users", headers=headers)
    assert users_res.status_code == 200
    user_emails = [u["email"] for u in users_res.json()["items"]]
    assert "guest.nobooking1@gmail.com" not in user_emails
    assert "guest.nobooking2@gmail.com" not in user_emails

    # 5. Manager trying to filter by 'registered_no_booking' segment gets 403
    seg_res = client.get("/api/v1/admin/users?segment=registered_no_booking", headers=headers)
    assert seg_res.status_code == 403

def test_super_admin_sees_all_and_unassigned_pool(client: TestClient, db_session):
    """
    Super Admin:
    - sees all properties
    - sees all users, including the no-booking unassigned pool
    """
    # Create super admin access token directly
    admin_user = db_session.scalar(select(User).where(User.email == "admin@havenstays.com"))
    token = create_access_token(
        subject=admin_user.id,
        audience="admin",
        account_type="SUPER_ADMIN",
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Sees all properties
    props_res = client.get("/api/v1/admin/properties", headers=headers)
    assert props_res.status_code == 200
    assert len(props_res.json()) >= 2

    # 2. Sees unassigned no-booking customer
    seg_res = client.get("/api/v1/admin/users?segment=registered_no_booking", headers=headers)
    assert seg_res.status_code == 200
    seg_items = seg_res.json()["items"]
    seg_emails = [u["email"] for u in seg_items]
    assert "guest.nobooking1@gmail.com" in seg_emails

    # 3. Can read any user details
    hostel_guest = db_session.scalar(select(User).where(User.email == "guest.hostel@gmail.com"))
    detail_res = client.get(f"/api/v1/admin/users/{hostel_guest.id}", headers=headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["email"] == "guest.hostel@gmail.com"
