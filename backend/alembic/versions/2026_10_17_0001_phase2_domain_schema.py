"""Phase 2 Domain and Relational Database Schema.

Revision ID: 2026_10_17_0001
Revises: 
Create Date: 2026-10-17 17:45:00.000000

"""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2026_10_17_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Properties
    op.create_table(
        "properties",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("property_type", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("publication_status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("is_bookable", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="USD", nullable=False),
        sa.Column("timezone", sa.String(length=50), server_default="UTC", nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("state_province", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column("checkin_time_start", sa.String(length=5), server_default="14:00", nullable=False),
        sa.Column("checkout_time_deadline", sa.String(length=5), server_default="11:00", nullable=False),
        sa.Column("total_rooms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_beds", sa.Integer(), server_default="0", nullable=False),
        sa.Column("amenities", sa.JSON(), nullable=False),
        sa.Column("policies", sa.JSON(), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_properties_code"),
        sa.UniqueConstraint("slug", name="uq_properties_slug"),
    )
    op.create_index("ix_properties_name", "properties", ["name"])
    op.create_index("ix_properties_city", "properties", ["city"])
    op.create_index("ix_properties_public", "properties", ["publication_status", "is_bookable", "is_active"])

    # 2. Users (Staff / System Admins)
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("global_role", sa.String(length=30), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    # 3. User Property Assignments
    op.create_table(
        "user_property_assignments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("property_role", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "property_id", name="uq_user_property_assignment"),
    )

    # 4. Buildings & Floors
    op.create_table(
        "buildings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "code", name="uq_building_property_code"),
    )

    op.create_table(
        "floors",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("building_id", sa.String(length=36), nullable=True),
        sa.Column("floor_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "floor_number", name="uq_floor_property_number"),
    )

    # 5. Room Types
    op.create_table(
        "room_types",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("accommodation_tier", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("base_capacity_adults", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_capacity_adults", sa.Integer(), server_default="2", nullable=False),
        sa.Column("max_capacity_children", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_dormitory", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("gender_policy", sa.String(length=20), server_default="any", nullable=False),
        sa.Column("base_price_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("amenities", sa.JSON(), nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("base_capacity_adults >= 1", name="ck_room_type_base_capacity"),
        sa.CheckConstraint("max_capacity_adults >= base_capacity_adults", name="ck_room_type_max_capacity"),
        sa.CheckConstraint("base_price_amount >= 0", name="ck_room_type_base_price"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "code", name="uq_room_type_property_code"),
        sa.UniqueConstraint("property_id", "slug", name="uq_room_type_property_slug"),
    )

    # 6. Physical Rooms
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("room_type_id", sa.String(length=36), nullable=False),
        sa.Column("floor_id", sa.String(length=36), nullable=True),
        sa.Column("room_number", sa.String(length=30), nullable=False),
        sa.Column("operational_status", sa.String(length=20), server_default="available", nullable=False),
        sa.Column("cleanliness_status", sa.String(length=20), server_default="clean", nullable=False),
        sa.Column("keycard_code", sa.String(length=50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_type_id"], ["room_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "room_number", name="uq_room_property_number"),
    )

    # 7. Physical Hostel Beds
    op.create_table(
        "beds",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("bed_label", sa.String(length=30), nullable=False),
        sa.Column("bed_type", sa.String(length=20), server_default="standard_single", nullable=False),
        sa.Column("locker_number", sa.String(length=30), nullable=True),
        sa.Column("operational_status", sa.String(length=20), server_default="available", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_id", "bed_label", name="uq_bed_room_label"),
    )

    # 8. Rate Plans & Pricing Rules
    op.create_table(
        "rate_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cancellation_policy", sa.String(length=50), server_default="flexible", nullable=False),
        sa.Column("min_nights", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_nights", sa.Integer(), server_default="365", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("min_nights >= 1", name="ck_rate_plan_min_nights"),
        sa.CheckConstraint("max_nights >= min_nights", name="ck_rate_plan_max_nights"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "code", name="uq_rate_plan_property_code"),
    )

    op.create_table(
        "price_rules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("rate_plan_id", sa.String(length=36), nullable=False),
        sa.Column("room_type_id", sa.String(length=36), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("price_per_night", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("minimum_stay", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_closed_to_arrival", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_closed_to_departure", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("end_date >= start_date", name="ck_price_rule_dates"),
        sa.CheckConstraint("price_per_night >= 0", name="ck_price_rule_positive_amount"),
        sa.CheckConstraint("minimum_stay >= 1", name="ck_price_rule_min_stay"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rate_plan_id"], ["rate_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_type_id"], ["room_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 9. Taxes
    op.create_table(
        "property_taxes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("tax_type", sa.String(length=20), server_default="percentage", nullable=False),
        sa.Column("rate", sa.Numeric(8, 4), nullable=False),
        sa.Column("is_inclusive", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 10. Guests (Customers & Residents)
    op.create_table(
        "guests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("identification_type", sa.String(length=50), nullable=True),
        sa.Column("identification_number", sa.String(length=100), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state_province", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_guests_email", "guests", ["email"])
    op.create_index("ix_guests_phone", "guests", ["phone"])

    # 11. Bookings & Items
    op.create_table(
        "bookings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("booking_reference", sa.String(length=30), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("guest_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("booking_source", sa.String(length=20), server_default="public_website", nullable=False),
        sa.Column("booking_status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("check_in_date", sa.Date(), nullable=False),
        sa.Column("check_out_date", sa.Date(), nullable=False),
        sa.Column("total_nights", sa.Integer(), server_default="1", nullable=False),
        sa.Column("adult_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("child_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("base_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("service_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("deposit_paid", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("special_requests", sa.Text(), nullable=True),
        sa.Column("hold_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("check_out_date > check_in_date", name="ck_booking_date_range"),
        sa.CheckConstraint("adult_count >= 1", name="ck_booking_adult_count"),
        sa.CheckConstraint("total_amount >= 0", name="ck_booking_positive_total"),
        sa.CheckConstraint("base_amount >= 0", name="ck_booking_positive_base"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["guest_id"], ["guests.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_reference", name="uq_bookings_reference"),
    )
    op.create_index("ix_bookings_property_dates", "bookings", ["property_id", "check_in_date", "check_out_date"])
    op.create_index("ix_bookings_property_status", "bookings", ["property_id", "booking_status"])

    op.create_table(
        "booking_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("booking_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("room_type_id", sa.String(length=36), nullable=False),
        sa.Column("rate_plan_id", sa.String(length=36), nullable=True),
        sa.Column("allocated_room_id", sa.String(length=36), nullable=True),
        sa.Column("allocated_bed_id", sa.String(length=36), nullable=True),
        sa.Column("guest_name", sa.String(length=100), nullable=True),
        sa.Column("check_in_date", sa.Date(), nullable=False),
        sa.Column("check_out_date", sa.Date(), nullable=False),
        sa.Column("unit_price_per_night", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_item_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax_breakdown", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("check_out_date > check_in_date", name="ck_item_date_range"),
        sa.CheckConstraint("unit_price_per_night >= 0", name="ck_item_unit_price"),
        sa.CheckConstraint("total_item_price >= 0", name="ck_item_total_price"),
        sa.ForeignKeyConstraint(["allocated_bed_id"], ["beds.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["allocated_room_id"], ["rooms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rate_plan_id"], ["rate_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["room_type_id"], ["room_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 12. Physical Inventory Allocations
    op.create_table(
        "inventory_allocations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("booking_item_id", sa.String(length=36), nullable=True),
        sa.Column("room_id", sa.String(length=36), nullable=True),
        sa.Column("bed_id", sa.String(length=36), nullable=True),
        sa.Column("check_in_date", sa.Date(), nullable=False),
        sa.Column("check_out_date", sa.Date(), nullable=False),
        sa.Column("allocation_type", sa.String(length=20), server_default="reservation", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("check_out_date > check_in_date", name="ck_alloc_date_range"),
        sa.CheckConstraint("room_id IS NOT NULL OR bed_id IS NOT NULL", name="ck_alloc_target_exists"),
        sa.ForeignKeyConstraint(["bed_id"], ["beds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_item_id"], ["booking_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alloc_room_dates", "inventory_allocations", ["room_id", "check_in_date", "check_out_date"])
    op.create_index("ix_alloc_bed_dates", "inventory_allocations", ["bed_id", "check_in_date", "check_out_date"])
    op.create_index("ix_alloc_active", "inventory_allocations", ["is_active", "check_in_date", "check_out_date"])

    # 13. Hostel Operations (Resident KYC & Agreements)
    op.create_table(
        "hostel_resident_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("guest_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("emergency_contact_name", sa.String(length=100), nullable=False),
        sa.Column("emergency_contact_phone", sa.String(length=50), nullable=False),
        sa.Column("institution_or_employer", sa.String(length=150), nullable=True),
        sa.Column("student_or_work_id", sa.String(length=50), nullable=True),
        sa.Column("is_kyc_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("curfew_exemption", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["guest_id"], ["guests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "guest_id", name="uq_resident_property_guest"),
    )

    op.create_table(
        "hostel_agreements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("resident_profile_id", sa.String(length=36), nullable=False),
        sa.Column("allocated_bed_id", sa.String(length=36), nullable=False),
        sa.Column("agreement_number", sa.String(length=40), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("term_type", sa.String(length=20), server_default="semester", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("monthly_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("security_deposit", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("special_terms", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("end_date > start_date", name="ck_agreement_dates"),
        sa.CheckConstraint("monthly_rate >= 0", name="ck_agreement_rate"),
        sa.CheckConstraint("security_deposit >= 0", name="ck_agreement_deposit"),
        sa.ForeignKeyConstraint(["allocated_bed_id"], ["beds.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resident_profile_id"], ["hostel_resident_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "agreement_number", name="uq_hostel_agreement_number"),
    )

    # 14. Hotel Operations (Stays, Changes, Housekeeping)
    op.create_table(
        "hotel_stay_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("booking_item_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("actual_check_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("keycards_issued", sa.Integer(), server_default="1", nullable=False),
        sa.Column("vehicle_license_plate", sa.String(length=50), nullable=True),
        sa.Column("luggage_tags", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["booking_item_id"], ["booking_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_item_id", name="uq_stay_booking_item"),
    )

    op.create_table(
        "room_change_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("booking_item_id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("from_room_id", sa.String(length=36), nullable=False),
        sa.Column("to_room_id", sa.String(length=36), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False),
        sa.Column("authorized_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["authorized_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["booking_item_id"], ["booking_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_room_id"], ["rooms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_room_id"], ["rooms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "housekeeping_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("bed_id", sa.String(length=36), nullable=True),
        sa.Column("task_type", sa.String(length=20), server_default="departure_clean", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("assigned_user_id", sa.String(length=36), nullable=True),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["bed_id"], ["beds.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # 15. Finance: Invoices & Payments
    op.create_table(
        "invoices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("booking_id", sa.String(length=36), nullable=True),
        sa.Column("guest_id", sa.String(length=36), nullable=False),
        sa.Column("invoice_number", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("subtotal_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("subtotal_amount >= 0", name="ck_inv_subtotal"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_inv_tax"),
        sa.CheckConstraint("total_amount >= 0", name="ck_inv_total"),
        sa.CheckConstraint("paid_amount >= 0", name="ck_inv_paid"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["guest_id"], ["guests.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "invoice_number", name="uq_property_invoice_number"),
    )

    op.create_table(
        "invoice_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("invoice_id", sa.String(length=36), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(8, 4), server_default="0.0000", nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quantity >= 1", name="ck_inv_item_qty"),
        sa.CheckConstraint("unit_price >= 0", name="ck_inv_item_unit_price"),
        sa.CheckConstraint("total_amount >= 0", name="ck_inv_item_total"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=False),
        sa.Column("invoice_id", sa.String(length=36), nullable=True),
        sa.Column("booking_id", sa.String(length=36), nullable=True),
        sa.Column("payment_reference", sa.String(length=50), nullable=False),
        sa.Column("payment_method", sa.String(length=20), server_default="credit_card", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("transaction_id", sa.String(length=100), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payment_positive_amount"),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_reference", name="uq_payments_reference"),
    )

    # 16. Audit Logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("property_id", sa.String(length=36), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("correlation_id", sa.String(length=50), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("ix_audit_property_ts", "audit_logs", ["property_id", "timestamp"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("payments")
    op.drop_table("invoice_items")
    op.drop_table("invoices")
    op.drop_table("housekeeping_tasks")
    op.drop_table("room_change_logs")
    op.drop_table("hotel_stay_records")
    op.drop_table("hostel_agreements")
    op.drop_table("hostel_resident_profiles")
    op.drop_table("inventory_allocations")
    op.drop_table("booking_items")
    op.drop_table("bookings")
    op.drop_table("guests")
    op.drop_table("property_taxes")
    op.drop_table("price_rules")
    op.drop_table("rate_plans")
    op.drop_table("beds")
    op.drop_table("rooms")
    op.drop_table("room_types")
    op.drop_table("floors")
    op.drop_table("buildings")
    op.drop_table("user_property_assignments")
    op.drop_table("users")
    op.drop_table("properties")
