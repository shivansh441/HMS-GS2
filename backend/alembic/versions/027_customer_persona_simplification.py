"""Simplify customer account personas and migrate legacy hostel guest values.

Revision ID: 027_customer_persona
Revises: 026_invoice_additional_fees
"""

import sqlalchemy as sa

from alembic import op

revision = "027_customer_persona"
down_revision = "026_invoice_additional_fees"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "_persona_027_backup",
        sa.Column("table_name", sa.String(length=32), primary_key=True),
        sa.Column("record_id", sa.String(length=36), primary_key=True),
        sa.Column("old_persona", sa.String(length=32), nullable=True),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO _persona_027_backup (table_name, record_id, old_persona)
            SELECT 'users', id, customer_persona
            FROM users
            WHERE customer_persona = 'HOSTEL_GUEST'
               OR (role = 'CUSTOMER' AND customer_persona IS NULL)
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO _persona_027_backup (table_name, record_id, old_persona)
            SELECT 'stay_records', id, persona
            FROM stay_records
            WHERE persona = 'HOSTEL_GUEST'
            """
        )
    )
    op.execute(
        sa.text(
            "UPDATE users SET customer_persona = 'HOSTELER' "
            "WHERE customer_persona = 'HOSTEL_GUEST'"
        )
    )
    op.execute(
        sa.text(
            "UPDATE users SET customer_persona = 'TEMP_CUSTOMER' "
            "WHERE role = 'CUSTOMER' AND customer_persona IS NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE stay_records SET persona = 'HOSTELER' "
            "WHERE persona = 'HOSTEL_GUEST'"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE users
            SET customer_persona = (
                SELECT old_persona
                FROM _persona_027_backup
                WHERE table_name = 'users'
                  AND record_id = users.id
            )
            WHERE EXISTS (
                SELECT 1
                FROM _persona_027_backup
                WHERE table_name = 'users'
                  AND record_id = users.id
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE users
            SET customer_persona = NULL
            WHERE customer_persona = 'TEMP_CUSTOMER'
              AND NOT EXISTS (
                SELECT 1
                FROM _persona_027_backup
                WHERE table_name = 'users'
                  AND record_id = users.id
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE stay_records
            SET persona = (
                SELECT old_persona
                FROM _persona_027_backup
                WHERE table_name = 'stay_records'
                  AND record_id = stay_records.id
            )
            WHERE EXISTS (
                SELECT 1
                FROM _persona_027_backup
                WHERE table_name = 'stay_records'
                  AND record_id = stay_records.id
            )
            """
        )
    )
    op.drop_table("_persona_027_backup")
