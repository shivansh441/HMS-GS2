"""Add privacy-conscious public website page-view analytics."""

import sqlalchemy as sa

from alembic import op

revision = "030_website_monitoring"
down_revision = "029_guest_account_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "website_page_views",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("visitor_ip_masked", sa.String(length=64), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("referrer_host", sa.String(length=255), nullable=True),
        sa.Column("browser", sa.String(length=32), nullable=False),
        sa.Column("device_type", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_website_page_views_created_at",
        "website_page_views",
        ["created_at"],
    )
    op.create_index(
        "ix_website_page_views_created_path",
        "website_page_views",
        ["created_at", "path"],
    )


def downgrade() -> None:
    op.drop_index("ix_website_page_views_created_path", table_name="website_page_views")
    op.drop_index("ix_website_page_views_created_at", table_name="website_page_views")
    op.drop_table("website_page_views")
