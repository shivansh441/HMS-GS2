"""Add recurring invoices, deposit escrows, and payment receipts.

Revision ID: 010_monthly_billing_ledger
Revises: 009_occupant_identity
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "010_monthly_billing_ledger"
down_revision = "009_occupant_identity"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    op.execute(
        """
        UPDATE property_fee_configs
        SET pricing_basis = 'METERED', billing_timing = 'ARREARS'
        WHERE fee_type = 'WATER_CHARGE'
        """
    )
    if not _table_exists("monthly_invoices"):
        op.create_table(
            "monthly_invoices",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("invoice_number", sa.String(length=64), nullable=False),
            sa.Column("property_id", sa.String(length=36), nullable=False),
            sa.Column("unit_assignment_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("billing_month", sa.Date(), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("unit_fee", sa.Numeric(12, 2), nullable=False),
            sa.Column("mess_fee", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("electricity_arrears", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("water_arrears", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("paid_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="UNPAID"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(
                ["unit_assignment_id"], ["unit_assignments.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
            sa.UniqueConstraint(
                "unit_assignment_id", "billing_month", name="uq_invoice_assignment_month"
            ),
            sa.UniqueConstraint("invoice_number", name="uq_monthly_invoice_number"),
        )
    if not _index_exists("monthly_invoices", "ix_monthly_invoice_property_month"):
        op.create_index(
            "ix_monthly_invoice_property_month",
            "monthly_invoices",
            ["property_id", "billing_month"],
        )
    if not _index_exists("monthly_invoices", "ix_monthly_invoice_user_status"):
        op.create_index("ix_monthly_invoice_user_status", "monthly_invoices", ["user_id", "status"])
    if not _table_exists("deposit_escrows"):
        op.create_table(
            "deposit_escrows",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("property_id", sa.String(length=36), nullable=False),
            sa.Column("unit_assignment_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("collected_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="DUE"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(
                ["unit_assignment_id"], ["unit_assignments.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
            sa.UniqueConstraint("unit_assignment_id", name="uq_deposit_escrow_assignment"),
        )
    if not _index_exists("deposit_escrows", "ix_deposit_escrow_property_status"):
        op.create_index(
            "ix_deposit_escrow_property_status", "deposit_escrows", ["property_id", "status"]
        )
    if not _table_exists("payment_receipts"):
        op.create_table(
            "payment_receipts",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("property_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("invoice_id", sa.String(length=36), nullable=True),
            sa.Column("deposit_escrow_id", sa.String(length=36), nullable=True),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("payment_method", sa.String(length=24), nullable=False),
            sa.Column("reference", sa.String(length=100), nullable=True),
            sa.Column("received_by_user_id", sa.String(length=36), nullable=False),
            sa.Column(
                "received_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.CheckConstraint(
                "(invoice_id IS NOT NULL AND deposit_escrow_id IS NULL) OR "
                "(invoice_id IS NULL AND deposit_escrow_id IS NOT NULL)",
                name="ck_payment_receipt_single_target",
            ),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["invoice_id"], ["monthly_invoices.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(
                ["deposit_escrow_id"], ["deposit_escrows.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(["received_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        )
    if not _index_exists("payment_receipts", "ix_payment_receipts_property_received"):
        op.create_index(
            "ix_payment_receipts_property_received",
            "payment_receipts",
            ["property_id", "received_at"],
        )


def downgrade() -> None:
    op.drop_index("ix_payment_receipts_property_received", table_name="payment_receipts")
    op.drop_table("payment_receipts")
    op.drop_index("ix_deposit_escrow_property_status", table_name="deposit_escrows")
    op.drop_table("deposit_escrows")
    op.drop_index("ix_monthly_invoice_user_status", table_name="monthly_invoices")
    op.drop_index("ix_monthly_invoice_property_month", table_name="monthly_invoices")
    op.drop_table("monthly_invoices")
    op.execute(
        """
        UPDATE property_fee_configs
        SET pricing_basis = 'CONFIG_ONLY', billing_timing = 'NONE'
        WHERE fee_type = 'WATER_CHARGE'
        """
    )
