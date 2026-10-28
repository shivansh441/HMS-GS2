"""Add reservation requests, occupants, unit assignments, and stay records.

Revision ID: 004_reservations_and_stays
Revises: 003_property_inventory
Create Date: 2026-10-27
"""

import sqlalchemy as sa

from alembic import op

revision = "004_reservations_and_stays"
down_revision = "003_property_inventory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reservation_requests",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("request_code", sa.String(length=50), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("primary_user_id", sa.String(length=36), nullable=True),
        sa.Column("guest_name", sa.String(length=100), nullable=False),
        sa.Column("mobile", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=100), nullable=True),
        sa.Column("requested_category", sa.String(length=50), nullable=False),
        sa.Column("requested_type", sa.String(length=20), nullable=False),
        sa.Column("requested_quantity", sa.Integer(), nullable=False),
        sa.Column("number_of_adults", sa.Integer(), nullable=False),
        sa.Column("number_of_children", sa.Integer(), nullable=False),
        sa.Column("expected_check_in", sa.Date(), nullable=False),
        sa.Column("expected_check_out", sa.Date(), nullable=True),
        sa.Column("channel_origin", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["primary_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("request_code"),
    )
    op.create_index(
        "ix_reservation_requests_property_status",
        "reservation_requests",
        ["property_id", "status"],
    )
    op.create_index(
        "ix_reservation_requests_mobile_email",
        "reservation_requests",
        ["mobile", "email"],
    )

    op.create_table(
        "reservation_occupants",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("reservation_request_id", sa.String(length=36), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("first_name", sa.String(length=50), nullable=False),
        sa.Column("last_name", sa.String(length=50), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=100), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(
            ["reservation_request_id"],
            ["reservation_requests.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_reservation_occupants_reservation_request_id",
        "reservation_occupants",
        ["reservation_request_id"],
    )

    op.create_table(
        "unit_assignments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("unit_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("reservation_request_id", sa.String(length=36), nullable=True),
        sa.Column("billing_strategy", sa.String(length=32), nullable=False),
        sa.Column("agreed_price_per_night", sa.Numeric(12, 2), nullable=True),
        sa.Column("agreed_monthly_rate", sa.Numeric(12, 2), nullable=True),
        sa.Column("expected_check_in", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_check_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_check_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_check_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["reservation_request_id"],
            ["reservation_requests.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_unit_assignments_unit_active",
        "unit_assignments",
        ["unit_id", "is_active"],
    )
    op.create_index("ix_unit_assignments_user_id", "unit_assignments", ["user_id"])

    op.create_table(
        "stay_records",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("persona", sa.String(length=32), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="RESTRICT"
        ),
    )
    op.create_index("ix_stay_records_user_id", "stay_records", ["user_id"])
    op.create_index("ix_stay_records_property_id", "stay_records", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_stay_records_property_id", table_name="stay_records")
    op.drop_index("ix_stay_records_user_id", table_name="stay_records")
    op.drop_table("stay_records")
    op.drop_index("ix_unit_assignments_user_id", table_name="unit_assignments")
    op.drop_index("ix_unit_assignments_unit_active", table_name="unit_assignments")
    op.drop_table("unit_assignments")
    op.drop_index(
        "ix_reservation_occupants_reservation_request_id",
        table_name="reservation_occupants",
    )
    op.drop_table("reservation_occupants")
    op.drop_index(
        "ix_reservation_requests_mobile_email",
        table_name="reservation_requests",
    )
    op.drop_index(
        "ix_reservation_requests_property_status",
        table_name="reservation_requests",
    )
    op.drop_table("reservation_requests")
