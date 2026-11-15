"""Track staff advances and payroll deductions.

Revision ID: 025_staff_advance_payments
Revises: 024_stay_occupant_full_name
Create Date: 2026-11-15
"""

import sqlalchemy as sa

from alembic import op

revision = "025_staff_advance_payments"
down_revision = "024_stay_occupant_full_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "staff_salary_disbursements",
        sa.Column(
            "advance_deduction",
            sa.Numeric(precision=10, scale=2),
            server_default=sa.text("0.00"),
            nullable=False,
        ),
    )
    op.add_column(
        "staff_salary_disbursements",
        sa.Column("paid_amount", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.execute(
        """
        UPDATE staff_salary_disbursements
        SET paid_amount = payable_salary
        WHERE payment_status = 'PAID'
        """
    )
    op.create_table(
        "staff_advances",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("staff_id", sa.String(length=36), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_staff_advances_positive_amount"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_staff_advances_created_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_profiles.id"],
            name="fk_staff_advances_staff_id_staff_profiles",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_staff_advances_staff_id", "staff_advances", ["staff_id"])


def downgrade() -> None:
    op.drop_index("ix_staff_advances_staff_id", table_name="staff_advances")
    op.drop_table("staff_advances")
    with op.batch_alter_table("staff_salary_disbursements") as batch_op:
        batch_op.drop_column("paid_amount")
        batch_op.drop_column("advance_deduction")
