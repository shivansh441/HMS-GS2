"""Property endpoints separating public customer discovery from property-scoped administration."""

from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_roles, verify_property_scope
from app.core.exceptions import EntityNotFoundError, PermissionDeniedError, ResourceConflictError, ValidationError
from app.core.security import UserRole
from app.models.booking import Booking, BookingStatus
from app.models.property import Property, PropertyType, PublicationStatus
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.property import (
    PropertyAdminRead,
    PropertyArchiveResponse,
    PropertyCreate,
    PropertyPublicRead,
    PropertyPublishRequest,
    PropertyUpdate,
)

router = APIRouter(prefix="/properties", tags=["Properties"])


@router.get(
    "/public",
    response_model=ApiResponse[list[PropertyPublicRead]],
    status_code=status.HTTP_200_OK,
    summary="Public property catalog for visitors and customers",
)
async def list_public_properties(
    session: Annotated[AsyncSession, Depends(get_db)],
    property_type: PropertyType | None = Query(default=None, description="Filter by property type"),
    city: str | None = Query(default=None, description="Filter by city"),
) -> ApiResponse[list[PropertyPublicRead]]:
    """Public discovery endpoint accessible without authentication.
    Returns only published, bookable, and active properties with customer-facing fields.
    """
    query = select(Property).where(
        Property.is_active.is_(True),
        Property.publication_status == PublicationStatus.PUBLISHED,
        Property.is_bookable.is_(True),
    )
    if property_type:
        query = query.where(Property.property_type == property_type)
    if city:
        query = query.where(Property.city.ilike(f"%{city}%"))

    result = await session.execute(query)
    properties = result.scalars().all()

    return ApiResponse(
        success=True,
        data=[PropertyPublicRead.model_validate(p) for p in properties],
        message="Public property catalog loaded.",
    )


@router.get(
    "/public/{slug}",
    response_model=ApiResponse[PropertyPublicRead],
    status_code=status.HTTP_200_OK,
    summary="Public property details by unique slug",
)
async def get_public_property_by_slug(
    slug: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[PropertyPublicRead]:
    """Retrieve public property details by slug.
    Returns 404 if property does not exist or is not published.
    """
    result = await session.execute(
        select(Property).where(
            Property.slug == slug,
            Property.is_active.is_(True),
            Property.publication_status == PublicationStatus.PUBLISHED,
        )
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", slug)

    return ApiResponse(
        success=True,
        data=PropertyPublicRead.model_validate(prop),
        message="Public property details loaded.",
    )


@router.get(
    "/public/{slug}/availability",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Public property accommodation availability by dates",
)
async def get_public_property_availability(
    slug: str,
    check_in_date: date,
    check_out_date: date,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[dict]:
    """Public customer-facing availability query for published bookable properties.
    Excludes private administrative notes, keycards, guest names, or staff data.
    """
    result = await session.execute(
        select(Property).where(
            Property.slug == slug,
            Property.is_active.is_(True),
            Property.publication_status == PublicationStatus.PUBLISHED,
            Property.is_bookable.is_(True),
        )
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", slug)

    from app.services.availability_service import calculate_property_availability

    data = await calculate_property_availability(
        session=session,
        property_id=prop.id,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
    )

    # Expose only customer-facing accommodation room types and available count
    public_summary = {
        "property_id": prop.id,
        "property_name": prop.name,
        "property_slug": prop.slug,
        "property_type": prop.property_type,
        "currency": prop.currency,
        "check_in_date": check_in_date.isoformat(),
        "check_out_date": check_out_date.isoformat(),
        "total_nights": data.total_nights,
        "room_types": [
            {
                "room_type_id": rt.room_type_id,
                "name": rt.room_type_name,
                "slug": rt.slug,
                "accommodation_tier": rt.accommodation_tier,
                "is_dormitory": rt.is_dormitory,
                "base_price_per_night": float(rt.base_price_per_night),
                "available_units_count": rt.available_units,
                "is_available": rt.available_units > 0,
            }
            for rt in data.room_types
        ],
    }

    return ApiResponse(
        success=True,
        data=public_summary,
        message="Public availability loaded.",
    )


@router.get(
    "",
    response_model=ApiResponse[list[PropertyAdminRead]],
    status_code=status.HTTP_200_OK,
    summary="Admin list of properties with RBAC and filters",
)
async def list_admin_properties(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    property_type: PropertyType | None = Query(default=None),
    publication_status: PublicationStatus | None = Query(default=None),
    q: str | None = Query(default=None, description="Search term for name, code, or city"),
    include_inactive: bool = Query(default=False),
) -> ApiResponse[list[PropertyAdminRead]]:
    """Administrative property list.
    Super admins can view all properties. Staff can only view their assigned properties.
    Customers receive 403.
    """
    if current_user.global_role == UserRole.GUEST:
        raise PermissionDeniedError("Guests are not authorized to view property management data.")

    query = select(Property)
    if not include_inactive:
        query = query.where(Property.is_active.is_(True))

    # Apply RBAC property scoping for non-superadmins
    if not current_user.is_superuser and current_user.global_role != UserRole.SUPER_ADMIN:
        assigned_ids = [a.property_id for a in current_user.property_assignments if a.is_active]
        query = query.where(Property.id.in_(assigned_ids))

    if property_type:
        query = query.where(Property.property_type == property_type)
    if publication_status:
        query = query.where(Property.publication_status == publication_status)
    if q:
        search_filter = or_(
            Property.name.ilike(f"%{q}%"),
            Property.code.ilike(f"%{q}%"),
            Property.city.ilike(f"%{q}%"),
        )
        query = query.where(search_filter)

    query = query.order_by(Property.name.asc())
    result = await session.execute(query)
    properties = result.scalars().all()

    return ApiResponse(
        success=True,
        data=[PropertyAdminRead.model_validate(p) for p in properties],
        message="Admin properties retrieved.",
    )


@router.post(
    "",
    response_model=ApiResponse[PropertyAdminRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new property (Super Admin only)",
)
async def create_property(
    payload: PropertyCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles([UserRole.SUPER_ADMIN]))],
) -> ApiResponse[PropertyAdminRead]:
    """Create a new property entity.
    Requires platform administrator privileges. Validates code and slug uniqueness.
    """
    # Check duplicate code or slug
    existing = await session.execute(
        select(Property).where(
            or_(Property.code == payload.code.upper(), Property.slug == payload.slug.lower())
        )
    )
    dup = existing.scalar_one_or_none()
    if dup:
        if dup.code == payload.code.upper():
            raise ResourceConflictError("Property", f"code '{payload.code}' already exists")
        raise ResourceConflictError("Property", f"slug '{payload.slug}' already exists")

    new_prop = Property(
        name=payload.name,
        code=payload.code.upper(),
        slug=payload.slug.lower(),
        property_type=payload.property_type,
        currency=payload.currency.upper(),
        timezone=payload.timezone,
        description=payload.description,
        address=payload.address,
        city=payload.city,
        state_province=payload.state_province,
        country=payload.country,
        postal_code=payload.postal_code,
        latitude=payload.latitude,
        longitude=payload.longitude,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        checkin_time_start=payload.checkin_time_start,
        checkout_time_deadline=payload.checkout_time_deadline,
        publication_status=payload.publication_status,
        is_bookable=payload.is_bookable,
        amenities=payload.amenities,
        policies=payload.policies,
        configuration=payload.configuration,
        created_by_user_id=current_user.id,
    )
    session.add(new_prop)
    await session.commit()
    await session.refresh(new_prop)

    return ApiResponse(
        success=True,
        data=PropertyAdminRead.model_validate(new_prop),
        message="Property created successfully.",
    )


@router.get(
    "/{property_id}",
    response_model=ApiResponse[PropertyAdminRead],
    status_code=status.HTTP_200_OK,
    summary="Get property administrative details",
)
async def get_property_by_id(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(verify_property_scope)],
) -> ApiResponse[PropertyAdminRead]:
    """Retrieve full property administrative details."""
    result = await session.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", property_id)

    return ApiResponse(
        success=True,
        data=PropertyAdminRead.model_validate(prop),
        message="Property retrieved.",
    )


@router.put(
    "/{property_id}",
    response_model=ApiResponse[PropertyAdminRead],
    status_code=status.HTTP_200_OK,
    summary="Update property administrative details",
)
async def update_property(
    property_id: str,
    payload: PropertyUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(verify_property_scope)],
) -> ApiResponse[PropertyAdminRead]:
    """Update property details.
    Restricted to super administrators or assigned property managers.
    """
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can modify property details.")

    result = await session.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", property_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(prop, field, val)

    await session.commit()
    await session.refresh(prop)

    return ApiResponse(
        success=True,
        data=PropertyAdminRead.model_validate(prop),
        message="Property updated successfully.",
    )


@router.post(
    "/{property_id}/publish",
    response_model=ApiResponse[PropertyAdminRead],
    status_code=status.HTTP_200_OK,
    summary="Publish or unpublish property",
)
async def publish_property(
    property_id: str,
    payload: PropertyPublishRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(verify_property_scope)],
) -> ApiResponse[PropertyAdminRead]:
    """Change publication status with validation."""
    if not current_user.is_superuser and current_user.global_role not in (
        UserRole.SUPER_ADMIN,
        UserRole.PROPERTY_MANAGER,
    ):
        raise PermissionDeniedError("Only property managers or super admins can change publication status.")

    result = await session.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", property_id)

    # Validate readiness before publishing
    if payload.publication_status == PublicationStatus.PUBLISHED:
        if not prop.address or not prop.city or not prop.country:
            raise ValidationError("Address, city, and country must be specified before publishing.")
        if not prop.currency or not prop.timezone:
            raise ValidationError("Currency and timezone must be specified before publishing.")

    prop.publication_status = payload.publication_status
    await session.commit()
    await session.refresh(prop)

    return ApiResponse(
        success=True,
        data=PropertyAdminRead.model_validate(prop),
        message=f"Property publication status updated to '{prop.publication_status.value}'.",
    )


@router.post(
    "/{property_id}/archive",
    response_model=ApiResponse[PropertyArchiveResponse],
    status_code=status.HTTP_200_OK,
    summary="Safely archive property",
)
async def archive_property(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles([UserRole.SUPER_ADMIN]))],
) -> ApiResponse[PropertyArchiveResponse]:
    """Safely archive a property without destructive cascade deletion.
    Super admin only. Checks for active reservations before archiving.
    """
    result = await session.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", property_id)

    # Check for active bookings
    active_bk = await session.execute(
        select(Booking).where(
            Booking.property_id == property_id,
            Booking.booking_status.in_([BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN]),
        )
    )
    if active_bk.scalars().first():
        raise ValidationError(
            "Cannot archive property: Active reservations or checked-in guests exist. "
            "Please resolve or transfer all bookings prior to archival."
        )

    now = datetime.now(UTC)
    prop.is_active = False
    prop.publication_status = PublicationStatus.UNPUBLISHED
    prop.archived_at = now
    await session.commit()

    return ApiResponse(
        success=True,
        data=PropertyArchiveResponse(
            id=prop.id,
            is_active=False,
            publication_status=PublicationStatus.UNPUBLISHED,
            archived_at=now,
            message="Property archived successfully. Historical bookings and financial data are preserved.",
        ),
        message="Property safely archived.",
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
    """Retrieve private property administration data."""
    result = await session.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise EntityNotFoundError("Property", property_id)

    return ApiResponse(
        success=True,
        data=PropertyAdminRead.model_validate(prop),
        message="Property administration details loaded.",
    )
