from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session


class GuestStage(str, Enum):
    REGISTERED_NO_BOOKING = "REGISTERED_NO_BOOKING"
    UPCOMING = "UPCOMING"
    ACTIVE_STAY = "ACTIVE_STAY"
    PAST_ONLY = "PAST_ONLY"

class BookingProvider(ABC):
    @abstractmethod
    def get_guest_bookings_count(self, db: Session, user_id: str) -> int:
        pass

    @abstractmethod
    def get_guest_stage(self, db: Session, user_id: str) -> GuestStage:
        pass

    @abstractmethod
    def get_guest_bookings(self, db: Session, user_id: str) -> list[dict[str, Any]]:
        pass

class NullBookingProvider(BookingProvider):
    """
    Null implementation used during Module 1. Always returns zero bookings
    and the REGISTERED_NO_BOOKING stage. Replaced by real booking provider in Module 2.
    """
    def get_guest_bookings_count(self, db: Session, user_id: str) -> int:
        return 0

    def get_guest_stage(self, db: Session, user_id: str) -> GuestStage:
        return GuestStage.REGISTERED_NO_BOOKING

    def get_guest_bookings(self, db: Session, user_id: str) -> list[dict[str, Any]]:
        return []

booking_provider: BookingProvider = NullBookingProvider()
