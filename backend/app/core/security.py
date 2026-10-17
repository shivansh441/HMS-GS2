"""Security baseline: Argon2id password hashing, JWT token handling, and role permissions."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from pydantic import BaseModel

from app.core.config import settings

ph = PasswordHasher()


class UserRole(StrEnum):
    """System-wide role definitions for RBAC."""

    SUPER_ADMIN = "super_admin"  # Global system access across all properties
    PROPERTY_MANAGER = "property_manager"  # Full administrative access within assigned property
    FRONT_DESK = "front_desk"  # Check-ins, reservations, guest folio management
    HOUSEKEEPING = "housekeeping"  # Room/bed status updates, maintenance logs
    ACCOUNTANT = "accountant"  # Invoicing, POS reports, financial reconciliation
    GUEST = "guest"  # Self-service booking, digital key, room service


class TokenPayload(BaseModel):
    """Decoded JWT payload model."""

    sub: str | None = None
    role: UserRole | None = None
    property_id: str | None = None  # Scoped property context
    token_type: str = "access"  # access or refresh
    exp: int | None = None
    iat: int | None = None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Safely verify a plain text password against an Argon2id or legacy bcrypt hash."""
    if not hashed_password:
        return False
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except Exception:
            return False
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return ph.hash(password)


def generate_secure_token() -> str:
    """Generate a high-entropy cryptographically secure random token string."""
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Compute SHA-256 hash of a token for secure database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    subject: str,
    role: UserRole,
    property_id: str | None = None,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a signed JWT access token containing subject, role, property scope, and token_type."""
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    claims: dict[str, Any] = {
        "sub": str(subject),
        "role": role.value if isinstance(role, UserRole) else str(role),
        "property_id": str(property_id) if property_id else None,
        "token_type": "access",
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }
    if extra_claims:
        claims.update(extra_claims)

    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str,
    role: UserRole,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a signed JWT refresh token."""
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    claims: dict[str, Any] = {
        "sub": str(subject),
        "role": role.value if isinstance(role, UserRole) else str(role),
        "token_type": "refresh",
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "jti": secrets.token_hex(16),
    }

    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str, expected_type: str = "access") -> TokenPayload:
    """Decode and validate a JWT access or refresh token, verifying token_type."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub", "token_type"]},
        )
        token_type = payload.get("token_type")
        if token_type != expected_type:
            raise ValueError(f"Invalid token type: expected {expected_type}, got {token_type}")
        return TokenPayload(**payload)
    except jwt.PyJWTError as e:
        raise ValueError(f"Could not validate credentials: {e}") from e
