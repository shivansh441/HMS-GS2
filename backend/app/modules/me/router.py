from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import get_user_permissions
from app.core.scoping import get_allowed_property_ids
from app.db.models import User
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user, get_current_customer
from app.modules.auth.schemas import OverviewResponse, ProfileCompletion, UserResponse
from app.modules.bookings_port.service import booking_provider

me_router = APIRouter(prefix="/me", tags=["Customer Profile & Overview"])
admin_me_router = APIRouter(prefix="/admin/me", tags=["Admin Profile"])

@me_router.get("", response_model=UserResponse, summary="Get current logged-in customer profile")
def get_customer_profile(current_user: User = Depends(get_current_customer)):
    return UserResponse.model_validate(current_user)

@me_router.get(
    "/overview",
    response_model=OverviewResponse,
    summary="Get customer account overview, booking stage, and profile checklist",
)
def get_customer_overview(
    current_user: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    # Retrieve stage and bookings count from BookingProvider port
    stage = booking_provider.get_guest_stage(db, current_user.id)
    bookings_count = booking_provider.get_guest_bookings_count(db, current_user.id)

    # Compute profile completion
    missing: list[str] = []
    percent = 40 # Base registered account

    if not current_user.email_verified_at:
        missing.append("EMAIL_VERIFIED")
    else:
        percent += 20

    if not current_user.phone_verified_at:
        missing.append("PHONE_VERIFIED")
    else:
        percent += 20

    if not current_user.id_document_number_encrypted:
        missing.append("ID_DOCUMENT")
    else:
        percent += 20

    next_actions = []
    if "EMAIL_VERIFIED" in missing:
        next_actions.append({
            "action": "VERIFY_EMAIL",
            "title": "Verify your email address",
            "description": "Confirm your email to receive direct reservation receipts and keycard codes.",
        })
    if "PHONE_VERIFIED" in missing:
        next_actions.append({
            "action": "VERIFY_PHONE",
            "title": "Add a mobile phone number",
            "description": "Receive SMS arrival updates and urgent door access alerts.",
        })
    if "ID_DOCUMENT" in missing:
        next_actions.append({
            "action": "UPLOAD_ID",
            "title": "Complete identity verification",
            "description": "Upload an ID document (passport or driver's license) for contactless self-check-in.",
        })

    if stage.value == "REGISTERED_NO_BOOKING":
        next_actions.append({
            "action": "EXPLORE_PROPERTIES",
            "title": "Browse boutique stays & residences",
            "description": "Explore short-term suites and long-term co-living options across our locations.",
        })

    return OverviewResponse(
        stage=stage.value,
        bookingsCount=bookings_count,
        profileCompletion=ProfileCompletion(
            percent=min(percent, 100),
            missing=missing,
        ),
        nextActions=next_actions,
    )

@admin_me_router.get("", summary="Get current logged-in admin user and effective permissions")
def get_admin_me(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    permissions = get_user_permissions(admin_user.account_type, admin_user.staff_role)
    allowed_props = get_allowed_property_ids(db, admin_user)

    return {
        "user": UserResponse.model_validate(admin_user),
        "permissions": sorted([p.value for p in permissions]),
        "allowedPropertyIds": sorted(list(allowed_props)),
        "isSuperAdmin": admin_user.account_type == "SUPER_ADMIN",
    }
