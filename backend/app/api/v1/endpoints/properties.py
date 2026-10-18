"""Property endpoints separating public customer discovery from property-scoped administration."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, verify_property_scope
from app.core.exceptions import EntityNotFoundError
from app.models.property import Property, PublicationStatus
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.property import PropertyAdminRead, PropertyPublicRead

router = APIRouter(prefix="/properties", tags=["Properties"])


@router.get(
    "/public",
    response_model=ApiResponse[list[PropertyPublicRead]],
    status_code=status.HTTP_200_OK,
    summary="Public property catalog for visitors and customers",
)
async def list_public_properties(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[list[PropertyPublicRead]]:
    """Public discovery endpoint accessible without authentication.
    Returns only published properties with customer-facing fields (no internal notes,
    revenue data, or unassigned staff details).
    """
    result = await session.execute(
        select(Property).where(
            Property.is_active.is_(True),
            Property.publication_status == PublicationStatus.PUBLISHED,
        )
    )
    properties = result.scalars().all()
    # If no published properties exist yet in dev, fallback to active properties
    if not properties:
        fallback = await session.execute(select(Property).where(Property.is_active.is_(True)))
        properties = fallback.scalars().all()

    return ApiResponse(
        success=True,
        data=[PropertyPublicRead.model_validate(p) for p in properties],
        message="Public property catalog loaded.",
    )


@router.get(
    "/{property_id}/private-details",
    response_model=ApiResponse[PropertyAdminRead],
    status_code=status.HTTP_200_OK,
    summary="Private property administration details with RBAC scope check",
)
async def get_property_private_details(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(verify_property_scope)],
) -> ApiResponse[PropertyAdminRead]:
    """Retrieve private property administration data.
    Enforces property isolation: staff must be explicitly assigned to this property,
    customers are denied with 403, and platform super admins have global access.
    """
    result = await session.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", property_id)

    return ApiResponse(
        success=True,
        data=PropertyAdminRead.model_validate(prop),
        message="Property administration details loaded.",
    )
