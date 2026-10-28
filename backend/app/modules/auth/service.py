import json
import hmac
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import quote

import jwt
from fastapi import Request, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_data, encrypt_data
from app.core.errors import AppException, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.core.permissions import Role
from app.core.rate_limit import get_client_ip, rate_limiter
from app.core.security import (
    create_access_token,
    decode_access_token,
    dummy_verify_password,
    generate_mfa_secret,
    generate_one_time_token,
    generate_opaque_token,
    generate_otp_code,
    generate_recovery_codes,
    get_refresh_token_duration_seconds,
    get_totp_provisioning_uri,
    hash_password,
    hash_token,
    needs_rehash,
    validate_password_strength,
    verify_csrf_and_origin,
    verify_password,
    verify_totp_code_with_replay,
)
from app.db.models import (
    CustomerPropertyLink,
    LinkedIdentity,
    MfaRecoveryCode,
    OtpCode,
    SessionModel,
    User,
    UserPropertyAccess,
    VerificationToken,
)
from app.modules.audit.service import write_audit_log
from app.modules.notifier.service import notifier

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def parse_user_agent(ua_str: str | None) -> tuple[str, str]:
    if not ua_str:
        return "Unknown Browser", "Unknown OS"
    ua = ua_str.lower()
    if "windows" in ua:
        os_name = "Windows"
    elif "macintosh" in ua or "mac os" in ua:
        os_name = "macOS"
    elif "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Desktop"

    if "edg" in ua:
        browser_name = "Microsoft Edge"
    elif "chrome" in ua and "safari" in ua:
        browser_name = "Chrome"
    elif "safari" in ua and "chrome" not in ua:
        browser_name = "Safari"
    elif "firefox" in ua:
        browser_name = "Firefox"
    else:
        browser_name = "Web Browser"
    return browser_name, os_name

# ==========================================
# 1. SESSION MANAGEMENT & REFRESH TOKENS
# ==========================================

def create_user_session(
    db: Session,
    user: User,
    audience: Literal["admin", "customer"],
    response: Response,
    remember: bool = False,
    family_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    absolute_expires_at: datetime | None = None,
) -> tuple[str, str, int, SessionModel]:
    now = utc_now()
    duration = get_refresh_token_duration_seconds(user.role, remember=remember)
    expires_at = now + timedelta(seconds=duration)
    if absolute_expires_at is not None:
        expires_at = min(expires_at, ensure_utc(absolute_expires_at) or expires_at)
        duration = max(1, int((expires_at - now).total_seconds()))

    opaque_refresh = generate_opaque_token()
    token_hashed = hash_token(opaque_refresh)
    sess_family = family_id or str(uuid.uuid4())

    session = SessionModel(
        user_id=user.id,
        refresh_token_hash=token_hashed,
        family_id=sess_family,
        audience=audience,
        user_agent=user_agent,
        ip=ip,
        last_active_at=now,
        is_revoked=False,
        expires_at=expires_at,
    )
    db.add(session)
    db.flush()

    access_token = create_access_token(
        subject=user.id,
        audience=audience,
        role=user.role,
        session_id=session.id,
        mfa=user.mfa_enabled,
        extra_claims={
            "email": user.email,
            "role": user.role,
        },
    )

    cookie_name = settings.ADMIN_REFRESH_COOKIE_NAME if audience == "admin" else settings.CUST_REFRESH_COOKIE_NAME
    cookie_path = settings.ADMIN_COOKIE_PATH if audience == "admin" else settings.CUST_COOKIE_PATH

    response.set_cookie(
        key=cookie_name,
        value=opaque_refresh,
        max_age=duration,
        path=cookie_path,
        httponly=True,
        samesite="lax",
        secure=False,
    )

    return access_token, opaque_refresh, 15 * 60, session

def rotate_refresh_token(
    db: Session,
    raw_refresh_token: str,
    audience: Literal["admin", "customer"],
    request: Request,
    response: Response,
) -> tuple[str, User]:
    verify_csrf_and_origin(request)
    now = utc_now()
    token_hash = hash_token(raw_refresh_token)
    ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent")

    session = db.scalar(select(SessionModel).where(SessionModel.refresh_token_hash == token_hash))

    if not session:
        raise UnauthorizedError("Invalid or expired session", code="INVALID_REFRESH_TOKEN")

    if session.audience != audience:
        raise UnauthorizedError("Session audience mismatch", code="FORBIDDEN_AUDIENCE")

    # Family reuse detection
    if session.is_revoked or (ensure_utc(session.expires_at) or now) < now:
        family_id = session.family_id
        db.query(SessionModel).filter(SessionModel.family_id == family_id).update(
            {"is_revoked": True, "revoked_reason": "TOKEN_REUSE_DETECTED"}
        )
        write_audit_log(
            db,
            action="TOKEN_REUSE_DETECTED",
            actor_user_id=session.user_id,
            target_user_id=session.user_id,
            details={"family_id": family_id},
            ip=ip,
            user_agent=user_agent,
        )
        # Notify user
        user = db.get(User, session.user_id)
        if user and user.email:
            notifier.send_notification(
                db=db,
                channel="EMAIL",
                destination=user.email,
                subject="Security Alert: Suspicious session activity",
                body="We detected suspicious reuse of a revoked session token. All sessions have been terminated for security.",
            )
        db.commit()
        raise UnauthorizedError("Security violation detected. Please sign in again.", code="TOKEN_REUSE_DETECTED")

    # Staff idle timeout: staff sessions with no activity for 30 minutes expire on next refresh
    if audience == "admin":
        idle_elapsed = (now - (ensure_utc(session.last_active_at) or now)).total_seconds()
        if idle_elapsed > 30 * 60:
            session.is_revoked = True
            session.revoked_reason = "IDLE_TIMEOUT"
            db.commit()
            raise UnauthorizedError("Staff session expired due to 30-minute inactivity", code="IDLE_TIMEOUT")

    user = db.get(User, session.user_id)
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("User is no longer active", code="USER_INACTIVE")

    # Mark current token as rotated
    session.is_revoked = True
    session.revoked_reason = "ROTATED"
    db.flush()

    access_token, _, _, _ = create_user_session(
        db=db,
        user=user,
        audience=audience,
        response=response,
        family_id=session.family_id,
        ip=ip,
        user_agent=user_agent,
        absolute_expires_at=(
            session.expires_at if user.role in (Role.ADMIN, Role.STAFF) else None
        ),
    )

    db.commit()
    return access_token, user

def revoke_session(
    db: Session,
    raw_refresh_token: str | None,
    audience: Literal["admin", "customer"],
    request: Request,
    response: Response,
) -> None:
    verify_csrf_and_origin(request)
    cookie_name = settings.ADMIN_REFRESH_COOKIE_NAME if audience == "admin" else settings.CUST_REFRESH_COOKIE_NAME
    cookie_path = settings.ADMIN_COOKIE_PATH if audience == "admin" else settings.CUST_COOKIE_PATH

    response.delete_cookie(key=cookie_name, path=cookie_path)

    if raw_refresh_token:
        token_hash = hash_token(raw_refresh_token)
        session = db.scalar(select(SessionModel).where(SessionModel.refresh_token_hash == token_hash))
        if session:
            session.is_revoked = True
            session.revoked_reason = "LOGOUT"
            write_audit_log(
                db,
                action="SESSION_LOGOUT",
                actor_user_id=session.user_id,
                target_user_id=session.user_id,
                details={"session_id": session.id},
                ip=get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
            )
            db.commit()

def revoke_all_user_sessions(db: Session, user_id: str, reason: str = "ALL_SESSIONS_REVOKED", except_session_id: str | None = None) -> None:
    query = db.query(SessionModel).filter(SessionModel.user_id == user_id, SessionModel.is_revoked == False)
    if except_session_id:
        query = query.filter(SessionModel.id != except_session_id)
    query.update({"is_revoked": True, "revoked_reason": reason})
    db.commit()

# ==========================================
# 2. CUSTOMER AUTHENTICATION & REGISTRATION
# ==========================================

def register_customer_flow(
    db: Session,
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    phone: str | None,
    ip: str,
    user_agent: str | None,
) -> dict[str, Any]:
    # Rate limit: 10/hour per IP
    rate_limiter.check(key=f"register_ip:{ip}", max_requests=10, window_seconds=3600)

    try:
        validate_password_strength(password)
    except ValueError as e:
        raise ValidationError(str(e)) from e

    clean_email = email.strip().lower()
    full_name = f"{first_name.strip()} {last_name.strip()}"
    existing = db.scalar(select(User).where(User.email == clean_email))

    if existing:
        # No account enumeration: return identical generic 202 response
        dummy_verify_password()
        return {
            "statusCode": 202,
            "message": "Registration received. Please check your email to complete activation.",
        }

    user = User(
        email=clean_email,
        username=clean_email.split("@")[0] + "_" + secrets.token_hex(3),
        password_hash=hash_password(password),
        full_name=full_name,
        phone=phone.strip() if phone else None,
        role=Role.CUSTOMER,
        status="PENDING_ACTIVATION",
    )
    db.add(user)
    db.flush()

    # Generate 256-bit email verification token (24 hour expiry)
    raw_token, token_hash = generate_one_time_token()
    ver_token = VerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        token_type="EMAIL_VERIFY",
        expires_at=utc_now() + timedelta(hours=24),
    )
    db.add(ver_token)
    db.flush()

    verify_url = f"{settings.PUBLIC_WEBSITE_URL}/verify-email?token={raw_token}"
    notifier.send_notification(
        db=db,
        channel="EMAIL",
        destination=clean_email,
        subject="Welcome to Haven Stays - Verify your email",
        body=f"Hello {first_name}, welcome to Haven Stays! Click here to verify your account: {verify_url}",
    )

    write_audit_log(
        db,
        action="CUSTOMER_REGISTERED",
        actor_user_id=user.id,
        target_user_id=user.id,
        details={"role": Role.CUSTOMER},
        ip=ip,
        user_agent=user_agent,
    )
    db.commit()

    return {
        "statusCode": 202,
        "message": "Registration received. Please check your email to complete activation.",
    }

def verify_email_token(db: Session, token: str, response: Response, request: Request) -> tuple[str, int, User]:
    now = utc_now()
    token_hash = hash_token(token)

    ver = db.scalar(
        select(VerificationToken).where(
            VerificationToken.token_hash == token_hash,
            VerificationToken.token_type == "EMAIL_VERIFY",
            VerificationToken.is_used == False,
        )
    )

    if not ver or (ensure_utc(ver.expires_at) or now) < now:
        raise UnauthorizedError("Invalid or expired email verification link", code="INVALID_TOKEN")

    ver.is_used = True
    user = db.get(User, ver.user_id)
    if not user:
        raise NotFoundError("User not found")

    user.email_verified_at = now
    user.status = "ACTIVE"
    db.flush()

    write_audit_log(
        db,
        action="EMAIL_VERIFIED",
        actor_user_id=user.id,
        target_user_id=user.id,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    access_token, _, exp, _ = create_user_session(
        db=db,
        user=user,
        audience="customer",
        response=response,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return access_token, exp, user

def resend_verification_email(db: Session, email: str, ip: str) -> dict[str, Any]:
    # Rate limit: 3 per 10 min
    rate_limiter.check(key=f"resend_ver:{ip}", max_requests=3, window_seconds=600, cooldown_seconds=60)
    clean_email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == clean_email))

    if user and user.status == "PENDING_ACTIVATION":
        # Invalidate old tokens
        db.query(VerificationToken).filter(
            VerificationToken.user_id == user.id,
            VerificationToken.token_type == "EMAIL_VERIFY"
        ).update({"is_used": True})

        raw_token, token_hash = generate_one_time_token()
        ver = VerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type="EMAIL_VERIFY",
            expires_at=utc_now() + timedelta(hours=24),
        )
        db.add(ver)
        db.flush()

        verify_url = f"{settings.PUBLIC_WEBSITE_URL}/verify-email?token={raw_token}"
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=clean_email,
            subject="Haven Stays - Account Verification Link",
            body=f"Click here to verify your account: {verify_url}",
        )
        db.commit()
    else:
        dummy_verify_password()

    return {"message": "If an unactivated account exists for this email, a verification link has been sent."}

def customer_login_flow(
    db: Session,
    identifier: str,
    password: str,
    remember: bool,
    response: Response,
    request: Request,
) -> tuple[str, int, User, bool, str | None]:
    now = utc_now()
    ip = get_client_ip(request)
    clean_id = identifier.strip().lower()

    user = db.scalar(select(User).where(or_(User.email == clean_id, User.phone == clean_id)))
    invalid_err = UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")

    if not user:
        rate_limiter.check(key=f"cust_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        raise invalid_err

    # Staff/admin cannot log in through customer auth
    if user.role != Role.CUSTOMER:
        rate_limiter.check(key=f"cust_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        raise invalid_err

    # Suspended or archived accounts get generic error
    if user.status in ("SUSPENDED", "ARCHIVED"):
        rate_limiter.check(key=f"cust_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        raise invalid_err

    # Pending activation accounts
    if user.status == "PENDING_ACTIVATION":
        rate_limiter.check(key=f"cust_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        if user.email:
            try:
                resend_verification_email(db, user.email, ip)
            except AppException as error:
                if error.status_code != 429:
                    raise
        raise UnauthorizedError("Please check your email to finish setting up your account.", code="PENDING_ACTIVATION")

    # Lockout check
    locked_until_utc = ensure_utc(user.locked_until)
    if locked_until_utc and locked_until_utc > now:
        retry_seconds = int((locked_until_utc - now).total_seconds()) + 1
        raise AppException(
            status_code=423,
            code="ACCOUNT_LOCKED",
            message=f"Account temporarily locked due to multiple failed logins. Try again in {max(1, retry_seconds // 60)} minutes.",
            headers={"Retry-After": str(retry_seconds)}
        )

    # Return an active account lockout before the request-rate limit so clients
    # receive the account lock's Retry-After value on subsequent attempts.
    rate_limiter.check(key=f"cust_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)

    # Password check
    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= 5:
            multiplier = 2 ** min(user.lockout_count, 6) # 1, 2, 4, 8, 16, 32, 64
            lockout_min = min(15 * multiplier, 1440) # 15m to 24h
            user.lockout_count += 1
            user.locked_until = now + timedelta(minutes=lockout_min)
            write_audit_log(
                db,
                action="ACCOUNT_LOCKED",
                target_user_id=user.id,
                details={"reason": "FAILED_PASSWORD_THRESHOLD", "lockout_minutes": lockout_min},
                ip=ip,
                user_agent=request.headers.get("user-agent"),
            )
            if user.email:
                notifier.send_notification(
                    db=db,
                    channel="EMAIL",
                    destination=user.email,
                    subject="Security Notice: Account locked",
                    body=f"Your account was locked due to 5 failed password attempts. It will unlock in {lockout_min} minutes.",
                )
        db.commit()
        raise invalid_err

    # Reset lockout on success
    user.failed_login_count = 0
    user.lockout_count = 0
    user.locked_until = None
    user.last_login_at = now

    # Transparent rehash if parameters changed
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    # Check if MFA is enabled
    if user.mfa_enabled:
        # Issue 5-minute single-purpose mfaToken
        mfa_token = create_access_token(
            subject=user.id,
            audience="customer-mfa",
            role=user.role,
            expires_delta=timedelta(minutes=5),
        )
        db.commit()
        return "", 0, user, True, mfa_token

    access_token, _, exp, _ = create_user_session(
        db=db,
        user=user,
        audience="customer",
        response=response,
        remember=remember,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
    )

    write_audit_log(
        db,
        action="CUSTOMER_LOGIN",
        actor_user_id=user.id,
        target_user_id=user.id,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return access_token, exp, user, False, None

# ==========================================
# 3. OTP (ONE-TIME PASSCODE) FLOWS
# ==========================================

def request_otp_flow(db: Session, target: str, channel: str, purpose: str, request: Request, current_user: User | None = None) -> dict[str, Any]:
    clean_target = target.strip().lower()
    ip = get_client_ip(request)

    # Rate limit: 3 per 10 min per target with 60 s resend cooldown
    rate_limiter.check(
        key=f"otp_req:{clean_target}",
        max_requests=3,
        window_seconds=600,
        cooldown_seconds=60
    )

    # Validate purpose restrictions
    if purpose in ("VERIFY_PHONE", "VERIFY_EMAIL") and not current_user:
        raise UnauthorizedError("Authentication required for contact verification", code="AUTH_REQUIRED")
    if current_user and current_user.role != Role.CUSTOMER:
        raise UnauthorizedError("Customer authentication is required", code="AUTH_REQUIRED")
    if current_user and purpose == "VERIFY_PHONE":
        current_user.pending_phone = clean_target
    elif current_user and purpose == "VERIFY_EMAIL":
        current_user.pending_email = clean_target

    existing_user = db.scalar(select(User).where(or_(User.email == clean_target, User.phone == clean_target)))

    # Invalidate existing unused OTPs for this target & purpose
    db.query(OtpCode).filter(
        OtpCode.recipient == clean_target,
        OtpCode.purpose == purpose,
        OtpCode.is_used == False
    ).update({"is_used": True})

    raw_code, code_hash = generate_otp_code()
    otp = OtpCode(
        user_id=current_user.id if current_user else (existing_user.id if existing_user else None),
        recipient=clean_target,
        code_hash=code_hash,
        channel=channel.upper(),
        purpose=purpose,
        expires_at=utc_now() + timedelta(minutes=5),
        attempts=0,
    )
    db.add(otp)
    db.flush()

    notifier.send_notification(
        db=db,
        channel=channel.upper(),
        destination=clean_target,
        subject=f"Your Haven Stays Passcode: {raw_code}",
        body=f"Your Haven Stays security passcode is: {raw_code}. It expires in 5 minutes. Do not share it with anyone.",
    )
    db.commit()

    return {"message": f"Verification passcode dispatched via {channel.upper()}"}

def verify_otp_flow(
    db: Session,
    target: str,
    code: str,
    purpose: str,
    response: Response,
    request: Request,
    current_user: User | None = None,
) -> tuple[str, int, User]:
    now = utc_now()
    clean_target = target.strip().lower()
    ip = get_client_ip(request)

    otp = db.scalar(
        select(OtpCode).where(
            OtpCode.recipient == clean_target,
            OtpCode.purpose == purpose,
            OtpCode.is_used == False,
        ).order_by(OtpCode.created_at.desc())
    )

    if not otp or (ensure_utc(otp.expires_at) or now) < now:
        raise UnauthorizedError("Passcode has expired or does not exist", code="INVALID_OTP")

    if not hmac.compare_digest(hash_token(code), otp.code_hash):
        otp.attempts += 1
        if otp.attempts >= 3:
            otp.is_used = True
        db.commit()
        raise UnauthorizedError("Incorrect passcode. Attempts remaining: " + str(max(0, 3 - otp.attempts)), code="INVALID_OTP")

    otp.is_used = True

    if purpose == "LOGIN":
        user = db.scalar(select(User).where(or_(User.email == clean_target, User.phone == clean_target)))
        if user and user.role != Role.CUSTOMER:
            raise UnauthorizedError("Invalid passcode", code="INVALID_OTP")
        if not user:
            # Create a lightweight active customer account.
            is_email = "@" in clean_target
            user = User(
                email=clean_target if is_email else None,
                phone=None if is_email else clean_target,
                username="guest_" + secrets.token_hex(4),
                password_hash=hash_password(secrets.token_urlsafe(32)),
                full_name="Guest " + secrets.token_hex(2).upper(),
                role=Role.CUSTOMER,
                status="ACTIVE",
                email_verified_at=now if is_email else None,
                phone_verified_at=now if not is_email else None,
            )
            db.add(user)
            db.flush()
            write_audit_log(db, action="CUSTOMER_REGISTERED_OTP", actor_user_id=user.id, target_user_id=user.id, ip=ip)
        else:
            if "@" in clean_target:
                user.email_verified_at = now
            else:
                user.phone_verified_at = now

        access_token, _, exp, _ = create_user_session(db, user, "customer", response, ip=ip, user_agent=request.headers.get("user-agent"))
        write_audit_log(db, action="CUSTOMER_LOGIN_OTP", actor_user_id=user.id, target_user_id=user.id, ip=ip)
        db.commit()
        return access_token, exp, user

    elif purpose == "VERIFY_PHONE":
        if not current_user or otp.user_id != current_user.id or current_user.pending_phone != clean_target:
            raise UnauthorizedError("Auth required", code="AUTH_REQUIRED")
        current_user.phone = clean_target
        current_user.phone_verified_at = now
        current_user.pending_phone = None
        db.commit()
        return "", 0, current_user

    elif purpose == "VERIFY_EMAIL":
        if not current_user or otp.user_id != current_user.id or current_user.pending_email != clean_target:
            raise UnauthorizedError("Auth required", code="AUTH_REQUIRED")
        current_user.email = clean_target
        current_user.email_verified_at = now
        current_user.pending_email = None
        db.commit()
        return "", 0, current_user

    raise ValidationError("Unknown OTP purpose")

# ==========================================
# 4. CUSTOMER MAGIC LINK
# ==========================================

def request_magic_link_flow(db: Session, email: str, response: Response, request: Request) -> dict[str, Any]:
    ip = get_client_ip(request)
    clean_email = email.strip().lower()

    # Rate limit: 3 per 10 min per email
    rate_limiter.check(key=f"ml_req:{clean_email}", max_requests=3, window_seconds=600)

    user = db.scalar(select(User).where(User.email == clean_email))

    if user and user.role == Role.CUSTOMER and user.status == "ACTIVE":
        # Invalidate old magic links
        db.query(VerificationToken).filter(
            VerificationToken.user_id == user.id,
            VerificationToken.token_type == "MAGIC_LINK"
        ).update({"is_used": True})

        raw_token, token_hash = generate_one_time_token()
        ml_nonce = secrets.token_hex(24)
        nonce_hash = hash_token(ml_nonce)

        ver = VerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type="MAGIC_LINK",
            expires_at=utc_now() + timedelta(minutes=10),
            metadata_json=json.dumps({"nonce_hash": nonce_hash}),
        )
        db.add(ver)
        db.flush()

        # Bind to requesting browser via short-lived cookie
        response.set_cookie(
            key="ml_nonce",
            value=ml_nonce,
            max_age=600,
            path="/",
            httponly=True,
            samesite="lax",
        )

        magic_url = f"{settings.PUBLIC_WEBSITE_URL}/magic-link/verify?token={raw_token}"
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=clean_email,
            subject="Your Haven Stays Magic Sign-In Link",
            body=f"Click here to sign in to Haven Stays: {magic_url}",
        )
        db.commit()
    else:
        dummy_verify_password()

    return {"message": "If a customer account is registered for this address, a magic sign-in link has been sent."}

def verify_magic_link_flow(db: Session, token: str, request: Request, response: Response) -> tuple[str, int, User]:
    now = utc_now()
    token_hash = hash_token(token)
    ml_nonce = request.cookies.get("ml_nonce")

    ver = db.scalar(
        select(VerificationToken).where(
            VerificationToken.token_hash == token_hash,
            VerificationToken.token_type == "MAGIC_LINK",
            VerificationToken.is_used == False,
        )
    )

    if not ver or (ensure_utc(ver.expires_at) or now) < now:
        raise UnauthorizedError("Invalid or expired magic link", code="INVALID_MAGIC_LINK")

    # Check browser nonce binding
    if not ml_nonce:
        raise UnauthorizedError("Magic link browser verification failed. Please open the link in the same browser that requested it.", code="NONCE_MISMATCH")

    meta = json.loads(ver.metadata_json or "{}")
    if not hmac.compare_digest(hash_token(ml_nonce), meta.get("nonce_hash", "")):
        raise UnauthorizedError("Magic link browser verification failed. Nonce mismatch.", code="NONCE_MISMATCH")

    ver.is_used = True
    response.delete_cookie(key="ml_nonce", path="/")

    user = db.get(User, ver.user_id)
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("Customer user is inactive or not found", code="USER_INACTIVE")

    access_token, _, exp, _ = create_user_session(db, user, "customer", response, ip=get_client_ip(request), user_agent=request.headers.get("user-agent"))
    write_audit_log(db, action="MAGIC_LINK_LOGIN", actor_user_id=user.id, target_user_id=user.id, ip=get_client_ip(request))
    db.commit()
    return access_token, exp, user

# ==========================================
# 5. PASSWORD MANAGEMENT & RECOVERY
# ==========================================

def forgot_password_flow(db: Session, identifier: str, ip: str, is_admin: bool = False) -> dict[str, Any]:
    clean_id = identifier.strip().lower()
    # Rate limit: 3/hour per target
    rate_limiter.check(key=f"forgot_pw:{clean_id}", max_requests=3, window_seconds=3600)

    user = db.scalar(select(User).where(or_(User.email == clean_id, User.username == clean_id)))

    if user and user.email:
        # Check audience match
        if is_admin and user.role not in (Role.ADMIN, Role.STAFF):
            dummy_verify_password()
            return {"message": "If an eligible account was found, password recovery instructions have been sent."}

        if not is_admin and user.role != Role.CUSTOMER:
            dummy_verify_password()
            return {"message": "If an eligible account was found, password recovery instructions have been sent."}

        raw_token, token_hash = generate_one_time_token()
        ver = VerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type="PASSWORD_RESET",
            expires_at=utc_now() + timedelta(minutes=15),
        )
        db.add(ver)
        db.flush()

        reset_base = (settings.ADMIN_PANEL_URL if is_admin else settings.PUBLIC_WEBSITE_URL).rstrip("/")
        reset_url = (
            f"{reset_base}/?token={raw_token}&mode=reset"
            if is_admin
            else f"{reset_base}/reset-password?token={raw_token}"
        )
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=user.email,
            subject="Haven Stays - Password Reset Instructions",
            body=f"Click here to reset your Haven password: {reset_url}. This link expires in 15 minutes.",
        )
        db.commit()
    else:
        dummy_verify_password()

    return {"message": "If an eligible account was found, password recovery instructions have been sent."}

def reset_password_flow(db: Session, token: str, new_password: str, request: Request) -> dict[str, Any]:
    now = utc_now()
    try:
        validate_password_strength(new_password)
    except ValueError as e:
        raise ValidationError(str(e)) from e

    token_hash = hash_token(token)
    ver = db.scalar(
        select(VerificationToken).where(
            VerificationToken.token_hash == token_hash,
            VerificationToken.token_type == "PASSWORD_RESET",
            VerificationToken.is_used == False,
        )
    )

    if not ver or (ensure_utc(ver.expires_at) or now) < now:
        raise UnauthorizedError("Invalid or expired password reset link", code="INVALID_TOKEN")

    ver.is_used = True
    user = db.get(User, ver.user_id)
    if not user:
        raise NotFoundError("User not found")

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.failed_login_count = 0
    user.locked_until = None

    # Revoke all sessions!
    revoke_all_user_sessions(db, user.id, reason="PASSWORD_RESET_COMPLETED")

    write_audit_log(
        db,
        action="PASSWORD_RESET_COMPLETED",
        actor_user_id=user.id,
        target_user_id=user.id,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if user.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=user.email,
            subject="Haven Stays - Security Notice: Password changed",
            body="Your Haven Stays password was successfully reset. If you did not make this change, contact support immediately.",
        )

    db.commit()
    return {"message": "Password reset successfully. Please sign in with your new password."}

def activate_invited_account(db: Session, token: str, new_password: str, response: Response, request: Request) -> tuple[str, int, User]:
    now = utc_now()
    try:
        validate_password_strength(new_password)
    except ValueError as e:
        raise ValidationError(str(e)) from e

    token_hash = hash_token(token)
    ver = db.scalar(
        select(VerificationToken).where(
            VerificationToken.token_hash == token_hash,
            VerificationToken.token_type == "ACTIVATION",
            VerificationToken.is_used == False,
        )
    )

    if not ver or (ensure_utc(ver.expires_at) or now) < now:
        raise UnauthorizedError("Invalid or expired invitation token", code="INVALID_TOKEN")

    ver.is_used = True
    user = db.get(User, ver.user_id)
    if not user:
        raise NotFoundError("Invited account not found")

    user.password_hash = hash_password(new_password)
    user.status = "ACTIVE"
    user.email_verified_at = now

    write_audit_log(
        db,
        action="ACCOUNT_ACTIVATED",
        actor_user_id=user.id,
        target_user_id=user.id,
        ip=get_client_ip(request),
    )

    audience = "admin" if user.role in (Role.ADMIN, Role.STAFF) else "customer"
    access_token, _, exp, _ = create_user_session(
        db,
        user,
        audience,
        response,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return access_token, exp, user

def change_password_authenticated(db: Session, user: User, current_pw: str, new_pw: str, request: Request) -> None:
    if not verify_password(current_pw, user.password_hash):
        raise UnauthorizedError("Current password is incorrect", code="INVALID_PASSWORD")

    validate_password_strength(new_pw)
    user.password_hash = hash_password(new_pw)
    user.must_change_password = False

    # Extract current session ID if available from Bearer token
    auth_header = request.headers.get("Authorization", "")
    current_sid = None
    if auth_header.startswith("Bearer "):
        try:
            p = jwt.decode(auth_header[7:], options={"verify_signature": False})
            current_sid = p.get("sid")
        except Exception:
            pass

    # Keeps current session, revokes others
    revoke_all_user_sessions(db, user.id, reason="PASSWORD_CHANGED", except_session_id=current_sid)

    write_audit_log(
        db,
        action="PASSWORD_CHANGED",
        actor_user_id=user.id,
        target_user_id=user.id,
        ip=get_client_ip(request),
    )

    if user.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=user.email,
            subject="Security Notice: Password updated",
            body="Your Haven Stays password was changed. Other active sessions have been signed out.",
        )
    db.commit()

# ==========================================
# 6. MULTI-FACTOR AUTHENTICATION (MFA)
# ==========================================

def verify_mfa_step(
    db: Session,
    mfa_token: str,
    code: str | None,
    recovery_code: str | None,
    response: Response,
    request: Request,
    expected_aud: Literal["customer-mfa", "admin-mfa"],
) -> tuple[str, int, User]:
    # Rate limit: 5 per 5 min per mfaToken
    rate_limiter.check(key=f"mfa_verify:{hash_token(mfa_token)}", max_requests=5, window_seconds=300)

    try:
        payload = decode_access_token(mfa_token, expected_audience=expected_aud)
    except Exception as e:
        raise UnauthorizedError(f"MFA session expired or invalid: {e}", code="MFA_TOKEN_INVALID") from e

    user_id = payload.get("sub")
    user = db.get(User, user_id)
    if not user or user.status != "ACTIVE":
        raise UnauthorizedError("User inactive", code="USER_INACTIVE")

    target_aud: Literal["admin", "customer"] = "admin" if expected_aud == "admin-mfa" else "customer"

    if code:
        if not user.mfa_secret_encrypted:
            raise UnauthorizedError("MFA is not configured on this account", code="MFA_NOT_ENROLLED")
        plain_secret = decrypt_data(user.mfa_secret_encrypted)
        valid, step = verify_totp_code_with_replay(plain_secret, code, last_step=user.last_totp_step)
        if not valid:
            raise UnauthorizedError("Invalid one-time passcode (TOTP) or code already used", code="INVALID_MFA_CODE")
        user.last_totp_step = step
    elif recovery_code:
        clean_rc = recovery_code.strip().upper()
        rc_hash = hash_token(clean_rc)
        rc = db.scalar(
            select(MfaRecoveryCode).where(
                MfaRecoveryCode.user_id == user.id,
                MfaRecoveryCode.code_hash == rc_hash,
                MfaRecoveryCode.is_used == False,
            )
        )
        if not rc:
            raise UnauthorizedError("Invalid or already used recovery code", code="INVALID_RECOVERY_CODE")
        rc.is_used = True
        rc.used_at = utc_now()
    else:
        raise ValidationError("Either 'code' or 'recoveryCode' must be provided")

    access_token, _, exp, _ = create_user_session(db, user, target_aud, response, ip=get_client_ip(request))
    write_audit_log(db, action="MFA_VERIFIED", actor_user_id=user.id, target_user_id=user.id, ip=get_client_ip(request))
    db.commit()
    return access_token, exp, user

def enroll_mfa_flow(user: User) -> dict[str, str]:
    secret = generate_mfa_secret()
    label = user.email or user.username or user.id
    otpauth = get_totp_provisioning_uri(secret, label)
    # Generate clean QR code data URL using SVG
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={quote(otpauth)}"
    return {
        "secret": secret,
        "otpauthUri": otpauth,
        "qrDataUrl": qr_url,
    }

def confirm_mfa_enrollment(db: Session, user: User, secret: str, code: str, request: Request) -> list[str]:
    valid, step = verify_totp_code_with_replay(secret, code)
    if not valid:
        raise UnauthorizedError("Invalid confirmation code", code="INVALID_MFA_CODE")

    user.mfa_enabled = True
    user.mfa_secret_encrypted = encrypt_data(secret)
    user.last_totp_step = step

    # Generate 10 single-use recovery codes
    codes = generate_recovery_codes(10)
    for plain, c_hash in codes:
        db.add(MfaRecoveryCode(user_id=user.id, code_hash=c_hash))

    write_audit_log(db, action="MFA_ENROLLED", actor_user_id=user.id, target_user_id=user.id, ip=get_client_ip(request))
    db.commit()
    return [plain for plain, _ in codes]

def disable_mfa_flow(db: Session, user: User, password: str, code: str, request: Request) -> None:
    if user.role == Role.ADMIN:
        raise ForbiddenError("MFA cannot be disabled for Admin accounts", code="MFA_MANDATORY")

    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Incorrect password", code="INVALID_PASSWORD")

    if user.mfa_secret_encrypted:
        plain_secret = decrypt_data(user.mfa_secret_encrypted)
        valid, _ = verify_totp_code_with_replay(plain_secret, code, last_step=user.last_totp_step)
        if not valid:
            raise UnauthorizedError("Invalid one-time passcode", code="INVALID_MFA_CODE")

    user.mfa_enabled = False
    user.mfa_secret_encrypted = None
    user.last_totp_step = None

    # Invalidate all recovery codes
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user.id).delete()

    # Revoke all sessions on MFA disable
    revoke_all_user_sessions(db, user.id, reason="MFA_DISABLED")

    write_audit_log(db, action="MFA_DISABLED", actor_user_id=user.id, target_user_id=user.id, ip=get_client_ip(request))
    db.commit()

# ==========================================
# 7. ADMIN AUTHENTICATION
# ==========================================

def admin_login_flow(
    db: Session,
    identifier: str,
    password: str,
    response: Response,
    request: Request,
) -> tuple[str, int, User, bool, str | None, bool, str | None, bool, str | None]:
    now = utc_now()
    clean_id = identifier.strip().lower()
    ip = get_client_ip(request)

    user = db.scalar(select(User).where(or_(User.email == clean_id, User.username == clean_id)))
    invalid_err = UnauthorizedError("Invalid credentials", code="INVALID_CREDENTIALS")

    if not user:
        rate_limiter.check(key=f"admin_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        raise invalid_err

    if user.role not in (Role.ADMIN, Role.STAFF):
        rate_limiter.check(key=f"admin_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        raise invalid_err

    if user.status in ("SUSPENDED", "ARCHIVED"):
        rate_limiter.check(key=f"admin_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)
        dummy_verify_password()
        raise invalid_err

    locked_until_utc = ensure_utc(user.locked_until)
    if locked_until_utc and locked_until_utc > now:
        retry_sec = int((locked_until_utc - now).total_seconds()) + 1
        raise AppException(
            status_code=423,
            code="ACCOUNT_LOCKED",
            message=f"Admin account locked. Try again in {max(1, retry_sec // 60)} minutes.",
            headers={"Retry-After": str(retry_sec)}
        )

    rate_limiter.check(key=f"admin_login:{ip}:{clean_id}", max_requests=5, window_seconds=60)

    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= 5:
            multiplier = 2 ** min(user.lockout_count, 6)
            lockout_minutes = min(15 * multiplier, 1440)
            user.lockout_count += 1
            user.locked_until = now + timedelta(minutes=lockout_minutes)
            write_audit_log(
                db,
                action="ADMIN_ACCOUNT_LOCKED",
                target_user_id=user.id,
                details={
                    "reason": "FAILED_PASSWORD_THRESHOLD",
                    "lockout_minutes": lockout_minutes,
                },
                ip=ip,
                user_agent=request.headers.get("user-agent"),
            )
            if user.email:
                notifier.send_notification(
                    db=db,
                    channel="EMAIL",
                    destination=user.email,
                    subject="Security Notice: Account locked",
                    body=(
                        "Your account was locked due to multiple failed login attempts. "
                        f"It will unlock in {lockout_minutes} minutes."
                    ),
                )
        db.commit()
        raise invalid_err

    user.failed_login_count = 0
    user.lockout_count = 0
    user.locked_until = None
    user.last_login_at = now

    # Check 1: Must change password gating
    if user.must_change_password:
        change_token = create_access_token(
            subject=user.id,
            audience="admin-password-change",
            role=user.role,
            expires_delta=timedelta(minutes=15),
        )
        db.commit()
        return "", 0, user, False, None, False, None, True, change_token

    # Check 2: Admin forced MFA enrollment gating
    if user.role == Role.ADMIN and settings.ADMIN_MFA_REQUIRED and not user.mfa_enabled:
        enroll_token = create_access_token(
            subject=user.id,
            audience="admin-enroll",
            role=user.role,
            expires_delta=timedelta(minutes=15),
        )
        db.commit()
        return "", 0, user, False, None, True, enroll_token, False, None

    # Check 3: MFA step
    if user.mfa_enabled:
        mfa_token = create_access_token(
            subject=user.id,
            audience="admin-mfa",
            role=user.role,
            expires_delta=timedelta(minutes=5),
        )
        db.commit()
        return "", 0, user, True, mfa_token, False, None, False, None

    # Full admin session
    access_token, _, exp, _ = create_user_session(db, user, "admin", response, ip=ip, user_agent=request.headers.get("user-agent"))
    write_audit_log(db, action="ADMIN_LOGIN", actor_user_id=user.id, target_user_id=user.id, ip=ip)
    db.commit()
    return access_token, exp, user, False, None, False, None, False, None
