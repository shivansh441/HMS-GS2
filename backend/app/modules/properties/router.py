from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.scoping import get_allowed_property_ids
from app.db.models import Property, User
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user

properties_router = APIRouter(prefix="/admin/properties", tags=["Admin Properties"])

class PropertyItemResponse(BaseModel):
    id: str
    code: str
    name: str
    timezone: str
    status: str
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)

@properties_router.get(
    "",
    response_model=list[PropertyItemResponse],
    summary="List properties accessible to the authenticated staff or admin",
)
def list_properties(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    allowed_ids = get_allowed_property_ids(db, admin_user)
    if not allowed_ids:
        return []
    
    props = db.scalars(
        select(Property).where(Property.id.in_(allowed_ids)).order_by(Property.code.asc())
    ).all()
    
    return [
        PropertyItemResponse(
            id=p.id,
            code=p.code,
            name=p.name,
            timezone=p.timezone,
            status=p.status,
            createdAt=p.created_at,
        )
        for p in props
    ]

# Documented CRUD stubs for Module 2
@properties_router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_property():
    """Stub: Create new property (Module 2)"""
    return {"statusCode": 501, "message": "Property creation will be implemented in Module 2"}

@properties_router.get("/{property_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def get_property_details(property_id: str):
    """Stub: Detailed property settings & room config (Module 2)"""
    return {"statusCode": 501, "message": "Property detail view will be implemented in Module 2"}
