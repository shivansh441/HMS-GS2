"""Health check and container readiness endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.logging import correlation_id_ctx
from app.schemas.common import ApiResponse
from app.schemas.health import HealthResponse
from app.services.health_service import HealthService

router = APIRouter(tags=["Health & Diagnostics"])


@router.get(
    "/health",
    response_model=ApiResponse[HealthResponse],
    status_code=status.HTTP_200_OK,
    summary="Comprehensive system health probe",
    description=(
        "Probes database connectivity, returns latency, runtime uptime, and service status."
    ),
)
async def get_health(
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[HealthResponse]:
    """Execute health checks against connected backing services."""
    health_data = await HealthService.check_health(session=session)
    return ApiResponse(
        success=health_data.status != "unhealthy",
        data=health_data,
        message=f"System is operational ({health_data.status})",
        correlation_id=correlation_id_ctx.get() or None,
    )


@router.get(
    "/healthz",
    status_code=status.HTTP_200_OK,
    summary="Lightweight container liveness probe",
    description="Fast non-probing liveness check for Docker Compose and Kubernetes orchestration.",
)
async def get_liveness() -> dict[str, str]:
    """Simple 200 OK liveness ping."""
    return {"status": "ok", "service": "grandstay-backend"}
