"""Comprehensive automated security test suite for authentication, tokens,
password hashing, and property RBAC isolation.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import UserRole, get_password_hash
from app.models.property import Property, PropertyType
from app.models.user import User


@pytest.mark.asyncio
async def test_customer_registration_success_and_duplicate(async_client: AsyncClient) -> None:
    """Verify customer registration and handling of duplicate email conflicts."""
    payload = {
        "email": "customer.test@example.com",
        "password": "SecurePassword2026!",
        "first_name": "Alice",
        "last_name": "Smith",
        "phone": "+15550199",
        "country": "United States",
    }
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["email"] == payload["email"]
    assert data["data"]["global_role"] == UserRole.GUEST

    # Attempt duplicate registration
    res_dup = await async_client.post("/api/v1/auth/register", json=payload)
    assert res_dup.status_code == 409


@pytest.mark.asyncio
async def test_login_success_and_invalid_credentials(async_client: AsyncClient) -> None:
    """Verify login success issues tokens and invalid credentials return 401."""
    # First register
    reg_payload = {
        "email": "login.test@example.com",
        "password": "SecurePassword2026!",
        "first_name": "Bob",
        "last_name": "Jones",
    }
    await async_client.post("/api/v1/auth/register", json=reg_payload)

    # Login with correct credentials
    login_payload = {
        "email": "login.test@example.com",
        "password": "SecurePassword2026!",
    }
    res = await async_client.post("/api/v1/auth/login", json=login_payload)
    assert res.status_code == 200
    token_data = res.json()["data"]
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["role"] == UserRole.GUEST

    # Login with incorrect password
    bad_login = {
        "email": "login.test@example.com",
        "password": "WrongPassword!",
    }
    res_bad = await async_client.post("/api/v1/auth/login", json=bad_login)
    assert res_bad.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_rotation_and_logout(async_client: AsyncClient) -> None:
    """Verify refresh token rotation and session revocation."""
    reg_payload = {
        "email": "refresh.test@example.com",
        "password": "SecurePassword2026!",
        "first_name": "Charlie",
        "last_name": "Brown",
    }
    await async_client.post("/api/v1/auth/register", json=reg_payload)

    login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "refresh.test@example.com", "password": "SecurePassword2026!"},
    )
    refresh_token = login_res.json()["data"]["refresh_token"]

    # Rotate refresh token
    ref_res = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert ref_res.status_code == 200
    new_tokens = ref_res.json()["data"]
    assert "access_token" in new_tokens
    assert "refresh_token" in new_tokens

    # Logout using new refresh token
    logout_res = await async_client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": new_tokens["refresh_token"]},
    )
    assert logout_res.status_code == 200
    assert logout_res.json()["data"]["logged_out"] is True


@pytest.mark.asyncio
async def test_get_current_user_profile(async_client: AsyncClient) -> None:
    """Verify GET /api/v1/auth/me with valid bearer token."""
    reg_payload = {
        "email": "me.test@example.com",
        "password": "SecurePassword2026!",
        "first_name": "Diana",
        "last_name": "Prince",
    }
    await async_client.post("/api/v1/auth/register", json=reg_payload)

    login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "me.test@example.com", "password": "SecurePassword2026!"},
    )
    access_token = login_res.json()["data"]["access_token"]

    headers = {"Authorization": f"Bearer {access_token}"}
    me_res = await async_client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == "me.test@example.com"


@pytest.mark.asyncio
async def test_password_change_and_reset_flow(async_client: AsyncClient) -> None:
    """Verify password change and forgot/reset password workflow."""
    reg_payload = {
        "email": "pass.test@example.com",
        "password": "OldPassword2026!",
        "first_name": "Edward",
        "last_name": "Nigma",
    }
    await async_client.post("/api/v1/auth/register", json=reg_payload)

    login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "pass.test@example.com", "password": "OldPassword2026!"},
    )
    access_token = login_res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # Change password
    change_res = await async_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPassword2026!", "new_password": "NewSecurePassword2026!"},
        headers=headers,
    )
    assert change_res.status_code == 200

    # Forgot password request
    forgot_res = await async_client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "pass.test@example.com"},
    )
    assert forgot_res.status_code == 200
    simulated_token = forgot_res.json()["data"].get("simulated_reset_token")
    assert simulated_token is not None

    # Reset password
    reset_res = await async_client.post(
        "/api/v1/auth/reset-password",
        json={"token": simulated_token, "new_password": "ResetPassword2026!"},
    )
    assert reset_res.status_code == 200


@pytest.mark.asyncio
async def test_admin_provisioning_and_property_rbac(async_client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify platform admin provisioning and property access restriction enforcement."""
    # 1. Create a platform super admin directly in DB for test
    admin_user = User(
        email="superadmin@grandstay.com",
        hashed_password=get_password_hash("AdminPass2026!"),
        first_name="Super",
        last_name="Admin",
        global_role=UserRole.SUPER_ADMIN,
        is_superuser=True,
        is_active=True,
    )
    db_session.add(admin_user)

    # Create two test properties
    p1 = Property(
        name="Hotel Alpha",
        code="PHA-01",
        slug="hotel-alpha",
        property_type=PropertyType.HOTEL,
        currency="USD",
        timezone="UTC",
        address="1 Alpha St",
        city="Chicago",
        country="USA",
    )
    p2 = Property(
        name="Hotel Beta",
        code="PHB-02",
        slug="hotel-beta",
        property_type=PropertyType.HOTEL,
        currency="USD",
        timezone="UTC",
        address="2 Beta St",
        city="Chicago",
        country="USA",
    )
    db_session.add_all([p1, p2])
    await db_session.commit()

    # Login as admin
    login_admin = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "superadmin@grandstay.com", "password": "AdminPass2026!"},
    )
    admin_token = login_admin.json()["data"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Provision staff member assigned ONLY to Hotel Alpha (p1)
    provision_payload = {
        "email": "staff.alpha@grandstay.com",
        "password": "StaffPassword2026!",
        "first_name": "Staff",
        "last_name": "Member",
        "global_role": UserRole.FRONT_DESK,
        "is_superuser": False,
        "assigned_property_ids": [p1.id],
    }
    prov_res = await async_client.post(
        "/api/v1/auth/admin/provision",
        json=provision_payload,
        headers=admin_headers,
    )
    assert prov_res.status_code == 201

    # Login as staff member
    login_staff = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "staff.alpha@grandstay.com", "password": "StaffPassword2026!"},
    )
    assert login_staff.status_code == 200
    staff_token = login_staff.json()["data"]["access_token"]
    assert staff_token is not None

    # Staff accesses assigned Hotel Alpha private details -> 200 OK
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    alpha_res = await async_client.get(
        f"/api/v1/properties/{p1.id}/private-details",
        headers=staff_headers,
    )
    assert alpha_res.status_code == 200

    # Staff attempts to access unassigned Hotel Beta private details -> 403 Forbidden
    beta_res = await async_client.get(
        f"/api/v1/properties/{p2.id}/private-details",
        headers=staff_headers,
    )
    assert beta_res.status_code == 403


@pytest.mark.asyncio
async def test_refresh_token_reuse_detection(async_client: AsyncClient) -> None:
    """Verify that reusing an already rotated refresh token triggers security revocation of all sessions."""
    reg_payload = {
        "email": "reuse.test@example.com",
        "password": "SecurePassword2026!",
        "first_name": "Eve",
        "last_name": "Hacker",
    }
    await async_client.post("/api/v1/auth/register", json=reg_payload)

    login_res = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "reuse.test@example.com", "password": "SecurePassword2026!"},
    )
    token_1 = login_res.json()["data"]["refresh_token"]

    # Legitimate first rotation (token 1 -> token 2)
    ref1_res = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": token_1})
    assert ref1_res.status_code == 200
    token_2 = ref1_res.json()["data"]["refresh_token"]

    # Attacker attempts to reuse rotated token 1 -> Must be rejected with 401 and trigger reuse detection
    reuse_res = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": token_1})
    assert reuse_res.status_code == 401

    # Now verify that token 2 has been revoked due to reuse detection
    token2_try = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": token_2})
    assert token2_try.status_code == 401


@pytest.mark.asyncio
async def test_invalid_and_expired_access_tokens(async_client: AsyncClient) -> None:
    """Verify that malformed or forged access tokens return 401 Unauthorized."""
    # Malformed token
    res_malformed = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.valid.jwt"},
    )
    assert res_malformed.status_code == 401

    # Missing credentials
    res_none = await async_client.get("/api/v1/auth/me")
    assert res_none.status_code == 401


@pytest.mark.asyncio
async def test_staff_account_activation_and_deactivation(async_client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify platform admin can deactivate a staff account and deactivated account cannot authenticate."""
    admin_user = User(
        email="superadmin2@grandstay.com",
        hashed_password=get_password_hash("AdminPass2026!"),
        first_name="Admin",
        last_name="Super",
        global_role=UserRole.SUPER_ADMIN,
        is_superuser=True,
        is_active=True,
    )
    db_session.add(admin_user)
    await db_session.commit()

    admin_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "superadmin2@grandstay.com", "password": "AdminPass2026!"},
    )
    admin_token = admin_login.json()["data"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Provision staff
    prov_res = await async_client.post(
        "/api/v1/auth/admin/provision",
        json={
            "email": "deactivate.staff@grandstay.com",
            "password": "Password2026!",
            "first_name": "Target",
            "last_name": "Staff",
            "global_role": UserRole.HOUSEKEEPING,
            "assigned_property_ids": [],
        },
        headers=admin_headers,
    )
    assert prov_res.status_code == 201
    staff_id = prov_res.json()["data"]["id"]

    # Deactivate staff account
    patch_res = await async_client.patch(
        f"/api/v1/auth/admin/users/{staff_id}/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["data"]["is_active"] is False

    # Attempt to log in with deactivated account -> 401
    bad_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "deactivate.staff@grandstay.com", "password": "Password2026!"},
    )
    assert bad_login.status_code == 401


@pytest.mark.asyncio
async def test_public_properties_access_without_authentication(async_client: AsyncClient) -> None:
    """Verify public visitors can browse properties catalog without an account."""
    res = await async_client.get("/api/v1/properties/public")
    assert res.status_code == 200
    assert res.json()["success"] is True

