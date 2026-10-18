# GrandStay — Hybrid Hostel & Hotel Enterprise Management System

> **A production-grade, modular multi-property management platform supporting unified administrative operations, distinct hostel and hotel business workflows, and property-isolated security.**

[![Continuous Integration](https://github.com/shivansh441/HMS-GS2/actions/workflows/ci.yml/badge.svg)](https://github.com/shivansh441/HMS-GS2/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. System Overview

GrandStay is an enterprise hospitality platform designed to solve the operational divergence between **high-density hostels** and **luxury boutique hotels**. It provides unified multi-property administrative operations while preserving the specific workflows required by each property type:

- **Hostel Operations**: Bed-level inventory matrix, dormitory pod management, mixed & female-only gender policies, bunk/locker assignments, mess hall dining subscriptions, and fast walk-in check-ins.
- **Hotel Operations**: Room suite inventory, multi-occupant bookings, VIP loyalty tiers, concierge requests, minibar billing, room service, and personalized guest folio settlements.
- **Hybrid Properties**: High-density designer dorm pods and executive boutique suites co-existing under one roof with consolidated financial reporting and shared staffing.
- **Multi-Tenant Property Isolation**: Strict cryptographic and role-based data isolation preventing staff in one property from accessing another property's guests, bookings, or revenue.
- **Financial & Tax Engine**: Multi-jurisdiction VAT/tourism tax calculation, split folios, deposit tracking, payment allocations, and audited refunds.
- **Mess & Restaurant POS**: Meal plan subscriptions, dietary flags (allergens, vegan, halal), meal hall swipe attendance, dining orders, and kitchen stock replenishment.
- **Staff & Facilities Operations**: Department scheduling (Front Desk, Housekeeping, Maintenance, F&B), attendance clock-in/out, room/bed cleaning queues, and maintenance work orders.
- **Reporting & Business Analytics**: Consolidated executive dashboards, RevPAR, ADR, occupancy rates, aging receivables, cash-flow reconciliation, and sanitized CSV exports.

---

## 2. Technology Stack

- **Frontend**: React 19, TypeScript (Strict Mode), Vite 8, Tailwind CSS v4, TanStack Query v5, Lucide React, Motion.
- **Backend**: Node.js 22, Express, TypeScript (`server.ts`), Argon2id / Scrypt cryptographic key derivation, HMAC-SHA256 JWT sessions.
- **Database**: PostgreSQL 16 with persistent volumes and healthchecks.
- **Containerization & Reverse Proxy**: Docker multi-stage builds (non-root `node` user), Docker Compose, Nginx with TLS 1.3, rate limiting, and HTTP security headers.
- **Automated Testing & Quality**: Vitest (184 automated tests across 11 test suites), strict `tsc --noEmit` type checking.

---

## 3. Quick Start Guide

### Option A: Local Development Setup (Quickest)
```bash
# 1. Clone repository
git clone https://github.com/shivansh441/HMS-GS2.git
cd HMS-GS2

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env

# 4. Start local development server
npm run dev
```
Open **`http://localhost:3000`** in your browser to access the management portal.

### Option B: Docker Compose (Self-Hosted / Production)
```bash
# 1. Build and start containers
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# 2. Inspect container status
docker compose ps

# 3. View live application logs
docker compose logs -f app
```

---

## 4. Pre-Seeded Development Accounts

GrandStay comes with pre-seeded credentials for all platform roles:

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Super Admin** | `director@grandstay.com` | `Admin2026!Secure` | Global (All Properties) |
| **Property Manager** | `clara.manager@grandstay.com` | `Manager2026!Pass` | Edinburgh Hostel (`prop-hostel-001`) |
| **Front Desk** | `liam.desk@grandstay.com` | `Desk2026!Pass` | London Hotel (`prop-hotel-002`) |
| **Housekeeping** | `elena.clean@grandstay.com` | `Clean2026!Pass` | Edinburgh Hostel & London Hotel |
| **Accountant** | `marcus.finance@grandstay.com` | `Finance2026!Pass` | All Properties |
| **Guest / Customer** | `sofia.guest@example.com` | `Sofia2026!Guest` | Customer Self-Service Portal |

---

## 5. Automated Verification & Quality Assurance

GrandStay features 100% passing automated test coverage across all business modules:

```bash
# Run complete Vitest test suite (184 tests across 11 suites)
npm test

# Run strict TypeScript type checking (0 errors)
npm run lint

# Run production bundle build
npm run build
```

### Verified Test Suites:
- `src/test/security.test.ts` — Authentication, RBAC, IDOR protection, double-booking rejection (14 tests)
- `src/test/auth.test.ts` — JWT rotation, refresh token invalidation, property boundaries (12 tests)
- `src/test/hotel.test.ts` — Hotel reservations, room moves, folio checkout, walk-ins (27 tests)
- `src/test/hostel.test.ts` — Dorm beds, lockers, female-only dorm enforcement, stays (27 tests)
- `src/test/operations.test.ts` — Housekeeping queues, work orders, staff shifts (24 tests)
- `src/test/finance.test.ts` — Invoices, multi-rate tax calculations, payment allocation, refunds (19 tests)
- `src/test/property.test.ts` — Multi-property registry, publication lifecycle, validation (12 tests)
- `src/test/food.test.ts` — Meal subscriptions, kitchen inventory, dining POS orders (23 tests)
- `src/test/reports.test.ts` — RevPAR, ADR, occupancy calculation, CSV tabular export (12 tests)
- `src/test/inventory.test.ts` — Rooms, dorm beds, maintenance blocks, allocation matrix (10 tests)
- `src/test/app.test.ts` — Shell navigation, property context, role simulator (4 tests)

---

## 6. Detailed Documentation Index

For in-depth architectural specifications and operational runbooks, refer to the `/docs` directory:

- 📐 [**Architecture & System Design**](docs/architecture.md) — Modular monolith layers, multi-tenancy model, booking concurrency, and financial flows.
- 💻 [**Local Development Guide**](docs/development.md) — Environment setup, seed data, and testing procedures.
- 📡 [**REST API v1 Specification**](docs/api.md) — Comprehensive endpoint reference, request/response envelopes, and status codes.
- 🚀 [**Production Deployment Guide**](docs/deployment.md) — Docker container builds, Nginx reverse proxy, TLS certificates, and rollback SOPs.
- 🛡️ [**Security Architecture & Baseline**](docs/security.md) — Cryptography, password hashing, JWT sessions, RBAC, and rate limits.
- 📋 [**Operations & Maintenance Guide**](docs/operations.md) — Automated database backups, disaster recovery, log inspection, and monitoring.

---

## 7. Administrative Utilities

### Provision Initial Super Administrator
```bash
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_PASSWORD="YourStrongPassword2026!" \
npx tsx scripts/bootstrap_admin.ts
```

### Automated PostgreSQL Backup
```bash
./scripts/backup_db.sh
```

### Safe Database Restore
```bash
./scripts/restore_db.sh ./backups/grandstay_grandstay_hms_YYYYMMDD_HHMMSS.sql.gz
```
