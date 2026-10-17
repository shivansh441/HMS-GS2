"""Inventory schemas for room types, physical rooms, and hostel beds."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.inventory import (
    AccommodationTier,
    BedType,
    CleanlinessStatus,
    GenderPolicy,
    RoomOperationalStatus,
)


class RoomTypeBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=120)
    code: str = Field(..., min_length=2, max_length=30)
    accommodation_tier: AccommodationTier
    description: str | None = None
    base_capacity_adults: int = Field(default=1, ge=1)
    max_capacity_adults: int = Field(default=2, ge=1)
    max_capacity_children: int = Field(default=0, ge=0)
    is_dormitory: bool = False
    gender_policy: GenderPolicy = GenderPolicy.ANY
    base_price_amount: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    amenities: list[str] = Field(default_factory=list)
    is_published: bool = True


class RoomTypeCreate(RoomTypeBase):
    property_id: str


class RoomTypePublicRead(BaseModel):
    """Customer-facing accommodation type with capacities, amenities, and starting price."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    property_id: str
    name: str
    slug: str
    code: str
    accommodation_tier: AccommodationTier
    description: str | None
    base_capacity_adults: int
    max_capacity_adults: int
    max_capacity_children: int
    is_dormitory: bool
    gender_policy: GenderPolicy
    base_price_amount: Decimal
    amenities: list[str]


class RoomTypeAdminRead(RoomTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    property_id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RoomBase(BaseModel):
    property_id: str
    room_type_id: str
    floor_id: str | None = None
    room_number: str = Field(..., min_length=1, max_length=30)
    operational_status: RoomOperationalStatus = RoomOperationalStatus.AVAILABLE
    cleanliness_status: CleanlinessStatus = CleanlinessStatus.CLEAN
    keycard_code: str | None = None
    notes: str | None = None


class RoomCreate(RoomBase):
    pass


class RoomRead(RoomBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BedBase(BaseModel):
    property_id: str
    room_id: str
    bed_label: str = Field(..., min_length=1, max_length=30)
    bed_type: BedType = BedType.STANDARD_SINGLE
    locker_number: str | None = None
    operational_status: RoomOperationalStatus = RoomOperationalStatus.AVAILABLE


class BedCreate(BedBase):
    pass


class BedRead(BedBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
