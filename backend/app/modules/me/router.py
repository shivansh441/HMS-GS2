from datetime import timedelta
import hmac
from typing import Any
import jwt
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from app.core.permissions import get_user_permissions
from app.core.rate_limit import get_client_ip
from app.core.scoping import get_allowed_property_ids
from app.core.security import generate_one_time_token, generate_recovery_codes, hash_token, verify_password, verify_totp_code_with_replay
from app.db.models import LinkedIdentity, MfaRecoveryCode, OtpCode, SessionModel, User, VerificationToken
from app.db.session import get_db
from app.modules.auth.deps import extract_bearer_token, get_current_admin_user, get_current_customer
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    CustomerProfileUpdateRequest,
    GenericResponse,
    LinkedIdentityItem,
    MfaConfirmRequest,
    MfaConfirmResponse,
    MfaDisableRequest,
    MfaEnrollResponse,
    MfaRegenerateCodesRequest,
    NextAction,
    OverviewResponse,
    ProfileCompletion,
    SessionItemResponse,
    UserResponse,
)
from app.modules.auth.service import (
    change_password_authenticated,
    confirm_mfa_enrollment,
    disable_mfa_flow,
    enroll_mfa_flow,
    parse_user_agent,
    revoke_all_user_sessions,
    utc_now,
)
from app.modules.bookings_port.service import booking_provider
from app.modules.notifier.service import notifier

me_router = APIRouter(prefix="/me", tags=["Customer Profile & Overview"])
admin_me_router = APIRouter(prefix="/admin/me", tags=["Admin Profile"])

def get_current_session_id(request: Request) -> str | None:
    token = extract_bearer_token(request)
    try:
        p = jwt.decode(token, options={"verify_signature": False})
        return p.get("sid")
    except Exception:
        return None

# ==========================================
# CUSTOMER SELF-SERVICE (/api/v1/me)
# ==========================================

@me_router.get("", response_model=UserResponse, summary="Get current logged-in customer profile")
def get_customer_profile(current_user: User = Depends(get_current_customer)):
    return UserResponse.model_validate(current_user)

@me_router.patch("", response_model=UserResponse, summary="Update customer profile")
def update_customer_profile(
    payload: CustomerProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    if payload.firstName or payload.lastName:
        fn = payload.firstName or (current_user.full_name.split()[0] if current_user.full_name else "")
        ln = payload.lastName or (current_user.full_name.split()[-1] if current_user.full_name else "")
        current_user.full_name = f"{fn} {ln}".strip()

    # Phone change requires OTP verification
    if payload.phone:
        clean_phone = payload.phone.strip()
        if clean_phone != current_user.phone:
            if not payload.phoneOtpCode:
                raise ValidationError("Phone change requires a verified SMS passcode in phoneOtpCode")
            
            otp = db.scalar(
                select(OtpCode).where(
                    OtpCode.recipient == clean_phone,
                    OtpCode.purpose == "VERIFY_PHONE",
                    OtpCode.is_used == False,
                ).order_by(OtpCode.created_at.desc())
            )
            if not otp or otp.expires_at < utc_now() or not hmac.compare_digest(
                hash_token(payload.phoneOtpCode),
                otp.code_hash,
            ):
                raise UnauthorizedError("Invalid or expired phone verification code", code="INVALID_OTP")
            
            otp.is_used = True
            current_user.phone = clean_phone
            current_user.phone_verified_at = utc_now()

    # Email change requires verification of new address, old address is notified
    if payload.email:
        clean_email = payload.email.strip().lower()
        if clean_email != current_user.email:
            existing = db.scalar(select(User).where(User.email == clean_email))
            if existing:
                raise ConflictError("This email address is already in use by another account")
            
            current_user.pending_email = clean_email
            raw_token, token_hash = generate_one_time_token()
            ver = VerificationToken(
                user_id=current_user.id,
                token_hash=token_hash,
                token_type="EMAIL_VERIFY",
                expires_at=utc_now() + timedelta(hours=24),
            )
            db.add(ver)
            db.flush()

            # Notify old address
            if current_user.email:
                notifier.send_notification(
                    db=db,
                    channel="EMAIL",
                    destination=current_user.email,
                    subject="Security Notice: Email change requested",
                    body=f"A request was made to change your Haven Stays email to {clean_email}. If you did not make this request, please contact support immediately.",
                )

            # Send verification link to new address
            verify_url = f"{settings.PUBLIC_WEBSITE_URL}/verify-email?token={raw_token}"
            notifier.send_notification(
                db=db,
                channel="EMAIL",
                destination=clean_email,
                subject="Haven Stays - Confirm your new email address",
                body=f"Please verify your new email address by clicking here: {verify_url}",
            )

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@me_router.get(
    "/overview",
    response_model=OverviewResponse,
    summary="Get customer account overview, booking stage, and profile checklist",
)
def get_customer_overview(
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    stage = booking_provider.get_guest_stage(db, current_user.id)
    bookings_count = booking_provider.get_guest_bookings_count(db, current_user.id)

    missing: list[str] = []
    percent = 40

    if not current_user.email_verified_at:
        missing.append("EMAIL_VERIFIED")
    else:
        percent += 20

    if not current_user.phone_verified_at:
        missing.append("PHONE_VERIFIED")
    else:
        percent += 20

    if not current_user.id_document_number_encrypted:
        missing.append("ID_DOCUMENT")
    else:
        percent += 20

    next_actions: list[NextAction] = []
    if "EMAIL_VERIFIED" in missing:
        next_actions.append(NextAction(
            action="VERIFY_EMAIL",
            title="Verify your email address",
            description="Confirm your email to receive direct reservation receipts and keycard codes.",
        ))
    if "PHONE_VERIFIED" in missing:
        next_actions.append(NextAction(
            action="VERIFY_PHONE",
            title="Add a mobile phone number",
            description="Receive SMS arrival updates and urgent door access alerts.",
        ))
    if "ID_DOCUMENT" in missing:
        next_actions.append(NextAction(
            action="UPLOAD_ID",
            title="Complete identity verification",
            description="Upload an ID document (passport or driver's license) for contactless self-check-in.",
        ))

    if stage.value == "REGISTERED_NO_BOOKING":
        next_actions.append(NextAction(
            action="EXPLORE_PROPERTIES",
            title="Browse boutique stays & residences",
            description="Explore short-term suites and long-term co-living options across our locations.",
        ))

    return OverviewResponse(
        stage=stage.value,
        bookingsCount=bookings_count,
        profileCompletion=ProfileCompletion(
            percent=min(percent, 100),
            missing=missing,
        ),
        nextActions=next_actions,
    )

# Sessions
@me_router.get("/sessions", response_model=list[SessionItemResponse], summary="List active customer sessions")
def list_customer_sessions(
    request: Request,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    current_sid = get_current_session_id(request)
    now = utc_now()
    sessions = db.scalars(
        select(SessionModel).where(
            SessionModel.user_id == current_user.id,
            SessionModel.is_revoked == False,
            SessionModel.expires_at > now,
        ).order_by(SessionModel.last_active_at.desc())
    ).all()

    result = []
    for s in sessions:
        browser, os_name = parse_user_agent(s.user_agent)
        result.append(SessionItemResponse(
            id=s.id,
            ip=s.ip,
            browser=browser,
            os=os_name,
            userAgent=s.user_agent,
            createdAt=s.created_at,
            lastActiveAt=s.last_active_at,
            current=(s.id == current_sid),
        ))
    return result

@me_router.delete("/sessions/{session_id}", response_model=GenericResponse, summary="Revoke a specific session")
def delete_customer_session(
    session_id: str,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    session = db.scalar(select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == current_user.id))
    if not session:
        raise NotFoundError("Session not found")
    session.is_revoked = True
    session.revoked_reason = "USER_TERMINATED"
    db.commit()
    return GenericResponse(message="Session revoked")

@me_router.delete("/sessions", response_model=GenericResponse, summary="Revoke all other customer sessions")
def delete_all_other_customer_sessions(
    request: Request,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    current_sid = get_current_session_id(request)
    revoke_all_user_sessions(db, current_user.id, reason="REVOKE_ALL_OTHERS", except_session_id=current_sid)
    return GenericResponse(message="All other sessions revoked")

# MFA
@me_router.post("/mfa/enroll", response_model=MfaEnrollResponse, summary="Enroll MFA (Generate secret & QR)")
def customer_mfa_enroll(current_user: User = Depends(get_current_customer)):
    data = enroll_mfa_flow(current_user)
    return MfaEnrollResponse(**data)

@me_router.post("/mfa/confirm", response_model=MfaConfirmResponse, summary="Confirm MFA enrollment")
def customer_mfa_confirm(
    payload: MfaConfirmRequest,
    secret: str,
    request: Request,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    codes = confirm_mfa_enrollment(db, current_user, secret, payload.code, request)
    return MfaConfirmResponse(recoveryCodes=codes)

@me_router.post("/mfa/disable", response_model=GenericResponse, summary="Disable MFA")
def customer_mfa_disable(
    payload: MfaDisableRequest,
    request: Request,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    disable_mfa_flow(db, current_user, payload.password, payload.code, request)
    return GenericResponse(message="MFA has been disabled. All sessions have been logged out.")

@me_router.post("/mfa/recovery-codes/regenerate", response_model=MfaConfirmResponse, summary="Regenerate MFA recovery codes")
def customer_regenerate_recovery_codes(
    payload: MfaRegenerateCodesRequest,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    if not current_user.mfa_enabled or not current_user.mfa_secret_encrypted:
        raise ValidationError("MFA is not enabled on this account")
    if not verify_password(payload.password, current_user.password_hash):
        raise UnauthorizedError("Incorrect password", code="INVALID_PASSWORD")
    
    # Invalidate existing
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == current_user.id).delete()
    codes = generate_recovery_codes(10)
    for plain, c_hash in codes:
        db.add(MfaRecoveryCode(user_id=current_user.id, code_hash=c_hash))
    db.commit()
    return MfaConfirmResponse(recoveryCodes=[plain for plain, _ in codes])

# Linked Identities
@me_router.get("/linked-identities", response_model=list[LinkedIdentityItem], summary="List linked OAuth identities")
def list_linked_identities(
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    links = db.scalars(select(LinkedIdentity).where(LinkedIdentity.user_id == current_user.id)).all()
    return [
        LinkedIdentityItem(
            id=l.id,
            provider=l.provider,
            providerUserId=l.provider_user_id,
            email=l.email,
            createdAt=l.created_at,
        )
        for l in links
    ]

@me_router.delete("/linked-identities/{identity_id}", response_model=GenericResponse, summary="Unlink an OAuth identity")
def delete_linked_identity(
    identity_id: str,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    links = db.scalars(select(LinkedIdentity).where(LinkedIdentity.user_id == current_user.id)).all()
    target = next((l for l in links if l.id == identity_id), None)
    if not target:
        raise NotFoundError("Linked identity not found")

    # Block if leaves account with no login method
    has_usable_password = len(current_user.password_hash) > 20 and "$" in current_user.password_hash
    if len(links) <= 1 and not has_usable_password:
        raise ConflictError("Cannot remove the only login method on your account")

    db.delete(target)
    db.commit()
    return GenericResponse(message="Identity unlinked")

# ==========================================
# ADMIN SELF-SERVICE (/api/v1/admin/me)
# ==========================================

@admin_me_router.get("", summary="Get current logged-in admin user and effective permissions")
def get_admin_me(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    permissions = get_user_permissions(admin_user.role)
    allowed_props = get_allowed_property_ids(db, admin_user)

    return {
        "user": UserResponse.model_validate(admin_user),
        "permissions": sorted([p.value for p in permissions]),
        "allowedPropertyIds": sorted(list(allowed_props)),
        "isAdmin": admin_user.role == "ADMIN",
    }

@admin_me_router.get("/sessions", response_model=list[SessionItemResponse], summary="List active admin sessions")
def list_admin_sessions(
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    current_sid = get_current_session_id(request)
    now = utc_now()
    sessions = db.scalars(
        select(SessionModel).where(
            SessionModel.user_id == admin_user.id,
            SessionModel.is_revoked == False,
            SessionModel.expires_at > now,
        ).order_by(SessionModel.last_active_at.desc())
    ).all()

    result = []
    for s in sessions:
        browser, os_name = parse_user_agent(s.user_agent)
        result.append(SessionItemResponse(
            id=s.id,
            ip=s.ip,
            browser=browser,
            os=os_name,
            userAgent=s.user_agent,
            createdAt=s.created_at,
            lastActiveAt=s.last_active_at,
            current=(s.id == current_sid),
        ))
    return result

@admin_me_router.delete("/sessions/{session_id}", response_model=GenericResponse, summary="Revoke a specific admin session")
def delete_admin_session(
    session_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    session = db.scalar(select(SessionModel).where(SessionModel.id == session_id, SessionModel.user_id == admin_user.id))
    if not session:
        raise NotFoundError("Session not found")
    session.is_revoked = True
    session.revoked_reason = "ADMIN_TERMINATED"
    db.commit()
    return GenericResponse(message="Admin session revoked")

@admin_me_router.delete("/sessions", response_model=GenericResponse, summary="Revoke all other admin sessions")
def delete_all_other_admin_sessions(
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    current_sid = get_current_session_id(request)
    revoke_all_user_sessions(db, admin_user.id, reason="REVOKE_ALL_OTHER_ADMIN", except_session_id=current_sid)
    return GenericResponse(message="All other admin sessions revoked")

@admin_me_router.post("/change-password", response_model=GenericResponse, summary="Change admin password")
def admin_me_change_password(
    payload: ChangePasswordRequest,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    change_password_authenticated(db, admin_user, payload.currentPassword, payload.newPassword, request)
    return GenericResponse(message="Password successfully changed")

@admin_me_router.post("/mfa/enroll", response_model=MfaEnrollResponse, summary="Start admin MFA enrollment")
def admin_self_mfa_enroll(admin_user: User = Depends(get_current_admin_user)):
    data = enroll_mfa_flow(admin_user)
    return MfaEnrollResponse(**data)

@admin_me_router.post("/mfa/confirm", response_model=MfaConfirmResponse, summary="Confirm admin MFA enrollment")
def admin_self_mfa_confirm(
    payload: MfaConfirmRequest,
    secret: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    codes = confirm_mfa_enrollment(db, admin_user, secret, payload.code, request)
    return MfaConfirmResponse(recoveryCodes=codes)

@admin_me_router.post("/mfa/disable", response_model=GenericResponse, summary="Disable admin MFA")
def admin_self_mfa_disable(
    payload: MfaDisableRequest,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    disable_mfa_flow(db, admin_user, payload.password, payload.code, request)
    return GenericResponse(message="MFA disabled")
