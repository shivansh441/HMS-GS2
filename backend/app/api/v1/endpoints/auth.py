"""Authentication endpoints: Register, login, refresh, logout, profile, and password reset."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, require_platform_admin
from app.models.user import User
from app.schemas.auth import (
    AdminProvisionUserRequest,
    ChangePasswordRequest,
    CustomerRegisterRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    Token,
    UserRead,
)
from app.schemas.common import ApiResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=ApiResponse[UserRead],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new customer account",
)
async def register_customer(
    data: CustomerRegisterRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[UserRead]:
    """Register customer account and create guest profile."""
    user = await AuthService.register_customer(session, data)
    return ApiResponse(
        success=True,
        data=UserRead.model_validate(user),
        message="Customer registration successful.",
    )


@router.post(
    "/login",
    response_model=ApiResponse[Token],
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and issue tokens",
)
async def login(
    data: LoginRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[Token]:
    """Authenticate credentials and return JWT access and refresh tokens."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    token_data, _ = await AuthService.authenticate_user(
        session,
        data,
        ip_address=client_ip,
        device_info=user_agent,
    )
    return ApiResponse(
        success=True,
        data=token_data,
        message="Authentication successful.",
    )


@router.post(
    "/refresh",
    response_model=ApiResponse[Token],
    status_code=status.HTTP_200_OK,
    summary="Rotate refresh token",
)
async def refresh_token(
    data: RefreshTokenRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[Token]:
    """Rotate refresh token and issue new token pair."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    tokens = await AuthService.rotate_refresh_token(
        session,
        data.refresh_token,
        ip_address=client_ip,
        device_info=user_agent,
    )
    return ApiResponse(
        success=True,
        data=tokens,
        message="Token rotation successful.",
    )


@router.post(
    "/logout",
    response_model=ApiResponse[dict[str, bool]],
    status_code=status.HTTP_200_OK,
    summary="Revoke refresh token session",
)
async def logout(
    data: RefreshTokenRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[dict[str, bool]]:
    """Revoke active refresh session."""
    await AuthService.logout(session, data.refresh_token)
    return ApiResponse(
        success=True,
        data={"logged_out": True},
        message="Successfully logged out.",
    )


@router.get(
    "/me",
    response_model=ApiResponse[UserRead],
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
)
async def get_current_user_profile(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> ApiResponse[UserRead]:
    """Retrieve authenticated user profile."""
    return ApiResponse(
        success=True,
        data=UserRead.model_validate(current_user),
        message="Profile retrieved successfully.",
    )


@router.post(
    "/change-password",
    response_model=ApiResponse[dict[str, bool]],
    status_code=status.HTTP_200_OK,
    summary="Change account password",
)
async def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[dict[str, bool]]:
    """Update password and revoke existing sessions."""
    await AuthService.change_password(session, current_user, data)
    return ApiResponse(
        success=True,
        data={"password_changed": True},
        message="Password updated successfully.",
    )


@router.post(
    "/forgot-password",
    response_model=ApiResponse[dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Request password reset",
)
async def forgot_password(
    data: ForgotPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[dict[str, str]]:
    """Request password reset. Returns generic response to prevent user enumeration."""
    reset_token = await AuthService.request_password_reset(session, data)
    # In development mode, return simulated token for easy testing/verification
    response_data: dict[str, str] = {"message": "If the email exists, a password reset link has been sent."}
    if reset_token != "reset_token_simulated_placeholder":
        response_data["simulated_reset_token"] = reset_token

    return ApiResponse(
        success=True,
        data=response_data,
        message="Password reset request processed.",
    )


@router.post(
    "/reset-password",
    response_model=ApiResponse[dict[str, bool]],
    status_code=status.HTTP_200_OK,
    summary="Reset password using token",
)
async def reset_password(
    data: ResetPasswordRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiResponse[dict[str, bool]]:
    """Reset password using secure token."""
    await AuthService.reset_password(session, data)
    return ApiResponse(
        success=True,
        data={"password_reset": True},
        message="Password has been reset successfully.",
    )


@router.post(
    "/admin/provision",
    response_model=ApiResponse[UserRead],
    status_code=status.HTTP_201_CREATED,
    summary="Provision administrative or staff account",
)
async def admin_provision_user(
    data: AdminProvisionUserRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_platform_admin)],
) -> ApiResponse[UserRead]:
    """Platform administrator action to provision staff or admin users with property scopes."""
    user = await AuthService.admin_provision_user(session, data)
    return ApiResponse(
        success=True,
        data=UserRead.model_validate(user),
        message="Administrative user provisioned successfully.",
    )
