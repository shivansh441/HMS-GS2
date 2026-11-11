"""Use one full-name field for stay occupants.

Revision ID: 024_stay_occupant_full_name
Revises: 023_stay_occupant_address
Create Date: 2026-11-11
"""

import sqlalchemy as sa

from alembic import op

revision = "024_stay_occupant_full_name"
down_revision = "023_stay_occupant_address"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stay_occupants",
        sa.Column("full_name", sa.String(length=128), nullable=True),
    )
    op.execute(
        """
        UPDATE stay_occupants
        SET full_name = CASE
            WHEN last_name IS NULL OR trim(last_name) = '' THEN trim(first_name)
            ELSE trim(first_name) || ' ' || trim(last_name)
        END
        """
    )
    with op.batch_alter_table("stay_occupants") as batch_op:
        batch_op.alter_column("full_name", existing_type=sa.String(length=128), nullable=False)
        batch_op.drop_column("first_name")
        batch_op.drop_column("last_name")


def downgrade() -> None:
    with op.batch_alter_table("stay_occupants") as batch_op:
        batch_op.add_column(sa.Column("first_name", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("last_name", sa.String(length=50), nullable=True))
    connection = op.get_bind()
    occupants = connection.execute(
        sa.text("SELECT id, full_name FROM stay_occupants")
    ).mappings().all()
    for occupant in occupants:
        parts = (occupant["full_name"] or "").split(maxsplit=1)
        connection.execute(
            sa.text(
                """
                UPDATE stay_occupants
                SET first_name = :first_name, last_name = :last_name
                WHERE id = :id
                """
            ),
            {
                "id": occupant["id"],
                "first_name": parts[0][:50] if parts else "",
                "last_name": parts[1][:50] if len(parts) > 1 else None,
            },
        )
    with op.batch_alter_table("stay_occupants") as batch_op:
        batch_op.alter_column("first_name", existing_type=sa.String(length=50), nullable=False)
        batch_op.drop_column("full_name")
