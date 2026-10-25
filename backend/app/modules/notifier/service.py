from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import OutboxMessage


class Notifier(ABC):
    @abstractmethod
    def send_notification(
        self,
        db: Session,
        channel: str,
        destination: str,
        subject: str | None,
        body: str,
        metadata: dict[str, Any] | None = None,
    ) -> OutboxMessage:
        pass

class DevNotifier(Notifier):
    """
    Developer notifier that safely writes outbox messages to the database
    outbox table for testing, inspection, and local development.
    """
    def send_notification(
        self,
        db: Session,
        channel: str,
        destination: str,
        subject: str | None,
        body: str,
        metadata: dict[str, Any] | None = None,
    ) -> OutboxMessage:
        outbox_msg = OutboxMessage(
            channel=channel.upper(),
            destination=destination,
            subject=subject,
            body=body,
            status="PENDING",
        )
        db.add(outbox_msg)
        db.flush()
        return outbox_msg

notifier: Notifier = DevNotifier()
