#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# GrandStay Enterprise PostgreSQL Automated Backup Script
# -----------------------------------------------------------------------------
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

DB_USER="${POSTGRES_USER:-grandstay_admin}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-grandstay_hms}"

mkdir -p "${BACKUP_DIR}"

BACKUP_FILE="${BACKUP_DIR}/grandstay_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "=========================================================="
echo " GrandStay PostgreSQL Backup Utility"
echo " Target DB:   ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo " Timestamp:   ${TIMESTAMP}"
echo " Output File: ${BACKUP_FILE}"
echo "=========================================================="

if command -v pg_dump >/dev/null 2>&1; then
    echo "[INFO] Running pg_dump with gzip compression..."
    PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -F p \
        --clean \
        --if-exists \
        "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "grandstay_postgres"; then
    echo "[INFO] Running pg_dump inside running Docker container 'grandstay_postgres'..."
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-GrandStay_2026_SecureDev!}" \
        grandstay_postgres pg_dump \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --clean \
        --if-exists | gzip -9 > "${BACKUP_FILE}"
else
    echo "❌ ERROR: Neither 'pg_dump' nor Docker container 'grandstay_postgres' was found."
    exit 1
fi

# Verify backup integrity
if [ -s "${BACKUP_FILE}" ]; then
    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "✅ Backup completed successfully: ${BACKUP_FILE} (${FILE_SIZE})"
else
    echo "❌ ERROR: Backup file was created empty. Aborting."
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Rotate backups older than retention window
echo "[INFO] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "grandstay_*.sql.gz" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
echo "[INFO] Retention maintenance completed."
echo "=========================================================="
