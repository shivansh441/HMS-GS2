from datetime import date
import secrets
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_data, process_id_document
from app.core.errors import BadRequestError, ConflictError
from app.core.permissions import CustomerLinkSource, Role, UserStatus
from app.core.security import hash_password
from app.db.models import (
    CustomerPersona,
    CustomerPropertyLink,
    CustomerOccupantProfile,
    ReservationOccupant,
    StayOccupant,
    StayRecord,
    User,
)


def get_owned_occupant_profiles(
    db: Session,
    owner_user_id: str,
    profile_ids: Iterable[str],
) -> list[CustomerOccupantProfile]:
    requested_ids = list(profile_ids)
    if len(requested_ids) != len(set(requested_ids)):
        raise BadRequestError(
            "An occupant profile cannot be selected more than once",
            code="DUPLICATE_OCCUPANT_PROFILE",
        )
    if not requested_ids:
        return []
    profiles = db.scalars(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.owner_user_id == owner_user_id,
            CustomerOccupantProfile.id.in_(requested_ids),
        )
    ).all()
    profiles_by_id = {profile.id: profile for profile in profiles}
    if len(profiles_by_id) != len(requested_ids):
        raise BadRequestError(
            "One or more occupant profiles do not belong to this customer",
            code="OCCUPANT_PROFILE_NOT_OWNED",
        )
    return [profiles_by_id[profile_id] for profile_id in requested_ids]


def get_guest_accounts(
    db: Session,
    guest_user_ids: Iterable[str],
    primary_user_id: str,
) -> list[User]:
    requested_ids = list(guest_user_ids)
    if len(requested_ids) != len(set(requested_ids)):
        raise BadRequestError(
            "A guest account cannot be selected more than once",
            code="DUPLICATE_STAY_OCCUPANT",
        )
    if primary_user_id in requested_ids:
        raise BadRequestError(
            "The main guest cannot also be listed as an additional guest",
            code="DUPLICATE_STAY_OCCUPANT",
        )
    if not requested_ids:
        return []
    guests = db.scalars(
        select(User).where(
            User.id.in_(requested_ids),
            User.role == Role.CUSTOMER.value,
            User.status == UserStatus.ACTIVE.value,
            User.customer_persona == CustomerPersona.HOTEL_GUEST.value,
        )
    ).all()
    guests_by_id = {guest.id: guest for guest in guests}
    if len(guests_by_id) != len(requested_ids):
        raise BadRequestError(
            "One or more selected guests are not active hotel guest accounts",
            code="GUEST_ACCOUNT_NOT_AVAILABLE",
        )
    for guest in guests:
        if (
            not guest.email
            or not guest.phone
            or not guest.id_document_type
            or not guest.id_document_number_encrypted
        ):
            raise BadRequestError(
                "Each additional guest must have a unique email, phone, and government ID",
                code="GUEST_DETAILS_REQUIRED",
            )
    return [guests_by_id[guest_id] for guest_id in requested_ids]


def create_or_update_occupant_profile(
    db: Session,
    owner_user_id: str,
    *,
    full_name: str,
    date_of_birth: date | None,
    age: int | None,
    gender: str | None,
    email: str | None,
    phone: str | None,
    permanent_address: str | None,
    id_document_type: str,
    id_document_number: str,
) -> CustomerOccupantProfile:
    encrypted_document, last4, lookup_hash = process_id_document(id_document_number)
    profile = db.scalar(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.owner_user_id == owner_user_id,
            CustomerOccupantProfile.id_document_lookup_hash == lookup_hash,
        )
    )
    if profile is None:
        profile = CustomerOccupantProfile(
            owner_user_id=owner_user_id,
            id_document_lookup_hash=lookup_hash,
            id_document_number_encrypted=encrypted_document,
            id_document_last4=last4,
            id_document_type=id_document_type,
        )
        db.add(profile)
    profile.full_name = full_name.strip()
    profile.date_of_birth = date_of_birth
    profile.age = age
    profile.gender = gender
    profile.email = email
    profile.phone = phone
    profile.permanent_address = permanent_address
    profile.id_document_type = id_document_type
    profile.id_document_number_encrypted = encrypted_document
    profile.id_document_last4 = last4
    db.flush()
    return profile


def get_or_create_guest_account(
    db: Session,
    *,
    full_name: str,
    email: str | None,
    phone: str | None,
    date_of_birth: date | None,
    gender: str | None,
    permanent_address: str | None,
    id_document_type: str,
    id_document_number: str,
    property_id: str | None = None,
) -> User:
    normalized_email = (email or "").strip().lower()
    normalized_phone = (phone or "").strip()
    if not normalized_email or not normalized_phone:
        raise BadRequestError(
            "Each guest must have a unique email address and phone number",
            code="GUEST_CONTACT_REQUIRED",
        )

    encrypted_document, last4, lookup_hash = process_id_document(id_document_number)
    matches = db.scalars(
        select(User)
        .where(
            User.role == Role.CUSTOMER.value,
            User.id_document_lookup_hash == lookup_hash,
        )
        .with_for_update()
    ).all()
    if len(matches) > 1:
        raise ConflictError(
            "More than one customer account uses this government ID",
            code="GUEST_IDENTITY_AMBIGUOUS",
        )

    guest = matches[0] if matches else None
    if guest:
        if guest.status != UserStatus.ACTIVE.value:
            raise ConflictError(
                "The matching guest account is not active",
                code="GUEST_ACCOUNT_INACTIVE",
            )
        if guest.email != normalized_email or guest.phone != normalized_phone:
            raise ConflictError(
                "This government ID is already registered with different contact details",
                code="GUEST_IDENTITY_CONFLICT",
            )
    else:
        contact_match = db.scalar(
            select(User.id)
            .where(
                (User.email == normalized_email) | (User.phone == normalized_phone)
            )
            .limit(1)
        )
        if contact_match:
            raise ConflictError(
                "The guest email or phone number belongs to another account",
                code="GUEST_CONTACT_IN_USE",
            )
        guest = User(
            email=normalized_email,
            phone=normalized_phone,
            full_name=full_name.strip(),
            gender=gender,
            date_of_birth=date_of_birth,
            permanent_address=permanent_address,
            id_document_type=id_document_type,
            id_document_number_encrypted=encrypted_document,
            id_document_last4=last4,
            id_document_lookup_hash=lookup_hash,
            password_hash=hash_password(secrets.token_urlsafe(48)),
            role=Role.CUSTOMER.value,
            customer_persona=CustomerPersona.HOTEL_GUEST.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(guest)
        db.flush()

    guest.customer_persona = CustomerPersona.HOTEL_GUEST.value
    if property_id and not db.scalar(
        select(CustomerPropertyLink.id).where(
            CustomerPropertyLink.user_id == guest.id,
            CustomerPropertyLink.property_id == property_id,
        )
    ):
        db.add(
            CustomerPropertyLink(
                user_id=guest.id,
                property_id=property_id,
                source=CustomerLinkSource.BOOKING.value,
            )
        )
    db.flush()
    return guest


def get_or_create_guest_account_from_profile(
    db: Session,
    profile: CustomerOccupantProfile,
    property_id: str | None = None,
) -> User:
    if not profile.email or not profile.phone:
        raise BadRequestError(
            "Each guest must have a unique email address and phone number",
            code="GUEST_CONTACT_REQUIRED",
        )
    return get_or_create_guest_account(
        db,
        full_name=profile.full_name,
        email=profile.email,
        phone=profile.phone,
        date_of_birth=profile.date_of_birth,
        gender=profile.gender,
        permanent_address=profile.permanent_address,
        id_document_type=profile.id_document_type,
        id_document_number=decrypt_data(profile.id_document_number_encrypted),
        property_id=property_id,
    )


def sync_profile_from_stay_occupant(
    db: Session,
    owner_user_id: str,
    occupant: StayOccupant,
    id_document_number: str | None = None,
    property_id: str | None = None,
) -> CustomerOccupantProfile:
    document_number = id_document_number or decrypt_data(
        occupant.id_document_number_encrypted
    )
    encrypted_document, last4, lookup_hash = process_id_document(document_number)
    existing_guest = (
        db.get(User, occupant.guest_user_id) if occupant.guest_user_id else None
    )
    email = occupant.email or (existing_guest.email if existing_guest else None)
    phone = occupant.phone or (existing_guest.phone if existing_guest else None)
    if not email or not phone:
        raise BadRequestError(
            "Each guest must have a unique email address and phone number",
            code="GUEST_CONTACT_REQUIRED",
        )
    profile = (
        db.get(CustomerOccupantProfile, occupant.profile_id)
        if occupant.profile_id
        else None
    )
    duplicate = db.scalar(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.owner_user_id == owner_user_id,
            CustomerOccupantProfile.id_document_lookup_hash == lookup_hash,
        )
    )
    if duplicate and profile and duplicate.id != profile.id:
        raise BadRequestError(
            "Another saved occupant already uses this government ID",
            code="OCCUPANT_PROFILE_EXISTS",
        )
    profile = duplicate or profile
    if profile and profile.owner_user_id != owner_user_id:
        raise BadRequestError(
            "Occupant profile does not belong to this customer",
            code="OCCUPANT_PROFILE_NOT_OWNED",
        )
    if profile is None:
        profile = CustomerOccupantProfile(owner_user_id=owner_user_id)
        db.add(profile)
    profile.full_name = occupant.full_name
    profile.date_of_birth = occupant.date_of_birth
    profile.age = occupant.age
    profile.gender = occupant.gender
    profile.email = email
    profile.phone = phone
    profile.permanent_address = occupant.permanent_address
    profile.id_document_type = occupant.id_document_type
    profile.id_document_number_encrypted = encrypted_document
    profile.id_document_last4 = last4
    profile.id_document_lookup_hash = lookup_hash
    db.flush()
    occupant.profile_id = profile.id
    guest = get_or_create_guest_account(
        db,
        full_name=occupant.full_name,
        email=email,
        phone=phone,
        date_of_birth=occupant.date_of_birth,
        gender=occupant.gender,
        permanent_address=occupant.permanent_address,
        id_document_type=occupant.id_document_type,
        id_document_number=document_number,
        property_id=property_id,
    )
    occupant.guest_user_id = guest.id
    occupant.email = email
    occupant.phone = phone
    return profile


def stay_occupant_from_profile(
    profile: CustomerOccupantProfile,
    stay_record: StayRecord,
    guest_user_id: str | None = None,
) -> StayOccupant:
    return StayOccupant(
        guest_user_id=guest_user_id,
        profile_id=profile.id,
        stay_record=stay_record,
        full_name=profile.full_name,
        date_of_birth=profile.date_of_birth,
        age=profile.age,
        gender=profile.gender,
        email=profile.email,
        phone=profile.phone,
        permanent_address=profile.permanent_address,
        id_document_type=profile.id_document_type,
        id_document_number_encrypted=profile.id_document_number_encrypted,
        id_document_last4=profile.id_document_last4,
    )


def copy_stay_occupant_to_record(
    occupant: StayOccupant,
    stay_record: StayRecord,
) -> StayOccupant:
    return StayOccupant(
        guest_user_id=occupant.guest_user_id,
        profile_id=occupant.profile_id,
        stay_record=stay_record,
        full_name=occupant.full_name,
        date_of_birth=occupant.date_of_birth,
        age=occupant.age,
        gender=occupant.gender,
        email=occupant.email,
        phone=occupant.phone,
        permanent_address=occupant.permanent_address,
        id_document_type=occupant.id_document_type,
        id_document_number_encrypted=occupant.id_document_number_encrypted,
        id_document_last4=occupant.id_document_last4,
    )


def stay_occupant_from_guest_account(
    db: Session,
    owner_user_id: str,
    stay_record: StayRecord,
    guest: User,
) -> StayOccupant:
    if not guest.id_document_type or not guest.id_document_number_encrypted:
        raise BadRequestError(
            "Every additional guest needs a government ID before check-in",
            code="GUEST_ID_REQUIRED",
        )
    profile = create_or_update_occupant_profile(
        db,
        owner_user_id,
        full_name=guest.full_name or "",
        date_of_birth=guest.date_of_birth,
        age=None,
        gender=guest.gender,
        email=guest.email,
        phone=guest.phone,
        permanent_address=guest.permanent_address,
        id_document_type=guest.id_document_type,
        id_document_number=decrypt_data(guest.id_document_number_encrypted),
    )
    return stay_occupant_from_profile(profile, stay_record, guest.id)


def profile_from_reservation_occupant(
    db: Session,
    owner_user_id: str,
    occupant: ReservationOccupant,
) -> CustomerOccupantProfile:
    if occupant.profile_id:
        profile = db.get(CustomerOccupantProfile, occupant.profile_id)
        if profile and profile.owner_user_id == owner_user_id:
            return profile
    encrypted_document = occupant.id_number_encrypted
    if not encrypted_document:
        raise BadRequestError(
            "A government ID is required to save this occupant for future bookings",
            code="OCCUPANT_ID_REQUIRED",
        )
    profile = create_or_update_occupant_profile(
        db,
        owner_user_id,
        full_name=" ".join(
            part for part in (occupant.first_name, occupant.last_name) if part
        ),
        date_of_birth=None,
        age=occupant.age,
        gender=occupant.gender,
        email=occupant.email,
        phone=occupant.phone,
        permanent_address=None,
        id_document_type=occupant.id_type or "OTHER_GOVERNMENT_ID",
        id_document_number=decrypt_data(encrypted_document),
    )
    occupant.profile_id = profile.id
    return profile


def stay_occupant_from_reservation(
    db: Session,
    owner_user_id: str,
    stay_record: StayRecord,
    occupant: ReservationOccupant,
) -> StayOccupant:
    profile = profile_from_reservation_occupant(db, owner_user_id, occupant)
    encrypted_document = occupant.id_number_encrypted or profile.id_document_number_encrypted
    document_number = decrypt_data(encrypted_document)
    full_name = " ".join(
        part for part in (occupant.first_name, occupant.last_name) if part
    )
    return StayOccupant(
        profile_id=profile.id,
        stay_record=stay_record,
        full_name=full_name,
        age=occupant.age,
        gender=occupant.gender,
        email=occupant.email,
        phone=occupant.phone,
        id_document_type=occupant.id_type or profile.id_document_type,
        id_document_number_encrypted=encrypted_document,
        id_document_last4=document_number[-4:],
    )


def stay_occupant_from_reservation_occupant(
    db: Session,
    owner_user_id: str,
    stay_record: StayRecord,
    occupant: ReservationOccupant,
    property_id: str,
) -> StayOccupant:
    profile = profile_from_reservation_occupant(db, owner_user_id, occupant)
    encrypted_document = occupant.id_number_encrypted or profile.id_document_number_encrypted
    guest = get_or_create_guest_account(
        db,
        full_name=" ".join(
            part for part in (occupant.first_name, occupant.last_name) if part
        ),
        email=occupant.email or profile.email,
        phone=occupant.phone or profile.phone,
        date_of_birth=profile.date_of_birth,
        gender=occupant.gender or profile.gender,
        permanent_address=profile.permanent_address,
        id_document_type=occupant.id_type or profile.id_document_type,
        id_document_number=decrypt_data(encrypted_document),
        property_id=property_id,
    )
    if guest.id == owner_user_id:
        raise BadRequestError(
            "The primary guest cannot also be listed as an additional guest",
            code="DUPLICATE_RESERVATION_OCCUPANT",
        )
    occupant.guest_user_id = guest.id
    return stay_occupant_from_profile(profile, stay_record, guest.id)
