"""Extend audit events and add security alerts.

Revision ID: 017_audit_security_monitoring
Revises: 016_mess_management
Create Date: 2026-11-06
"""

import sqlalchemy as sa

from alembic import op

revision = "017_audit_security_monitoring"
down_revision = "016_mess_management"
branch_labels = None
depends_on = None


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    )


def _foreign_key_exists(
    table_name: str, columns: list[str], referred_table: str
) -> bool:
    return any(
        foreign_key["constrained_columns"] == columns
        and foreign_key["referred_table"] == referred_table
        for foreign_key in sa.inspect(op.get_bind()).get_foreign_keys(table_name)
    )


def upgrade() -> None:
    columns = (
        ("actor_email", sa.String(length=100), True, None),
        ("actor_role", sa.String(length=50), True, None),
        ("entity_name", sa.String(length=100), True, None),
        ("entity_id", sa.String(length=100), True, None),
        ("client_ip", sa.String(length=45), False, "0.0.0.0"),
        ("request_method", sa.String(length=10), True, None),
        ("request_url", sa.String(length=255), True, None),
        ("payload_diff", sa.JSON(), True, None),
        ("status_code", sa.Integer(), False, "200"),
    )
    for name, column_type, nullable, server_default in columns:
        if not _column_exists("audit_logs", name):
            op.add_column(
                "audit_logs",
                sa.Column(name, column_type, nullable=nullable, server_default=server_default),
            )
    if op.get_bind().dialect.name != "sqlite":
        for name, column, table in (
            ("fk_audit_logs_actor_user_id_users", "actor_user_id", "users"),
            ("fk_audit_logs_target_user_id_users", "target_user_id", "users"),
            ("fk_audit_logs_property_id_properties", "property_id", "properties"),
        ):
            if not _foreign_key_exists("audit_logs", [column], table):
                op.create_foreign_key(
                    name,
                    "audit_logs",
                    table,
                    [column],
                    ["id"],
                    ondelete="SET NULL",
                )
    for column in ("actor_email", "actor_role", "entity_name", "entity_id"):
        index_name = f"ix_audit_logs_{column}"
        if not _index_exists("audit_logs", index_name):
            op.create_index(index_name, "audit_logs", [column], unique=False)

    if not _table_exists("security_alerts"):
        op.create_table(
            "security_alerts",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("alert_type", sa.String(length=100), nullable=False),
            sa.Column("severity", sa.String(length=16), nullable=False, server_default="MEDIUM"),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("source_ip", sa.String(length=45), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=True),
            sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("resolved_by", sa.String(length=36), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.CheckConstraint(
                "severity IN ('LOW', 'INFO', 'MEDIUM', 'HIGH', 'CRITICAL')",
                name="security_severity",
            ),
            sa.ForeignKeyConstraint(["resolved_by"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
    indexes = (
        ("ix_security_alerts_alert_type", ["alert_type"]),
        ("ix_security_alerts_created_at", ["created_at"]),
        ("ix_security_alerts_severity_resolved", ["severity", "is_resolved"]),
        ("ix_security_alerts_source_ip_created", ["source_ip", "created_at"]),
        ("ix_security_alerts_user_id", ["user_id"]),
        ("ix_security_alerts_is_resolved", ["is_resolved"]),
    )
    for name, columns in indexes:
        if not _index_exists("security_alerts", name):
            op.create_index(name, "security_alerts", columns)


def downgrade() -> None:
    op.drop_index("ix_security_alerts_is_resolved", table_name="security_alerts")
    op.drop_index("ix_security_alerts_user_id", table_name="security_alerts")
    op.drop_index("ix_security_alerts_source_ip_created", table_name="security_alerts")
    op.drop_index("ix_security_alerts_severity_resolved", table_name="security_alerts")
    op.drop_index("ix_security_alerts_created_at", table_name="security_alerts")
    op.drop_index("ix_security_alerts_alert_type", table_name="security_alerts")
    op.drop_table("security_alerts")
    for column in ("actor_email", "actor_role", "entity_name", "entity_id"):
        op.drop_index(f"ix_audit_logs_{column}", table_name="audit_logs")
    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint("fk_audit_logs_property_id_properties", "audit_logs", type_="foreignkey")
        op.drop_constraint("fk_audit_logs_target_user_id_users", "audit_logs", type_="foreignkey")
        op.drop_constraint("fk_audit_logs_actor_user_id_users", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "status_code")
    op.drop_column("audit_logs", "payload_diff")
    op.drop_column("audit_logs", "request_url")
    op.drop_column("audit_logs", "request_method")
    op.drop_column("audit_logs", "client_ip")
    op.drop_column("audit_logs", "entity_id")
    op.drop_column("audit_logs", "entity_name")
    op.drop_column("audit_logs", "actor_role")
    op.drop_column("audit_logs", "actor_email")
