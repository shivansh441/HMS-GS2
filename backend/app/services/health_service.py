"""Health check service probing database connectivity and server runtime stats."""

import platform
import time
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import logger
from app.schemas.health import DatabaseHealth, HealthResponse, SystemInfo

# Track server process start time
_START_TIME = time.time()


class HealthService:
    """Probes system readiness, database round-trip latency, and core services."""

    @staticmethod
    async def check_health(session: AsyncSession | None = None) -> HealthResponse:
        """Run health probes across dependencies and assemble status report."""
        db_health: DatabaseHealth

        if session is not None:
            start_ts = time.perf_counter()
            try:
                # Execute lightweight ping query
                result = await session.execute(text("SELECT 1"))
                _ = result.scalar()
                latency_ms = round((time.perf_counter() - start_ts) * 1000, 2)
                db_health = DatabaseHealth(
                    status="connected",
                    latency_ms=latency_ms,
                    dialect=session.bind.dialect.name if session.bind else "postgresql",
                    error=None,
                )
            except Exception as exc:
                latency_ms = round((time.perf_counter() - start_ts) * 1000, 2)
                logger.warning(f"Database health check probe failed: {exc}")
                db_health = DatabaseHealth(
                    status="degraded",
                    latency_ms=latency_ms,
                    dialect=session.bind.dialect.name if session.bind else "unknown",
                    error=str(exc),
                )
        else:
            db_health = DatabaseHealth(
                status="disconnected",
                latency_ms=None,
                error="No active database session provided for probe",
            )


        uptime_seconds = round(time.time() - _START_TIME, 2)
        overall_status: Literal["healthy", "degraded", "unhealthy"] = (
            "healthy" if db_health.status == "connected" else "degraded"
        )

        return HealthResponse(
            status=overall_status,
            service=settings.PROJECT_NAME,
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            timestamp=datetime.now(UTC),
            database=db_health,
            system=SystemInfo(
                python_version=platform.python_version(),
                server_time_utc=datetime.now(UTC),
                uptime_seconds=uptime_seconds,
            ),
        )
