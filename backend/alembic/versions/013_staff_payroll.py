"""Add staff profiles, attendance, and salary disbursements.

Revision ID: 013_staff_payroll
Revises: 012_stay_logistics
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "013_staff_payroll"
down_revision = "012_stay_logistics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())
    managed_tables = {
        "staff_profiles",
        "staff_attendances",
        "staff_salary_disbursements",
    }
    if managed_tables.issubset(existing_tables):
        indexes = {
            (table_name, index["name"])
            for table_name in managed_tables
            for index in sa.inspect(op.get_bind()).get_indexes(table_name)
        }
        expected_indexes = {
            ("staff_profiles", "ix_staff_profiles_property_id"),
            ("staff_attendances", "ix_staff_attendances_staff_id"),
            ("staff_salary_disbursements", "ix_staff_salary_disbursements_staff_id"),
        }
        for table_name, index_name in expected_indexes - indexes:
            columns = {
                "ix_staff_profiles_property_id": ["property_id"],
                "ix_staff_attendances_staff_id": ["staff_id"],
                "ix_staff_salary_disbursements_staff_id": ["staff_id"],
            }[index_name]
            op.create_index(index_name, table_name, columns)
        return

    op.create_table(
        "staff_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("designation", sa.String(length=100), nullable=False),
        sa.Column("department", sa.String(length=100), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("base_monthly_salary", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("joining_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["property_id"],
            ["properties.id"],
            name="fk_staff_profiles_property_id_properties",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_staff_profiles_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_staff_profiles_user_id"),
    )
    op.create_index("ix_staff_profiles_property_id", "staff_profiles", ["property_id"])

    op.create_table(
        "staff_attendances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("staff_id", sa.String(length=36), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("worked_days", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("month >= 1 AND month <= 12", name="ck_staff_attendance_month"),
        sa.CheckConstraint("worked_days >= 0", name="ck_staff_attendance_worked_days"),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_profiles.id"],
            name="fk_staff_attendances_staff_id_staff_profiles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("staff_id", "year", "month", name="uq_staff_attendance_period"),
    )
    op.create_index("ix_staff_attendances_staff_id", "staff_attendances", ["staff_id"])

    op.create_table(
        "staff_salary_disbursements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("staff_id", sa.String(length=36), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("payable_salary", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            "payment_status",
            sa.Enum(
                "PENDING",
                "PAID",
                name="staff_payment_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "payment_mode",
            sa.Enum(
                "CASH",
                "BANK_TRANSFER",
                "UPI",
                name="staff_payment_mode",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.Column("transaction_reference", sa.String(length=100), nullable=True),
        sa.Column("payment_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("month >= 1 AND month <= 12", name="ck_staff_salary_month"),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_profiles.id"],
            name="fk_staff_salary_disbursements_staff_id_staff_profiles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("staff_id", "year", "month", name="uq_staff_salary_period"),
    )
    op.create_index(
        "ix_staff_salary_disbursements_staff_id",
        "staff_salary_disbursements",
        ["staff_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_staff_salary_disbursements_staff_id", table_name="staff_salary_disbursements")
    op.drop_table("staff_salary_disbursements")
    op.drop_index("ix_staff_attendances_staff_id", table_name="staff_attendances")
    op.drop_table("staff_attendances")
    op.drop_index("ix_staff_profiles_property_id", table_name="staff_profiles")
    op.drop_table("staff_profiles")
