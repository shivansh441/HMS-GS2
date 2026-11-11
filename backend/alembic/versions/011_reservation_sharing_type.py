"""Store sharing type requested by reservation leads.

Revision ID: 011_reservation_sharing_type
Revises: 010_monthly_billing_ledger
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "011_reservation_sharing_type"
down_revision = "010_monthly_billing_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("reservation_requests")
    }
    if "requested_sharing_type" not in existing_columns:
        op.add_column(
            "reservation_requests",
            sa.Column("requested_sharing_type", sa.String(length=32), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("reservation_requests", "requested_sharing_type")
