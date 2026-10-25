from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CustomerRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12)
    full_name: str | None = None
    phone: str | None = None
    account_type: str = "HOTEL_GUEST" # HOTEL_GUEST, SHORT_TERM_HOSTEL_GUEST, LONG_TERM_RESIDENT

class CustomerLoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_device: bool = False

class AdminLoginRequest(BaseModel):
    identifier: str # Email or username
    password: str
    mfa_code: str | None = None

class UserResponse(BaseModel):
    id: str
    email: str | None
    username: str | None
    full_name: str | None
    phone: str | None
    account_type: str
    staff_role: str | None
    status: str
    must_change_password: bool
    mfa_enabled: bool
    email_verified_at: datetime | None
    phone_verified_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AuthSuccessResponse(BaseModel):
    accessToken: str
    tokenType: str = "Bearer"
    expiresIn: int
    user: UserResponse
    requiresMfa: bool = False
    mfaChallengeToken: str | None = None

class ProfileCompletion(BaseModel):
    percent: int
    missing: list[str]

class OverviewResponse(BaseModel):
    stage: str # REGISTERED_NO_BOOKING | UPCOMING | ACTIVE_STAY | PAST_ONLY
    bookingsCount: int
    profileCompletion: ProfileCompletion
    nextActions: list[dict[str, Any]]
