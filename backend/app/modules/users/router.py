import re
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import process_id_document
from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.permissions import Role, StaffRole, UserStatus
from app.core.rate_limit import get_client_ip, rate_limiter
from app.core.scoping import ScopedQuery
from app.core.security import generate_one_time_token, hash_password
from app.db.models import (
    CustomerPersona,
    CustomerPropertyLink,
    MfaRecoveryCode,
    Property,
    StayRecord,
    User,
    UserPropertyAccess,
    VerificationToken,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.auth.schemas import UserResponse
from app.modules.auth.service import revoke_all_user_sessions
from app.modules.notifier.service import notifier

users_router = APIRouter(prefix="/admin/users", tags=["Admin Users"])


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    limit: int
    offset: int


class ReasonRequest(BaseModel):
    reason: str | None = None


class ActionSuccessResponse(BaseModel):
    message: str
    targetUserId: str


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    email: EmailStr
    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    phone: str = Field(min_length=5, max_length=32)
    username: str | None = Field(default=None, min_length=3, max_length=64)
    gender: str | None = Field(default=None, max_length=16)
    id_document_type: str | None = Field(default=None, alias="idDocumentType", max_length=64)
    id_document_number: str | None = Field(default=None, alias="idDocumentNumber", max_length=128)
    role: Role
    staff_role: StaffRole | None = Field(default=None, alias="staffRole")
    property_ids: list[str] = Field(default_factory=list, alias="propertyIds", max_length=100)
    customer_persona: CustomerPersona | None = Field(default=None, alias="customerPersona")
    emergency_contact_name: str | None = Field(default=None, alias="emergencyContactName", max_length=128)
    emergency_contact_phone: str | None = Field(default=None, alias="emergencyContactPhone", max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    occupation: str | None = Field(default=None, max_length=128)
    initial_stay_property_id: str | None = Field(default=None, alias="initialStayPropertyId")
    stay_start_date: date | None = Field(default=None, alias="stayStartDate")
    stay_end_date: date | None = Field(default=None, alias="stayEndDate")


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, alias="fullName", min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    username: str | None = Field(default=None, min_length=3, max_length=64)
    gender: str | None = Field(default=None, max_length=16)
    id_document_type: str | None = Field(default=None, alias="idDocumentType", max_length=64)
    id_document_number: str | None = Field(default=None, alias="idDocumentNumber", max_length=128)
    staff_role: StaffRole | None = Field(default=None, alias="staffRole")
    property_ids: list[str] | None = Field(default=None, alias="propertyIds", max_length=100)
    customer_persona: CustomerPersona | None = Field(default=None, alias="customerPersona")
    emergency_contact_name: str | None = Field(default=None, alias="emergencyContactName", max_length=128)
    emergency_contact_phone: str | None = Field(default=None, alias="emergencyContactPhone", max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    occupation: str | None = Field(default=None, max_length=128)
    initial_stay_property_id: str | None = Field(default=None, alias="initialStayPropertyId")
    stay_start_date: date | None = Field(default=None, alias="stayStartDate")
    stay_end_date: date | None = Field(default=None, alias="stayEndDate")


class ManagedStayResponse(BaseModel):
    property_id: str = Field(alias="propertyId")
    start_date: date = Field(alias="startDate")
    end_date: date | None = Field(alias="endDate")

    model_config = ConfigDict(populate_by_name=True)


class ManagedUserResponse(UserResponse):
    property_ids: list[str] = Field(default_factory=list, alias="propertyIds")
    activation_url: str | None = Field(default=None, alias="activationUrl")
    id_document_type: str | None = Field(alias="idDocumentType")
    id_document_last4: str | None = Field(alias="idDocumentLast4")
    emergency_contact_name: str | None = Field(alias="emergencyContactName")
    emergency_contact_phone: str | None = Field(alias="emergencyContactPhone")
    permanent_address: str | None = Field(alias="permanentAddress")
    occupation: str | None = None
    initial_stay: ManagedStayResponse | None = Field(default=None, alias="initialStay")


class UserCreatedResponse(ManagedUserResponse):
    activation_url: str = Field(alias="activationUrl")


def _require_admin(admin_user: User) -> None:
    if admin_user.role != Role.ADMIN:
        raise ForbiddenError("Only admins can create or edit user accounts", code="ADMIN_REQUIRED")


def _validate_property_assignments(
    db: Session,
    role: Role,
    property_ids: list[str],
) -> list[Property]:
    if len(property_ids) != len(set(property_ids)):
        raise BadRequestError("Property assignments must not contain duplicates")
    if role == Role.STAFF and not property_ids:
        raise BadRequestError("Staff accounts must be assigned to at least one property")
    if role == Role.ADMIN and property_ids:
        raise BadRequestError("Admin accounts automatically have access to every property")
    if not property_ids:
        return []

    properties = db.scalars(
        select(Property).where(
            Property.id.in_(property_ids),
            Property.is_deleted.is_(False),
        )
    ).all()
    if len(properties) != len(property_ids):
        raise BadRequestError("One or more selected properties do not exist or are inactive")
    return list(properties)


def _user_property_ids(db: Session, user: User) -> list[str]:
    if user.role == Role.ADMIN:
        return sorted(db.scalars(select(Property.id).where(Property.is_deleted.is_(False))).all())
    if user.role == Role.STAFF:
        return sorted(
            db.scalars(
                select(UserPropertyAccess.property_id).where(
                    UserPropertyAccess.user_id == user.id
                )
            ).all()
        )
    return sorted(
        db.scalars(
            select(CustomerPropertyLink.property_id).where(
                CustomerPropertyLink.user_id == user.id
            )
        ).all()
    )


def _managed_user_response(
    db: Session,
    user: User,
    activation_url: str | None = None,
) -> ManagedUserResponse:
    stay = db.scalar(
        select(StayRecord)
        .where(StayRecord.user_id == user.id)
        .order_by(StayRecord.created_at.desc())
        .limit(1)
    )
    return ManagedUserResponse(
        **UserResponse.model_validate(user).model_dump(),
        propertyIds=_user_property_ids(db, user),
        activationUrl=activation_url,
        idDocumentType=user.id_document_type,
        idDocumentLast4=user.id_document_last4,
        emergencyContactName=user.emergency_contact_name,
        emergencyContactPhone=user.emergency_contact_phone,
        permanentAddress=user.permanent_address,
        occupation=user.occupation,
        initialStay=(
            ManagedStayResponse(
                propertyId=stay.property_id,
                startDate=stay.start_date,
                endDate=stay.end_date,
            )
            if stay
            else None
        ),
    )


def _validate_username(db: Session, username: str | None, exclude_user_id: str | None = None) -> str | None:
    if username is None:
        return None
    clean_username = username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_.-]{3,64}", clean_username):
        raise BadRequestError("Username must contain 3-64 letters, numbers, dots, underscores, or hyphens")
    query = select(User.id).where(User.username == clean_username)
    if exclude_user_id:
        query = query.where(User.id != exclude_user_id)
    if db.scalar(query):
        raise ConflictError("An account with this username already exists", code="USERNAME_IN_USE")
    return clean_username


def _validate_id_document(document_type: str | None, document_number: str | None) -> None:
    if bool(document_type) != bool(document_number):
        raise BadRequestError("Provide both ID document type and number, or leave both empty")


def _validate_customer_fields(
    role: Role,
    persona: CustomerPersona | None,
    emergency_contact_name: str | None,
    emergency_contact_phone: str | None,
    permanent_address: str | None,
    occupation: str | None,
    initial_stay_property_id: str | None,
    stay_start_date: date | None,
    stay_end_date: date | None,
) -> None:
    customer_fields = (
        persona,
        emergency_contact_name,
        emergency_contact_phone,
        permanent_address,
        occupation,
        initial_stay_property_id,
        stay_start_date,
        stay_end_date,
    )
    if role == Role.CUSTOMER:
        if persona is None:
            raise BadRequestError("Customer accounts require a guest subtype")
        if not initial_stay_property_id or not stay_start_date:
            raise BadRequestError("Guest accounts require an initial stay property and start date")
        if stay_end_date and stay_end_date < stay_start_date:
            raise BadRequestError("Stay end date cannot be before its start date")
    elif any(value is not None for value in customer_fields):
        raise BadRequestError("Guest subtype and stay details are only valid for customer accounts")


def _validate_guest_property_type(
    db: Session,
    persona: CustomerPersona | None,
    property_id: str | None,
) -> None:
    if not persona or not property_id:
        return
    prop = db.scalar(
        select(Property).where(
            Property.id == property_id,
            Property.is_deleted.is_(False),
        )
    )
    if not prop:
        raise BadRequestError("Initial stay property does not exist or is inactive")
    is_hotel_persona = persona == CustomerPersona.HOTEL_GUEST
    is_hotel_property = prop.type == "HOTEL"
    if is_hotel_persona != is_hotel_property:
        expected = "hotel" if is_hotel_persona else "hostel or co-living"
        raise BadRequestError(
            f"{persona.value.replace('_', ' ').title()} must be linked to a {expected} property",
            code="GUEST_PROPERTY_TYPE_MISMATCH",
        )


def _latest_stay_record(db: Session, user_id: str) -> StayRecord | None:
    return db.scalar(
        select(StayRecord)
        .where(StayRecord.user_id == user_id)
        .order_by(StayRecord.created_at.desc())
        .limit(1)
    )


def _create_activation_invite(db: Session, user: User) -> str:
    raw_token, token_hash = generate_one_time_token()
    db.add(
        VerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type="ACTIVATION",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    panel_account = user.role in (Role.ADMIN, Role.STAFF)
    invite_base = (
        settings.ADMIN_PANEL_URL if panel_account else settings.PUBLIC_WEBSITE_URL
    ).rstrip("/")
    activation_url = f"{invite_base}/?token={raw_token}"
    notifier.send_notification(
        db=db,
        channel="EMAIL",
        destination=user.email or "",
        subject="Invitation to Haven Stays",
        body=(
            f"You have been invited to Haven Stays. Complete your account setup here: "
            f"{activation_url}"
        ),
    )
    return activation_url


def _get_target_user_for_mutation(db: Session, admin_user: User, target_user_id: str) -> User:
    """Allows only ADMIN mutations and enforces property isolation."""
    if admin_user.role != Role.ADMIN:
        raise ForbiddenError("Staff members cannot perform administrative user mutations")

    target = db.scalar(select(User).where(User.id == target_user_id))
    if not target:
        raise NotFoundError("User not found")

    # Verify target is within caller's property scope (returns 404 for out-of-scope)
    return ScopedQuery.get_scoped_user(db, admin_user, target_user_id)


def _ensure_admin_can_suspend(
    db: Session,
    actor: User,
    target: User,
) -> None:
    if target.role != Role.ADMIN:
        return
    if actor.id == target.id:
        raise ForbiddenError("An admin cannot suspend their own account", code="SELF_ACTION")
    active_admins = db.scalar(
        select(func.count()).select_from(User).where(
            User.role == Role.ADMIN,
            User.status == UserStatus.ACTIVE,
        )
    ) or 0
    if active_admins <= 1:
        raise ConflictError("The last active admin cannot be suspended", code="LAST_ADMIN")


@users_router.get(
    "",
    response_model=UserListResponse,
    summary="List users within authorized property scope with segment filters",
)
def list_users(
    role: str | None = Query(None, description="Filter by user role"),
    guest_subtype: CustomerPersona | None = Query(
        None, description="Filter customer accounts by guest subtype"
    ),
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
        role_filter=role,
        customer_persona_filter=guest_subtype.value if guest_subtype else None,
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


@users_router.post(
    "",
    response_model=UserCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an invited admin, staff, or customer account",
)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    email = str(payload.email).strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise ConflictError("An account with this email already exists", code="EMAIL_IN_USE")
    if payload.phone and db.scalar(select(User.id).where(User.phone == payload.phone)):
        raise ConflictError("An account with this phone number already exists", code="PHONE_IN_USE")
    if payload.role == Role.STAFF and payload.staff_role is None:
        raise BadRequestError("Staff accounts require a staff role")
    if payload.role != Role.STAFF and payload.staff_role is not None:
        raise BadRequestError("Only staff accounts can have a staff role")
    _validate_customer_fields(
        payload.role,
        payload.customer_persona,
        payload.emergency_contact_name,
        payload.emergency_contact_phone,
        payload.permanent_address,
        payload.occupation,
        payload.initial_stay_property_id,
        payload.stay_start_date,
        payload.stay_end_date,
    )
    _validate_id_document(payload.id_document_type, payload.id_document_number)
    property_ids = list(payload.property_ids)
    if (
        payload.role == Role.CUSTOMER
        and payload.initial_stay_property_id
        and payload.initial_stay_property_id not in property_ids
    ):
        property_ids.append(payload.initial_stay_property_id)
    properties = _validate_property_assignments(db, payload.role, property_ids)
    if payload.role == Role.CUSTOMER:
        _validate_guest_property_type(
            db,
            payload.customer_persona,
            payload.initial_stay_property_id,
        )

    username_base = re.sub(r"[^a-z0-9_]", "_", email.split("@", 1)[0].lower()).strip("_")
    username_base = (username_base or "user")[:48]
    username = _validate_username(db, payload.username)
    if username is None:
        username = f"{username_base}_{secrets.token_hex(4)}"
    encrypted_id = process_id_document(payload.id_document_number) if payload.id_document_number else None
    user = User(
        email=email,
        username=username,
        full_name=payload.full_name,
        phone=payload.phone,
        gender=payload.gender,
        id_document_type=payload.id_document_type,
        id_document_number_encrypted=encrypted_id[0] if encrypted_id else None,
        id_document_last4=encrypted_id[1] if encrypted_id else None,
        id_document_lookup_hash=encrypted_id[2] if encrypted_id else None,
        password_hash=hash_password(secrets.token_urlsafe(48)),
        role=payload.role,
        staff_role=payload.staff_role.value if payload.staff_role else None,
        customer_persona=payload.customer_persona.value if payload.customer_persona else None,
        emergency_contact_name=payload.emergency_contact_name,
        emergency_contact_phone=payload.emergency_contact_phone,
        permanent_address=payload.permanent_address,
        occupation=payload.occupation,
        created_by_id=admin_user.id,
        status=UserStatus.PENDING_ACTIVATION,
    )
    db.add(user)
    db.flush()

    for prop in properties:
        if payload.role == Role.STAFF:
            db.add(UserPropertyAccess(user_id=user.id, property_id=prop.id))
        elif payload.role == Role.CUSTOMER:
            db.add(
                CustomerPropertyLink(
                    user_id=user.id,
                    property_id=prop.id,
                    source="MANUAL",
                )
            )

    if payload.role == Role.CUSTOMER:
        db.add(
            StayRecord(
                user_id=user.id,
                property_id=payload.initial_stay_property_id,
                persona=payload.customer_persona.value,
                start_date=payload.stay_start_date,
                end_date=payload.stay_end_date,
            )
        )

    activation_url = _create_activation_invite(db, user)
    write_audit_log(
        db,
        action="USER_CREATED",
        actor_user_id=admin_user.id,
        target_user_id=user.id,
        details={
            "role": user.role,
            "propertyIds": [prop.id for prop in properties],
            "customerPersona": user.customer_persona,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(user)
    return UserCreatedResponse(
        **_managed_user_response(db, user, activation_url).model_dump(by_alias=True),
    )


@users_router.get(
    "/{user_id}",
    response_model=ManagedUserResponse,
    summary="Get user details strictly scoped by property (out-of-scope returns 404)",
)
def get_user_detail(
    user_id: str,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    user = ScopedQuery.get_scoped_user(db, admin_user, user_id)
    return _managed_user_response(db, user)


@users_router.patch(
    "/{user_id}",
    response_model=ManagedUserResponse,
    summary="Update a user profile and property assignments",
)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    target = _get_target_user_for_mutation(db, admin_user, user_id)
    fields = payload.model_fields_set

    if "staff_role" in fields and target.role != Role.STAFF:
        raise BadRequestError("Only staff accounts can have a staff role")
    if target.role != Role.CUSTOMER and any(
        field in fields
        for field in (
            "customer_persona",
            "emergency_contact_name",
            "emergency_contact_phone",
            "permanent_address",
            "occupation",
            "initial_stay_property_id",
            "stay_start_date",
            "stay_end_date",
        )
    ):
        raise BadRequestError("Guest subtype and stay details are only valid for customer accounts")

    latest_stay = _latest_stay_record(db, target.id) if target.role == Role.CUSTOMER else None
    update_stay = target.role == Role.CUSTOMER and bool(
        fields
        & {
            "customer_persona",
            "initial_stay_property_id",
            "stay_start_date",
            "stay_end_date",
        }
    )
    property_ids = (
        list(payload.property_ids or [])
        if "property_ids" in fields
        else _user_property_ids(db, target)
    )
    stay_property_id = (
        payload.initial_stay_property_id
        if "initial_stay_property_id" in fields
        else latest_stay.property_id if latest_stay else None
    )
    if target.role == Role.CUSTOMER and stay_property_id and stay_property_id not in property_ids:
        property_ids.append(stay_property_id)

    if update_stay:
        try:
            current_persona = CustomerPersona(target.customer_persona) if target.customer_persona else None
        except ValueError:
            current_persona = None
        persona = (
            payload.customer_persona
            if "customer_persona" in fields
            else current_persona
        )
        stay_start_date = (
            payload.stay_start_date
            if "stay_start_date" in fields
            else latest_stay.start_date if latest_stay else None
        )
        stay_end_date = (
            payload.stay_end_date
            if "stay_end_date" in fields
            else latest_stay.end_date if latest_stay else None
        )
        _validate_customer_fields(
            Role.CUSTOMER,
            persona,
            payload.emergency_contact_name
            if "emergency_contact_name" in fields
            else target.emergency_contact_name,
            payload.emergency_contact_phone
            if "emergency_contact_phone" in fields
            else target.emergency_contact_phone,
            payload.permanent_address
            if "permanent_address" in fields
            else target.permanent_address,
            payload.occupation if "occupation" in fields else target.occupation,
            stay_property_id,
            stay_start_date,
            stay_end_date,
        )
        properties = _validate_property_assignments(db, Role.CUSTOMER, property_ids)
        _validate_guest_property_type(db, persona, stay_property_id)
    elif "property_ids" in fields:
        properties = _validate_property_assignments(db, Role(target.role), property_ids)
    else:
        properties = []

    if "property_ids" in fields or (update_stay and stay_property_id):
        if target.role == Role.STAFF:
            db.query(UserPropertyAccess).filter(
                UserPropertyAccess.user_id == target.id
            ).delete()
            db.add_all(
                UserPropertyAccess(user_id=target.id, property_id=prop.id)
                for prop in properties
            )
        elif target.role == Role.CUSTOMER:
            db.query(CustomerPropertyLink).filter(
                CustomerPropertyLink.user_id == target.id
            ).delete()
            db.add_all(
                CustomerPropertyLink(
                    user_id=target.id,
                    property_id=prop.id,
                    source="MANUAL",
                )
                for prop in properties
            )
        elif "property_ids" in fields and payload.property_ids:
            raise BadRequestError("Admin accounts automatically have access to every property")

    email_changed = False
    activation_url = None
    if "email" in fields:
        new_email = str(payload.email).strip().lower() if payload.email else None
        if not new_email:
            raise BadRequestError("A user account must have an email address")
        if target.id == admin_user.id and new_email != target.email:
            raise ForbiddenError("Use account security settings to change your own email")
        duplicate = db.scalar(
            select(User.id).where(User.email == new_email, User.id != target.id)
        )
        if duplicate:
            raise ConflictError("An account with this email already exists", code="EMAIL_IN_USE")
        email_changed = new_email != target.email
        if email_changed:
            target.email = new_email
            target.email_verified_at = None
            target.status = UserStatus.PENDING_ACTIVATION
            db.query(VerificationToken).filter(
                VerificationToken.user_id == target.id,
                VerificationToken.token_type.in_(["ACTIVATION", "EMAIL_VERIFY"]),
                VerificationToken.is_used.is_(False),
            ).update({"is_used": True})
            activation_url = _create_activation_invite(db, target)
            revoke_all_user_sessions(db, target.id, reason="USER_EMAIL_CHANGED")

    if "full_name" in fields:
        target.full_name = payload.full_name
    if "phone" in fields:
        if not payload.phone or len(payload.phone.strip()) < 5:
            raise BadRequestError("Phone number is required and must contain at least 5 characters")
        if db.scalar(
            select(User.id).where(User.phone == payload.phone, User.id != target.id)
        ):
            raise ConflictError("An account with this phone number already exists", code="PHONE_IN_USE")
        target.phone = payload.phone
    if "staff_role" in fields:
        target.staff_role = payload.staff_role.value if payload.staff_role else None
    if "username" in fields:
        if not payload.username:
            raise BadRequestError("Username cannot be empty")
        target.username = _validate_username(db, payload.username, target.id)
    if "gender" in fields:
        target.gender = payload.gender
    if "id_document_number" in fields and payload.id_document_number:
        document_type = payload.id_document_type or target.id_document_type
        if not document_type:
            raise BadRequestError("ID document type is required when providing an ID number")
        encrypted_id = process_id_document(payload.id_document_number)
        target.id_document_type = document_type
        target.id_document_number_encrypted = encrypted_id[0]
        target.id_document_last4 = encrypted_id[1]
        target.id_document_lookup_hash = encrypted_id[2]
    elif "id_document_type" in fields and payload.id_document_type:
        if not target.id_document_number_encrypted:
            raise BadRequestError("Provide the ID document number when setting its type")
        target.id_document_type = payload.id_document_type

    for field in (
        "emergency_contact_name",
        "emergency_contact_phone",
        "permanent_address",
        "occupation",
    ):
        if field in fields:
            setattr(target, field, getattr(payload, field))

    if update_stay:
        target.customer_persona = persona.value
        if latest_stay:
            latest_stay.property_id = stay_property_id
            latest_stay.persona = persona.value
            latest_stay.start_date = stay_start_date
            latest_stay.end_date = stay_end_date
        else:
            db.add(
                StayRecord(
                    user_id=target.id,
                    property_id=stay_property_id,
                    persona=persona.value,
                    start_date=stay_start_date,
                    end_date=stay_end_date,
                )
            )

    write_audit_log(
        db,
        action="USER_UPDATED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={
            "updatedFields": sorted(fields),
            "emailVerificationRequired": email_changed,
        },
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    db.refresh(target)
    return _managed_user_response(db, target, activation_url)


@users_router.post(
    "/{user_id}/force-logout",
    response_model=ActionSuccessResponse,
    summary="Force logout user by revoking all their active sessions",
)
def force_logout_user(
    user_id: str,
    request: Request,
    body: ReasonRequest = ReasonRequest(),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    revoke_all_user_sessions(db, target.id, reason="ADMIN_FORCE_LOGOUT")

    write_audit_log(
        db,
        action="FORCE_LOGOUT",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={"reason": body.reason or "Administrative action"},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Security Notice: Active Sessions Terminated",
            body="An administrator has terminated all active sessions for your account.",
            metadata={"reason": body.reason},
        )
    db.commit()

    return ActionSuccessResponse(message="All sessions revoked successfully", targetUserId=target.id)


@users_router.post(
    "/{user_id}/reset-mfa",
    response_model=ActionSuccessResponse,
    summary="Reset MFA credentials for a user and revoke their sessions",
)
def reset_user_mfa(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    target.mfa_enabled = False
    target.mfa_secret_encrypted = None
    target.last_totp_step = None

    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == target.id).delete()
    revoke_all_user_sessions(db, target.id, reason="MFA_RESET_BY_ADMIN")

    write_audit_log(
        db,
        action="MFA_RESET",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={"reset_by": admin_user.id},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Security Notice: Two-Factor Authentication Reset",
            body="Two-factor authentication has been reset on your account by an administrator. Please configure MFA on your next sign-in.",
        )
    db.commit()

    return ActionSuccessResponse(message="User MFA has been reset", targetUserId=target.id)


@users_router.post(
    "/{user_id}/suspend",
    response_model=ActionSuccessResponse,
    summary="Suspend a user account and terminate all active sessions",
)
def suspend_user(
    user_id: str,
    request: Request,
    body: ReasonRequest = ReasonRequest(),
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)
    _ensure_admin_can_suspend(db, admin_user, target)

    target.status = UserStatus.SUSPENDED
    revoke_all_user_sessions(db, target.id, reason="USER_SUSPENDED")

    write_audit_log(
        db,
        action="USER_SUSPENDED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={"reason": body.reason or "Administrative suspension"},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Account Suspended",
            body=f"Your account has been suspended by an administrator. Reason: {body.reason or 'Administrative action'}.",
        )
    db.commit()

    return ActionSuccessResponse(message="User account suspended", targetUserId=target.id)


@users_router.post(
    "/{user_id}/reactivate",
    response_model=ActionSuccessResponse,
    summary="Reactivate a suspended user account",
)
def reactivate_user(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    target.status = UserStatus.ACTIVE

    write_audit_log(
        db,
        action="USER_REACTIVATED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Account Reactivated",
            body="Your Haven Stays account has been reactivated. You may now sign in.",
        )
    db.commit()

    return ActionSuccessResponse(message="User account reactivated", targetUserId=target.id)


@users_router.post(
    "/{user_id}/resend-invite",
    response_model=ActionSuccessResponse,
    summary="Resend activation invite for pending activation users",
)
def resend_user_invite(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)

    if target.status != UserStatus.PENDING_ACTIVATION:
        raise BadRequestError("Only pending activation accounts can be resent invitations", code="INVALID_STATUS")

    # Invalidate older tokens
    db.query(VerificationToken).filter(
        VerificationToken.user_id == target.id,
        VerificationToken.token_type.in_(["ACTIVATION", "EMAIL_VERIFY"]),
    ).update({"is_used": True})

    raw_token, token_hash = generate_one_time_token()
    token = VerificationToken(
        user_id=target.id,
        token_hash=token_hash,
        token_type="ACTIVATION",
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(token)
    db.flush()

    write_audit_log(
        db,
        action="INVITE_RESENT",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    if target.email:
        activation_url = f"{settings.PUBLIC_WEBSITE_URL}/activate?token={raw_token}"
        notifier.send_notification(
            db=db,
            channel="EMAIL",
            destination=target.email,
            subject="Invitation to Haven Stays",
            body=f"You have been invited to Haven Stays. Complete your activation here: {activation_url}",
        )
    db.commit()

    return ActionSuccessResponse(message="Activation invitation resent", targetUserId=target.id)


@users_router.post(
    "/{user_id}/issue-reset-link",
    response_model=ActionSuccessResponse,
    summary="Send a password reset link to a user",
)
def issue_password_reset_link(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)
    if target.id == admin_user.id:
        raise ForbiddenError("An admin cannot issue a reset link for their own account", code="SELF_ACTION")
    if not target.email:
        raise BadRequestError("The user does not have an email address", code="MISSING_EMAIL")
    rate_limiter.check(
        key=f"admin_password_reset:{admin_user.id}:{target.id}",
        max_requests=3,
        window_seconds=3600,
    )

    db.query(VerificationToken).filter(
        VerificationToken.user_id == target.id,
        VerificationToken.token_type == "PASSWORD_RESET",
        VerificationToken.is_used == False,
    ).update({"is_used": True})
    raw_token, token_hash = generate_one_time_token()
    db.add(
        VerificationToken(
            user_id=target.id,
            token_hash=token_hash,
            token_type="PASSWORD_RESET",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
    )

    is_admin_account = target.role in (Role.ADMIN, Role.STAFF)
    reset_base = (settings.ADMIN_PANEL_URL if is_admin_account else settings.PUBLIC_WEBSITE_URL).rstrip("/")
    reset_mode = "&mode=reset" if is_admin_account else ""
    reset_url = (
        f"{reset_base}/?token={raw_token}{reset_mode}"
        if is_admin_account
        else f"{reset_base}/reset-password?token={raw_token}"
    )
    write_audit_log(
        db,
        action="PASSWORD_RESET_LINK_ISSUED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    notifier.send_notification(
        db=db,
        channel="EMAIL",
        destination=target.email,
        subject="Haven Stays - Password Reset Instructions",
        body=f"An administrator requested a password reset link for your account: {reset_url}. This link expires in 15 minutes.",
    )
    db.commit()

    return ActionSuccessResponse(message="Password reset link sent", targetUserId=target.id)
