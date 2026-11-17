"""Store configured additional monthly fees on invoices.

Revision ID: 026_invoice_additional_fees
Revises: 025_staff_advance_payments
Create Date: 2026-11-16
"""

import sqlalchemy as sa

from alembic import op

revision = "026_invoice_additional_fees"
down_revision = "025_staff_advance_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "monthly_invoices",
        sa.Column(
            "additional_fees",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("monthly_invoices", "additional_fees")
