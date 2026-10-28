"""Add guest profile details to user accounts.

Revision ID: 006_guest_profiles
Revises: 005_reconcile_model_schema
Create Date: 2026-10-27
"""

import sqlalchemy as sa

from alembic import op

revision = "006_guest_profiles"
down_revision = "005_reconcile_model_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("customer_persona", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("emergency_contact_name", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("emergency_contact_phone", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("permanent_address", sa.String(length=512), nullable=True))
    op.add_column("users", sa.Column("occupation", sa.String(length=128), nullable=True))
    op.create_index("ix_users_customer_persona", "users", ["customer_persona"])


def downgrade() -> None:
    op.drop_index("ix_users_customer_persona", table_name="users")
    op.drop_column("users", "occupation")
    op.drop_column("users", "permanent_address")
    op.drop_column("users", "emergency_contact_phone")
    op.drop_column("users", "emergency_contact_name")
    op.drop_column("users", "customer_persona")
