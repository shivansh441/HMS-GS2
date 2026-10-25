import json
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AuditLog


def write_audit_log(
    db: Session,
    action: str,
    actor_user_id: str | None = None,
    target_user_id: str | None = None,
    property_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """
    Append-only audit log entry helper used across all state-changing actions.
    """
    log_entry = AuditLog(
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        property_id=property_id,
        action=action,
        details=json.dumps(details or {}),
        ip=ip,
        user_agent=user_agent,
    )
    db.add(log_entry)
    db.flush()
    return log_entry
