"""Store group guest details with managed stays.

Revision ID: 020_stay_guest_details
Revises: 019_encrypted_occupant_ids
Create Date: 2026-11-10
"""

import sqlalchemy as sa

from alembic import op

revision = "020_stay_guest_details"
down_revision = "019_encrypted_occupant_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("stay_records") as batch_op:
        batch_op.add_column(
            sa.Column("guest_count", sa.Integer(), server_default="1", nullable=False)
        )
        batch_op.create_check_constraint(
            "ck_stay_records_guest_count",
            "guest_count >= 1",
        )
    op.create_table(
        "stay_occupants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("stay_record_id", sa.String(length=36), nullable=False),
        sa.Column("first_name", sa.String(length=50), nullable=False),
        sa.Column("last_name", sa.String(length=50), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(length=16), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("id_document_type", sa.String(length=64), nullable=False),
        sa.Column("id_document_number_encrypted", sa.Text(), nullable=False),
        sa.Column("id_document_last4", sa.String(length=8), nullable=False),
        sa.ForeignKeyConstraint(
            ["stay_record_id"], ["stay_records.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_stay_occupants_stay_record_id",
        "stay_occupants",
        ["stay_record_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_stay_occupants_stay_record_id", table_name="stay_occupants")
    op.drop_table("stay_occupants")
    with op.batch_alter_table("stay_records") as batch_op:
        batch_op.drop_constraint("ck_stay_records_guest_count", type_="check")
        batch_op.drop_column("guest_count")
