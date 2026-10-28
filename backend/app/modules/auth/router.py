from typing import Annotated
from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.permissions import Role
from app.core.rate_limit import get_client_ip
from app.core.security import decode_access_token, hash_password, validate_password_strength
from app.db.models import User
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import (
    get_admin_enrollment_user,
    get_current_admin_user,
    get_current_customer,
    get_optional_current_customer,
)
from app.modules.auth.oauth import handle_oauth_callback, render_mock_consent_page, start_oauth_flow
from app.modules.auth.schemas import (
    ActivateRequest,
    AdminForcedPasswordChangeRequest,
    AdminLoginRequest,
    AuthSuccessResponse,
    ChangePasswordRequest,
    CustomerLoginRequest,
    CustomerRegisterRequest,
    ForgotPasswordRequest,
    GenericResponse,
    MagicLinkRequest,
    MagicLinkVerifyRequest,
    MfaConfirmRequest,
    MfaConfirmResponse,
    MfaEnrollResponse,
    MfaVerifyRequest,
    OtpRequestPayload,
    OtpVerifyPayload,
    ResendVerificationRequest,
    ResetPasswordRequest,
    UserResponse,
    VerifyEmailRequest,
)
from app.modules.auth.service import (
    activate_invited_account,
    admin_login_flow,
    change_password_authenticated,
    confirm_mfa_enrollment,
    create_user_session,
    customer_login_flow,
    enroll_mfa_flow,
    forgot_password_flow,
    register_customer_flow,
    request_magic_link_flow,
    request_otp_flow,
    resend_verification_email,
    reset_password_flow,
    revoke_all_user_sessions,
    revoke_session,
    rotate_refresh_token,
    verify_email_token,
    verify_magic_link_flow,
    verify_mfa_step,
    verify_otp_flow,
)

auth_router = APIRouter(prefix="/auth", tags=["Customer Auth"])
admin_auth_router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])

# ==========================================
# CUSTOMER AUTH
# ==========================================

@auth_router.post(
    "/register",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Register a new customer account",
)
def register(
    request: Request,
    payload: CustomerRegisterRequest,
    db: Session = Depends(get_db),
):
    ip = get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    res = register_customer_flow(
        db=db,
        email=payload.email,
        password=payload.password,
        first_name=payload.firstName,
        last_name=payload.lastName,
        phone=payload.phone,
        ip=ip,
        user_agent=user_agent,
    )
    return res

@auth_router.post(
    "/verify-email",
    response_model=AuthSuccessResponse,
    summary="Verify email token and sign in",
)
def verify_email(
    request: Request,
    response: Response,
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    access_token, exp, user = verify_email_token(db, payload.token, response, request)
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/resend-verification",
    response_model=GenericResponse,
    summary="Resend account activation email",
)
def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    ip = get_client_ip(request)
    target_email = payload.email or payload.identifier or ""
    res = resend_verification_email(db, target_email, ip)
    return GenericResponse(message=res["message"])

@auth_router.post(
    "/login",
    response_model=AuthSuccessResponse,
    summary="Customer sign in",
)
def customer_login(
    request: Request,
    response: Response,
    payload: CustomerLoginRequest,
    db: Session = Depends(get_db),
):
    ident = payload.identifier or payload.email or ""
    access_token, exp, user, mfa_req, mfa_tok = customer_login_flow(
        db=db,
        identifier=ident,
        password=payload.password,
        remember=payload.remember,
        response=response,
        request=request,
    )

    if mfa_req:
        return AuthSuccessResponse(
            accessToken="",
            expiresIn=0,
            user=None,
            mfaRequired=True,
            requiresMfa=True,
            mfaToken=mfa_tok,
            mfaChallengeToken=mfa_tok,
        )

    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/otp/request",
    response_model=GenericResponse,
    summary="Request a 6-digit OTP passcode via SMS or Email",
)
def request_otp(
    request: Request,
    payload: OtpRequestPayload,
    current_user: User | None = Depends(get_optional_current_customer),
    db: Session = Depends(get_db),
):
    res = request_otp_flow(
        db,
        payload.target,
        payload.channel,
        payload.purpose,
        request,
        current_user=current_user,
    )
    return GenericResponse(message=res["message"])

@auth_router.post(
    "/otp/verify",
    response_model=AuthSuccessResponse,
    summary="Verify 6-digit OTP passcode",
)
def verify_otp(
    request: Request,
    response: Response,
    payload: OtpVerifyPayload,
    current_user: User | None = Depends(get_optional_current_customer),
    db: Session = Depends(get_db),
):
    access_token, exp, user = verify_otp_flow(
        db,
        payload.target,
        payload.code,
        payload.purpose,
        response,
        request,
        current_user=current_user,
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/magic-link/request",
    response_model=GenericResponse,
    summary="Request magic sign-in link (Residents only)",
)
def request_magic_link(
    request: Request,
    response: Response,
    payload: MagicLinkRequest,
    db: Session = Depends(get_db),
):
    res = request_magic_link_flow(db, payload.email, response, request)
    return GenericResponse(message=res["message"])

@auth_router.post(
    "/magic-link/verify",
    response_model=AuthSuccessResponse,
    summary="Verify magic sign-in link",
)
def verify_magic_link(
    request: Request,
    response: Response,
    payload: MagicLinkVerifyRequest,
    db: Session = Depends(get_db),
):
    access_token, exp, user = verify_magic_link_flow(db, payload.token, request, response)
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/oauth/{provider}/start",
    summary="Start OAuth sign-in flow (Google or Apple)",
)
def oauth_start(provider: str):
    return start_oauth_flow(provider)

@auth_router.get(
    "/oauth/{provider}/mock-consent",
    summary="Local development mock OAuth consent UI",
)
def oauth_mock_consent(provider: str, state: str):
    return render_mock_consent_page(provider, state)

@auth_router.get(
    "/oauth/{provider}/callback",
    summary="OAuth provider redirect callback",
)
def oauth_callback(
    provider: str,
    request: Request,
    response: Response,
    state: str = "",
    mock_user: str | None = None,
    code: str | None = None,
    db: Session = Depends(get_db),
):
    return handle_oauth_callback(db, provider, state, mock_user, code, response, request)

@auth_router.post(
    "/refresh",
    response_model=AuthSuccessResponse,
    summary="Rotate customer refresh token and return fresh access token",
)
def customer_refresh(
    request: Request,
    response: Response,
    hs_cust_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    if not hs_cust_rt:
        raise UnauthorizedError("Missing customer refresh cookie", code="AUTH_REQUIRED")
        
    access_token, user = rotate_refresh_token(
        db=db,
        raw_refresh_token=hs_cust_rt,
        audience="customer",
        request=request,
        response=response,
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=15 * 60,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Customer logout (Current session)",
)
def customer_logout(
    request: Request,
    response: Response,
    hs_cust_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    revoke_session(db, hs_cust_rt, "customer", request, response)
    return {"message": "Successfully logged out"}

@auth_router.post(
    "/logout-all",
    status_code=status.HTTP_200_OK,
    summary="Revoke all sessions for current user",
)
def customer_logout_all(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_customer),
    hs_cust_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    revoke_session(db, hs_cust_rt, "customer", request, response)
    revoke_all_user_sessions(db, current_user.id, reason="USER_LOGOUT_ALL")
    return {"message": "All sessions revoked"}

@auth_router.post(
    "/forgot-password",
    response_model=GenericResponse,
    summary="Request password reset email",
)
def customer_forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    ip = get_client_ip(request)
    res = forgot_password_flow(db, payload.identifier, ip, is_admin=False)
    return GenericResponse(message=res["message"])

@auth_router.post(
    "/reset-password",
    response_model=GenericResponse,
    summary="Reset account password with one-time token",
)
def customer_reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    res = reset_password_flow(db, payload.token, payload.newPassword, request)
    return GenericResponse(message=res["message"])

@auth_router.post(
    "/activate",
    response_model=AuthSuccessResponse,
    summary="Claim an invitation token and set initial password",
)
def customer_activate(
    request: Request,
    response: Response,
    payload: ActivateRequest,
    db: Session = Depends(get_db),
):
    access_token, exp, user = activate_invited_account(db, payload.token, payload.newPassword, response, request)
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/change-password",
    response_model=GenericResponse,
    summary="Change password (Authenticated)",
)
def customer_change_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    change_password_authenticated(db, current_user, payload.currentPassword, payload.newPassword, request)
    return GenericResponse(message="Password successfully changed")

@auth_router.post(
    "/mfa/verify",
    response_model=AuthSuccessResponse,
    summary="Verify customer MFA passcode or recovery code",
)
def customer_mfa_verify(
    request: Request,
    response: Response,
    payload: MfaVerifyRequest,
    db: Session = Depends(get_db),
):
    access_token, exp, user = verify_mfa_step(
        db, payload.mfaToken, payload.code, payload.recoveryCode, response, request, "customer-mfa"
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

# ==========================================
# ADMIN AUTH
# ==========================================

@admin_auth_router.post(
    "/login",
    response_model=AuthSuccessResponse,
    summary="Admin / Staff sign in with MFA and change-password gating",
)
def admin_login(
    request: Request,
    response: Response,
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
):
    access_token, exp, user, mfa_req, mfa_tok, enroll_req, enroll_tok, pw_req, pw_tok = admin_login_flow(
        db, payload.identifier, payload.password, response, request
    )

    if pw_req:
        return AuthSuccessResponse(
            accessToken="",
            expiresIn=0,
            user=UserResponse.model_validate(user),
            passwordChangeRequired=True,
            changeToken=pw_tok,
        )

    if enroll_req:
        return AuthSuccessResponse(
            accessToken="",
            expiresIn=0,
            user=UserResponse.model_validate(user),
            mfaEnrollmentRequired=True,
            enrollToken=enroll_tok,
        )

    if mfa_req:
        return AuthSuccessResponse(
            accessToken="",
            expiresIn=0,
            user=UserResponse.model_validate(user),
            mfaRequired=True,
            requiresMfa=True,
            mfaToken=mfa_tok,
            mfaChallengeToken=mfa_tok,
        )

    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@admin_auth_router.post(
    "/mfa/verify",
    response_model=AuthSuccessResponse,
    summary="Verify admin MFA code or recovery code",
)
def admin_mfa_verify(
    request: Request,
    response: Response,
    payload: MfaVerifyRequest,
    db: Session = Depends(get_db),
):
    access_token, exp, user = verify_mfa_step(
        db, payload.mfaToken, payload.code, payload.recoveryCode, response, request, "admin-mfa"
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=exp,
        user=UserResponse.model_validate(user),
    )

@admin_auth_router.post(
    "/mfa/enroll",
    response_model=MfaEnrollResponse,
    summary="Start forced or voluntary admin MFA enrollment",
)
def admin_mfa_enroll(
    current_admin: User = Depends(get_admin_enrollment_user),
):
    if current_admin.mfa_enabled:
        raise ForbiddenError("MFA is already enrolled", code="MFA_ALREADY_ENROLLED")
    data = enroll_mfa_flow(current_admin)
    return MfaEnrollResponse(**data)

@admin_auth_router.post(
    "/mfa/confirm",
    response_model=MfaConfirmResponse,
    summary="Confirm admin MFA enrollment and receive recovery codes",
)
def admin_mfa_confirm(
    request: Request,
    payload: MfaConfirmRequest,
    secret: str,
    current_admin: User = Depends(get_admin_enrollment_user),
    db: Session = Depends(get_db),
):
    recovery_codes = confirm_mfa_enrollment(db, current_admin, secret, payload.code, request)
    return MfaConfirmResponse(recoveryCodes=recovery_codes)

@admin_auth_router.post(
    "/change-password",
    response_model=AuthSuccessResponse,
    summary="Complete forced admin password change",
)
def admin_forced_change_password(
    request: Request,
    response: Response,
    payload: AdminForcedPasswordChangeRequest,
    db: Session = Depends(get_db),
):
    # Verify changeToken (15 min, aud=admin-password-change)
    token_payload = decode_access_token(payload.changeToken, expected_audience="admin-password-change")
    user_id = token_payload.get("sub")
    user = db.get(User, user_id)
    if (
        not user
        or user.role not in (Role.ADMIN, Role.STAFF)
        or user.status != "ACTIVE"
        or not user.must_change_password
    ):
        raise NotFoundError("Admin user not found")

    validate_password_strength(payload.newPassword)
    user.password_hash = hash_password(payload.newPassword)
    user.must_change_password = False

    access_token, _, exp, _ = create_user_session(db, user, "admin", response, ip=get_client_ip(request))
    write_audit_log(
        db,
        action="ADMIN_FORCED_PASSWORD_CHANGED",
        actor_user_id=user.id,
        target_user_id=user.id,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return AuthSuccessResponse(accessToken=access_token, expiresIn=exp, user=UserResponse.model_validate(user))

@admin_auth_router.post(
    "/refresh",
    response_model=AuthSuccessResponse,
    summary="Rotate admin refresh token and return fresh access token",
)
def admin_refresh(
    request: Request,
    response: Response,
    hs_admin_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    if not hs_admin_rt:
        raise UnauthorizedError("Missing admin refresh cookie", code="AUTH_REQUIRED")
        
    access_token, user = rotate_refresh_token(
        db=db,
        raw_refresh_token=hs_admin_rt,
        audience="admin",
        request=request,
        response=response,
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=15 * 60,
        user=UserResponse.model_validate(user),
    )

@admin_auth_router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Admin logout (Current session)",
)
def admin_logout(
    request: Request,
    response: Response,
    hs_admin_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    revoke_session(db, hs_admin_rt, "admin", request, response)
    return {"message": "Admin session revoked"}

@admin_auth_router.post(
    "/logout-all",
    status_code=status.HTTP_200_OK,
    summary="Revoke all admin sessions",
)
def admin_logout_all(
    request: Request,
    response: Response,
    current_admin: User = Depends(get_current_admin_user),
    hs_admin_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    revoke_session(db, hs_admin_rt, "admin", request, response)
    revoke_all_user_sessions(db, current_admin.id, reason="ADMIN_LOGOUT_ALL")
    return {"message": "All admin sessions revoked"}

@admin_auth_router.post(
    "/forgot-password",
    response_model=GenericResponse,
    summary="Admin or staff forgot password",
)
def admin_forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    ip = get_client_ip(request)
    res = forgot_password_flow(db, payload.identifier, ip, is_admin=True)
    return GenericResponse(message=res["message"])

@admin_auth_router.post(
    "/reset-password",
    response_model=GenericResponse,
    summary="Admin or staff reset password",
)
def admin_reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    res = reset_password_flow(db, payload.token, payload.newPassword, request)
    return GenericResponse(message=res["message"])
