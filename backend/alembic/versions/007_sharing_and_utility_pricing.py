"""Add sharing-based pricing and metered utility arrears.

Revision ID: 007_sharing_and_utility_pricing
Revises: 006_guest_profiles
Create Date: 2026-10-27
"""

import sqlalchemy as sa

from alembic import context, op

revision = "007_sharing_and_utility_pricing"
down_revision = "006_guest_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("units", sa.Column("sharing_type", sa.String(length=16), nullable=True))
    op.create_index("ix_units_sharing_type", "units", ["sharing_type"])

    op.add_column(
        "property_fee_configs",
        sa.Column(
            "pricing_basis",
            sa.String(length=16),
            nullable=False,
            server_default="FIXED_FLAT",
        ),
    )
    op.add_column(
        "property_fee_configs",
        sa.Column(
            "billing_timing",
            sa.String(length=16),
            nullable=False,
            server_default="ADVANCE",
        ),
    )
    op.add_column(
        "property_fee_configs", sa.Column("rate_per_unit", sa.Numeric(12, 4), nullable=True)
    )
    op.add_column(
        "property_fee_configs", sa.Column("unit_of_measure", sa.String(length=32), nullable=True)
    )
    op.execute(
        sa.text(
            "UPDATE property_fee_configs "
            "SET pricing_basis = 'METERED', billing_timing = 'ARREARS' "
            "WHERE fee_type IN ('ELECTRICITY_FEE', 'WATER_CHARGE')"
        )
    )

    existing_indexes: set[str] = set()
    table_exists = False
    if not context.is_offline_mode():
        inspector = sa.inspect(op.get_bind())
        table_exists = inspector.has_table("utility_meter_readings")
        if table_exists:
            existing_indexes = {
                index["name"] for index in inspector.get_indexes("utility_meter_readings")
            }
    if not table_exists:
        op.create_table(
            "utility_meter_readings",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("property_id", sa.String(length=36), nullable=False),
            sa.Column("unit_assignment_id", sa.String(length=36), nullable=False),
            sa.Column("fee_type", sa.String(length=32), nullable=False),
            sa.Column("period_start", sa.Date(), nullable=False),
            sa.Column("period_end", sa.Date(), nullable=False),
            sa.Column("previous_reading", sa.Numeric(12, 3), nullable=False),
            sa.Column("current_reading", sa.Numeric(12, 3), nullable=False),
            sa.Column("consumption", sa.Numeric(12, 3), nullable=False),
            sa.Column("rate_per_unit", sa.Numeric(12, 4), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("billing_status", sa.String(length=16), nullable=False, server_default="QUEUED"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["property_id"], ["properties.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(
                ["unit_assignment_id"], ["unit_assignments.id"], ondelete="RESTRICT"
            ),
            sa.UniqueConstraint(
                "unit_assignment_id",
                "fee_type",
                "period_start",
                "period_end",
                name="uq_utility_reading_assignment_fee_period",
            ),
        )
    if "ix_utility_reading_property_status" not in existing_indexes:
        op.create_index(
            "ix_utility_reading_property_status",
            "utility_meter_readings",
            ["property_id", "billing_status"],
        )


def downgrade() -> None:
    op.drop_index("ix_utility_reading_property_status", table_name="utility_meter_readings")
    op.drop_table("utility_meter_readings")
    op.drop_column("property_fee_configs", "unit_of_measure")
    op.drop_column("property_fee_configs", "rate_per_unit")
    op.drop_column("property_fee_configs", "billing_timing")
    op.drop_column("property_fee_configs", "pricing_basis")
    op.drop_index("ix_units_sharing_type", table_name="units")
    op.drop_column("units", "sharing_type")
