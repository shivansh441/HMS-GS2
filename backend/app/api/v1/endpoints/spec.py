"""System architecture and capabilities endpoint."""

from fastapi import APIRouter

from app.core.config import settings
from app.core.logging import correlation_id_ctx
from app.core.security import UserRole
from app.models.property import PropertyType
from app.schemas.common import ApiResponse

router = APIRouter(tags=["System Architecture"])


@router.get(
    "/system-meta",
    summary="System architecture specification",
    description="Returns foundation metadata, supported property types, and security baseline.",
)
async def get_system_meta() -> ApiResponse[dict[str, object]]:
    return ApiResponse(
        data={
            "service": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "api_version": "v1",
            "supported_property_types": [pt.value for pt in PropertyType],
            "rbac_roles": [r.value for r in UserRole],
            "architecture": "Modular Monolith",
            "modules": {
                "shared": ["core", "security", "database", "users", "properties"],
                "hostel_domain": ["dorm_allocations", "bunk_beds", "lockers", "communal_fees"],
                "hotel_domain": ["room_suites", "housekeeping", "concierge", "minibar_billing"],
            },
            "security": {
                "password_hashing": "bcrypt (work factor 12)",
                "token_auth": "JWT HMAC-SHA256",
                "isolation": "Tenant/Property ID scoping on all mutations",
            },
        },
        message="System architectural specifications loaded.",
        correlation_id=correlation_id_ctx.get() or None,
    )
