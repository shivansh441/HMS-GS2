"""Link reservation and stay occupants to customer guest accounts.

Revision ID: 029_guest_account_links
Revises: 028_customer_occupant_profiles
"""

import sqlalchemy as sa

from alembic import op

revision = "029_guest_account_links"
down_revision = "028_customer_occupant_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("reservation_occupants") as batch_op:
        batch_op.add_column(sa.Column("guest_user_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_reservation_occupants_guest_user_id",
            "users",
            ["guest_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "ix_reservation_occupants_guest_user_id",
        "reservation_occupants",
        ["guest_user_id"],
    )
    with op.batch_alter_table("stay_occupants") as batch_op:
        batch_op.add_column(sa.Column("guest_user_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_stay_occupants_guest_user_id",
            "users",
            ["guest_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "ix_stay_occupants_guest_user_id",
        "stay_occupants",
        ["guest_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_stay_occupants_guest_user_id",
        table_name="stay_occupants",
    )
    with op.batch_alter_table("stay_occupants") as batch_op:
        batch_op.drop_constraint("fk_stay_occupants_guest_user_id", type_="foreignkey")
        batch_op.drop_column("guest_user_id")
    op.drop_index(
        "ix_reservation_occupants_guest_user_id",
        table_name="reservation_occupants",
    )
    with op.batch_alter_table("reservation_occupants") as batch_op:
        batch_op.drop_constraint(
            "fk_reservation_occupants_guest_user_id", type_="foreignkey"
        )
        batch_op.drop_column("guest_user_id")
