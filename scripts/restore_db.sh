#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# GrandStay Enterprise PostgreSQL Database Restore Script
# -----------------------------------------------------------------------------
set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path-to-backup-file.sql.gz> [--force]"
    echo "Example: $0 ./backups/grandstay_grandstay_hms_20261018_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"
FORCE="${2:-}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "❌ ERROR: Backup file '${BACKUP_FILE}' does not exist."
    exit 1
fi

DB_USER="${POSTGRES_USER:-grandstay_admin}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-grandstay_hms}"

echo "=========================================================="
echo " ⚠️  GrandStay Database Restore Utility"
echo " Target DB:    ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo " Source File:  ${BACKUP_FILE}"
echo "=========================================================="

if [ "${FORCE}" != "--force" ]; then
    echo "WARNING: This operation will overwrite existing tables and records in '${DB_NAME}'."
    read -r -p "Type 'RESTORE-CONFIRM' to proceed: " CONFIRMATION
    if [ "${CONFIRMATION}" != "RESTORE-CONFIRM" ]; then
        echo "Restore cancelled by user."
        exit 0
    fi
fi

echo "[INFO] Restoring database..."

if command -v psql >/dev/null 2>&1; then
    PGPASSWORD="${POSTGRES_PASSWORD:-}" gunzip -c "${BACKUP_FILE}" | \
        psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "grandstay_postgres"; then
    gunzip -c "${BACKUP_FILE}" | docker exec -i \
        -e PGPASSWORD="${POSTGRES_PASSWORD:-GrandStay_2026_SecureDev!}" \
        grandstay_postgres psql -U "${DB_USER}" -d "${DB_NAME}"
else
    echo "❌ ERROR: Neither 'psql' nor Docker container 'grandstay_postgres' was found."
    exit 1
fi

echo "✅ Database restore successfully completed."
echo "=========================================================="
