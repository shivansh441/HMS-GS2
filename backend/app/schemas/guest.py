"""Guest schemas supporting public checkout and administrative profile management."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class GuestCreatePublic(BaseModel):
    """Minimal customer info required for public website checkout."""

    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=50)
    country: str | None = Field(default=None, max_length=100)


class GuestCreateAdmin(GuestCreatePublic):
    """Full administrative guest registration."""

    identification_type: str | None = None
    identification_number: str | None = None
    address: str | None = None
    city: str | None = None
    state_province: str | None = None
    postal_code: str | None = None
    notes: str | None = None


class GuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    first_name: str
    last_name: str
    phone: str | None
    country: str | None
    is_verified: bool
    created_at: datetime


class GuestAdminRead(GuestRead):
    identification_type: str | None
    identification_number: str | None
    address: str | None
    city: str | None
    state_province: str | None
    postal_code: str | None
    notes: str | None
    updated_at: datetime
