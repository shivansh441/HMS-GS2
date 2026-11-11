"""Add stay lifecycle, pricing audit, and assignment-linked stay records.

Revision ID: 012_stay_logistics
Revises: 011_reservation_sharing_type
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "012_stay_logistics"
down_revision = "011_reservation_sharing_type"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _has_foreign_key(table_name: str, column_name: str, referred_table: str) -> bool:
    return any(
        foreign_key["constrained_columns"] == [column_name]
        and foreign_key["referred_table"] == referred_table
        for foreign_key in sa.inspect(op.get_bind()).get_foreign_keys(table_name)
    )


def _has_unique_constraint(table_name: str, column_name: str) -> bool:
    return any(
        constraint["column_names"] == [column_name]
        for constraint in sa.inspect(op.get_bind()).get_unique_constraints(table_name)
    )


def _has_index(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if not _has_column("unit_assignments", "status"):
        op.add_column(
            "unit_assignments",
            sa.Column(
                "status",
                sa.String(length=24),
                nullable=False,
                server_default="CHECKED_IN",
            ),
        )
    if not _has_column("unit_assignments", "standard_rate"):
        op.add_column(
            "unit_assignments",
            sa.Column("standard_rate", sa.Numeric(12, 2), nullable=True),
        )
    if not _has_column("unit_assignments", "rate_override_reason"):
        op.add_column(
            "unit_assignments",
            sa.Column("rate_override_reason", sa.Text(), nullable=True),
        )
    if not _has_column("unit_assignments", "actor_id"):
        op.add_column(
            "unit_assignments",
            sa.Column("actor_id", sa.String(length=36), nullable=True),
        )
    if not _has_foreign_key("unit_assignments", "actor_id", "users"):
        op.create_foreign_key(
            "fk_unit_assignments_actor_id_users",
            "unit_assignments",
            "users",
            ["actor_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _has_column("stay_records", "assignment_id"):
        op.add_column(
            "stay_records",
            sa.Column("assignment_id", sa.String(length=36), nullable=True),
        )
    if not _has_foreign_key("stay_records", "assignment_id", "unit_assignments"):
        op.create_foreign_key(
            "fk_stay_records_assignment_id_unit_assignments",
            "stay_records",
            "unit_assignments",
            ["assignment_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _has_unique_constraint("stay_records", "assignment_id"):
        op.create_unique_constraint(
            "uq_stay_records_assignment_id",
            "stay_records",
            ["assignment_id"],
        )
    if not _has_column("stay_records", "final_amount_paid"):
        op.add_column(
            "stay_records",
            sa.Column(
                "final_amount_paid",
                sa.Numeric(12, 2),
                nullable=False,
                server_default="0.00",
            ),
        )
    if not _has_column("stay_records", "is_active"):
        op.add_column(
            "stay_records",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    op.alter_column("unit_assignments", "status", server_default=None)
    op.alter_column("stay_records", "final_amount_paid", server_default=None)
    op.alter_column("stay_records", "is_active", server_default=None)
    if not _has_index("unit_assignments", "ix_unit_assignments_status_active"):
        op.create_index(
            "ix_unit_assignments_status_active",
            "unit_assignments",
            ["status", "is_active"],
        )


def downgrade() -> None:
    op.drop_index("ix_unit_assignments_status_active", table_name="unit_assignments")
    op.drop_column("stay_records", "is_active")
    op.drop_column("stay_records", "final_amount_paid")
    op.drop_constraint("uq_stay_records_assignment_id", "stay_records", type_="unique")
    op.drop_constraint(
        "fk_stay_records_assignment_id_unit_assignments",
        "stay_records",
        type_="foreignkey",
    )
    op.drop_column("stay_records", "assignment_id")
    op.drop_constraint(
        "fk_unit_assignments_actor_id_users",
        "unit_assignments",
        type_="foreignkey",
    )
    op.drop_column("unit_assignments", "actor_id")
    op.drop_column("unit_assignments", "rate_override_reason")
    op.drop_column("unit_assignments", "standard_rate")
    op.drop_column("unit_assignments", "status")
