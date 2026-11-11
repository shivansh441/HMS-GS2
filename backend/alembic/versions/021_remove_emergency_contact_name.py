"""Remove emergency contact names from user profiles.

Revision ID: 021_remove_emergency_contact_name
Revises: 020_stay_guest_details
Create Date: 2026-11-10
"""

import sqlalchemy as sa

from alembic import op

revision = "021_remove_emergency_contact_name"
down_revision = "020_stay_guest_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "emergency_contact_name")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("emergency_contact_name", sa.String(length=128), nullable=True),
    )
