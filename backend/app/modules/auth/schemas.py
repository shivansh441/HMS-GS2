from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field

from app.core.permissions import Role


class CustomerRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12)
    firstName: str
    lastName: str
    phone: str | None = None
    consent: Literal[True] = Field(description="Terms of service and privacy consent")

class VerifyEmailRequest(BaseModel):
    token: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr | None = None
    identifier: str | None = None

class CustomerLoginRequest(BaseModel):
    identifier: str | None = None # Email or phone number
    email: str | None = None
    password: str
    remember: bool = False

class AdminLoginRequest(BaseModel):
    identifier: str # Email or staff username
    password: str
    mfa_code: str | None = None

class ForgotPasswordRequest(BaseModel):
    identifier: str # Email or phone

class ResetPasswordRequest(BaseModel):
    token: str
    newPassword: str = Field(..., min_length=12)

class ActivateRequest(BaseModel):
    token: str
    newPassword: str = Field(..., min_length=12)

class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str = Field(..., min_length=12)

class OtpRequestPayload(BaseModel):
    target: str # Email or phone number
    channel: Literal["SMS", "EMAIL"]
    purpose: Literal["LOGIN", "VERIFY_PHONE", "VERIFY_EMAIL"]

class OtpVerifyPayload(BaseModel):
    target: str
    code: str = Field(..., min_length=6, max_length=6)
    purpose: Literal["LOGIN", "VERIFY_PHONE", "VERIFY_EMAIL"]

class MagicLinkRequest(BaseModel):
    email: EmailStr

class MagicLinkVerifyRequest(BaseModel):
    token: str

class MfaVerifyRequest(BaseModel):
    mfaToken: str
    code: str | None = None
    recoveryCode: str | None = None

class MfaEnrollResponse(BaseModel):
    secret: str
    otpauthUri: str
    qrDataUrl: str

class MfaConfirmRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)

class MfaConfirmResponse(BaseModel):
    recoveryCodes: list[str]

class MfaDisableRequest(BaseModel):
    password: str
    code: str = Field(..., min_length=6, max_length=6)

class MfaRegenerateCodesRequest(BaseModel):
    password: str
    code: str = Field(..., min_length=6, max_length=6)

class AdminForcedPasswordChangeRequest(BaseModel):
    changeToken: str
    newPassword: str = Field(..., min_length=12)

class UserResponse(BaseModel):
    id: str
    email: str | None
    username: str | None
    full_name: str | None
    phone: str | None
    gender: str | None
    customer_persona: str | None = Field(
        validation_alias=AliasChoices("customer_persona", "customerPersona"),
        serialization_alias="customerPersona",
    )
    role: Role
    staff_role: str | None = Field(
        validation_alias=AliasChoices("staff_role", "staffRole"),
        serialization_alias="staffRole",
    )
    status: str
    must_change_password: bool
    mfa_enabled: bool
    email_verified_at: datetime | None
    phone_verified_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class AuthSuccessResponse(BaseModel):
    accessToken: str = ""
    tokenType: str = "Bearer"
    expiresIn: int = 900
    user: UserResponse | None = None
    mfaRequired: bool = False
    requiresMfa: bool = False
    mfaToken: str | None = None
    mfaChallengeToken: str | None = None
    mfaEnrollmentRequired: bool = False
    enrollToken: str | None = None
    passwordChangeRequired: bool = False
    changeToken: str | None = None

class SessionItemResponse(BaseModel):
    id: str
    ip: str | None
    browser: str
    os: str
    userAgent: str | None
    createdAt: datetime
    lastActiveAt: datetime
    current: bool

class LinkedIdentityItem(BaseModel):
    id: str
    provider: str
    providerUserId: str
    email: str | None
    createdAt: datetime

class CustomerProfileUpdateRequest(BaseModel):
    firstName: str | None = None
    lastName: str | None = None
    phone: str | None = None
    phoneOtpCode: str | None = None
    email: EmailStr | None = None

class ProfileCompletion(BaseModel):
    percent: int
    missing: list[str]

class NextAction(BaseModel):
    action: str
    title: str
    description: str

class OverviewResponse(BaseModel):
    stage: str # REGISTERED_NO_BOOKING | UPCOMING | ACTIVE_STAY | PAST_ONLY
    bookingsCount: int
    profileCompletion: ProfileCompletion
    nextActions: list[NextAction]

class GenericResponse(BaseModel):
    message: str
    statusCode: int = 200
