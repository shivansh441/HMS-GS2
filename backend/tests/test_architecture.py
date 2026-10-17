"""Architectural and security invariant tests."""

import pytest
from httpx import AsyncClient

from app.core.security import (
    UserRole,
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.schemas.property import HostelConfig, HotelConfig


def test_password_hashing_security() -> None:
    """Ensure passwords are never plain text and verify cleanly."""
    raw_pass = "EnterpriseSuperSecret2026!"
    hashed = get_password_hash(raw_pass)

    assert hashed != raw_pass
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$") or hashed.startswith("$argon2id$")
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_token_payload_and_role_scoping() -> None:
    """Ensure tokens encapsulate roles and optional property boundary."""
    token = create_access_token(
        subject="user-uuid-1234",
        role=UserRole.PROPERTY_MANAGER,
        property_id="prop-hostel-99",
    )
    payload = decode_access_token(token)

    assert payload.sub == "user-uuid-1234"
    assert payload.role == UserRole.PROPERTY_MANAGER
    assert payload.property_id == "prop-hostel-99"
    assert payload.exp is not None


def test_property_workflow_models() -> None:
    """Verify distinct hostel and hotel configuration models."""
    hostel_cfg = HostelConfig(
        allow_mixed_gender_dorms=True,
        lockers_provided=True,
        quiet_hours_start="22:30",
    )
    assert hostel_cfg.communal_kitchen_access is True

    hotel_cfg = HotelConfig(
        star_rating=5,
        valet_parking=True,
        daily_housekeeping=True,
    )
    assert hotel_cfg.star_rating == 5
    assert hotel_cfg.minibar_enabled is True


@pytest.mark.asyncio
async def test_system_meta_endpoint(async_client: AsyncClient) -> None:
    """Verify /api/v1/system-meta returns architectural specs."""
    response = await async_client.get("/api/v1/system-meta")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "supported_property_types" in data["data"]
    assert "hostel" in data["data"]["supported_property_types"]
    assert "hotel" in data["data"]["supported_property_types"]
    assert "hybrid" in data["data"]["supported_property_types"]
