"""Remove stored usernames from user accounts.

Revision ID: 018_remove_username
Revises: 017_audit_security_monitoring
Create Date: 2026-11-10
"""

import sqlalchemy as sa

from alembic import op

revision = "018_remove_username"
down_revision = "017_audit_security_monitoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not any(column["name"] == "username" for column in inspector.get_columns("users")):
        return

    username_constraints = [
        constraint["name"]
        for constraint in inspector.get_unique_constraints("users")
        if constraint["column_names"] == ["username"] and constraint["name"]
    ]
    username_indexes = [
        index["name"]
        for index in inspector.get_indexes("users")
        if "username" in index["column_names"]
        and index["name"] not in username_constraints
        and not index.get("duplicates_constraint", False)
    ]
    for index_name in username_indexes:
        op.drop_index(index_name, table_name="users")

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("users", recreate="always") as batch_op:
            for constraint_name in username_constraints:
                batch_op.drop_constraint(constraint_name, type_="unique")
            batch_op.drop_column("username")
    else:
        for constraint_name in username_constraints:
            op.drop_constraint(constraint_name, "users", type_="unique")
        op.drop_column("users", "username")


def downgrade() -> None:
    if any(
        column["name"] == "username"
        for column in sa.inspect(op.get_bind()).get_columns("users")
    ):
        return

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("users_username_key", ["username"])
    op.create_index("ix_users_username", "users", ["username"])
