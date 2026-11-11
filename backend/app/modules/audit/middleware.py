import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qsl, urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppException
from app.core.logging import logger
from app.core.security import decode_access_token
from app.db.models import (
    AuditLog,
    Property,
    SecurityAlert,
    SecuritySeverity,
    Unit,
    UnitAssignment,
    User,
)
from app.db.session import SessionLocal

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
REDACTED_KEYS = {
    "password",
    "currentpassword",
    "newpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "authorization",
    "email",
    "phone",
    "mobile",
    "identifier",
    "otp",
    "code",
    "id",
    "document",
    "documentnumber",
    "identitydocument",
    "governmentid",
    "idnumber",
    "iddocument",
    "idproof",
    "cvv",
    "cardnumber",
    "key",
}
ENTITY_NAMES = {
    "properties": "Property",
    "units": "Unit",
    "stay": "UnitAssignment",
    "assignments": "UnitAssignment",
    "reservations": "ReservationRequest",
    "invoices": "CustomerInvoice",
    "deposits": "DepositEscrow",
    "payments": "CustomerPaymentReceipt",
    "users": "User",
    "staff": "StaffProfile",
    "mess": "MessFacility",
}
VARIANCE_LIMIT = Decimal(str(settings.AUDIT_RATE_VARIANCE_LIMIT))
REFUND_ALERT_THRESHOLD = Decimal(str(settings.AUDIT_HIGH_REFUND_THRESHOLD))


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            normalized = re.sub(r"[^a-z]", "", str(key).lower())
            sensitive = normalized in REDACTED_KEYS or any(
                marker in normalized for marker in ("email", "phone", "mobile", "document")
            )
            redacted[key] = "[REDACTED]" if sensitive else _redact(item)
        return redacted
    if isinstance(value, list):
        return [_redact(item) for item in value[:200]]
    if isinstance(value, str):
        return value[:4000]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:4000]


def _safe_request_url(scope: dict[str, Any]) -> str:
    path = str(scope.get("path", ""))[:255]
    raw_query = scope.get("query_string", b"").decode("latin-1")
    if not raw_query:
        return path
    safe_query = []
    for key, value in parse_qsl(raw_query, keep_blank_values=True):
        normalized = re.sub(r"[^a-z]", "", key.lower())
        safe_query.append((key, "[REDACTED]" if normalized in REDACTED_KEYS else value[:200]))
    return f"{path}?{urlencode(safe_query)}"[:255]


def _request_payload(
    body: bytes,
    headers: dict[bytes, bytes],
    truncated: bool,
) -> tuple[dict[str, Any] | None, str | None]:
    content_type = headers.get(b"content-type", b"").decode("latin-1").lower()
    if not body:
        return ({"truncated": truncated} if truncated else None), None
    if "application/json" not in content_type:
        return (
            {"contentType": content_type[:100], "bodyLength": len(body), "truncated": truncated},
            None,
        )
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return (
            {"contentType": "application/json", "body": "[UNPARSEABLE]", "truncated": truncated},
            None,
        )
    candidate = _find_value(parsed, {"identifier", "email"})
    attempted_email = (
        str(candidate).strip().lower()
        if isinstance(candidate, str) and "@" in candidate
        else None
    )
    return {"request": _redact(parsed), "truncated": truncated}, attempted_email


def _find_value(data: Any, keys: set[str]) -> Any:
    if isinstance(data, dict):
        for key, value in data.items():
            normalized = re.sub(r"[^a-z]", "", str(key).lower())
            if normalized in keys:
                return value
        for value in data.values():
            found = _find_value(value, keys)
            if found is not None:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _find_value(item, keys)
            if found is not None:
                return found
    return None


def _entity_for(path: str) -> str:
    for segment in path.strip("/").split("/"):
        if segment in ENTITY_NAMES:
            return ENTITY_NAMES[segment]
    return "HTTP Request"


def _alert_once(
    db: Session,
    *,
    alert_type: str,
    severity: SecuritySeverity,
    description: str,
    source_ip: str,
    user_id: str | None,
    since: datetime,
) -> None:
    existing = db.scalar(
        select(SecurityAlert.id)
        .where(
            SecurityAlert.alert_type == alert_type,
            SecurityAlert.source_ip == source_ip,
            SecurityAlert.is_resolved.is_(False),
            SecurityAlert.created_at >= since,
        )
        .limit(1)
    )
    if not existing:
        db.add(
            SecurityAlert(
                alert_type=alert_type,
                severity=severity,
                description=description,
                source_ip=source_ip,
                user_id=user_id,
            )
        )


def _standard_rate(
    db: Session, payload: Any, path_params: dict[str, Any]
) -> Decimal | None:
    standard_value = _find_value(payload, {"standardrate", "baserate", "originalrate"})
    if standard_value is not None:
        try:
            return Decimal(str(standard_value))
        except InvalidOperation:
            return None

    unit_id = _find_value(payload, {"unitid"})
    assignment_id = path_params.get("assignment_id") or path_params.get("assignmentId")
    unit = db.get(Unit, str(unit_id)) if unit_id else None
    if not unit and assignment_id:
        assignment = db.get(UnitAssignment, str(assignment_id))
        unit = db.get(Unit, assignment.unit_id) if assignment else None
    if not unit:
        return None
    for rate in (unit.base_rate_monthly, unit.default_recurring_monthly_rate, unit.default_price_per_night):
        if rate is not None:
            return Decimal(rate)
    return None


def _action_for(method: str, path: str, status_code: int, payload: Any) -> str:
    lowered_path = path.lower()
    if status_code == 429:
        return "RATE_LIMIT_EXCEEDED"
    if lowered_path.endswith("/auth/login"):
        return "FAILED_LOGIN" if status_code == 401 else "LOGIN"
    if lowered_path.endswith("/auth/logout"):
        return "LOGOUT"
    if "refund" in lowered_path or _find_value(payload, {"refundamount"}) is not None:
        return "REFUND"
    if _find_value(payload, {"agreedrate"}) is not None:
        return "RATE_OVERRIDE"
    if "check-in" in lowered_path:
        return "MANUAL_CHECK_IN"
    if "reservations" in lowered_path and _find_value(payload, {"status"}) == "CANCELLED":
        return "RESERVATION_CANCELLED"
    if "payment" in lowered_path and str(_find_value(payload, {"paymentmethod", "paymentmode"}) or "").upper() == "CASH":
        return "MANUAL_CASH_COLLECTION"
    if method == "POST":
        return "CREATE"
    if method == "DELETE":
        return "DELETE"
    return "UPDATE"


def _record_mutation(
    *,
    scope: dict[str, Any],
    headers: dict[bytes, bytes],
    payload: Any,
    status_code: int,
    session_factory=SessionLocal,
    record_event: bool = True,
    attempted_email: str | None = None,
) -> None:
    method = scope.get("method", "POST").upper()
    path = str(scope.get("path", ""))
    authorization = headers.get(b"authorization", b"").decode("latin-1")
    actor: User | None = None
    if not attempted_email:
        candidate = _find_value(payload, {"identifier", "email"})
        attempted_email = (
            str(candidate).strip().lower()
            if isinstance(candidate, str) and "@" in candidate
            else None
        )
    if not path.lower().endswith("/auth/login"):
        attempted_email = None
    client = scope.get("client")
    client_ip = headers.get(b"x-forwarded-for", b"").decode("latin-1").split(",")[0].strip()
    if not client_ip:
        client_ip = str(client[0]) if client else "0.0.0.0"
    client_ip = client_ip[:45] or "0.0.0.0"

    with session_factory() as db:
        if authorization.startswith("Bearer "):
            try:
                token_payload = decode_access_token(
                    authorization[7:].strip(), expected_audience=["admin", "customer"]
                )
                actor = db.get(User, token_payload.get("sub"))
            except AppException:
                actor = None
        if actor is None and attempted_email and path.lower().endswith("/auth/login"):
            actor = db.scalar(select(User).where(User.email == attempted_email))

        actor_id = actor.id if actor else None
        actor_email = (actor.email if actor else attempted_email or "")[:100] or None
        actor_role = actor.role if actor else None
        url = _safe_request_url(scope)
        entity_name = _entity_for(path)
        path_params = scope.get("path_params") or {}
        entity_id = next(
            (str(value)[:100] for key, value in path_params.items() if key.endswith("_id")),
            None,
        )
        property_value = _find_value(payload, {"propertyid"}) or headers.get(b"x-property-id", b"").decode("latin-1")
        if property_value:
            property_exists = db.get(Property, str(property_value))
            property_id = property_exists.id if property_exists else None
        else:
            property_id = None
        safe_payload = payload if isinstance(payload, dict) else None
        action = _action_for(method, path, status_code, safe_payload)
        if action == "FAILED_LOGIN":
            entity_name = "Authentication"
        details = safe_payload or {}
        if record_event:
            db.add(
                AuditLog(
                    actor_user_id=actor_id,
                    target_user_id=None,
                    property_id=property_id,
                    action=action,
                    details=json.dumps(details),
                    ip=client_ip,
                    client_ip=client_ip,
                    user_agent=headers.get(b"user-agent", b"").decode("latin-1")[:512] or None,
                    actor_email=actor_email,
                    actor_role=actor_role,
                    entity_name=entity_name,
                    entity_id=entity_id,
                    request_method=method[:10],
                    request_url=url,
                    payload_diff=payload,
                    status_code=status_code,
                )
            )

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=15)
        if record_event and action == "FAILED_LOGIN":
            db.flush()
            failures = db.scalars(
                select(AuditLog.id)
                .where(
                    AuditLog.action == "FAILED_LOGIN",
                    AuditLog.client_ip == client_ip,
                    AuditLog.created_at >= cutoff,
                ).limit(6)
            ).all()
            failure_count = len(failures)
            if failure_count > 5:
                _alert_once(
                    db,
                    alert_type="BRUTE_FORCE_LOGIN_ATTEMPTS",
                    severity=SecuritySeverity.HIGH,
                    description=f"{failure_count} failed login attempts were recorded from this IP within 15 minutes.",
                    source_ip=client_ip,
                    user_id=actor_id,
                    since=cutoff,
                )

        if status_code == 403 and actor and actor.role != "ADMIN" and any(
            segment in path.lower()
            for segment in ("propert", "unit", "billing", "stay", "reservation")
        ):
            _alert_once(
                db,
                alert_type="UNAUTHORIZED_ACCESS_ATTEMPT",
                severity=SecuritySeverity.MEDIUM,
                description=f"A non-admin account received a forbidden response for {method} {url}.",
                source_ip=client_ip,
                user_id=actor.id,
                since=cutoff,
            )
        if status_code == 429:
            _alert_once(
                db,
                alert_type="RATE_LIMIT_EXCEEDED",
                severity=SecuritySeverity.MEDIUM,
                description=f"Rate limit exceeded for {method} {url}.",
                source_ip=client_ip,
                user_id=actor_id,
                since=cutoff,
            )

        if action == "RATE_OVERRIDE":
            agreed_value = _find_value(safe_payload, {"agreedrate"})
            standard_rate = _standard_rate(db, safe_payload, path_params)
            try:
                agreed_rate = Decimal(str(agreed_value))
            except (InvalidOperation, TypeError):
                agreed_rate = None
            if standard_rate and agreed_rate is not None and standard_rate > 0:
                variance = abs(standard_rate - agreed_rate) / standard_rate
                if variance > VARIANCE_LIMIT:
                    _alert_once(
                        db,
                        alert_type="RATE_VARIANCE_EXCEEDED",
                        severity=SecuritySeverity.HIGH,
                        description=f"Agreed rate differs from the standard rate by {variance:.1%}, above the configured limit.",
                        source_ip=client_ip,
                        user_id=actor_id,
                        since=cutoff,
                    )

        if action == "REFUND":
            amount_value = _find_value(safe_payload, {"refundamount", "amount"})
            try:
                refund_amount = Decimal(str(amount_value))
            except (InvalidOperation, TypeError):
                refund_amount = Decimal("0")
            if refund_amount > REFUND_ALERT_THRESHOLD:
                _alert_once(
                    db,
                    alert_type="HIGH_REFUND_ALERT",
                    severity=SecuritySeverity.HIGH,
                    description=f"Refund amount exceeds the configured threshold of {REFUND_ALERT_THRESHOLD}.",
                    source_ip=client_ip,
                    user_id=actor_id,
                    since=cutoff,
                )
        db.commit()


class AuditTrailMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        record_event = scope.get("method", "").upper() in MUTATING_METHODS
        body_chunks: list[bytes] = []
        body_size = 0
        body_truncated = False
        response_status = 500
        headers = dict(scope.get("headers", []))

        async def receive_with_body():
            nonlocal body_size, body_truncated
            message = await receive()
            if record_event and message["type"] == "http.request":
                chunk = message.get("body", b"")
                if body_size < 65536:
                    remaining = 65536 - body_size
                    body_chunks.append(chunk[:remaining])
                body_size += len(chunk)
                if body_size > 65536:
                    body_truncated = True
            return message

        async def send_with_status(message):
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive_with_body, send_with_status)
        except Exception:
            logger.exception("Request failed while audit middleware was observing it")
            raise
        finally:
            if record_event or response_status in {403, 429}:
                raw_body = b"".join(body_chunks)
                if record_event:
                    payload, attempted_email = _request_payload(
                        raw_body, headers, body_truncated
                    )
                else:
                    payload, attempted_email = None, None
                try:
                    app_state = getattr(scope.get("app"), "state", None)
                    _record_mutation(
                        scope=scope,
                        headers=headers,
                        payload=payload,
                        status_code=response_status,
                        session_factory=getattr(app_state, "audit_session_factory", SessionLocal),
                        record_event=record_event,
                        attempted_email=attempted_email,
                    )
                except Exception:
                    logger.exception(
                        "Unable to persist audit event for %s %s",
                        scope.get("method"),
                        scope.get("path"),
                    )
