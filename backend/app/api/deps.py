"""FastAPI dependencies for database sessions, security, and property isolation."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PermissionDeniedError, PropertyAccessViolationError
from app.core.security import TokenPayload, UserRole, decode_access_token
from app.db.session import get_async_session
from app.models.user import User, UserPropertyAssignment

bearer_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for obtaining an asynchronous database session."""
    async for session in get_async_session():
        yield session


async def get_current_token_payload(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> TokenPayload:
    """Dependency that extracts and validates the bearer JWT access token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials, expected_type="access")
        return payload
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_db)],
    payload: Annotated[TokenPayload, Depends(get_current_token_payload)],
) -> User:
    """Fetch the authenticated user from PostgreSQL and verify active status."""
    if not payload.sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject.",
        )

    result = await session.execute(select(User).where(User.id == payload.sub, User.is_active))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account is deactivated.",
        )
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure current user account is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account.",
        )
    return current_user


async def require_platform_admin(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Enforce platform-wide administrator privileges."""
    if not current_user.is_superuser and current_user.global_role != UserRole.SUPER_ADMIN:
        raise PermissionDeniedError("Platform administrator privileges required.")
    return current_user


def require_roles(*allowed_roles: UserRole):
    """Factory dependency enforcing RBAC role checks."""

    async def role_checker(
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        if current_user.is_superuser or current_user.global_role == UserRole.SUPER_ADMIN:
            return current_user

        if current_user.global_role not in allowed_roles:
            role_names = [r.value for r in allowed_roles]
            raise PermissionDeniedError(
                f"Role '{current_user.global_role}' lacks permission. Required one of: {role_names}"
            )
        return current_user

    return role_checker


async def verify_property_scope(
    property_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Enforce strict property-level data isolation and database-backed staff assignment."""
    if current_user.is_superuser or current_user.global_role == UserRole.SUPER_ADMIN:
        return current_user

    # Customers cannot access private property admin routes
    if current_user.global_role == UserRole.GUEST:
        raise PropertyAccessViolationError(property_id=property_id)

    # Check database for explicit property assignment
    result = await session.execute(
        select(UserPropertyAssignment).where(
            UserPropertyAssignment.user_id == current_user.id,
            UserPropertyAssignment.property_id == property_id,
            UserPropertyAssignment.is_active,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise PropertyAccessViolationError(property_id=property_id)

    return current_user
