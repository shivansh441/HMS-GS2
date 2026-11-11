"""Store occupant identity document details.

Revision ID: 009_occupant_identity
Revises: 008_rent_water_flags
Create Date: 2026-10-28
"""

import sqlalchemy as sa

from alembic import op

revision = "009_occupant_identity"
down_revision = "008_rent_water_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("reservation_occupants")
    }
    if "id_type" not in existing_columns:
        op.add_column(
            "reservation_occupants",
            sa.Column("id_type", sa.String(length=64), nullable=True),
        )
    if "id_number" not in existing_columns:
        op.add_column(
            "reservation_occupants",
            sa.Column("id_number", sa.String(length=100), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("reservation_occupants", "id_number")
    op.drop_column("reservation_occupants", "id_type")
