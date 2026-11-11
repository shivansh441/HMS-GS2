from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.permissions import (
    FeeType,
    PropertyStatus,
    PropertyType,
    SharingType,
    UnitCategory,
    UnitStatus,
    UnitType,
)
from app.modules.auth.schemas import GovernmentIdType


class InventoryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class PropertyCreateRequest(InventoryRequest):
    name: str = Field(min_length=1, max_length=128)
    type: PropertyType = PropertyType.HOTEL
    floors: int = Field(default=1, ge=0, le=100)
    address: str = Field(min_length=1, max_length=255)
    city: str = Field(min_length=1, max_length=128)
    state: str = Field(min_length=1, max_length=128)
    pincode: str = Field(min_length=1, max_length=32)
    contact_phone: str = Field(alias="contactPhone", min_length=1, max_length=32)
    contact_email: str | None = Field(default=None, alias="contactEmail", max_length=255)
    facilities: list[str] = Field(default_factory=list, max_length=100)
    has_mess_facility: bool = Field(default=False, alias="hasMessFacility")
    currency: str = Field(default="INR", min_length=3, max_length=3)
    timezone: str = Field(default="UTC", min_length=1, max_length=64)


class PropertyUpdateRequest(PropertyCreateRequest):
    status: PropertyStatus = PropertyStatus.ACTIVE
    has_mess_facility: bool | None = Field(default=None, alias="hasMessFacility")


class PropertyFeeCreateRequest(InventoryRequest):
    fee_type: FeeType = Field(alias="feeType")
    name: str = Field(min_length=1, max_length=128)
    amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    is_mandatory: bool = Field(default=False, alias="isMandatory")
    is_active: bool = Field(default=True, alias="isActive")
    pricing_basis: Literal["FIXED_FLAT", "METERED", "ASSIGNMENT", "CONFIG_ONLY"] | None = Field(
        default=None, alias="pricingBasis"
    )
    billing_timing: Literal["ADVANCE", "ARREARS", "AT_ASSIGNMENT", "NONE"] | None = Field(
        default=None, alias="billingTiming"
    )
    rate_per_unit: Decimal | None = Field(
        default=None, alias="ratePerUnit", ge=0, max_digits=12, decimal_places=4
    )
    unit_of_measure: str | None = Field(default=None, alias="unitOfMeasure", max_length=32)


class UnitCreateRequest(InventoryRequest):
    unit_number: str = Field(alias="unitNumber", min_length=1, max_length=64)
    floor: int = 0
    type: UnitType = UnitType.ROOM
    category: UnitCategory = UnitCategory.CLASSIC
    sharing_type: SharingType | None = Field(default=None, alias="sharingType")
    capacity: int = Field(default=1, ge=1, le=100)
    beds_per_room: int | None = Field(default=None, alias="bedsPerRoom", ge=1, le=100)
    parent_id: str | None = Field(default=None, alias="parentId")
    default_price_per_night: Decimal | None = Field(
        default=None, alias="defaultPricePerNight", ge=0, max_digits=12, decimal_places=2
    )
    default_recurring_monthly_rate: Decimal | None = Field(
        default=None,
        alias="defaultRecurringMonthlyRate",
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    base_rate_monthly: Decimal | None = Field(
        default=None, alias="baseRateMonthly", ge=0, max_digits=12, decimal_places=2
    )
    deposit_amount: Decimal = Field(
        default=Decimal("0"), alias="depositAmount", ge=0, max_digits=12, decimal_places=2
    )
    utility_package_fee: Decimal = Field(
        default=Decimal("0"), alias="utilityPackageFee", ge=0, max_digits=12, decimal_places=2
    )
    features: list[str] = Field(default_factory=list, max_length=100)
    smart_lock_id: str | None = Field(default=None, alias="smartLockId", max_length=128)
    notes: str | None = Field(default=None, max_length=2000)


class BulkUnitCreateRequest(InventoryRequest):
    floors: Annotated[int, Field(ge=1, le=100)] | list[int] = Field(default=1)
    rooms_per_floor: int = Field(alias="roomsPerFloor", ge=1, le=500)
    beds_per_room: int = Field(default=0, alias="bedsPerRoom", ge=0, le=100)
    type: UnitType = UnitType.ROOM
    category: UnitCategory = UnitCategory.CLASSIC
    sharing_type: SharingType | None = Field(default=None, alias="sharingType")
    starting_room_number: int = Field(default=1, alias="startingRoomNumber", ge=0, le=999)
    capacity: int = Field(default=1, ge=1, le=100)
    default_price_per_night: Decimal | None = Field(
        default=None, alias="defaultPricePerNight", ge=0, max_digits=12, decimal_places=2
    )
    default_recurring_monthly_rate: Decimal | None = Field(
        default=None,
        alias="defaultRecurringMonthlyRate",
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    base_rate_monthly: Decimal | None = Field(
        default=None, alias="baseRateMonthly", ge=0, max_digits=12, decimal_places=2
    )
    deposit_amount: Decimal = Field(
        default=Decimal("0"), alias="depositAmount", ge=0, max_digits=12, decimal_places=2
    )
    utility_package_fee: Decimal = Field(
        default=Decimal("0"), alias="utilityPackageFee", ge=0, max_digits=12, decimal_places=2
    )
    features: list[str] = Field(default_factory=list, max_length=100)
    dry_run: bool = Field(default=False, alias="dryRun")

    @model_validator(mode="after")
    def validate_unit_count(self):
        floors = self.floors if isinstance(self.floors, list) else list(range(1, self.floors + 1))
        if not floors or len(floors) != len(set(floors)):
            raise ValueError("floors must contain unique floor numbers")
        if len(floors) > 100:
            raise ValueError("bulk requests cannot include more than 100 floors")
        units_per_room = 1 + self.beds_per_room
        if len(floors) * self.rooms_per_floor * units_per_room > 500:
            raise ValueError("bulk request cannot create more than 500 units")
        if self.category == UnitCategory.DORMITORY and self.beds_per_room < 4:
            raise ValueError("DORMITORY requires at least four beds per room")
        return self


class UnitStatusRequest(InventoryRequest):
    status: UnitStatus


class StayAssignmentCreateRequest(InventoryRequest):
    unit_id: str = Field(alias="unitId", min_length=1, max_length=36)
    user_id: str = Field(alias="userId", min_length=1, max_length=36)
    reservation_id: str | None = Field(default=None, alias="reservationId", max_length=36)
    expected_check_in: datetime = Field(alias="expectedCheckIn")
    expected_check_out: datetime | None = Field(default=None, alias="expectedCheckOut")
    check_in_now: bool = Field(default=True, alias="checkInNow")
    billing_strategy: Literal["PER_NIGHT_STAY", "RECURRING_MONTHLY"] = Field(
        default="RECURRING_MONTHLY", alias="billingStrategy"
    )
    agreed_rate: Decimal | None = Field(
        default=None, alias="agreedRate", gt=0, max_digits=12, decimal_places=2
    )
    rate_override_reason: str | None = Field(
        default=None, alias="rateOverrideReason", min_length=1, max_length=2000
    )
    deposit_payment_amount: Decimal = Field(
        default=Decimal("0"),
        alias="depositPaymentAmount",
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    deposit_payment_method: Literal["CASH", "UPI", "CARD", "BANK_TRANSFER"] | None = Field(
        default=None, alias="depositPaymentMethod"
    )
    deposit_payment_reference: str | None = Field(
        default=None, alias="depositPaymentReference", max_length=100
    )
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.expected_check_out and self.expected_check_out <= self.expected_check_in:
            raise ValueError("Expected check-out must be after check-in")
        return self


class StayCheckInRequest(InventoryRequest):
    deposit_payment_amount: Decimal = Field(
        default=Decimal("0"),
        alias="depositPaymentAmount",
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    deposit_payment_method: Literal["CASH", "UPI", "CARD", "BANK_TRANSFER"] | None = Field(
        default=None, alias="depositPaymentMethod"
    )
    deposit_payment_reference: str | None = Field(
        default=None, alias="depositPaymentReference", max_length=100
    )


class StayCheckOutRequest(InventoryRequest):
    folio_settled: bool = Field(alias="folioSettled")
    keycard_returned: bool = Field(alias="keycardReturned")
    final_amount_paid: Decimal = Field(
        default=Decimal("0"),
        alias="finalAmountPaid",
        ge=0,
        max_digits=12,
        decimal_places=2,
    )


class UtilityMeterReadingRequest(InventoryRequest):
    unit_assignment_id: str = Field(alias="unitAssignmentId", min_length=1, max_length=36)
    fee_type: Literal["ELECTRICITY_FEE", "WATER_CHARGE"] = Field(alias="feeType")
    period_start: date = Field(alias="periodStart")
    period_end: date = Field(alias="periodEnd")
    previous_reading: Decimal = Field(alias="previousReading", ge=0, max_digits=12, decimal_places=3)
    current_reading: Decimal = Field(alias="currentReading", ge=0, max_digits=12, decimal_places=3)


class PublicPropertyResponse(BaseModel):
    id: str
    code: str
    name: str
    type: str
    city: str
    state: str
    currency: str
    facilities: list[str] = Field(default_factory=list)


class PropertyItemResponse(BaseModel):
    id: str
    code: str
    name: str
    type: str
    status: str
    has_mess_facility: bool = Field(alias="hasMessFacility")
    timezone: str
    currency: str
    floors: int
    floor_count: int = Field(alias="floorCount")
    unit_count: int = Field(alias="unitCount")
    created_at: datetime = Field(alias="createdAt")


class PropertyFeeResponse(BaseModel):
    id: str
    fee_type: str = Field(alias="feeType")
    name: str
    amount: Decimal | None = None
    is_mandatory: bool | None = Field(default=None, alias="isMandatory")
    is_active: bool = Field(alias="isActive")
    pricing_basis: str = Field(default="FIXED_FLAT", alias="pricingBasis")
    billing_timing: str = Field(default="ADVANCE", alias="billingTiming")
    rate_per_unit: Decimal | None = Field(default=None, alias="ratePerUnit")
    unit_of_measure: str | None = Field(default=None, alias="unitOfMeasure")


class UnitResponse(BaseModel):
    id: str
    property_id: str = Field(alias="propertyId")
    unit_number: str = Field(alias="unitNumber")
    floor: int
    type: str
    category: str
    sharing_type: str | None = Field(default=None, alias="sharingType")
    capacity: int
    status: str
    parent_id: str | None = Field(alias="parentId")
    default_price_per_night: Decimal | None = Field(alias="defaultPricePerNight")
    default_recurring_monthly_rate: Decimal | None = Field(alias="defaultRecurringMonthlyRate")
    deposit_amount: Decimal | None = Field(default=None, alias="depositAmount")
    utility_package_fee: Decimal | None = Field(default=None, alias="utilityPackageFee")
    features: list[str]
    smart_lock_id: str | None = Field(default=None, alias="smartLockId")
    is_active: bool = Field(alias="isActive")


class StayAssignmentResponse(BaseModel):
    id: str
    unit_id: str = Field(alias="unitId")
    user_id: str = Field(alias="userId")
    billing_strategy: str = Field(alias="billingStrategy")
    status: str
    agreed_rate: Decimal | None = Field(alias="agreedRate")
    standard_rate: Decimal | None = Field(alias="standardRate")
    rate_override_reason: str | None = Field(alias="rateOverrideReason")
    expected_check_in: datetime = Field(alias="expectedCheckIn")
    expected_check_out: datetime | None = Field(alias="expectedCheckOut")
    actual_check_in: datetime | None = Field(alias="actualCheckIn")
    actual_check_out: datetime | None = Field(alias="actualCheckOut")
    is_active: bool = Field(alias="isActive")
    guest_name: str | None = Field(default=None, alias="guestName")
    guest_email: str | None = Field(default=None, alias="guestEmail")
    guest_phone: str | None = Field(default=None, alias="guestPhone")
    property_id: str | None = Field(default=None, alias="propertyId")
    property_name: str | None = Field(default=None, alias="propertyName")
    unit_number: str | None = Field(default=None, alias="unitNumber")
    unit_type: str | None = Field(default=None, alias="unitType")
    unit_category: str | None = Field(default=None, alias="unitCategory")
    persona: str | None = None
    stay_record_id: str | None = Field(default=None, alias="stayRecordId")


class StayOccupantUpdate(InventoryRequest):
    id: str | None = None
    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    date_of_birth: date | None = Field(default=None, alias="dateOfBirth")
    gender: str | None = Field(default=None, max_length=16)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    id_document_type: GovernmentIdType | None = Field(default=None, alias="idDocumentType")
    id_document_number: str | None = Field(default=None, alias="idDocumentNumber", min_length=2, max_length=128)


class StayOccupantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    full_name: str = Field(alias="fullName")
    date_of_birth: date | None = Field(alias="dateOfBirth")
    gender: str | None
    email: str | None
    phone: str | None
    permanent_address: str | None = Field(alias="permanentAddress")
    id_document_type: str = Field(alias="idDocumentType")
    id_document_last4: str = Field(alias="idDocumentLast4")


class StayOccupantsUpdate(InventoryRequest):
    occupants: list[StayOccupantUpdate] = Field(default_factory=list, max_length=100)


class StayHistoryItem(BaseModel):
    id: str
    assignment_id: str | None = Field(alias="assignmentId")
    user_id: str = Field(alias="userId")
    property_id: str = Field(alias="propertyId")
    property_name: str = Field(alias="propertyName")
    unit_id: str | None = Field(alias="unitId")
    unit_number: str | None = Field(alias="unitNumber")
    unit_type: str | None = Field(alias="unitType")
    unit_category: str | None = Field(alias="unitCategory")
    persona: str
    assignment_status: str | None = Field(alias="assignmentStatus")
    billing_strategy: str | None = Field(alias="billingStrategy")
    scheduled_check_in: datetime | None = Field(alias="scheduledCheckIn")
    scheduled_check_out: datetime | None = Field(alias="scheduledCheckOut")
    actual_check_in: datetime | None = Field(alias="actualCheckIn")
    actual_check_out: datetime | None = Field(alias="actualCheckOut")
    final_amount_paid: Decimal = Field(alias="finalAmountPaid")
    is_active: bool = Field(alias="isActive")
    created_at: datetime = Field(alias="createdAt")


class UtilityMeterReadingResponse(BaseModel):
    id: str
    fee_type: str = Field(alias="feeType")
    period_start: date = Field(alias="periodStart")
    period_end: date = Field(alias="periodEnd")
    consumption: Decimal
    unit_of_measure: str = Field(alias="unitOfMeasure")
    rate_per_unit: Decimal = Field(alias="ratePerUnit")
    amount: Decimal
    billing_status: str = Field(alias="billingStatus")
    arrears_for_period: str = Field(alias="arrearsForPeriod")


class BulkUnitCreateResponse(BaseModel):
    dry_run: bool = Field(alias="dryRun")
    floor_count: int = Field(alias="floorCount")
    room_count: int = Field(alias="roomCount")
    bed_count: int = Field(alias="bedCount")
    unit_count: int = Field(alias="unitCount")
    rooms: list[dict]
    beds: list[dict]


class PublicUnitResponse(BaseModel):
    property_code: str = Field(alias="propertyCode")
    property_name: str = Field(alias="propertyName")
    unit_number: str = Field(alias="unitNumber")
    floor: int
    type: str
    category: str
    sharing_type: str | None = Field(default=None, alias="sharingType")
    capacity: int
    currency: str
    price_per_night: Decimal | None = Field(alias="pricePerNight")
    recurring_monthly_rate: Decimal | None = Field(alias="recurringMonthlyRate")
    features: list[str]
    status: Literal["AVAILABLE"]
