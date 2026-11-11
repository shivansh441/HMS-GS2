"""Add date of birth to user accounts and stay occupants.

Revision ID: 022_user_occupant_dob
Revises: 021_remove_emergency_contact_name
Create Date: 2026-11-20
"""

import sqlalchemy as sa

from alembic import op

revision = "022_user_occupant_dob"
down_revision = "021_remove_emergency_contact_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("date_of_birth", sa.Date(), nullable=True),
    )
    op.add_column(
        "stay_occupants",
        sa.Column("date_of_birth", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stay_occupants", "date_of_birth")
    op.drop_column("users", "date_of_birth")
