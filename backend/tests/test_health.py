"""Tests for health check, liveness probe, and root metadata endpoints."""

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_health_endpoint_success(async_client: AsyncClient) -> None:
    """Verify GET /api/v1/health returns healthy status and database metrics."""
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200

    data = response.json()
    assert data["success"] is True
    assert "data" in data

    payload = data["data"]
    assert payload["status"] == "healthy"
    assert payload["service"] == settings.PROJECT_NAME
    assert payload["environment"] == "test"
    assert "version" in payload
    assert "timestamp" in payload

    # Database check
    db_info = payload["database"]
    assert db_info["status"] == "connected"
    assert isinstance(db_info["latency_ms"], (int, float))

    # Correlation ID
    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"] is not None


@pytest.mark.asyncio
async def test_liveness_probe(async_client: AsyncClient) -> None:
    """Verify lightweight /api/v1/healthz probe returns 200 OK without DB roundtrip."""
    response = await async_client.get("/api/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "grandstay-backend"}


@pytest.mark.asyncio
async def test_root_ping(async_client: AsyncClient) -> None:
    """Verify root endpoint returns API directory links."""
    response = await async_client.get("/")
    assert response.status_code == 200
    res_json = response.json()
    assert "version" in res_json
    assert res_json["health"] == "/api/v1/health"
