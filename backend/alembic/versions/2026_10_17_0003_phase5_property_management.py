"""Phase 5 Property Management and Archival Schema.

Revision ID: 2026_10_17_0003
Revises: 2026_10_17_0002
Create Date: 2026-10-17 18:00:00.000000

"""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2026_10_17_0003"
down_revision: str | None = "2026_10_17_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add audit and archival lifecycle columns to properties table
    op.add_column("properties", sa.Column("created_by_user_id", sa.String(length=36), nullable=True))
    op.add_column("properties", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_properties_created_by_user_id",
        "properties",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_properties_archived_at", "properties", ["archived_at"])


def downgrade() -> None:
    op.drop_index("ix_properties_archived_at", table_name="properties")
    op.drop_constraint("fk_properties_created_by_user_id", table_name="properties", type_="foreignkey")
    op.drop_column("properties", "archived_at")
    op.drop_column("properties", "created_by_user_id")
