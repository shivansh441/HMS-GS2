"""Move hostel rent to assignments and make water a property setting.

Revision ID: 008_rent_water_flags
Revises: 007_sharing_and_utility_pricing
Create Date: 2026-10-27
"""

from alembic import op

revision = "008_rent_water_flags"
down_revision = "007_sharing_and_utility_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE property_fee_configs
        SET amount = 0,
            is_mandatory = TRUE,
            is_active = TRUE,
            pricing_basis = 'ASSIGNMENT',
            billing_timing = 'AT_ASSIGNMENT',
            rate_per_unit = NULL,
            unit_of_measure = NULL
        WHERE fee_type = 'UNIT_FEE'
        """
    )
    op.execute(
        """
        UPDATE property_fee_configs
        SET amount = 0,
            pricing_basis = 'CONFIG_ONLY',
            billing_timing = 'NONE',
            rate_per_unit = NULL,
            unit_of_measure = NULL
        WHERE fee_type = 'WATER_CHARGE'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE property_fee_configs
        SET pricing_basis = 'FIXED_FLAT',
            billing_timing = 'ADVANCE'
        WHERE fee_type = 'UNIT_FEE'
        """
    )
    op.execute(
        """
        UPDATE property_fee_configs
        SET pricing_basis = 'METERED',
            billing_timing = 'ARREARS'
        WHERE fee_type = 'WATER_CHARGE'
        """
    )
