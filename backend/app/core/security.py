import hashlib
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import urlparse

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Request

from app.core.config import settings
from app.core.errors import ForbiddenError, UnauthorizedError

# Argon2id hasher with specified parameters: memory 65536, time 3, parallelism 4
ph = PasswordHasher(
    time_cost=settings.ARGON2_TIME_COST,
    memory_cost=settings.ARGON2_MEMORY_COST,
    parallelism=settings.ARGON2_PARALLELISM,
    hash_len=32,
    salt_len=16,
)

# Precomputed dummy hash for constant-time verification when account doesn't exist
DUMMY_ARGON2_HASH = ph.hash("DummyPasswordVerificationForTimingResistance123!")

COMMON_PASSWORDS = {
    "password1234", "password12345", "123456789012", "qwertyuiop12",
    "admin123456!", "welcome12345!", "letmein12345!", "changeme1234!",
    "customerpass1", "adminsecurepass"
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

def dummy_verify_password() -> None:
    """Perform dummy argon2 verification to prevent timing side channels on nonexistent accounts."""
    try:
        ph.verify(DUMMY_ARGON2_HASH, "WrongPasswordForDummyVerification123!")
    except Exception:
        pass

def needs_rehash(hashed_password: str) -> bool:
    return ph.check_needs_rehash(hashed_password)

def hash_token(raw_token: str) -> str:
    """SHA-256 hash for database storage of refresh tokens, one-time tokens, and OTPs."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

def generate_opaque_token() -> str:
    """Generates a high-entropy opaque token for refresh tokens."""
    return secrets.token_urlsafe(48)

def generate_one_time_token() -> tuple[str, str]:
    """Generates a 256-bit random URL-safe token and its SHA-256 hash."""
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_token(raw_token)

def generate_otp_code() -> tuple[str, str]:
    """Generates a 6-digit numeric OTP and its SHA-256 hash."""
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    return code, hash_token(code)

def generate_recovery_codes(count: int = 10) -> list[tuple[str, str]]:
    """Generates formatted one-time recovery codes (e.g. ABCD-1234) and their hashes."""
    codes: list[tuple[str, str]] = []
    for _ in range(count):
        part1 = secrets.token_hex(2).upper()
        part2 = secrets.token_hex(2).upper()
        plain = f"{part1}-{part2}"
        codes.append((plain, hash_token(plain)))
    return codes

def get_refresh_token_duration_seconds(
    role: str,
    remember: bool = False,
) -> int:
    if role == "ADMIN":
        return 8 * 3600
    if role == "STAFF":
        return 12 * 3600
    if remember:
        return 30 * 24 * 3600
    return 7 * 24 * 3600

def create_access_token(
    subject: str,
    audience: str,
    role: str,
    session_id: str | None = None,
    mfa: bool = False,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    
    payload: dict[str, Any] = {
        "sub": subject,
        "aud": audience,
        "role": role,
        "sid": session_id or "",
        "mfa": mfa,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str, expected_audience: str | list[str]) -> dict[str, Any]:
    """
    Decodes and validates JWT access token enforcing audience separation.
    """
    expected_audiences = [expected_audience] if isinstance(expected_audience, str) else expected_audience
    try:
        # First decode unverified to check audience
        unverified = jwt.decode(token, options={"verify_signature": False})
        aud = unverified.get("aud")
        if aud not in expected_audiences:
            raise UnauthorizedError(
                f"Invalid audience: token intended for '{aud}', not {expected_audiences}",
                code="INVALID_AUDIENCE"
            )
        
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=aud,
        )
        return payload
    except jwt.ExpiredSignatureError as e:
        raise UnauthorizedError("Token has expired", code="TOKEN_EXPIRED") from e
    except jwt.PyJWTError as e:
        raise UnauthorizedError(f"Invalid token: {e}", code="INVALID_TOKEN") from e

# MFA / TOTP helpers
def generate_mfa_secret() -> str:
    return pyotp.random_base32()

def verify_totp_code_with_replay(
    secret: str,
    code: str,
    last_step: int | None = None
) -> tuple[bool, int | None]:
    """
    Verifies TOTP code allowing +/- 1 step drift (30-second window).
    Prevents replay by checking against last_step.
    """
    totp = pyotp.TOTP(secret)
    now_step = int(time.time() // 30)
    for step in (now_step, now_step - 1, now_step + 1):
        if totp.at(step * totp.interval) == code:
            if last_step is not None and step <= last_step:
                return False, None # Replay blocked
            return True, step
    return False, None

def verify_totp_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)

def get_totp_provisioning_uri(secret: str, username_or_email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username_or_email, issuer_name="Haven Stays")

def verify_csrf_and_origin(request: Request) -> None:
    """
    CSRF enforcement for refresh and logout endpoints:
    1. Custom header: X-Requested-With: haven
    2. Origin / Referer allow-list check
    """
    custom_header = request.headers.get("x-requested-with", "").lower()
    if custom_header != "haven":
        raise ForbiddenError("CSRF protection: missing or invalid X-Requested-With header", code="CSRF_REJECTED")

    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    candidate = origin or referer
    if not candidate:
        raise ForbiddenError("CSRF protection requires an Origin or Referer header", code="CSRF_REJECTED")

    parsed = urlparse(candidate)
    allowed_origins = {
        (urlparse(allowed).scheme.lower(), urlparse(allowed).netloc.lower())
        for allowed in settings.CORS_ORIGINS
    }
    if (parsed.scheme.lower(), parsed.netloc.lower()) not in allowed_origins:
        raise ForbiddenError("CSRF protection: unauthorized origin/referer", code="CSRF_REJECTED")
