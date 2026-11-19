"""Persist reusable occupant profiles for customer accounts.

Revision ID: 028_customer_occupant_profiles
Revises: 027_customer_persona
"""

from datetime import datetime, timezone
import hashlib
import uuid

import sqlalchemy as sa

from alembic import op
from app.core.crypto import decrypt_data

revision = "028_customer_occupant_profiles"
down_revision = "027_customer_persona"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_occupant_profiles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "owner_user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("full_name", sa.String(length=128), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(length=16), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("permanent_address", sa.String(length=512), nullable=True),
        sa.Column("id_document_type", sa.String(length=64), nullable=False),
        sa.Column("id_document_number_encrypted", sa.Text(), nullable=False),
        sa.Column("id_document_last4", sa.String(length=8), nullable=False),
        sa.Column("id_document_lookup_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "owner_user_id",
            "id_document_lookup_hash",
            name="uq_customer_occupant_owner_document",
        ),
    )
    op.create_index(
        "ix_customer_occupant_profiles_owner_user_id",
        "customer_occupant_profiles",
        ["owner_user_id"],
    )
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        with op.batch_alter_table("reservation_occupants") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "profile_id",
                    sa.String(length=36),
                    sa.ForeignKey(
                        "customer_occupant_profiles.id",
                        ondelete="SET NULL",
                        name="fk_reservation_occupants_profile_id",
                    ),
                    nullable=True,
                )
            )
        with op.batch_alter_table("stay_occupants") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "profile_id",
                    sa.String(length=36),
                    sa.ForeignKey(
                        "customer_occupant_profiles.id",
                        ondelete="SET NULL",
                        name="fk_stay_occupants_profile_id",
                    ),
                    nullable=True,
                )
            )
    else:
        op.add_column(
            "reservation_occupants",
            sa.Column(
                "profile_id",
                sa.String(length=36),
                sa.ForeignKey(
                    "customer_occupant_profiles.id",
                    ondelete="SET NULL",
                    name="fk_reservation_occupants_profile_id",
                ),
                nullable=True,
            ),
        )
        op.add_column(
            "stay_occupants",
            sa.Column(
                "profile_id",
                sa.String(length=36),
                sa.ForeignKey(
                    "customer_occupant_profiles.id",
                    ondelete="SET NULL",
                    name="fk_stay_occupants_profile_id",
                ),
                nullable=True,
            ),
        )

    occupants = connection.execute(
        sa.text(
            """
            SELECT so.id, sr.user_id, so.full_name, so.date_of_birth, so.age,
                   so.gender, so.email, so.phone, so.permanent_address,
                   so.id_document_type, so.id_document_number_encrypted,
                   so.id_document_last4
            FROM stay_occupants AS so
            JOIN stay_records AS sr ON sr.id = so.stay_record_id
            ORDER BY sr.created_at, so.id
            """
        )
    ).mappings()
    profiles_by_owner_and_document: dict[tuple[str, str], str] = {}
    created_at = datetime.now(timezone.utc)
    for occupant in occupants:
        document_number = decrypt_data(
            occupant["id_document_number_encrypted"]
        ).strip().upper()
        document_hash = hashlib.sha256(document_number.encode("utf-8")).hexdigest()
        key = (occupant["user_id"], document_hash)
        profile_id = profiles_by_owner_and_document.get(key)
        if profile_id is None:
            profile_id = str(uuid.uuid4())
            profiles_by_owner_and_document[key] = profile_id
            connection.execute(
                sa.text(
                    """
                    INSERT INTO customer_occupant_profiles (
                        id, owner_user_id, full_name, date_of_birth, age, gender,
                        email, phone, permanent_address, id_document_type,
                        id_document_number_encrypted, id_document_last4,
                        id_document_lookup_hash, created_at, updated_at
                    ) VALUES (
                        :id, :owner_user_id, :full_name, :date_of_birth, :age,
                        :gender, :email, :phone, :permanent_address,
                        :id_document_type, :id_document_number_encrypted,
                        :id_document_last4, :id_document_lookup_hash,
                        :created_at, :updated_at
                    )
                    """
                ),
                {
                    "id": profile_id,
                    "owner_user_id": occupant["user_id"],
                    "full_name": occupant["full_name"],
                    "date_of_birth": occupant["date_of_birth"],
                    "age": occupant["age"],
                    "gender": occupant["gender"],
                    "email": occupant["email"],
                    "phone": occupant["phone"],
                    "permanent_address": occupant["permanent_address"],
                    "id_document_type": occupant["id_document_type"],
                    "id_document_number_encrypted": occupant[
                        "id_document_number_encrypted"
                    ],
                    "id_document_last4": occupant["id_document_last4"],
                    "id_document_lookup_hash": document_hash,
                    "created_at": created_at,
                    "updated_at": created_at,
                },
            )
        connection.execute(
            sa.text("UPDATE stay_occupants SET profile_id = :profile_id WHERE id = :id"),
            {"profile_id": profile_id, "id": occupant["id"]},
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("stay_occupants") as batch_op:
            batch_op.drop_column("profile_id")
        with op.batch_alter_table("reservation_occupants") as batch_op:
            batch_op.drop_column("profile_id")
    else:
        op.drop_column("stay_occupants", "profile_id")
        op.drop_column("reservation_occupants", "profile_id")
    op.drop_index(
        "ix_customer_occupant_profiles_owner_user_id",
        table_name="customer_occupant_profiles",
    )
    op.drop_table("customer_occupant_profiles")
