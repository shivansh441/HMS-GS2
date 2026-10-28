from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError
from app.core.permissions import Role
from app.db.models import AuditLog, User
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user

audit_router = APIRouter(prefix="/admin/audit", tags=["Admin Audit"])

class AuditLogItem(BaseModel):
    id: str
    actorUserId: str | None
    targetUserId: str | None
    action: str
    createdAt: datetime

@audit_router.get("", response_model=list[AuditLogItem], summary="View append-only audit trail")
def list_audit_logs(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    if admin_user.role != Role.ADMIN:
        raise ForbiddenError("Audit log access is restricted to Admin")
    
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(50)).all()
    return [
        AuditLogItem(
            id=log.id,
            actorUserId=log.actor_user_id,
            targetUserId=log.target_user_id,
            action=log.action,
            createdAt=log.created_at,
        )
        for log in logs
    ]
