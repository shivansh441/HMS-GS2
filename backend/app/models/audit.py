"""Audit log persistence tracking state changes, status transitions, and user actions."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.base import UUIDMixin


class AuditAction(StrEnum):
    """Action category recorded in the audit log."""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    STATUS_TRANSITION = "status_transition"
    ASSIGNMENT = "assignment"


class AuditLog(Base, UUIDMixin):
    """Sanitized mutation log tracking sensitive actions across domain entities."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_property_ts", "property_id", "timestamp"),
    )

    property_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[AuditAction] = mapped_column(
        SQLEnum(AuditAction, native_enum=False, length=20),
        nullable=False,
    )

    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    correlation_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    # Sanitized state diff (no raw passwords, payment card numbers, or PII)
    changes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
