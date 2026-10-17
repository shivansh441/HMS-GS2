"""Hotel operational schemas for stay check-ins, room changes, and housekeeping."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.hotel_ops import HousekeepingStatus, HousekeepingTaskType


class HotelStayRecordCreate(BaseModel):
    booking_item_id: str
    property_id: str
    room_id: str
    keycards_issued: int = 1
    vehicle_license_plate: str | None = None
    luggage_tags: list[str] = []


class HotelStayRecordRead(HotelStayRecordCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actual_check_in_at: datetime | None
    actual_check_out_at: datetime | None


class RoomChangeLogCreate(BaseModel):
    booking_item_id: str
    property_id: str
    from_room_id: str
    to_room_id: str
    reason: str


class RoomChangeLogRead(RoomChangeLogCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    authorized_by_user_id: str | None
    changed_at: datetime


class HousekeepingTaskCreate(BaseModel):
    property_id: str
    room_id: str
    bed_id: str | None = None
    task_type: HousekeepingTaskType = HousekeepingTaskType.DEPARTURE_CLEAN
    assigned_user_id: str | None = None
    scheduled_date: date
    notes: str | None = None


class HousekeepingTaskRead(HousekeepingTaskCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: HousekeepingStatus
    completed_at: datetime | None
