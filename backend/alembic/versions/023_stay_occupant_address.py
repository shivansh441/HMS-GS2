"""Add addresses to additional stay occupants.

Revision ID: 023_stay_occupant_address
Revises: 022_user_occupant_dob
Create Date: 2026-11-11
"""

import sqlalchemy as sa

from alembic import op

revision = "023_stay_occupant_address"
down_revision = "022_user_occupant_dob"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stay_occupants",
        sa.Column("permanent_address", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stay_occupants", "permanent_address")
