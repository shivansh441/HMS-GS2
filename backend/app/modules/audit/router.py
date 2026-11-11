import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import Role
from app.db.models import AuditLog, SecurityAlert, SecuritySeverity, User
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user

audit_router = APIRouter(tags=["Audit & Security"])
PRIVILEGED_ACTIONS = (
    "RATE_OVERRIDE",
    "PRICE_NEGOTIATION",
    "MANUAL_CASH_COLLECTION",
    "SECURITY_DEPOSIT_REFUND",
    "REFUND",
    "MANUAL_CHECK_IN",
    "RESERVATION_CANCELLED",
)


class AuditLogItem(BaseModel):
    id: str
    actor_user_id: str | None = Field(alias="actorUserId")
    target_user_id: str | None = Field(alias="targetUserId")
    actor_email: str | None = Field(alias="actorEmail")
    actor_role: str | None = Field(alias="actorRole")
    property_id: str | None = Field(alias="propertyId")
    action: str
    entity_name: str | None = Field(alias="entityName")
    entity_id: str | None = Field(alias="entityId")
    client_ip: str = Field(alias="clientIp")
    user_agent: str | None = Field(alias="userAgent")
    request_method: str | None = Field(alias="requestMethod")
    request_url: str | None = Field(alias="requestUrl")
    payload_diff: dict[str, Any] | None = Field(alias="payloadDiff")
    status_code: int = Field(alias="statusCode")
    timestamp: datetime

    model_config = ConfigDict(populate_by_name=True)


class AuditLogPage(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")
    model_config = ConfigDict(populate_by_name=True)


class SecurityAlertResponse(BaseModel):
    id: str
    alert_type: str = Field(alias="alertType")
    severity: SecuritySeverity
    description: str
    source_ip: str = Field(alias="sourceIp")
    user_id: str | None = Field(alias="userId")
    is_resolved: bool = Field(alias="isResolved")
    resolved_by: str | None = Field(alias="resolvedBy")
    resolved_at: datetime | None = Field(alias="resolvedAt")
    resolution_note: str | None = Field(alias="resolutionNote")
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class AlertResolveRequest(BaseModel):
    resolution_note: str | None = Field(default=None, alias="resolutionNote", max_length=2000)
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class AuditSummaryResponse(BaseModel):
    total_events: int = Field(alias="totalEvents")
    high_severity_alerts: int = Field(alias="highSeverityAlerts")
    active_lockouts: int = Field(alias="activeLockouts")
    recent_privileged_overrides: int = Field(alias="recentPrivilegedOverrides")
    unresolved_alerts: int = Field(alias="unresolvedAlerts")

    model_config = ConfigDict(populate_by_name=True)


def _require_admin(admin_user: User) -> None:
    if admin_user.role != Role.ADMIN:
        raise ForbiddenError("Audit and security monitoring is restricted to Admin")


def _details(log: AuditLog) -> dict[str, Any] | None:
    if log.payload_diff is not None:
        return log.payload_diff
    if not log.details:
        return None
    try:
        parsed = json.loads(log.details)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return {"value": log.details[:4000]}


def _log_response(log: AuditLog) -> AuditLogItem:
    return AuditLogItem(
        id=log.id,
        actorUserId=log.actor_user_id,
        targetUserId=log.target_user_id,
        actorEmail=log.actor_email,
        actorRole=log.actor_role,
        propertyId=log.property_id,
        action=log.action,
        entityName=log.entity_name,
        entityId=log.entity_id,
        clientIp=log.client_ip or log.ip or "0.0.0.0",
        userAgent=log.user_agent,
        requestMethod=log.request_method,
        requestUrl=log.request_url,
        payloadDiff=_details(log),
        statusCode=log.status_code,
        timestamp=log.created_at,
    )


@audit_router.get("/audit/logs", response_model=AuditLogPage)
def list_audit_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, alias="page_size", ge=1, le=200),
    user_id: str | None = Query(default=None, alias="user_id"),
    property_id: str | None = Query(default=None, alias="property_id"),
    action: str | None = Query(default=None),
    entity_name: str | None = Query(default=None, alias="entity_name"),
    start_date: date | None = Query(default=None, alias="start_date"),
    end_date: date | None = Query(default=None, alias="end_date"),
    actor: str | None = Query(default=None, max_length=100),
    client_ip: str | None = Query(default=None, alias="client_ip", max_length=45),
    privileged_only: bool = Query(default=False, alias="privileged_only"),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    filters = []
    if user_id:
        filters.append(AuditLog.actor_user_id == user_id)
    if property_id:
        filters.append(AuditLog.property_id == property_id)
    if action:
        filters.append(AuditLog.action == action)
    if privileged_only:
        filters.append(AuditLog.action.in_(PRIVILEGED_ACTIONS))
    if entity_name:
        filters.append(AuditLog.entity_name.ilike(f"%{entity_name.strip()}%"))
    if actor:
        term = f"%{actor.strip()}%"
        filters.append(
            or_(AuditLog.actor_email.ilike(term), AuditLog.actor_user_id.ilike(term))
        )
    if client_ip:
        filters.append(AuditLog.client_ip == client_ip)
    if start_date:
        filters.append(AuditLog.created_at >= datetime.combine(start_date, time.min, timezone.utc))
    if end_date:
        filters.append(
            AuditLog.created_at < datetime.combine(end_date + timedelta(days=1), time.min, timezone.utc)
        )

    total = db.scalar(select(func.count(AuditLog.id)).where(*filters)) or 0
    logs = db.scalars(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [_log_response(log) for log in logs]
    return AuditLogPage(items=items, total=total, page=page, pageSize=page_size)


@audit_router.get("/admin/audit", response_model=list[AuditLogItem], include_in_schema=False)
def list_legacy_audit_logs(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    logs = db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(50)
    ).all()
    return [_log_response(log) for log in logs]


@audit_router.get("/audit/alerts", response_model=list[SecurityAlertResponse])
def list_security_alerts(
    severity: SecuritySeverity | None = Query(default=None),
    is_resolved: bool | None = Query(default=None, alias="is_resolved"),
    limit: int = Query(default=100, ge=1, le=500),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    filters = []
    if severity:
        filters.append(SecurityAlert.severity == severity)
    if is_resolved is not None:
        filters.append(SecurityAlert.is_resolved.is_(is_resolved))
    alerts = db.scalars(
        select(SecurityAlert)
        .where(*filters)
        .order_by(SecurityAlert.created_at.desc())
        .limit(limit)
    ).all()
    return alerts


@audit_router.patch("/audit/alerts/{alert_id}/resolve", response_model=SecurityAlertResponse)
def resolve_security_alert(
    alert_id: str,
    payload: AlertResolveRequest,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    alert = db.get(SecurityAlert, alert_id)
    if not alert:
        raise NotFoundError("Security alert not found")
    if alert.is_resolved:
        raise ConflictError("Security alert has already been resolved")
    alert.is_resolved = True
    alert.resolved_by = admin_user.id
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolution_note = payload.resolution_note
    db.commit()
    db.refresh(alert)
    return alert


@audit_router.get("/audit/summary", response_model=AuditSummaryResponse)
def security_summary(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)
    total_events = db.scalar(select(func.count(AuditLog.id))) or 0
    high_alerts = db.scalar(
        select(func.count(SecurityAlert.id)).where(
            SecurityAlert.is_resolved.is_(False),
            SecurityAlert.severity.in_([SecuritySeverity.HIGH, SecuritySeverity.CRITICAL]),
        )
    ) or 0
    active_lockouts = db.scalar(
        select(func.count(User.id)).where(User.locked_until.is_not(None), User.locked_until > now)
    ) or 0
    privileged_overrides = db.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.action.in_(PRIVILEGED_ACTIONS),
            AuditLog.created_at >= day_ago,
        )
    ) or 0
    unresolved_alerts = db.scalar(
        select(func.count(SecurityAlert.id)).where(SecurityAlert.is_resolved.is_(False))
    ) or 0
    return AuditSummaryResponse(
        totalEvents=total_events,
        highSeverityAlerts=high_alerts,
        activeLockouts=active_lockouts,
        recentPrivilegedOverrides=privileged_overrides,
        unresolvedAlerts=unresolved_alerts,
    )
