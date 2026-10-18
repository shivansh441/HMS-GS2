# GrandStay Operations, Maintenance & Incident Response Guide

This document establishes standard operating procedures (SOPs) for systems administrators and operations engineers managing GrandStay.

---

## 1. Health Monitoring & Observability

### 1.1 Health Probes
GrandStay provides two standard health probes:
1. **Liveness Probe**: `GET /api/v1/healthz`
   - Returns `HTTP 200` with `{"status":"ok"}`.
   - Use in Docker, Kubernetes, or load balancer health checks.
2. **Readiness & Diagnostics Probe**: `GET /api/v1/health`
   - Returns comprehensive database connectivity, query latency in milliseconds, system uptime, and version telemetry.
   - Example response:
     ```json
     {
       "success": true,
       "data": {
         "status": "healthy",
         "service": "GrandStay Hybrid HMS",
         "version": "0.1.0",
         "database": {
           "status": "connected",
           "latency_ms": 1.54,
           "dialect": "postgresql"
         },
         "system": {
           "uptime_seconds": 1845.2
         }
       }
     }
     ```

### 1.2 Log Inspection
Container logs emit structured JSON records:
```bash
# View combined logs in real-time
docker compose logs -f

# Inspect only security audit events
docker compose logs app | grep "\[SECURITY_AUDIT\]"

# Filter error events
docker compose logs app | grep -E "ERROR|error"
```

---

## 2. Backup & Disaster Recovery

### 2.1 Recovery Objectives
- **Target RPO (Recovery Point Objective)**: 24 hours for daily automated dumps (or 1 hour if streaming WAL archiving is configured).
- **Target RTO (Recovery Time Objective)**: < 15 minutes to restore from compressed backup.

### 2.2 Scheduled Daily Backups
Add a cron job on the host machine to execute `scripts/backup_db.sh` every night at 02:00 UTC:
```bash
# Open crontab editor
crontab -e

# Add automated daily backup entry (retains last 30 days)
0 2 * * * /opt/grandstay/scripts/backup_db.sh >> /var/log/grandstay_backup.log 2>&1
```

### 2.3 Manual Database Backup
```bash
cd /opt/grandstay
./scripts/backup_db.sh
```

### 2.4 Database Restore
```bash
cd /opt/grandstay
./scripts/restore_db.sh ./backups/grandstay_grandstay_hms_YYYYMMDD_HHMMSS.sql.gz
```

---

## 3. Incident Response Playbook

### Incident 1: Backend Unresponsive or Returning HTTP 500
1. Check container health status:
   ```bash
   docker compose ps
   ```
2. Inspect recent application stack traces:
   ```bash
   docker compose logs --tail=100 app
   ```
3. Verify PostgreSQL database status:
   ```bash
   docker compose exec db pg_isready -U grandstay_admin -d grandstay_hms
   ```
4. Restart application container if hung:
   ```bash
   docker compose restart app
   ```

### Incident 2: High Memory or CPU Usage
1. Inspect container resource consumption:
   ```bash
   docker stats --no-stream
   ```
2. Check for runaway database queries:
   ```bash
   docker compose exec db psql -U grandstay_admin -d grandstay_hms -c \
     "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC;"
   ```

### Incident 3: Suspected Credential Compromise
1. Reset the compromised user's password via `/api/v1/auth/change-password` or administrative update.
2. Invalidate all active sessions across the platform by rotating `SECRET_KEY` in `.env` and restarting the application container:
   ```bash
   docker compose restart app
   ```
3. Review audit logs for unauthorized actions:
   ```bash
   docker compose logs app | grep "\[SECURITY_AUDIT\]"
   ```

---

## 4. Routine Maintenance Tasks

| Frequency | Task | Description |
|---|---|---|
| **Daily (02:00 UTC)** | Database Backup | Run `scripts/backup_db.sh` and verify backup file size > 0. |
| **Weekly** | Log Review | Inspect Nginx error logs and application exception counts. |
| **Monthly** | Backup Restore Test | Restore latest backup into a temporary test database to verify backup integrity. |
| **Quarterly** | Dependency Updates | Run `npm audit` and update security patches. |
| **Every 60 Days** | TLS Renewal | Ensure Let's Encrypt certificates are renewed automatically before 90-day expiry. |
