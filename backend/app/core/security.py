import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

# Argon2id hasher with specified parameters
ph = PasswordHasher(
    time_cost=settings.ARGON2_TIME_COST,
    memory_cost=settings.ARGON2_MEMORY_COST,
    parallelism=settings.ARGON2_PARALLELISM,
    hash_len=32,
    salt_len=16,
)

COMMON_PASSWORDS = {
    "password1234", "password12345", "123456789012", "qwertyuiop12",
    "admin123456!", "welcome12345!", "letmein12345!", "changeme1234!"
}

def validate_password_strength(password: str) -> None:
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters long")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise ValueError("Password must contain at least one special character")
    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("Password is too common; please choose a stronger password")

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, Exception):
        return False

def hash_token(raw_token: str) -> str:
    """SHA-256 hash for database storage of refresh tokens"""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

def generate_opaque_token() -> str:
    """Generates a high-entropy opaque token for refresh tokens"""
    return secrets.token_urlsafe(48)

def get_refresh_token_duration_seconds(account_type: str) -> int:
    """
    Refresh durations:
    - Guest / Resident: 7 days
    - Staff / Manager: 12 hours
    - Super Admin: 8 hours
    """
    if account_type == "SUPER_ADMIN":
        return 8 * 3600
    if account_type in ("MANAGER", "STAFF"):
        return 12 * 3600
    return 7 * 24 * 3600

def create_access_token(
    subject: str,
    audience: Literal["admin", "customer"],
    account_type: str,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    
    payload: dict[str, Any] = {
        "sub": subject,
        "aud": audience,
        "account_type": account_type,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str, expected_audience: Literal["admin", "customer"]) -> dict[str, Any]:
    """
    Decodes and validates JWT access token enforcing audience separation.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=expected_audience,
        )
        return payload
    except jwt.InvalidAudienceError as e:
        raise ValueError(f"Invalid audience: token not intended for {expected_audience}") from e
    except jwt.ExpiredSignatureError as e:
        raise ValueError("Token has expired") from e
    except jwt.PyJWTError as e:
        raise ValueError(f"Invalid token: {e}") from e

# MFA / TOTP helpers
def generate_mfa_secret() -> str:
    return pyotp.random_base32()

def verify_totp_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)

def get_totp_provisioning_uri(secret: str, username_or_email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username_or_email, issuer_name="Haven Stays Admin")
