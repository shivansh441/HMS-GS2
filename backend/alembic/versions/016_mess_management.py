"""Add mess facilities, meal library, and menu schedules.

Revision ID: 016_mess_management
Revises: 015_billing_receipts
Create Date: 2026-11-06
"""

import sqlalchemy as sa

from alembic import op

revision = "016_mess_management"
down_revision = "015_billing_receipts"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if not _column_exists("properties", "has_mess_facility"):
        op.add_column(
            "properties",
            sa.Column("has_mess_facility", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if not _table_exists("mess_facilities"):
        op.create_table(
            "mess_facilities",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("property_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("capacity", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _index_exists("mess_facilities", "ix_mess_facilities_property_id"):
        op.create_index(
            "ix_mess_facilities_property_id", "mess_facilities", ["property_id"], unique=False
        )
    if not _index_exists("mess_facilities", "uq_mess_facilities_one_default_per_property"):
        op.create_index(
            "uq_mess_facilities_one_default_per_property",
            "mess_facilities",
            ["property_id"],
            unique=True,
            postgresql_where=sa.text("is_default = true"),
            sqlite_where=sa.text("is_default = true"),
        )
    if not _table_exists("meal_items"):
        op.create_table(
            "meal_items",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("category", sa.String(length=16), nullable=False),
            sa.Column("dietary_type", sa.String(length=16), nullable=False, server_default="VEG"),
            sa.Column("ingredients", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.CheckConstraint(
                "category IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER')",
                name="meal_item_category",
            ),
            sa.CheckConstraint(
                "dietary_type IN ('VEG', 'NON_VEG', 'EGGETARIAN')",
                name="meal_item_dietary_type",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _table_exists("mess_menu_schedules"):
        op.create_table(
            "mess_menu_schedules",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("mess_id", sa.Integer(), nullable=False),
            sa.Column("meal_item_id", sa.Integer(), nullable=False),
            sa.Column("scheduled_date", sa.Date(), nullable=False),
            sa.Column("meal_category", sa.String(length=16), nullable=False),
            sa.ForeignKeyConstraint(["meal_item_id"], ["meal_items.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["mess_id"], ["mess_facilities.id"], ondelete="CASCADE"),
            sa.CheckConstraint(
                "meal_category IN ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER')",
                name="mess_menu_category",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "mess_id",
                "meal_item_id",
                "scheduled_date",
                "meal_category",
                name="uq_mess_menu_item_date_category",
            ),
        )
    for index_name, column_name in (
        ("ix_mess_menu_schedules_mess_id", "mess_id"),
        ("ix_mess_menu_schedules_meal_item_id", "meal_item_id"),
        ("ix_mess_menu_schedules_scheduled_date", "scheduled_date"),
    ):
        if not _index_exists("mess_menu_schedules", index_name):
            op.create_index(index_name, "mess_menu_schedules", [column_name])


def downgrade() -> None:
    op.drop_index("ix_mess_menu_schedules_scheduled_date", table_name="mess_menu_schedules")
    op.drop_index("ix_mess_menu_schedules_meal_item_id", table_name="mess_menu_schedules")
    op.drop_index("ix_mess_menu_schedules_mess_id", table_name="mess_menu_schedules")
    op.drop_table("mess_menu_schedules")
    op.drop_table("meal_items")
    op.drop_index(
        "uq_mess_facilities_one_default_per_property", table_name="mess_facilities"
    )
    op.drop_index("ix_mess_facilities_property_id", table_name="mess_facilities")
    op.drop_table("mess_facilities")
    op.drop_column("properties", "has_mess_facility")
