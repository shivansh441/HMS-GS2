import os
from pathlib import Path
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import encrypt_bytes, process_id_document
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.db.models import CustomerOccupantProfile, User
from app.db.session import get_db
from app.modules.auth.deps import get_current_customer
from app.modules.auth.schemas import CustomerProfileUpdateRequest, GovernmentIdType
from app.modules.customer.occupant_service import create_or_update_occupant_profile
from app.modules.inventory.router import _stay_history_response, _stay_history_rows
from app.modules.inventory.schemas import StayHistoryItem
from app.modules.me.router import apply_customer_profile_update

customer_router = APIRouter(prefix="/customer", tags=["Customer Portal"])

MAX_ID_DOCUMENT_BYTES = 8 * 1024 * 1024
ALLOWED_ID_MEDIA_TYPES = {
    "application/pdf": b"%PDF-",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
}


class CustomerProfileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    full_name: str | None = Field(alias="fullName")
    email: str | None
    pending_email: str | None = Field(alias="pendingEmail")
    phone: str | None
    gender: str | None
    email_verified: bool = Field(alias="emailVerified")
    phone_verified: bool = Field(alias="phoneVerified")
    id_document_type: str | None = Field(alias="idDocumentType")
    id_document_last4: str | None = Field(alias="idDocumentLast4")
    id_document_file_present: bool = Field(alias="idDocumentFilePresent")
    id_document_file_media_type: str | None = Field(alias="idDocumentFileMediaType")


class CustomerOccupantProfileCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    full_name: str = Field(alias="fullName", min_length=1, max_length=128)
    date_of_birth: date | None = Field(default=None, alias="dateOfBirth")
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, max_length=16)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    id_document_type: GovernmentIdType = Field(alias="idDocumentType")
    id_document_number: str = Field(alias="idDocumentNumber", min_length=2, max_length=128)

    def validate_birth_date(self) -> None:
        if self.date_of_birth and self.date_of_birth > date.today():
            raise BadRequestError("Date of birth cannot be in the future")


class CustomerOccupantProfileUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    full_name: str | None = Field(default=None, alias="fullName", min_length=1, max_length=128)
    date_of_birth: date | None = Field(default=None, alias="dateOfBirth")
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = Field(default=None, max_length=16)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    permanent_address: str | None = Field(default=None, alias="permanentAddress", max_length=512)
    id_document_type: GovernmentIdType | None = Field(default=None, alias="idDocumentType")
    id_document_number: str | None = Field(
        default=None, alias="idDocumentNumber", min_length=2, max_length=128
    )


class CustomerOccupantProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    full_name: str = Field(alias="fullName")
    date_of_birth: date | None = Field(alias="dateOfBirth")
    age: int | None
    gender: str | None
    email: str | None
    phone: str | None
    permanent_address: str | None = Field(alias="permanentAddress")
    id_document_type: str = Field(alias="idDocumentType")
    id_document_last4: str = Field(alias="idDocumentLast4")


def _profile_response(user: User) -> CustomerProfileResponse:
    return CustomerProfileResponse(
        id=user.id,
        fullName=user.full_name,
        email=user.email,
        pendingEmail=user.pending_email,
        phone=user.phone,
        gender=user.gender,
        emailVerified=user.email_verified_at is not None,
        phoneVerified=user.phone_verified_at is not None,
        idDocumentType=user.id_document_type,
        idDocumentLast4=user.id_document_last4,
        idDocumentFilePresent=user.id_document_file_present,
        idDocumentFileMediaType=user.id_document_file_media_type,
    )


def _valid_document_content(media_type: str | None, content: bytes) -> bool:
    signature = ALLOWED_ID_MEDIA_TYPES.get(media_type or "")
    return bool(signature and content.startswith(signature))


def _occupant_profile_response(
    profile: CustomerOccupantProfile,
) -> CustomerOccupantProfileResponse:
    return CustomerOccupantProfileResponse.model_validate(profile)


@customer_router.get(
    "/occupants",
    response_model=list[CustomerOccupantProfileResponse],
)
def list_customer_occupant_profiles(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    profiles = db.scalars(
        select(CustomerOccupantProfile)
        .where(CustomerOccupantProfile.owner_user_id == customer.id)
        .order_by(CustomerOccupantProfile.full_name, CustomerOccupantProfile.id)
    ).all()
    return [_occupant_profile_response(profile) for profile in profiles]


@customer_router.post(
    "/occupants",
    response_model=CustomerOccupantProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_customer_occupant_profile(
    payload: CustomerOccupantProfileCreate,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    payload.validate_birth_date()
    profile = create_or_update_occupant_profile(
        db,
        customer.id,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        age=payload.age,
        gender=payload.gender,
        email=payload.email,
        phone=payload.phone,
        permanent_address=payload.permanent_address,
        id_document_type=payload.id_document_type,
        id_document_number=payload.id_document_number,
    )
    db.commit()
    db.refresh(profile)
    return _occupant_profile_response(profile)


@customer_router.patch(
    "/occupants/{profile_id}",
    response_model=CustomerOccupantProfileResponse,
)
def update_customer_occupant_profile(
    profile_id: str,
    payload: CustomerOccupantProfileUpdate,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    profile = db.scalar(
        select(CustomerOccupantProfile)
        .where(
            CustomerOccupantProfile.id == profile_id,
            CustomerOccupantProfile.owner_user_id == customer.id,
        )
        .with_for_update()
    )
    if not profile:
        raise NotFoundError("Occupant profile not found")
    fields = payload.model_fields_set
    if "date_of_birth" in fields and payload.date_of_birth and payload.date_of_birth > date.today():
        raise BadRequestError("Date of birth cannot be in the future")
    if "id_document_number" in fields and payload.id_document_number:
        if not payload.id_document_type and "id_document_type" in fields:
            raise BadRequestError("Select an ID type when changing the ID number")
        document_type = payload.id_document_type or profile.id_document_type
        encrypted, last4, lookup_hash = process_id_document(payload.id_document_number)
        duplicate = db.scalar(
            select(CustomerOccupantProfile.id).where(
                CustomerOccupantProfile.owner_user_id == customer.id,
                CustomerOccupantProfile.id_document_lookup_hash == lookup_hash,
                CustomerOccupantProfile.id != profile.id,
            )
        )
        if duplicate:
            raise ConflictError(
                "Another occupant profile already uses this government ID",
                code="OCCUPANT_PROFILE_EXISTS",
            )
        profile.id_document_number_encrypted = encrypted
        profile.id_document_last4 = last4
        profile.id_document_lookup_hash = lookup_hash
        profile.id_document_type = document_type
    elif "id_document_type" in fields and payload.id_document_type:
        profile.id_document_type = payload.id_document_type
    for field in (
        "full_name",
        "date_of_birth",
        "age",
        "gender",
        "email",
        "phone",
        "permanent_address",
    ):
        if field in fields:
            setattr(profile, field, getattr(payload, field))
    db.commit()
    db.refresh(profile)
    return _occupant_profile_response(profile)


@customer_router.delete("/occupants/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer_occupant_profile(
    profile_id: str,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    profile = db.scalar(
        select(CustomerOccupantProfile).where(
            CustomerOccupantProfile.id == profile_id,
            CustomerOccupantProfile.owner_user_id == customer.id,
        )
    )
    if not profile:
        raise NotFoundError("Occupant profile not found")
    db.delete(profile)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@customer_router.get("/profile", response_model=CustomerProfileResponse)
def get_customer_portal_profile(
    customer: User = Depends(get_current_customer),
):
    return _profile_response(customer)


@customer_router.patch("/profile", response_model=CustomerProfileResponse)
def update_customer_portal_profile(
    payload: CustomerProfileUpdateRequest,
    request: Request,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    apply_customer_profile_update(payload, request, customer, db)
    return _profile_response(customer)


@customer_router.post("/profile/id-document", response_model=CustomerProfileResponse, status_code=201)
async def upload_customer_id_document(
    document_type: GovernmentIdType = Form(alias="documentType"),
    document_number: str = Form(alias="documentNumber", min_length=2, max_length=128),
    file: UploadFile = File(...),
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    media_type = (file.content_type or "").lower()
    content = await file.read(MAX_ID_DOCUMENT_BYTES + 1)
    if not content:
        raise BadRequestError("The ID document file is empty", code="EMPTY_ID_DOCUMENT")
    if len(content) > MAX_ID_DOCUMENT_BYTES:
        raise BadRequestError("ID document files must be 8 MB or smaller", code="ID_DOCUMENT_TOO_LARGE")
    if not _valid_document_content(media_type, content):
        raise BadRequestError(
            "Upload a valid PDF, JPEG, or PNG document",
            code="UNSUPPORTED_ID_DOCUMENT",
        )

    clean_number = document_number.strip()
    if not clean_number:
        raise BadRequestError("ID document number is required", code="INVALID_ID_DOCUMENT")
    encrypted_number, last4, lookup_hash = process_id_document(clean_number)
    encrypted_file = encrypt_bytes(content)

    storage_dir = Path(settings.ID_DOCUMENT_STORAGE_DIR)
    storage_dir.mkdir(parents=True, exist_ok=True)
    target_path = storage_dir / f"{customer.id}.enc"
    temporary_path = storage_dir / f".{customer.id}.{uuid4().hex}.tmp"
    previous_file = target_path.read_bytes() if target_path.exists() else None

    try:
        temporary_path.write_bytes(encrypted_file)
        os.replace(temporary_path, target_path)
        customer.id_document_type = document_type
        customer.id_document_number_encrypted = encrypted_number
        customer.id_document_last4 = last4
        customer.id_document_lookup_hash = lookup_hash
        customer.id_document_file_present = True
        customer.id_document_file_media_type = media_type
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        if previous_file is None:
            target_path.unlink(missing_ok=True)
        else:
            restore_path = storage_dir / f".{customer.id}.{uuid4().hex}.restore"
            restore_path.write_bytes(previous_file)
            os.replace(restore_path, target_path)
        raise
    finally:
        temporary_path.unlink(missing_ok=True)

    db.refresh(customer)
    return _profile_response(customer)


@customer_router.get("/stays/history", response_model=list[StayHistoryItem])
def get_customer_portal_stay_history(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    return _stay_history_response(_stay_history_rows(db, customer.id))
