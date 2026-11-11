"""Encrypt reservation occupant ID numbers.

Revision ID: 019_encrypted_occupant_ids
Revises: 018_remove_username
Create Date: 2026-11-10
"""

import sqlalchemy as sa

from alembic import op
from app.core.crypto import decrypt_data, process_id_document

revision = "019_encrypted_occupant_ids"
down_revision = "018_remove_username"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column(
        "reservation_occupants",
        sa.Column("id_number_encrypted", sa.Text(), nullable=True),
    )
    occupants = bind.execute(
        sa.text(
            "SELECT id, id_number FROM reservation_occupants "
            "WHERE id_number IS NOT NULL"
        )
    ).fetchall()
    for occupant_id, id_number in occupants:
        encrypted_number, _, _ = process_id_document(id_number)
        bind.execute(
            sa.text(
                "UPDATE reservation_occupants SET id_number_encrypted = :number "
                "WHERE id = :id"
            ),
            {"id": occupant_id, "number": encrypted_number},
        )
    op.drop_column("reservation_occupants", "id_number")


def downgrade() -> None:
    bind = op.get_bind()
    op.add_column(
        "reservation_occupants",
        sa.Column("id_number", sa.String(length=100), nullable=True),
    )
    occupants = bind.execute(
        sa.text(
            "SELECT id, id_number_encrypted FROM reservation_occupants "
            "WHERE id_number_encrypted IS NOT NULL"
        )
    ).fetchall()
    for occupant_id, encrypted_number in occupants:
        bind.execute(
            sa.text(
                "UPDATE reservation_occupants SET id_number = :number WHERE id = :id"
            ),
            {"id": occupant_id, "number": decrypt_data(encrypted_number)},
        )
    op.drop_column("reservation_occupants", "id_number_encrypted")
