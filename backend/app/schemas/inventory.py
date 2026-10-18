"""Inventory schemas for room types, physical rooms, hostel beds, maintenance blocking, and availability."""

from datetime import date, datetime
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


class RoomTypeUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    code: str | None = None
    accommodation_tier: AccommodationTier | None = None
    description: str | None = None
    base_capacity_adults: int | None = Field(default=None, ge=1)
    max_capacity_adults: int | None = Field(default=None, ge=1)
    max_capacity_children: int | None = Field(default=None, ge=0)
    is_dormitory: bool | None = None
    gender_policy: GenderPolicy | None = None
    base_price_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    amenities: list[str] | None = None
    is_published: bool | None = None


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


class BedBase(BaseModel):
    property_id: str
    room_id: str
    bed_label: str = Field(..., min_length=1, max_length=30)
    bed_type: BedType = BedType.STANDARD_SINGLE
    locker_number: str | None = None
    operational_status: RoomOperationalStatus = RoomOperationalStatus.AVAILABLE


class BedCreate(BedBase):
    pass


class BedUpdate(BaseModel):
    bed_label: str | None = None
    bed_type: BedType | None = None
    locker_number: str | None = None
    operational_status: RoomOperationalStatus | None = None


class BedRead(BedBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
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
    # Optional auto-generation of initial beds for hostel dorm rooms
    initial_bed_count: int | None = Field(default=None, ge=1, le=32)
    initial_bed_prefix: str | None = Field(default="Bed", max_length=10)


class RoomUpdate(BaseModel):
    room_type_id: str | None = None
    floor_id: str | None = None
    room_number: str | None = None
    operational_status: RoomOperationalStatus | None = None
    cleanliness_status: CleanlinessStatus | None = None
    keycard_code: str | None = None
    notes: str | None = None


class RoomRead(RoomBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RoomAdminDetail(RoomRead):
    """Detailed room payload with embedded beds and room type."""

    room_type_name: str
    room_type_code: str
    accommodation_tier: AccommodationTier
    is_dormitory: bool
    capacity_adults: int
    floor_name: str | None = None
    beds: list[BedRead] = Field(default_factory=list)


# Maintenance & Operational Block Schemas
class MaintenanceBlockRequest(BaseModel):
    check_in_date: date
    check_out_date: date
    notes: str = Field(..., min_length=3, max_length=255)


class MaintenanceBlockResponse(BaseModel):
    id: str
    property_id: str
    room_id: str | None = None
    bed_id: str | None = None
    check_in_date: date
    check_out_date: date
    allocation_type: str = "maintenance_block"
    notes: str | None = None
    created_at: datetime


# Availability Engine Schemas
class AvailabilityUnitItem(BaseModel):
    id: str
    unit_type: str  # "room" or "bed"
    identifier: str  # Room number or Bed label
    room_number: str
    room_id: str
    room_type_id: str
    room_type_name: str
    accommodation_tier: AccommodationTier
    is_dormitory: bool
    base_price_per_night: Decimal
    operational_status: RoomOperationalStatus
    is_available: bool
    conflict_reason: str | None = None


class RoomTypeAvailabilitySummary(BaseModel):
    room_type_id: str
    room_type_name: str
    slug: str
    accommodation_tier: AccommodationTier
    is_dormitory: bool
    base_price_per_night: Decimal
    total_units: int
    available_units: int
    occupied_or_reserved_units: int
    blocked_or_maintenance_units: int


class PropertyAvailabilityResponse(BaseModel):
    property_id: str
    check_in_date: date
    check_out_date: date
    total_nights: int
    is_stay_valid: bool
    room_types: list[RoomTypeAvailabilitySummary]
    units: list[AvailabilityUnitItem]


# Inventory Operational Summary Schemas
class InventorySummaryResponse(BaseModel):
    property_id: str
    total_active_rooms: int
    total_active_beds: int
    rooms_available: int
    rooms_occupied: int
    rooms_maintenance: int
    beds_available: int
    beds_occupied: int
    beds_maintenance: int
    occupancy_rate_percentage: int
    room_types_breakdown: list[RoomTypeAvailabilitySummary]


# Availability Calendar Matrix Schemas
class DailyUnitStatus(BaseModel):
    date: date
    status: str  # "available", "reserved", "occupied", "maintenance", "blocked"
    booking_reference: str | None = None
    notes: str | None = None


class CalendarRowItem(BaseModel):
    unit_id: str
    unit_type: str  # "room" or "bed"
    identifier: str
    room_number: str
    room_type_name: str
    floor_name: str | None = None
    days: list[DailyUnitStatus]


class CalendarMatrixResponse(BaseModel):
    property_id: str
    start_date: date
    end_date: date
    total_days: int
    rows: list[CalendarRowItem]
