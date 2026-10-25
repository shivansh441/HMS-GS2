from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BadRequestError, ForbiddenError, NotFoundError
from app.core.permissions import AccountType, UserStatus
from app.core.rate_limit import get_client_ip
from app.core.scoping import ScopedQuery
from app.core.security import generate_one_time_token
from app.db.models import MfaRecoveryCode, SessionModel, User, VerificationToken
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.auth.schemas import UserResponse
from app.modules.auth.service import revoke_all_user_sessions
from app.modules.notifier.service import notifier

users_router = APIRouter(prefix="/admin/users", tags=["Admin Users"])


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    limit: int
    offset: int


class ReasonRequest(BaseModel):
    reason: Optional[str] = None


class ActionSuccessResponse(BaseModel):
    message: str
    targetUserId: str


def _get_target_user_for_mutation(db: Session, admin_user: User, target_user_id: str) -> User:
    """Enforces strict role hierarchy, existence, and property isolation for mutations."""
    target = db.scalar(select(User).where(User.id == target_user_id))
    if not target:
        raise NotFoundError("User not found")

    if admin_user.account_type not in (AccountType.SUPER_ADMIN, AccountType.MANAGER):
        raise ForbiddenError("Staff members cannot perform administrative user mutations")

    if admin_user.account_type == AccountType.MANAGER:
        if target.account_type in (AccountType.MANAGER, AccountType.SUPER_ADMIN):
            raise ForbiddenError("Managers cannot modify other managers or super admins")

    if target.account_type == AccountType.SUPER_ADMIN and admin_user.account_type != AccountType.SUPER_ADMIN:
        raise ForbiddenError("Super Admin accounts can only be modified by Super Admins")

    # Verify target is within caller's property scope (returns 404 for out-of-scope)
    return ScopedQuery.get_scoped_user(db, admin_user, target_user_id)


@users_router.get(
    "",
    response_model=UserListResponse,
    summary="List users within authorized property scope with segment filters",
)
def list_users(
    account_type: str | None = Query(None, description="Filter by account type"),
    segment: str | None = Query(None, description="Optional segment filter (e.g. registered_no_booking)"),
    search: str | None = Query(None, description="Search by name, email, or username"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin_user: User = Depends(get_current_admin_user),
    effective_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    users, total = ScopedQuery.list_scoped_users(
        db=db,
        current_user=admin_user,
        effective_scope=effective_scope,
        account_type_filter=account_type,
        segment_filter=segment,
        search=search,
        limit=limit,
        offset=offset,
    )
    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@users_router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user details strictly scoped by property (out-of-scope returns 404)",
)
def get_user_detail(
    user_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    user = ScopedQuery.get_scoped_user(db, admin_user, user_id)
    return UserResponse.model_validate(user)


@users_router.post(
    "/{user_id}/force-logout",
    response_model=ActionSuccessResponse,
    summary="Force logout user by revoking all their active sessions",
)
def force_logout_user(
    user_id: str,
    request: Request,
    body: ReasonRequest = ReasonRequest(),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    revoke_all_user_sessions(db, target.id, reason="ADMIN_FORCE_LOGOUT")

    write_audit_log(
        db,
        action="FORCE_LOGOUT",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={"reason": body.reason or "Administrative action"},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Security Notice: Active Sessions Terminated",
            body="An administrator has terminated all active sessions for your account.",
            metadata={"reason": body.reason},
        )
    db.commit()

    return ActionSuccessResponse(message="All sessions revoked successfully", targetUserId=target.id)


@users_router.post(
    "/{user_id}/reset-mfa",
    response_model=ActionSuccessResponse,
    summary="Reset MFA credentials for a user and revoke their sessions",
)
def reset_user_mfa(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    target.mfa_enabled = False
    target.mfa_secret_encrypted = None
    target.last_totp_step = None

    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == target.id).delete()
    revoke_all_user_sessions(db, target.id, reason="MFA_RESET_BY_ADMIN")

    write_audit_log(
        db,
        action="MFA_RESET",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={"reset_by": admin_user.id},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Security Notice: Two-Factor Authentication Reset",
            body="Two-factor authentication has been reset on your account by an administrator. Please configure MFA on your next sign-in.",
        )
    db.commit()

    return ActionSuccessResponse(message="User MFA has been reset", targetUserId=target.id)


@users_router.post(
    "/{user_id}/suspend",
    response_model=ActionSuccessResponse,
    summary="Suspend a user account and terminate all active sessions",
)
def suspend_user(
    user_id: str,
    request: Request,
    body: ReasonRequest = ReasonRequest(),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    target.status = UserStatus.SUSPENDED
    revoke_all_user_sessions(db, target.id, reason="USER_SUSPENDED")

    write_audit_log(
        db,
        action="USER_SUSPENDED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={"reason": body.reason or "Administrative suspension"},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Account Suspended",
            body=f"Your account has been suspended by an administrator. Reason: {body.reason or 'Administrative action'}.",
        )
    db.commit()

    return ActionSuccessResponse(message="User account suspended", targetUserId=target.id)


@users_router.post(
    "/{user_id}/reactivate",
    response_model=ActionSuccessResponse,
    summary="Reactivate a suspended user account",
)
def reactivate_user(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    target.status = UserStatus.ACTIVE

    write_audit_log(
        db,
        action="USER_REACTIVATED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Account Reactivated",
            body="Your Haven Stays account has been reactivated. You may now sign in.",
        )
    db.commit()

    return ActionSuccessResponse(message="User account reactivated", targetUserId=target.id)


@users_router.post(
    "/{user_id}/resend-invite",
    response_model=ActionSuccessResponse,
    summary="Resend activation invite for pending activation users",
)
def resend_user_invite(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    if target.status != UserStatus.PENDING_ACTIVATION:
        raise BadRequestError("Only pending activation accounts can be resent invitations", code="INVALID_STATUS")

    # Invalidate older tokens
    db.query(VerificationToken).filter(
        VerificationToken.user_id == target.id,
        VerificationToken.token_type.in_(["ACTIVATION", "EMAIL_VERIFY"]),
    ).update({"is_used": True})

    raw_token, token_hash = generate_one_time_token()
    token = VerificationToken(
        user_id=target.id,
        token_hash=token_hash,
        token_type="ACTIVATION",
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(token)
    db.flush()

    write_audit_log(
        db,
        action="INVITE_RESENT",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        activation_url = f"{settings.PUBLIC_WEBSITE_URL}/activate?token={raw_token}"
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Invitation to Haven Stays",
            body=f"You have been invited to Haven Stays. Complete your activation here: {activation_url}",
        )
    db.commit()

    return ActionSuccessResponse(message="Activation invitation resent", targetUserId=target.id)
