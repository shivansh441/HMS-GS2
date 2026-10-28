from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Role
from app.db.models import Property, User
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.inventory.schemas import PropertyItemResponse
from app.modules.inventory.service import property_summary

properties_router = APIRouter(prefix="/admin/properties", tags=["Admin Properties"])

@properties_router.get(
    "",
    response_model=list[PropertyItemResponse],
    summary="List properties available to the authenticated staff or admin",
)
def list_properties(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    property_scope: set[str] = Depends(get_property_scope),
):
    query = select(Property).where(Property.is_deleted.is_(False))
    if current_user.role != Role.ADMIN:
        if not property_scope:
            return []
        query = query.where(Property.id.in_(property_scope))

    props = db.scalars(query.order_by(Property.code.asc())).all()
    return [PropertyItemResponse.model_validate(property_summary(db, prop)) for prop in props]
