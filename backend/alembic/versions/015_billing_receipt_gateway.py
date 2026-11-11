"""Add stable receipt numbers and invoice update timestamps.

Revision ID: 015_billing_receipts
Revises: 014_customer_id_documents
Create Date: 2026-11-06
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "015_billing_receipts"
down_revision = "014_customer_id_documents"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _unique_index_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(
        index.get("unique")
        and index["column_names"] == [column_name]
        for index in inspector.get_indexes(table_name)
    )


def _set_not_nullable(table_name: str, column_name: str, column_type: sa.types.TypeEngine) -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            batch_op.alter_column(
                column_name,
                existing_type=column_type,
                nullable=False,
            )
        return
    op.alter_column(
        table_name,
        column_name,
        existing_type=column_type,
        nullable=False,
    )


def upgrade() -> None:
    invoice_columns = _columns("monthly_invoices")
    if invoice_columns and "updated_at" not in invoice_columns:
        op.add_column(
            "monthly_invoices",
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.execute(
            "UPDATE monthly_invoices SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"
        )
        _set_not_nullable(
            "monthly_invoices",
            "updated_at",
            sa.DateTime(timezone=True),
        )

    receipt_columns = _columns("payment_receipts")
    if receipt_columns and "receipt_number" not in receipt_columns:
        op.add_column(
            "payment_receipts",
            sa.Column("receipt_number", sa.String(length=64), nullable=True),
        )
        bind = op.get_bind()
        receipt_ids = bind.execute(
            sa.text("SELECT id FROM payment_receipts WHERE receipt_number IS NULL")
        ).scalars()
        for receipt_id in receipt_ids:
            bind.execute(
                sa.text(
                    "UPDATE payment_receipts SET receipt_number = :receipt_number WHERE id = :id"
                ),
                {
                    "receipt_number": f"RCT-LEGACY-{uuid.uuid4().hex[:16].upper()}",
                    "id": receipt_id,
                },
            )
        _set_not_nullable(
            "payment_receipts",
            "receipt_number",
            sa.String(length=64),
        )
    if receipt_columns and not _unique_index_exists("payment_receipts", "receipt_number"):
        op.create_index(
            "uq_payment_receipts_receipt_number",
            "payment_receipts",
            ["receipt_number"],
            unique=True,
        )
    op.execute(
        "UPDATE monthly_invoices SET status = 'PARTIALLY_PAID' WHERE status = 'PARTIAL'"
    )


def downgrade() -> None:
    receipt_columns = _columns("payment_receipts")
    if receipt_columns and "receipt_number" in receipt_columns:
        if _unique_index_exists("payment_receipts", "receipt_number"):
            op.drop_index(
                "uq_payment_receipts_receipt_number", table_name="payment_receipts"
            )
        op.drop_column("payment_receipts", "receipt_number")
    invoice_columns = _columns("monthly_invoices")
    if invoice_columns and "updated_at" in invoice_columns:
        op.drop_column("monthly_invoices", "updated_at")
    op.execute(
        "UPDATE monthly_invoices SET status = 'PARTIAL' WHERE status = 'PARTIALLY_PAID'"
    )
