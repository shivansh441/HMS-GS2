"""Replace account types with user roles.

Revision ID: 002_role_model
Revises: 001_initial_schema
Create Date: 2026-10-26

"""
import sqlalchemy as sa

from alembic import op

revision = "002_role_model"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET account_type = CASE
            WHEN account_type IN ('SUPER_ADMIN', 'MANAGER', 'ADMIN') THEN 'ADMIN'
            WHEN account_type = 'STAFF' THEN 'STAFF'
            ELSE 'CUSTOMER'
        END
        """
    )
    op.drop_index("ix_users_account_type", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "account_type",
            new_column_name="role",
            existing_type=sa.String(length=64),
            type_=sa.String(length=32),
            existing_nullable=False,
        )
    op.create_index("ix_users_role", "users", ["role"])


def downgrade() -> None:
    op.drop_index("ix_users_role", table_name="users")
    op.execute(
        """
        UPDATE users
        SET role = CASE
            WHEN role = 'ADMIN' THEN 'SUPER_ADMIN'
            WHEN role = 'STAFF' THEN 'STAFF'
            ELSE 'HOTEL_GUEST'
        END
        """
    )
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "role",
            new_column_name="account_type",
            existing_type=sa.String(length=32),
            type_=sa.String(length=64),
            existing_nullable=False,
        )
    op.create_index("ix_users_account_type", "users", ["account_type"])
