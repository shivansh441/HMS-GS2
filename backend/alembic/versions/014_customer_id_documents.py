"""Track encrypted customer ID scan uploads.

Revision ID: 014_customer_id_documents
Revises: 013_staff_payroll
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "014_customer_id_documents"
down_revision = "013_staff_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "id_document_file_present" not in existing_columns:
        op.add_column(
            "users",
            sa.Column(
                "id_document_file_present",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
        op.alter_column("users", "id_document_file_present", server_default=None)
    if "id_document_file_media_type" not in existing_columns:
        op.add_column(
            "users",
            sa.Column("id_document_file_media_type", sa.String(length=64), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("users", "id_document_file_media_type")
    op.drop_column("users", "id_document_file_present")
