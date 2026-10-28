"""Reconcile existing authentication and audit columns with ORM models.

Revision ID: 005_reconcile_model_schema
Revises: 004_reservations_and_stays
Create Date: 2026-10-27
"""

import sqlalchemy as sa

from alembic import op

revision = "005_reconcile_model_schema"
down_revision = "004_reservations_and_stays"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("lockout_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch_op.add_column(sa.Column("last_totp_step", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("pending_email", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("pending_phone", sa.String(length=32), nullable=True))

    with op.batch_alter_table("linked_identities") as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(length=255), nullable=True))

    with op.batch_alter_table("otp_codes") as batch_op:
        batch_op.add_column(sa.Column("metadata_json", sa.Text(), nullable=True))

    with op.batch_alter_table("verification_tokens") as batch_op:
        batch_op.add_column(sa.Column("metadata_json", sa.Text(), nullable=True))
        batch_op.alter_column(
            "user_id",
            existing_type=sa.String(length=36),
            nullable=True,
        )

    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_otp_codes_recipient", "otp_codes", ["recipient"])
    op.create_index(
        "ix_verification_tokens_token_hash",
        "verification_tokens",
        ["token_hash"],
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])
    op.create_index("ix_audit_logs_target_user_id", "audit_logs", ["target_user_id"])
    op.create_index("ix_audit_logs_property_id", "audit_logs", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_property_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_index(
        "ix_verification_tokens_token_hash",
        table_name="verification_tokens",
    )
    op.drop_index("ix_otp_codes_recipient", table_name="otp_codes")
    op.drop_index("ix_sessions_user_id", table_name="sessions")

    with op.batch_alter_table("verification_tokens") as batch_op:
        batch_op.alter_column(
            "user_id",
            existing_type=sa.String(length=36),
            nullable=False,
        )
        batch_op.drop_column("metadata_json")

    with op.batch_alter_table("otp_codes") as batch_op:
        batch_op.drop_column("metadata_json")

    with op.batch_alter_table("linked_identities") as batch_op:
        batch_op.drop_column("email")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("pending_phone")
        batch_op.drop_column("pending_email")
        batch_op.drop_column("last_totp_step")
        batch_op.drop_column("lockout_count")
