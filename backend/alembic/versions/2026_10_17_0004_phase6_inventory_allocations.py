"""Phase 6 Inventory Management & Allocations Schema.

Revision ID: 2026_10_17_0004
Revises: 2026_10_17_0003
Create Date: 2026-10-17 19:30:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2026_10_17_0004"
down_revision: str | None = "2026_10_17_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add operational notes and audit user tracking to inventory_allocations
    op.add_column(
        "inventory_allocations",
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "inventory_allocations",
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
    )
    # Add index for rapid property-level allocation date-range querying
    op.create_index(
        "ix_alloc_property_dates",
        "inventory_allocations",
        ["property_id", "check_in_date", "check_out_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_alloc_property_dates", table_name="inventory_allocations")
    op.drop_column("inventory_allocations", "created_by_user_id")
    op.drop_column("inventory_allocations", "notes")
