from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ForbiddenError
from app.db.models import OutboxMessage
from app.db.session import get_db

dev_router = APIRouter(prefix="/dev", tags=["Developer Outbox"])

class OutboxItem(BaseModel):
    id: str
    channel: str
    destination: str
    subject: str | None
    body: str
    status: str
    createdAt: datetime
    sentAt: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

@dev_router.get("/outbox", response_model=list[OutboxItem], summary="Inspect developer notification outbox (Dev only)")
def get_outbox_messages(
    destination: str | None = Query(None, description="Filter by recipient email or phone"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if settings.ENVIRONMENT == "production":
        raise ForbiddenError("Dev outbox is disabled in production", code="FORBIDDEN")

    query = select(OutboxMessage).order_by(OutboxMessage.created_at.desc())
    if destination:
        query = query.where(OutboxMessage.destination == destination.strip().lower())
    
    messages = db.scalars(query.limit(limit)).all()
    return [
        OutboxItem(
            id=m.id,
            channel=m.channel,
            destination=m.destination,
            subject=m.subject,
            body=m.body,
            status=m.status,
            createdAt=m.created_at,
            sentAt=m.sent_at,
        )
        for m in messages
    ]

@dev_router.delete("/outbox", status_code=status.HTTP_200_OK, summary="Clear developer notification outbox (Dev only)")
def clear_outbox_messages(db: Session = Depends(get_db)):
    if settings.ENVIRONMENT == "production":
        raise ForbiddenError("Dev outbox is disabled in production", code="FORBIDDEN")
    db.query(OutboxMessage).delete()
    db.commit()
    return {"message": "Outbox cleared"}
