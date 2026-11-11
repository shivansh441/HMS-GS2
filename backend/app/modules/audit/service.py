import json
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AuditLog, User


def _redact_details(value: Any) -> Any:
    sensitive_keys = {
        "password",
        "currentpassword",
        "newpassword",
        "token",
        "accesstoken",
        "refreshtoken",
        "secret",
        "authorization",
        "otp",
        "email",
        "phone",
        "mobile",
        "documentnumber",
        "identitydocument",
        "governmentid",
        "idnumber",
        "idproof",
    }
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            normalized = "".join(char for char in str(key).lower() if char.isalpha())
            sensitive = normalized in sensitive_keys or any(
                marker in normalized for marker in ("email", "phone", "mobile", "document")
            )
            redacted[key] = "[REDACTED]" if sensitive else _redact_details(item)
        return redacted
    if isinstance(value, list):
        return [_redact_details(item) for item in value]
    return value


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
    actor = db.get(User, actor_user_id) if actor_user_id else None
    details = details or {}
    action_value = action
    if details.get("agreedRate") is not None:
        action_value = "RATE_OVERRIDE"
    elif details.get("paymentMethod") == "CASH" and (
        "PAYMENT" in action or "COLLECTED" in action
    ):
        action_value = "MANUAL_CASH_COLLECTION"
    safe_details = _redact_details(details)
    log_entry = AuditLog(
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        property_id=property_id,
        action=action_value,
        details=json.dumps(safe_details),
        ip=(ip or "0.0.0.0")[:64],
        client_ip=(ip or "0.0.0.0")[:45],
        user_agent=(user_agent[:512] if user_agent else None),
        actor_email=(actor.email or "")[:100] or None if actor else None,
        actor_role=(actor.role or "")[:50] or None if actor else None,
        entity_name=str(details.get("entity") or action_value)[:100],
        entity_id=str(
            details.get("assignmentId")
            or details.get("depositEscrowId")
            or details.get("invoiceId")
            or details.get("reservationId")
            or ""
        )[:100]
        or None,
        payload_diff=safe_details,
        status_code=200,
    )
    db.add(log_entry)
    db.flush()
    return log_entry
