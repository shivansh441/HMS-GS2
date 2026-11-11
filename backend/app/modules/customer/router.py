import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import encrypt_bytes, process_id_document
from app.core.errors import BadRequestError
from app.db.models import User
from app.db.session import get_db
from app.modules.auth.deps import get_current_customer
from app.modules.auth.schemas import CustomerProfileUpdateRequest, GovernmentIdType
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
