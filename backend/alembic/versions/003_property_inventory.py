"""Add property inventory and fee configuration.

Revision ID: 003_property_inventory
Revises: 002_role_model
Create Date: 2026-10-26
"""

import sqlalchemy as sa

from alembic import op

revision = "003_property_inventory"
down_revision = "002_role_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("properties") as batch_op:
        batch_op.add_column(sa.Column("type", sa.String(32), nullable=False, server_default="HOTEL"))
        batch_op.add_column(sa.Column("floors", sa.Integer(), nullable=False, server_default="1"))
        batch_op.add_column(sa.Column("address", sa.String(255), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("city", sa.String(128), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("state", sa.String(128), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("pincode", sa.String(32), nullable=False, server_default=""))
        batch_op.add_column(
            sa.Column("contact_phone", sa.String(32), nullable=False, server_default="")
        )
        batch_op.add_column(sa.Column("contact_email", sa.String(255), nullable=True))
        batch_op.add_column(
            sa.Column("facilities", sa.JSON(), nullable=False, server_default="[]")
        )
        batch_op.add_column(sa.Column("currency", sa.String(3), nullable=False, server_default="INR"))
        batch_op.add_column(
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.create_index("ix_properties_is_deleted", ["is_deleted"])

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("gender", sa.String(16), nullable=True))

    op.create_table(
        "floors",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("property_id", sa.String(36), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(128), nullable=False, server_default=""),
        sa.Column("amenities", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("access_zone", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("property_id", "number", name="uq_floor_property_number"),
    )
    op.create_index("ix_floors_property_id", "floors", ["property_id"])

    op.create_table(
        "units",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("property_id", sa.String(36), nullable=False),
        sa.Column("floor_id", sa.String(36), nullable=False),
        sa.Column("parent_id", sa.String(36), nullable=True),
        sa.Column("unit_number", sa.String(64), nullable=False),
        sa.Column("floor", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("type", sa.String(16), nullable=False, server_default="ROOM"),
        sa.Column("category", sa.String(32), nullable=False, server_default="CLASSIC"),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("default_price_per_night", sa.Numeric(12, 2), nullable=True),
        sa.Column("default_recurring_monthly_rate", sa.Numeric(12, 2), nullable=True),
        sa.Column("deposit_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("utility_package_fee", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("features", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(16), nullable=False, server_default="AVAILABLE"),
        sa.Column("smart_lock_id", sa.String(128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["parent_id"], ["units.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("property_id", "unit_number", name="uq_unit_property_number"),
        sa.UniqueConstraint("property_id", "smart_lock_id", name="uq_unit_property_smart_lock"),
    )
    op.create_index("ix_units_property_id", "units", ["property_id"])
    op.create_index("ix_units_floor_id", "units", ["floor_id"])
    op.create_index("ix_units_parent_id", "units", ["parent_id"])
    op.create_index("ix_units_property_status", "units", ["property_id", "status"])

    op.create_table(
        "property_fee_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("property_id", sa.String(36), nullable=False),
        sa.Column("fee_type", sa.String(32), nullable=False, server_default="UNIT_FEE"),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("property_id", "fee_type", name="uq_property_fee_type"),
    )
    op.create_index("ix_property_fee_configs_property_id", "property_fee_configs", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_property_fee_configs_property_id", table_name="property_fee_configs")
    op.drop_table("property_fee_configs")
    op.drop_index("ix_units_property_status", table_name="units")
    op.drop_index("ix_units_parent_id", table_name="units")
    op.drop_index("ix_units_floor_id", table_name="units")
    op.drop_index("ix_units_property_id", table_name="units")
    op.drop_table("units")
    op.drop_index("ix_floors_property_id", table_name="floors")
    op.drop_table("floors")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("gender")
    with op.batch_alter_table("properties") as batch_op:
        batch_op.drop_index("ix_properties_is_deleted")
        batch_op.drop_column("is_deleted")
        batch_op.drop_column("currency")
        batch_op.drop_column("facilities")
        batch_op.drop_column("contact_email")
        batch_op.drop_column("contact_phone")
        batch_op.drop_column("pincode")
        batch_op.drop_column("state")
        batch_op.drop_column("city")
        batch_op.drop_column("address")
        batch_op.drop_column("floors")
        batch_op.drop_column("type")
