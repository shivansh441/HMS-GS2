from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.db.session import get_db
from app.modules.auth.deps import limiter
from app.modules.auth.schemas import (
    AdminLoginRequest,
    AuthSuccessResponse,
    CustomerLoginRequest,
    CustomerRegisterRequest,
    UserResponse,
)
from app.modules.auth.service import (
    create_user_session,
    register_customer,
    revoke_session,
    rotate_refresh_token,
    verify_admin_login,
    verify_customer_login,
)

auth_router = APIRouter(prefix="/auth", tags=["Customer Auth"])
admin_auth_router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])

# ==========================================
# CUSTOMER AUTH
# ==========================================

@auth_router.post(
    "/register",
    response_model=AuthSuccessResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new customer account",
)
@limiter.limit("10/minute")
def register(
    request: Request,
    response: Response,
    payload: CustomerRegisterRequest,
    db: Session = Depends(get_db),
):
    user = register_customer(
        db=db,
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        phone=payload.phone,
        account_type=payload.account_type,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    access_token, _, expires_in = create_user_session(
        db=db,
        user=user,
        audience="customer",
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=expires_in,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/login",
    response_model=AuthSuccessResponse,
    summary="Customer sign in",
)
@limiter.limit("15/minute")
def customer_login(
    request: Request,
    response: Response,
    payload: CustomerLoginRequest,
    db: Session = Depends(get_db),
):
    user = verify_customer_login(
        db=db,
        email=payload.email,
        password=payload.password,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    access_token, _, expires_in = create_user_session(
        db=db,
        user=user,
        audience="customer",
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=expires_in,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/refresh",
    response_model=AuthSuccessResponse,
    summary="Rotate customer refresh token and return fresh access token",
)
@limiter.limit("30/minute")
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
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=15 * 60,
        user=UserResponse.model_validate(user),
    )

@auth_router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Customer logout",
)
def customer_logout(
    request: Request,
    response: Response,
    hs_cust_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    revoke_session(
        db=db,
        raw_refresh_token=hs_cust_rt,
        audience="customer",
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return {"message": "Successfully logged out"}

# Customer Auth Stubs (501)
@auth_router.post("/otp/send", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def send_otp():
    """Stub: Send One-Time Passcode for passwordless login (Module 2)"""
    return {"statusCode": 501, "message": "OTP login will be available in Module 2"}

@auth_router.post("/password/forgot", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def forgot_password():
    """Stub: Forgot password email dispatch (Module 2)"""
    return {"statusCode": 501, "message": "Password reset flow will be available in Module 2"}

# ==========================================
# ADMIN AUTH
# ==========================================

@admin_auth_router.post(
    "/login",
    response_model=AuthSuccessResponse,
    summary="Admin / Staff sign in with TOTP step",
)
@limiter.limit("15/minute")
def admin_login(
    request: Request,
    response: Response,
    payload: AdminLoginRequest,
    db: Session = Depends(get_db),
):
    user, requires_mfa, challenge_token = verify_admin_login(
        db=db,
        identifier=payload.identifier,
        password=payload.password,
        mfa_code=payload.mfa_code,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    
    if requires_mfa:
        return AuthSuccessResponse(
            accessToken="",
            expiresIn=0,
            user=UserResponse.model_validate(user),
            requiresMfa=True,
            mfaChallengeToken=challenge_token,
        )

    access_token, _, expires_in = create_user_session(
        db=db,
        user=user,
        audience="admin",
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=expires_in,
        user=UserResponse.model_validate(user),
        requiresMfa=False,
    )

@admin_auth_router.post(
    "/refresh",
    response_model=AuthSuccessResponse,
    summary="Rotate admin refresh token and return fresh access token",
)
@limiter.limit("30/minute")
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
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return AuthSuccessResponse(
        accessToken=access_token,
        expiresIn=15 * 60,
        user=UserResponse.model_validate(user),
    )

@admin_auth_router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Admin logout",
)
def admin_logout(
    request: Request,
    response: Response,
    hs_admin_rt: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
):
    revoke_session(
        db=db,
        raw_refresh_token=hs_admin_rt,
        audience="admin",
        response=response,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return {"message": "Admin session revoked"}
