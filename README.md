# Haven Stays Hospitality Platform — Full-Stack Monorepo

Welcome to **Haven Stays**, a production-grade full-stack hospitality monorepo orchestrating modern boutique hotels, social hostels, and long-term residences.

---

## 1. Monorepo Layout & Service Ports

| Service | Technology | Port | Purpose |
| :--- | :--- | :--- | :--- |
| **`/backend`** | Python 3.12 + FastAPI + SQLAlchemy 2.0 | `8000` | Core API, Auth, Scoping, Audit, Security |
| **`/admin-panel`** | React 19 + TypeScript + Vite + Tailwind (NO animation) | `5173` | Internal Management Console & Property Switcher |
| **`/public-website`** | Next.js 15 (App Router) + Tailwind + GSAP | `3000` | Guest Marketing & Stage-Based Customer Dashboard |
| **PostgreSQL** | Postgres 16 (in Docker Compose) | `5432` | Relational Storage (SQLite fallback when unset) |

**CORS Security:** The backend CORS middleware enforces an explicit allow-list of only `http://localhost:5173` and `http://localhost:3000`.

---

## 2. Quickstart & Commands

```bash
# Start all services together
make dev

# Run comprehensive test suites (pytest + frontends type checking)
make test

# Lint all codebases (Ruff + Mypy + check:no-animation + TypeScript)
make lint

# Run database migrations
make migrate

# Seed database with initial properties and test accounts
make seed

# Generate typed TypeScript contracts from OpenAPI schema
make types

# Run the 7-day unverified account retention housekeeping job
make housekeeping
```

### Docker Compose
```bash
docker compose up --build
```

---

## 3. Core Architecture

### A. Audience Separation (`aud`)
- **Customer Tokens:** Carry `aud="customer"` and receive `hs_cust_rt` refresh cookies scoped to `/api/v1/auth`. If presented to `/admin/*`, they are immediately rejected with `401 Unauthorized` or `403 Forbidden`.
- **Admin Tokens:** Carry `aud="admin"` and receive `hs_admin_rt` refresh cookies scoped to `/api/v1/admin/auth`. Rejected if presented to customer endpoints.
- **In-Memory JWT Access Tokens:** 15-minute lifetime, stored in JavaScript memory only (never `localStorage` or `sessionStorage`).
- **Opaque Refresh Tokens:** Stored as SHA-256 hashes in the DB with full reuse detection. If a revoked token is replayed, the entire token family is invalidated and an audit event is logged.

### B. Property Scoping & Tenant Isolation
- **Centralized Resolution:** The `resolve_property_scope()` dependency calculates accessible properties based on role and optional `X-Property-Id` header.
- **`ScopedQuery` Helper:** Admin routes read and write exclusively through `ScopedQuery`. Queries cannot bypass tenant boundaries.
- **Super Admin vs. Manager Scope:**
  - `SUPER_ADMIN` has global visibility across all properties and the unassigned customer pool.
  - `MANAGER` and `STAFF` see only records linked to their assigned properties.
  - Out-of-scope resources return **`404 Not Found`** (not 403) to prevent existence leakage.
- **Segment Filter (`registered_no_booking`):** Accessible only to Super Admin; returning 403 if requested by Managers.

### C. The `BookingProvider` Port (Vertical Slice)
- `BookingProvider` defines the boundary interface for guest booking counts and stay stages.
- In Module 1, `NullBookingProvider` safely returns `0` bookings and the **`REGISTERED_NO_BOOKING`** stage.
- Module 2 replaces this provider with real reservation queries without rewriting authentication or customer account logic.

### D. Zero-Animation Discipline in `/admin-panel`
- Hard rule: No motion or animation libraries (`gsap`, `framer-motion`, `lottie`, etc.).
- Global CSS rule: `* { animation: none !important; transition: none !important; scroll-behavior: auto !important; }`.
- Static loading indicators only.
- Validated via `check:no-animation` in `make lint` and CI.

### E. GSAP Animation System in `/public-website`
- Registered centrally in `lib/gsap.ts`.
- Reusable motion primitives in `components/motion/`: `<Reveal>`, `<Stagger>`, `<SplitHeading>`, `<Parallax>`, `<CountUp>`, `<MagneticButton>`, `<PageTransition>`.
- Fully respects `prefers-reduced-motion` via `gsap.matchMedia()`.
- Animations are strictly excluded from form inputs and error banners to ensure immediate usability.

---

## 4. Seeded Test Credentials (Dev Only)

All seeded passwords meet policy: $\ge 12$ chars, uppercase, lowercase, digit, and special symbol.

| Role | Email / Identifier | Password | Properties / Notes |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@havenstays.com` | `AdminSecurePass123!` | All Properties (HQ-01, HQ-02). MFA step enforced. |
| **Manager (HQ-01)** | `manager.hq01@havenstays.com` | `ManagerSecurePass123!` | Scoped to HQ-01 only. |
| **Manager (Both)** | `manager.all@havenstays.com` | `ManagerSecurePass123!` | Scoped to HQ-01 & HQ-02. |
| **Front Desk** | `frontdesk@havenstays.com` | `StaffSecurePass123!` | Scoped to HQ-01. |
| **Housekeeping** | `housekeeping@havenstays.com` | `StaffSecurePass123!` | Scoped to HQ-02. |
| **Customer (No Booking 1)** | `guest.nobooking1@gmail.com` | `CustomerPass123!` | Verified email, no property link. |
| **Customer (No Booking 2)** | `guest.nobooking2@gmail.com` | `CustomerPass123!` | Unverified email, unassigned pool. |
| **Resident (Pending)** | `resident.pending@gmail.com` | `CustomerPass123!` | Linked to HQ-01. ID document encrypted. |
| **Hotel Guest** | `guest.hotel@gmail.com` | `CustomerPass123!` | Linked to HQ-01 (Booking source). |
| **Hostel Guest** | `guest.hostel@gmail.com` | `CustomerPass123!` | Linked to HQ-02 (Booking source). |

---

## 5. Documented 501 Stubs (For Later Milestones)

The following endpoints are defined with OpenAPI documentation and clean HTTP 501 stubs ready for subsequent milestone prompts:
- `POST /api/v1/auth/otp/send` — SMS & email passwordless OTP token dispatch.
- `POST /api/v1/auth/password/forgot` — Cryptographic email reset token generator.
- `POST /api/v1/admin/properties` — Property creation and layout wizard.
- `GET /api/v1/admin/properties/{id}` — Room tier and inventory management.
- `POST /api/v1/admin/users` — Staff creation and guest onboarding modal.
- `PATCH /api/v1/admin/users/{id}/status` — Account suspension and activation mutations.
