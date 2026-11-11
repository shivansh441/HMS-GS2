import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from sqlalchemy import select
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
    StayOccupant,
    StayRecord,
    User,
    UserPropertyAccess,
    VerificationToken,
)
from app.db.session import get_db
from app.modules.audit.service import write_audit_log
from app.modules.auth.deps import get_current_admin_user, get_property_scope
from app.modules.auth.schemas import GovernmentIdType, UserResponse
from app.modules.auth.service import revoke_all_user_sessions
from app.modules.notifier.service import notifier

users_router = APIRouter(prefix="/admin/users", tags=["Admin Users"])


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    limit: int
    offset: int
    primaryAdminId: str | None


class ActionSuccessResponse(BaseModel):
    message: str
    targetUserId: str
    reset_url: str | None = Field(default=None, alias="resetUrl")
    activation_url: str | None = Field(default=None, alias="activationUrl")


class AdditionalGuestPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    date_of_birth: date = Field(alias="dateOfBirth")
    gender: str | None = Field(default=None, max_length=16)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    permanent_address: str | None = Field(
        default=None, alias="permanentAddress", max_length=512
    )
    id_document_type: GovernmentIdType = Field(alias="idDocumentType")
    id_document_number: str = Field(
        alias="idDocumentNumber", min_length=2, max_length=128
    )

    @model_validator(mode="after")
    def validate_date_of_birth(self):
        if self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class AdditionalGuestUpdatePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    id: str | None = Field(default=None, max_length=36)
    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    date_of_birth: date | None = Field(default=None, alias="dateOfBirth")
    gender: str | None = Field(default=None, max_length=16)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    permanent_address: str | None = Field(
        default=None, alias="permanentAddress", max_length=512
    )
    id_document_type: GovernmentIdType | None = Field(default=None, alias="idDocumentType")
    id_document_number: str | None = Field(
        default=None, alias="idDocumentNumber", min_length=2, max_length=128
    )

    @model_validator(mode="after")
    def validate_date_of_birth(self):
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    email: EmailStr
    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    phone: str = Field(min_length=5, max_length=32)
    gender: str | None = Field(default=None, max_length=16)
    date_of_birth: date = Field(alias="dateOfBirth")
    id_document_type: GovernmentIdType = Field(alias="idDocumentType")
    id_document_number: str = Field(alias="idDocumentNumber", min_length=2, max_length=128)
    role: Role
    staff_role: StaffRole | None = Field(default=None, alias="staffRole")
    property_ids: list[str] = Field(default_factory=list, alias="propertyIds", max_length=100)
    customer_persona: CustomerPersona | None = Field(default=None, alias="customerPersona")
    emergency_contact_phone: str | None = Field(default=None, alias="emergencyContactPhone", max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    occupation: str | None = Field(default=None, max_length=128)
    initial_stay_property_id: str | None = Field(default=None, alias="initialStayPropertyId")
    stay_start_date: date | None = Field(default=None, alias="stayStartDate")
    stay_end_date: date | None = Field(default=None, alias="stayEndDate")
    guest_count: int = Field(default=1, alias="guestCount", ge=1, le=100)
    additional_guests: list["AdditionalGuestPayload"] = Field(
        default_factory=list, alias="additionalGuests", max_length=99
    )

    @model_validator(mode="after")
    def validate_guest_count(self):
        if self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        is_hotel_guest = self.customer_persona == CustomerPersona.HOTEL_GUEST
        is_hostel_guest = self.customer_persona in (
            CustomerPersona.HOSTEL_GUEST,
            CustomerPersona.HOSTELER,
        )
        if self.role == Role.CUSTOMER and is_hotel_guest:
            if self.guest_count < len(self.additional_guests) + 1:
                raise ValueError("Guest count cannot be less than the listed occupants")
        if self.role == Role.CUSTOMER and is_hostel_guest:
            if self.guest_count != 1 or self.additional_guests:
                raise ValueError("Additional occupants are only supported for hotel guests")
        elif self.role != Role.CUSTOMER or not is_hotel_guest:
            if self.guest_count != 1 or self.additional_guests:
                raise ValueError("Occupant counts are only valid for customer hotel guests")
        return self


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, alias="fullName", min_length=1, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    gender: str | None = Field(default=None, max_length=16)
    date_of_birth: date | None = Field(default=None, alias="dateOfBirth")
    id_document_type: GovernmentIdType | None = Field(default=None, alias="idDocumentType")
    id_document_number: str | None = Field(
        default=None, alias="idDocumentNumber", min_length=2, max_length=128
    )
    staff_role: StaffRole | None = Field(default=None, alias="staffRole")
    property_ids: list[str] | None = Field(default=None, alias="propertyIds", max_length=100)
    customer_persona: CustomerPersona | None = Field(default=None, alias="customerPersona")
    emergency_contact_phone: str | None = Field(default=None, alias="emergencyContactPhone", max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    occupation: str | None = Field(default=None, max_length=128)
    initial_stay_property_id: str | None = Field(default=None, alias="initialStayPropertyId")
    stay_start_date: date | None = Field(default=None, alias="stayStartDate")
    stay_end_date: date | None = Field(default=None, alias="stayEndDate")
    guest_count: int | None = Field(default=None, alias="guestCount", ge=1, le=100)
    additional_guests: list[AdditionalGuestUpdatePayload] | None = Field(
        default=None, alias="additionalGuests", max_length=99
    )

    @model_validator(mode="after")
    def validate_date_of_birth(self):
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class ManagedStayOccupantResponse(BaseModel):
    id: str
    full_name: str = Field(alias="fullName")
    date_of_birth: date | None = Field(alias="dateOfBirth")
    gender: str | None
    email: str | None
    phone: str | None
    permanent_address: str | None = Field(alias="permanentAddress")
    id_document_type: str = Field(alias="idDocumentType")
    id_document_last4: str = Field(alias="idDocumentLast4")

    model_config = ConfigDict(populate_by_name=True)


class ManagedStayResponse(BaseModel):
    property_id: str = Field(alias="propertyId")
    start_date: date = Field(alias="startDate")
    end_date: date | None = Field(alias="endDate")
    guest_count: int = Field(default=1, alias="guestCount")
    additional_guests: list[ManagedStayOccupantResponse] = Field(
        default_factory=list, alias="additionalGuests"
    )

    model_config = ConfigDict(populate_by_name=True)


class ManagedUserResponse(UserResponse):
    property_ids: list[str] = Field(default_factory=list, alias="propertyIds")
    activation_url: str | None = Field(default=None, alias="activationUrl")
    id_document_type: str | None = Field(alias="idDocumentType")
    id_document_last4: str | None = Field(alias="idDocumentLast4")
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
        emergencyContactPhone=user.emergency_contact_phone,
        permanentAddress=user.permanent_address,
        occupation=user.occupation,
        initialStay=(
            ManagedStayResponse(
                propertyId=stay.property_id,
                startDate=stay.start_date,
                endDate=stay.end_date,
                guestCount=stay.guest_count,
                additionalGuests=[
                    ManagedStayOccupantResponse(
                        id=occupant.id,
                        fullName=occupant.full_name,
                        dateOfBirth=occupant.date_of_birth,
                        gender=occupant.gender,
                        email=occupant.email,
                        phone=occupant.phone,
                        permanentAddress=occupant.permanent_address,
                        idDocumentType=occupant.id_document_type,
                        idDocumentLast4=occupant.id_document_last4,
                    )
                    for occupant in stay.additional_guests
                ],
            )
            if stay
            else None
        ),
    )


def _validate_id_document(document_type: str | None, document_number: str | None) -> None:
    if bool(document_type) != bool(document_number):
        raise BadRequestError("Provide both ID document type and number, or leave both empty")


def _validate_customer_fields(
    role: Role,
    persona: CustomerPersona | None,
    emergency_contact_phone: str | None,
    occupation: str | None,
    initial_stay_property_id: str | None,
    stay_start_date: date | None,
    stay_end_date: date | None,
) -> None:
    customer_fields = (
        persona,
        emergency_contact_phone,
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
    activation_path = "/" if panel_account else "/activate"
    activation_url = f"{invite_base}{activation_path}?token={raw_token}"
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


def _primary_admin_id(db: Session) -> str | None:
    return db.scalar(
        select(User.id)
        .where(User.role == Role.ADMIN)
        .order_by(User.created_at, User.id)
        .limit(1)
    )


def _require_primary_admin(db: Session, admin_user: User) -> None:
    if admin_user.id != _primary_admin_id(db):
        raise ForbiddenError("Only the primary admin can manage other admin accounts", code="PRIMARY_ADMIN_REQUIRED")


@users_router.get(
    "",
    response_model=UserListResponse,
    summary="List users within authorized property scope with segment filters",
)
def list_users(
    role: str | None = Query(None, description="Filter by user role"),
    segment: str | None = Query(None, description="Optional segment filter (e.g. registered_no_booking)"),
    search: str | None = Query(None, description="Search by name or email"),
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
        primaryAdminId=_primary_admin_id(db),
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
        payload.emergency_contact_phone,
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

    encrypted_id = process_id_document(payload.id_document_number) if payload.id_document_number else None
    user = User(
        email=email,
        full_name=payload.full_name,
        phone=payload.phone,
        gender=payload.gender,
        date_of_birth=payload.date_of_birth,
        id_document_type=payload.id_document_type,
        id_document_number_encrypted=encrypted_id[0] if encrypted_id else None,
        id_document_last4=encrypted_id[1] if encrypted_id else None,
        id_document_lookup_hash=encrypted_id[2] if encrypted_id else None,
        password_hash=hash_password(secrets.token_urlsafe(48)),
        role=payload.role,
        staff_role=payload.staff_role.value if payload.staff_role else None,
        customer_persona=payload.customer_persona.value if payload.customer_persona else None,
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
        stay = StayRecord(
            user_id=user.id,
            property_id=payload.initial_stay_property_id,
            persona=payload.customer_persona.value,
            start_date=payload.stay_start_date,
            end_date=payload.stay_end_date,
            guest_count=payload.guest_count,
        )
        db.add(stay)
        db.flush()
        for guest in payload.additional_guests:
            encrypted_guest_id = process_id_document(guest.id_document_number)
            db.add(
                StayOccupant(
                    stay_record_id=stay.id,
                    full_name=guest.full_name,
                    date_of_birth=guest.date_of_birth,
                    gender=guest.gender,
                    email=str(guest.email) if guest.email else None,
                    phone=guest.phone,
                    permanent_address=guest.permanent_address,
                    id_document_type=guest.id_document_type,
                    id_document_number_encrypted=encrypted_guest_id[0],
                    id_document_last4=encrypted_guest_id[1],
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
            "emergency_contact_phone",
            "occupation",
            "initial_stay_property_id",
            "stay_start_date",
            "stay_end_date",
        )
    ):
        raise BadRequestError("Guest subtype and stay details are only valid for customer accounts")

    latest_stay = _latest_stay_record(db, target.id) if target.role == Role.CUSTOMER else None
    if "guest_count" in fields:
        effective_persona = (
            payload.customer_persona.value
            if "customer_persona" in fields and payload.customer_persona
            else latest_stay.persona if latest_stay else None
        )
        if (
            target.role != Role.CUSTOMER
            or latest_stay is None
            or payload.guest_count is None
            or effective_persona != CustomerPersona.HOTEL_GUEST.value
        ):
            raise BadRequestError("Occupant counts can only be updated for hotel guests")
        occupants = (
            payload.additional_guests
            if "additional_guests" in fields and payload.additional_guests is not None
            else latest_stay.additional_guests
        )
        if payload.guest_count < len(occupants) + 1:
            raise BadRequestError("Guest count cannot be less than the listed occupants")
        latest_stay.guest_count = payload.guest_count
    if "additional_guests" in fields:
        effective_persona = (
            payload.customer_persona.value
            if "customer_persona" in fields and payload.customer_persona
            else latest_stay.persona if latest_stay else None
        )
        if (
            target.role != Role.CUSTOMER
            or latest_stay is None
            or effective_persona != CustomerPersona.HOTEL_GUEST.value
            or payload.additional_guests is None
        ):
            raise BadRequestError("Additional occupants can only be updated for hotel guests")
        effective_guest_count = (
            payload.guest_count
            if "guest_count" in fields and payload.guest_count is not None
            else latest_stay.guest_count
        )
        if effective_guest_count < len(payload.additional_guests) + 1:
            raise BadRequestError("Guest count cannot be less than the listed occupants")

        existing_by_id = {occupant.id: occupant for occupant in latest_stay.additional_guests}
        submitted_ids = [guest.id for guest in payload.additional_guests if guest.id]
        if len(submitted_ids) != len(set(submitted_ids)):
            raise BadRequestError("An occupant cannot be submitted more than once")
        if any(occupant_id not in existing_by_id for occupant_id in submitted_ids):
            raise BadRequestError("One or more occupants do not belong to this stay")

        updated_occupants = []
        for guest in payload.additional_guests:
            occupant = existing_by_id.get(guest.id) if guest.id else None
            document_type = guest.id_document_type or (
                occupant.id_document_type if occupant else None
            )
            if occupant is None:
                if (
                    guest.date_of_birth is None
                    or document_type is None
                    or guest.id_document_number is None
                ):
                    raise BadRequestError(
                        "Date of birth and government ID are required for new occupants"
                    )
                encrypted_document = process_id_document(guest.id_document_number)
                occupant = StayOccupant(
                    stay_record_id=latest_stay.id,
                    id_document_type=document_type,
                    id_document_number_encrypted=encrypted_document[0],
                    id_document_last4=encrypted_document[1],
                )
            else:
                if (
                    guest.id_document_type
                    and guest.id_document_type != occupant.id_document_type
                    and not guest.id_document_number
                ):
                    raise BadRequestError(
                        "Provide the ID number when changing an occupant's ID type"
                    )
                if guest.id_document_number:
                    encrypted_document = process_id_document(guest.id_document_number)
                    occupant.id_document_number_encrypted = encrypted_document[0]
                    occupant.id_document_last4 = encrypted_document[1]
                if document_type:
                    occupant.id_document_type = document_type
                if "date_of_birth" in guest.model_fields_set:
                    occupant.date_of_birth = guest.date_of_birth

            occupant.full_name = guest.full_name
            occupant.gender = guest.gender
            occupant.email = str(guest.email) if guest.email else None
            occupant.phone = guest.phone
            occupant.permanent_address = guest.permanent_address
            updated_occupants.append(occupant)

        latest_stay.additional_guests = updated_occupants
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
            payload.emergency_contact_phone
            if "emergency_contact_phone" in fields
            else target.emergency_contact_phone,
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
    if "id_document_type" in fields or "id_document_number" in fields:
        _validate_id_document(payload.id_document_type, payload.id_document_number)
    elif not target.id_document_type or not target.id_document_number_encrypted:
        raise BadRequestError("A government ID is required for every user account")
    if "gender" in fields:
        target.gender = payload.gender
    if "date_of_birth" in fields:
        if payload.date_of_birth is None:
            raise BadRequestError("Date of birth is required")
        target.date_of_birth = payload.date_of_birth
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
    if target.id == admin_user.id:
        raise ForbiddenError("An admin cannot reactivate their own account", code="SELF_ACTION")
    if target.role == Role.ADMIN:
        _require_primary_admin(db, admin_user)
    if target.status not in (UserStatus.INACTIVE, UserStatus.SUSPENDED):
        raise BadRequestError("Only inactive or suspended accounts can be reactivated", code="INVALID_STATUS")

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
    "/{user_id}/deactivate",
    response_model=ActionSuccessResponse,
    summary="Set a user account inactive and terminate active sessions",
)
def deactivate_user(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)
    if target.id == admin_user.id:
        raise ForbiddenError("An admin cannot deactivate their own account", code="SELF_ACTION")
    if target.role == Role.ADMIN:
        _require_primary_admin(db, admin_user)
    if target.status == UserStatus.ARCHIVED:
        raise BadRequestError("Archived accounts cannot be deactivated", code="INVALID_STATUS")
    if target.status == UserStatus.INACTIVE:
        raise BadRequestError("The user account is already inactive", code="INVALID_STATUS")

    target.status = UserStatus.INACTIVE
    revoke_all_user_sessions(db, target.id, reason="USER_DEACTIVATED")
    write_audit_log(
        db,
        action="USER_DEACTIVATED",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return ActionSuccessResponse(message="User account set inactive", targetUserId=target.id)


@users_router.post(
    "/{user_id}/force-logout",
    response_model=ActionSuccessResponse,
    summary="Force logout an admin user by revoking all active sessions",
)
def force_logout_user(
    user_id: str,
    request: Request,
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    target = _get_target_user_for_mutation(db, admin_user, user_id)
    if target.id == admin_user.id:
        raise ForbiddenError("An admin cannot force logout their own account", code="SELF_ACTION")
    if target.role != Role.ADMIN:
        raise BadRequestError("Force logout is only available for other admin accounts", code="INVALID_ROLE")
    _require_primary_admin(db, admin_user)

    revoke_all_user_sessions(db, target.id, reason="ADMIN_FORCE_LOGOUT")
    write_audit_log(
        db,
        action="FORCE_LOGOUT",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()

    return ActionSuccessResponse(message="Admin user has been logged out", targetUserId=target.id)


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
    activation_url = _create_activation_invite(db, target)

    write_audit_log(
        db,
        action="INVITE_RESENT",
        actor_user_id=admin_user.id,
        target_user_id=target.id,
        details={},
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()

    return ActionSuccessResponse(
        message="A new activation link was generated and emailed to the user",
        targetUserId=target.id,
        activationUrl=activation_url,
    )


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

    return ActionSuccessResponse(
        message="Password reset link sent",
        targetUserId=target.id,
        resetUrl=reset_url,
    )
