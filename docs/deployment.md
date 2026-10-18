# GrandStay Production Deployment & Hosting Guide

This guide details how to deploy GrandStay into a production environment using Docker, Nginx, and PostgreSQL.

---

## 1. Production Architecture Overview

The recommended production deployment runs three services in an isolated Docker bridge network:
1. **Nginx Reverse Proxy (`grandstay_nginx`)**:
   - Listens on ports 80 and 443.
   - Terminates TLS/HTTPS.
   - Enforces rate limits and security headers.
   - Serves static assets with 1-year caching.
   - Forwards API requests to the app service.
2. **GrandStay Application (`grandstay_app`)**:
   - Node 22-alpine container running non-root.
   - Listens on internal port 3000.
   - Serves Express REST API and SSR/SPA fallback.
3. **PostgreSQL Database (`grandstay_postgres`)**:
   - PostgreSQL 16-alpine with persistent volume `postgres_data`.
   - Never exposed directly to the public internet.

---

## 2. Server Prerequisites

- **Operating System**: Ubuntu 22.04 LTS / Debian 12 / RHEL 9 (Linux x86_64)
- **Compute**: Minimum 2 vCPU, 4GB RAM, 40GB SSD
- **Tools**: Docker 24+, Docker Compose 2.20+, OpenSSL

---

## 3. Step-by-Step Production Deployment

### Step 1: Clone Repository & Create Environment Configuration
```bash
git clone https://github.com/shivansh441/HMS-GS2.git /opt/grandstay
cd /opt/grandstay

# Copy environment template
cp .env.example .env
```

### Step 2: Configure Production Secrets
Edit `.env` and configure mandatory production values:
```bash
# Set production environment
NODE_ENV=production
ENVIRONMENT=production
DEBUG=false

# Generate secure random JWT secret (min 32 chars)
SECRET_KEY=$(openssl rand -hex 32)

# Set database password
POSTGRES_USER=grandstay_admin
POSTGRES_PASSWORD=$(openssl rand -base64 24)
POSTGRES_DB=grandstay_hms

# Configure CORS for your actual production domain
BACKEND_CORS_ORIGINS='["https://app.yourdomain.com"]'
```

### Step 3: Install SSL/TLS Certificates
Place your TLS certificates in `nginx/ssl/`:
```bash
mkdir -p nginx/ssl
# Copy your fullchain.pem and privkey.pem (e.g. from Let's Encrypt / Certbot)
cp /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/app.yourdomain.com/privkey.pem nginx/ssl/privkey.pem
chmod 600 nginx/ssl/privkey.pem
```

*(For testing without a domain, generate a self-signed certificate:)*
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem -out nginx/ssl/fullchain.pem \
  -subj "/CN=localhost"
```

### Step 4: Build & Launch Production Containers
```bash
# Build production images and start services in background
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# Verify container status
docker compose ps
```

### Step 5: Provision Initial Platform Administrator
```bash
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_PASSWORD="YourVeryStrongPassword2026!" \
npx tsx scripts/bootstrap_admin.ts
```

### Step 6: Verify Deployment Health
```bash
# Test local health probe
curl -k https://localhost/api/v1/health

# Inspect live application logs
docker compose logs -f app
```

---

## 4. Updates & Zero-Downtime Rollout

To deploy an update without dropping user requests:
```bash
cd /opt/grandstay
git pull origin main

# Rebuild app container
docker compose -f docker-compose.yml -f docker-compose.prod.yml build app

# Restart app container with zero downtime
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps app
```

---

## 5. Rollback Procedure

If a deployed version has critical issues:
```bash
# 1. Rollback git repository to previous release tag or commit
git checkout v1.0.0

# 2. Rebuild and launch previous container image
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d app

# 3. If schema changes occurred, restore the pre-deployment database backup
./scripts/restore_db.sh ./backups/pre_deployment_backup.sql.gz --force
```
