"""Health check schema with database and service readiness telemetry."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DatabaseHealth(BaseModel):
    """Database connectivity and latency telemetry."""

    status: Literal["connected", "degraded", "disconnected"]
    latency_ms: float | None = Field(
        default=None,
        description="Roundtrip query latency in milliseconds",
    )
    dialect: str | None = None
    error: str | None = None


class SystemInfo(BaseModel):
    """Host process and runtime diagnostic information."""

    python_version: str
    server_time_utc: datetime
    uptime_seconds: float


class HealthResponse(BaseModel):
    """Production health check payload."""

    status: Literal["healthy", "degraded", "unhealthy"]
    service: str
    version: str
    environment: str
    timestamp: datetime
    database: DatabaseHealth
    system: SystemInfo
