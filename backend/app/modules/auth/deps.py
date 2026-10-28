from fastapi import Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.permissions import Role
from app.core.scoping import resolve_property_scope
from app.core.security import decode_access_token
from app.db.models import User
from app.db.session import get_db

limiter = Limiter(key_func=get_remote_address)

def extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header", code="AUTH_REQUIRED")
    return auth_header[7:].strip()

def get_current_customer(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Enforces aud = 'customer'. Rejects admin tokens.
    """
    token = extract_bearer_token(request)
    try:
        payload = decode_access_token(token, expected_audience="customer")
    except ValueError as e:
        raise UnauthorizedError(str(e), code="INVALID_TOKEN") from e
        
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Token payload missing subject", code="INVALID_TOKEN")
        
    user = db.get(User, user_id)
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("User inactive or not found", code="USER_INACTIVE")
        
    # Check that it's a customer account
    if user.role != Role.CUSTOMER:
        raise ForbiddenError("Admin accounts cannot access customer endpoints", code="FORBIDDEN_AUDIENCE")
        
    return user

def get_optional_current_customer(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    if not request.headers.get("Authorization"):
        return None
    return get_current_customer(request, db)

def get_current_admin_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Enforces aud = 'admin'. Rejects customer tokens.
    """
    token = extract_bearer_token(request)
    try:
        payload = decode_access_token(token, expected_audience="admin")
    except ValueError as e:
        raise UnauthorizedError(str(e), code="INVALID_TOKEN") from e
        
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Token payload missing subject", code="INVALID_TOKEN")
        
    user = db.get(User, user_id)
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("Admin user inactive or not found", code="USER_INACTIVE")
        
    if user.role not in (Role.ADMIN, Role.STAFF):
        raise ForbiddenError("Account not authorized for admin area", code="FORBIDDEN_AUDIENCE")
        
    return user

def get_admin_enrollment_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Accept only the short-lived token issued for forced admin MFA setup."""
    token = extract_bearer_token(request)
    try:
        payload = decode_access_token(token, expected_audience="admin-enroll")
    except ValueError as e:
        raise UnauthorizedError(str(e), code="INVALID_TOKEN") from e

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Token payload missing subject", code="INVALID_TOKEN")

    user = db.get(User, user_id)
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("Admin user inactive or not found", code="USER_INACTIVE")
    if user.role != Role.ADMIN:
        raise ForbiddenError("MFA enrollment token is not valid for this account", code="INVALID_ENROLLMENT_TOKEN")
    return user

def get_property_scope(
    request: Request,
    user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> set[str]:
    """
    Dependency resolving the authorized property scope for this admin request.
    Validates X-Property-Id header against user's permitted properties.
    """
    header_property_id = request.headers.get("X-Property-Id")
    if header_property_id:
        header_property_id = header_property_id.strip()
    return resolve_property_scope(db, user, header_property_id)
