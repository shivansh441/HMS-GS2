"""Booking endpoints with strict customer and property-staff ownership verification."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, verify_booking_ownership
from app.models.booking import Booking
from app.models.user import User
from app.schemas.booking import BookingPublicRead
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/bookings", tags=["Bookings & Reservations"])


@router.get(
    "/my",
    response_model=ApiResponse[list[BookingPublicRead]],
    status_code=status.HTTP_200_OK,
    summary="List authenticated customer's own bookings",
)
async def get_my_bookings(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> ApiResponse[list[BookingPublicRead]]:
    """Retrieve all reservations owned by the authenticated customer account."""
    result = await session.execute(
        select(Booking)
        .options(selectinload(Booking.guest), selectinload(Booking.items))
        .where(Booking.user_id == current_user.id)
        .order_by(Booking.check_in_date.desc())
    )
    bookings = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[BookingPublicRead.model_validate(b) for b in bookings],
        message="Customer bookings retrieved successfully.",
    )


@router.get(
    "/{booking_id}",
    response_model=ApiResponse[BookingPublicRead],
    status_code=status.HTTP_200_OK,
    summary="Get single booking with ownership verification",
)
async def get_booking_by_id(
    booking: Annotated[Booking, Depends(verify_booking_ownership)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[BookingPublicRead]:
    """Retrieve single booking details. Enforces ownership: customers can only view their own
    bookings; staff can only view bookings for assigned properties; platform admins have global access.
    """
    # Re-fetch with relationships loaded
    result = await session.execute(
        select(Booking)
        .options(selectinload(Booking.guest), selectinload(Booking.items))
        .where(Booking.id == booking.id)
    )
    loaded_booking = result.scalar_one_or_none() or booking

    return ApiResponse(
        success=True,
        data=BookingPublicRead.model_validate(loaded_booking),
        message="Booking retrieved successfully.",
    )
