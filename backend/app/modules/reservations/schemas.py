from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.permissions import SharingType, UnitCategory, UnitType
from app.db.models import ChannelOrigin, ReservationStatus
from app.modules.auth.schemas import GovernmentIdType


class ReservationPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class ReservationOccupantPayload(ReservationPayload):
    is_primary: bool = Field(default=False, alias="isPrimary")
    first_name: str = Field(alias="firstName", min_length=1, max_length=50)
    last_name: str | None = Field(default=None, alias="lastName", max_length=50)
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    id_type: GovernmentIdType = Field(alias="idType")
    id_number: str = Field(alias="idNumber", min_length=2, max_length=128)


class ReservationCreateRequest(ReservationPayload):
    property_id: str = Field(alias="propertyId", min_length=1, max_length=36)
    guest_name: str = Field(alias="guestName", min_length=1, max_length=100)
    mobile: str = Field(min_length=1, max_length=20)
    email: EmailStr | None = None
    requested_category: UnitCategory = Field(
        default=UnitCategory.CLASSIC, alias="requestedCategory"
    )
    requested_type: UnitType = Field(default=UnitType.ROOM, alias="requestedType")
    requested_sharing_type: SharingType | None = Field(
        default=None, alias="requestedSharingType"
    )
    requested_quantity: int = Field(default=1, alias="requestedQuantity", ge=1, le=100)
    number_of_adults: int = Field(default=1, alias="numberOfAdults", ge=1, le=100)
    number_of_children: int = Field(default=0, alias="numberOfChildren", ge=0, le=100)
    expected_check_in: date = Field(alias="expectedCheckIn")
    expected_check_out: date | None = Field(default=None, alias="expectedCheckOut")
    channel_origin: ChannelOrigin = Field(
        default=ChannelOrigin.PUBLIC_WEB, alias="channelOrigin"
    )
    occupants: list[ReservationOccupantPayload] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_stay_dates(self):
        if self.expected_check_out and self.expected_check_out <= self.expected_check_in:
            raise ValueError("Expected check-out must be after check-in")
        if self.requested_sharing_type and self.requested_type != UnitType.BED:
            raise ValueError("Sharing type can only be specified for a bed reservation")
        expected_occupants = self.number_of_adults + self.number_of_children
        if len(self.occupants) > expected_occupants:
            raise ValueError("Reservation occupant details exceed the guest count")
        if sum(occupant.is_primary for occupant in self.occupants) > 1:
            raise ValueError("Only one reservation occupant can be marked as primary")
        return self


class ReservationStatusRequest(ReservationPayload):
    status: ReservationStatus
    rejection_reason: str | None = Field(default=None, alias="rejectionReason", max_length=2000)


class ReservationConvertRequest(ReservationPayload):
    unit_id: str = Field(alias="unitId", min_length=1, max_length=36)
    additional_unit_ids: list[str] = Field(
        default_factory=list, alias="additionalUnitIds", max_length=99
    )
    agreed_rate: Decimal | None = Field(
        default=None, alias="agreedRate", gt=0, max_digits=12, decimal_places=2
    )
    rate_override_reason: str | None = Field(
        default=None, alias="rateOverrideReason", min_length=1, max_length=2000
    )
    initial_deposit: Decimal = Field(
        default=Decimal("0"),
        alias="initialDeposit",
        ge=0,
        max_digits=12,
        decimal_places=2,
    )
    payment_confirmed: bool = Field(default=False, alias="paymentConfirmed")
    payment_method: Literal["CASH", "UPI", "CARD", "BANK_TRANSFER"] | None = Field(
        default=None, alias="paymentMethod"
    )
    payment_reference: str | None = Field(
        default=None, alias="paymentReference", max_length=100
    )


class ReservationResponse(BaseModel):
    id: str
    request_code: str = Field(alias="requestCode")
    property_id: str = Field(alias="propertyId")
    primary_user_id: str | None = Field(alias="primaryUserId")
    guest_name: str = Field(alias="guestName")
    mobile: str
    email: str | None
    requested_category: str = Field(alias="requestedCategory")
    requested_type: str = Field(alias="requestedType")
    requested_sharing_type: str | None = Field(default=None, alias="requestedSharingType")
    requested_quantity: int = Field(alias="requestedQuantity")
    number_of_adults: int = Field(alias="numberOfAdults")
    number_of_children: int = Field(alias="numberOfChildren")
    expected_check_in: date = Field(alias="expectedCheckIn")
    expected_check_out: date | None = Field(alias="expectedCheckOut")
    channel_origin: str = Field(alias="channelOrigin")
    status: str
    rejection_reason: str | None = Field(alias="rejectionReason")
    converted_at: datetime | None = Field(alias="convertedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class ReservationListResponse(BaseModel):
    items: list[ReservationResponse]
    total: int
    limit: int
    offset: int


class AvailableReservationUnit(BaseModel):
    id: str
    property_id: str = Field(alias="propertyId")
    unit_number: str = Field(alias="unitNumber")
    type: str
    category: str
    sharing_type: str | None = Field(default=None, alias="sharingType")
    capacity: int
    floor: int
    default_price_per_night: Decimal | None = Field(alias="defaultPricePerNight")
    default_recurring_monthly_rate: Decimal | None = Field(
        alias="defaultRecurringMonthlyRate"
    )
    deposit_amount: Decimal = Field(alias="depositAmount")


class ReservationConversionResponse(BaseModel):
    reservation: ReservationResponse
    assignment_id: str = Field(alias="assignmentId")
    assignment_ids: list[str] = Field(alias="assignmentIds")
    stay_record_id: str = Field(alias="stayRecordId")
    user_id: str = Field(alias="userId")
    unit_id: str = Field(alias="unitId")
    unit_ids: list[str] = Field(alias="unitIds")
