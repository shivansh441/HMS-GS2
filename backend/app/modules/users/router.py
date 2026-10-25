from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.scoping import ScopedQuery
from app.db.models import User
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.auth.schemas import UserResponse

users_router = APIRouter(prefix="/admin/users", tags=["Admin Users"])

class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    limit: int
    offset: int

@users_router.get(
    "",
    response_model=UserListResponse,
    summary="List users within authorized property scope with segment filters",
)
def list_users(
    account_type: str | None = Query(None, description="Filter by account type"),
    segment: str | None = Query(None, description="Optional segment filter (e.g. registered_no_booking)"),
    search: str | None = Query(None, description="Search by name, email, or username"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin_user: User = Depends(get_current_admin_user),
    effective_scope: set[str] = Depends(get_property_scope),
    db: Session = Depends(get_db),
):
    users, total = ScopedQuery.list_scoped_users(
        db=db,
        current_user=admin_user,
        effective_scope=effective_scope,
        account_type_filter=account_type,
        segment_filter=segment,
        search=search,
        limit=limit,
        offset=offset,
    )
    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )

@users_router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user details strictly scoped by property (out-of-scope returns 404)",
)
def get_user_detail(
    user_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    user = ScopedQuery.get_scoped_user(db, admin_user, user_id)
    return UserResponse.model_validate(user)

# Documented stubs for user operations
@users_router.post("", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_staff_or_guest():
    """Stub: Onboard guest or create staff (Module 2)"""
    return {"statusCode": 501, "message": "User onboarding workflows will be enabled in Module 2"}

@users_router.patch("/{user_id}/status", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def update_user_status(user_id: str):
    """Stub: Suspend, activate, or archive user (Module 2)"""
    return {"statusCode": 501, "message": "User status mutations will be enabled in Module 2"}
