"""Authentication request and response schemas."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.security import UserRole


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int
    role: UserRole
    property_id: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    property_id: str | None = Field(default=None, description="Optional scoped property context")


class CustomerRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters with strong complexity recommended")
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    country: str | None = Field(default=None, max_length=100)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., description="Valid refresh token string")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, description="New secure password")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Password reset token received via secure channel")
    new_password: str = Field(..., min_length=8)


class AdminProvisionUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    global_role: UserRole = UserRole.FRONT_DESK
    is_superuser: bool = False
    assigned_property_ids: list[str] = Field(default_factory=list)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    first_name: str
    last_name: str
    global_role: UserRole
    is_active: bool
    is_superuser: bool
