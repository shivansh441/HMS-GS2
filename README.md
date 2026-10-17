# GrandStay — Hybrid Hostel-cum-Hotel Management System (HMS)

> **Phase 1: Project Foundation & Architectural Baseline**  
> A production-oriented, modular multi-property management platform supporting unified administrative operations, distinct hostel and hotel business workflows, and strict property-level data isolation.

---

## 1. System Overview & Architectural Principles

GrandStay operates as a **Modular Monolith** designed for high maintainability, strict property-level multi-tenancy, and independent evolution of hostel vs. hotel workflows.

```
                      ┌───────────────────────────────────────────────┐
                      │    GrandStay Client (React 19 + TypeScript)   │
                      │  Active Property Switcher & Role Simulator    │
                      └───────────────────────┬───────────────────────┘
                                              │ HTTP / JSON (API v1)
                                              ▼
                      ┌───────────────────────────────────────────────┐
                      │           FastAPI Gateway / Router            │
                      │   - X-Request-ID Correlation Tracing          │
                      │   - Exception Handlers & Standard Envelopes   │
                      └───────────────┬───────────────┬───────────────┘
                                      │               │
                     ┌────────────────┴────────┐      └────────────────┐
                     ▼                         ▼                       ▼
          ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
          │ Shared Core & Auth  │   │   Hostel Domain     │   │    Hotel Domain     │
          │ - User / Staff RBAC │   │ - Bed-level inv     │   │ - Room suite inv    │
          │ - Property Scoping  │   │ - Bunk assignments  │   │ - Housekeeping      │
          │ - Bcrypt + JWT      │   │ - Locker deposits   │   │ - Minibar / Folios  │
          │ - Audit Logging     │   │ - Communal policies │   │ - Concierge / Valet │
          └──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘
                     │                         │                         │
                     └────────────────┬────────┴─────────────────────────┘
                                      ▼
                      ┌───────────────────────────────────────────────┐
                      │   Persistence Layer (SQLAlchemy 2.0 Async)    │
                      │   - psycopg3 async connection pool            │
                      │   - Alembic asynchronous migrations           │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                      ┌───────────────────────────────────────────────┐
                      │            PostgreSQL 16 Database             │
                      │   Properties | Users | Property Assignments   │
                      └───────────────────────────────────────────────┘
```

### Layered Separation of Concerns
1. **API Routes & HTTP Layer (`backend/app/api/v1/`)**: Request routing, parameter validation, HTTP status codes, correlation ID injection. Zero business logic.
2. **Schemas (`backend/app/schemas/`)**: Pydantic v2 validation contracts, standard envelopes (`ApiResponse[T]`), high-precision Decimal money formatting.
3. **Application Services (`backend/app/services/`)**: Encapsulates business logic, transactional boundaries, and multi-service orchestration.
4. **Domain Models (`backend/app/models/`)**: Declarative SQLAlchemy 2.0 models with UUIDv4 primary keys and UTC timestamps.
5. **Database Persistence (`backend/app/db/` & `backend/alembic/`)**: Async engine pool, session lifecycle management, and schema migrations.
6. **Core Security (`backend/app/core/`)**: Cryptographic password hashing (bcrypt), JWT verification, RBAC definitions, structured JSON logging.

---

## 2. Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI pipeline (backend + frontend)
├── backend/
│   ├── alembic/
│   │   ├── versions/            # Migration revisions
│   │   ├── env.py               # Asynchronous migration environment
│   │   └── script.py.mako       # Migration template
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py          # DB session, JWT, RBAC & Property isolation dependencies
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── health.py# /api/v1/health & /healthz
│   │   │       │   └── spec.py  # /api/v1/system-meta
│   │   │       └── router.py    # Master API v1 router
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic-settings configuration
│   │   │   ├── exceptions.py    # Domain exceptions & error handlers
│   │   │   ├── logging.py       # Structured JSON logging with correlation IDs
│   │   │   └── security.py      # Bcrypt hashing, JWT tokens, UserRole enum
│   │   ├── db/
│   │   │   ├── base.py          # SQLAlchemy 2.0 DeclarativeBase
│   │   │   └── session.py       # Async engine & sessionmaker pool
│   │   ├── models/
│   │   │   ├── base.py          # UUID, Timestamp, SoftDelete mixins
│   │   │   ├── property.py      # Property model (hostel / hotel / hybrid)
│   │   │   └── user.py          # User & UserPropertyAssignment models
│   │   ├── schemas/
│   │   │   ├── auth.py          # Login & Token schemas
│   │   │   ├── common.py        # ApiResponse, Pagination, ErrorDetail, Money
│   │   │   ├── health.py        # Health probe telemetry schemas
│   │   │   └── property.py      # Property & Hostel/Hotel config schemas
│   │   ├── services/
│   │   │   └── health_service.py# Asynchronous health & DB latency probe
│   │   └── main.py              # FastAPI factory, CORS, trace middleware
│   ├── tests/
│   │   ├── conftest.py          # In-memory async SQLite engine & HTTPX client
│   │   ├── test_architecture.py # Invariant & security tests
│   │   └── test_health.py       # Health check & probe tests
│   ├── alembic.ini              # Alembic configuration
│   ├── Dockerfile               # Multi-stage production container
│   ├── pyproject.toml           # Backend dependencies, Ruff, Mypy, Pytest config
│   └── requirements.txt         # Pinned production dependencies
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx       # Property context switcher & role simulator
│   │   │   └── Sidebar.tsx      # Domain module navigation
│   │   └── shared/
│   │       ├── ArchitectureViewer.tsx   # Interactive layer explorer
│   │       ├── DashboardOverview.tsx    # Acceptance checklist & summary
│   │       ├── DatabaseSchemaCard.tsx   # Schema & migration visualizer
│   │       ├── HealthMonitorCard.tsx    # Live /api/v1/health probe UI
│   │       ├── HostelWorkflowCard.tsx   # Bed-level operations explorer
│   │       └── HotelWorkflowCard.tsx    # Room-level operations explorer
│   ├── contexts/
│   │   ├── AuthContext.tsx      # RBAC & property access enforcement
│   │   └── PropertyContext.tsx  # Multi-tenant active property state
│   ├── lib/
│   │   └── utils.ts             # Tailwind class merger & currency formatters
│   ├── services/
│   │   └── api-client.ts        # Fetch client with X-Request-ID propagation
│   ├── test/
│   │   └── app.test.ts          # Vitest frontend invariants
│   ├── types/
│   │   ├── api.ts               # Standard API contracts
│   │   └── property.ts          # Property & workflow interfaces
│   ├── App.tsx                  # Root application shell
│   └── main.tsx                 # React DOM mount point
├── docker-compose.yml           # PostgreSQL 16 + Backend + Frontend
├── .env.example                 # Environment configuration template
├── .gitignore                   # Monorepo ignores
├── index.html                   # HTML entry point with synchronized meta
├── package.json                 # Frontend dependencies & scripts
├── tsconfig.json                # Strict TypeScript configuration
└── vite.config.ts               # Vite configuration with API reverse proxy
```

---

## 3. Technology Stack & Pinned Dependencies

### Backend
- **Python 3.11+ / 3.12+**
- **FastAPI 0.111+**: Modern async web framework with OpenAPI generation.
- **Pydantic v2 & pydantic-settings 2.2+**: Strict validation and typed settings.
- **SQLAlchemy 2.0.30+**: Asynchronous ORM with 2.0-style queries.
- **psycopg 3.3+**: Binary PostgreSQL driver for high-performance async I/O.
- **Alembic 1.13+**: Database migration engine with async environment runner.
- **Pytest 8.2+ & HTTPX 0.27+**: Hermetic test harness with ASGI transport.
- **Ruff 0.4+**: Blazing-fast linter and formatter.
- **Mypy 1.10+**: Strict static type checker.
- **bcrypt 4.1+ & PyJWT 2.8+**: Cryptographic password hashing and token claims.

### Frontend
- **React 19 & TypeScript 5+ (Strict Mode)**
- **Vite 6+**: Build tool and dev server.
- **Tailwind CSS v4**: Utility-first styling.
- **TanStack Query v5**: Server state caching and background polling.
- **Lucide React**: Modern icon set.
- **Vitest**: Unit testing framework for frontend invariants.

### Infrastructure
- **Docker & Docker Compose**: PostgreSQL 16-alpine with healthchecks, multi-stage backend, hot-reloading frontend.
- **GitHub Actions**: Continuous integration running linters, type checks, and tests on push and pull requests.

---

## 4. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment variables:
| Variable | Description | Default |
|---|---|---|
| `ENVIRONMENT` | Target environment (`development`, `staging`, `production`, `test`) | `development` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql+psycopg://postgres:...@localhost:5432/grandstay_hms` |
| `SECRET_KEY` | 32+ char key for JWT signing | *(Must be generated via `openssl rand -hex 32`)* |
| `BACKEND_CORS_ORIGINS` | JSON list of allowed origins | `["http://localhost:3000","http://127.0.0.1:3000"]` |
| `LOG_LEVEL` | Logging verbosity (`DEBUG`, `INFO`, `WARNING`, `ERROR`) | `INFO` |
| `LOG_FORMAT` | Format output (`console` or `json`) | `console` |

---

## 5. Setup & Running Instructions

### Option A: Running via Docker Compose (Recommended)
Starts PostgreSQL 16, initializes health checks, and brings up backend and frontend:
```bash
# 1. Start all services
docker compose up --build

# 2. View logs
docker compose logs -f backend

# 3. Stop services
docker compose down
```

### Option B: Local Development Setup

#### 1. Backend Setup
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip setuptools wheel
pip install -r backend/requirements.txt

# Run database migrations
alembic -c backend/alembic.ini upgrade head

# Start FastAPI development server
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```
Interactive OpenAPI documentation will be available at:
- Swagger UI: `http://localhost:8000/api/v1/docs`
- ReDoc: `http://localhost:8000/api/v1/redoc`

#### 2. Frontend Setup
```bash
# Install node packages
npm install

# Start Vite dev server (runs on port 3000)
npm run dev
```
Open `http://localhost:3000` to interact with the GrandStay management shell.

---

## 6. Testing & Quality Verification

### Run Backend Tests (Pytest)
Executes all async invariant and health check tests against an in-memory SQLite database:
```bash
# Run test suite
pytest backend/tests -v

# Run with coverage report
pytest backend/tests --cov=app --cov-report=term-missing
```

### Run Backend Linting & Formatting (Ruff)
```bash
# Check code style and rules
ruff check backend/app backend/tests

# Check formatting
ruff format --check backend/app backend/tests

# Auto-fix fixable issues
ruff check --fix backend/app backend/tests
```

### Run Static Type Checking (Mypy)
```bash
PYTHONPATH=backend mypy --config-file backend/pyproject.toml backend/app
```

### Run Frontend Tests & Typecheck
```bash
# Run Vitest test suite
npm run test

# Run TypeScript strict typecheck
npm run lint

# Run Vite production build
npm run build
```

---

## 7. API Conventions & Standards

All endpoints adhere to strict API v1 conventions:

### Version Prefix
All routes are mounted under `/api/v1`.

### Envelope Formats
- **Success (`ApiResponse<T>`)**:
  ```json
  {
    "success": true,
    "data": { ... },
    "message": "Operation completed successfully",
    "correlation_id": "c1f79590-...",
    "timestamp": "2026-10-17T17:26:04.046Z"
  }
  ```
- **Error (`ErrorResponse`)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "PROPERTY_ACCESS_VIOLATION",
      "message": "Access denied: user is not authorized for property.",
      "details": { "property_id": "prop-hostel-001" },
      "correlation_id": "c1f79590-..."
    },
    "timestamp": "2026-10-17T17:26:04.046Z"
  }
  ```

### HTTP Status Codes
- `200 OK`: Successful read or update.
- `201 Created`: Resource created.
- `400 Bad Request`: Malformed payload.
- `401 Unauthorized`: Missing or invalid JWT.
- `403 Forbidden`: Insufficient role or property boundary violation.
- `404 Not Found`: Resource does not exist.
- `409 Conflict`: Business invariant collision.
- `422 Unprocessable Entity`: Pydantic validation failure with field breakdown.
- `500 Internal Server Error`: Unhandled failure with correlation ID.

---

## 8. Security Baseline

1. **Password Hashing**: Passwords are encrypted using `bcrypt` (work factor 12) with salt generation.
2. **Authorization**: Strict role-based access control (`UserRole`) with 6 distinct roles: `super_admin`, `property_manager`, `front_desk`, `housekeeping`, `accountant`, `guest`.
3. **Property-Level Data Isolation**: Enforced via FastAPI dependency `verify_property_scope()`. Non-super-admins cannot query or modify entities outside their assigned property.
4. **Secrets Management**: No credentials committed in source control; loaded through `.env`.
5. **Correlation Tracking**: Every incoming request is stamped with a unique `X-Request-ID` header, propagated through Python async `ContextVar` into structured logs.

---

## 9. Phase 2 Handoff Checklist

Phase 1 provides the foundational architecture. Phase 2 will implement domain business modules:

- [ ] **Property Management Engine**: CRUD endpoints for properties, wings, room tiers, and seasonal rates.
- [ ] **Hostel Bed Allocation System**: Dorm bed visual map, mixed/female dorm allocation constraints, bunk bed selection.
- [ ] **Hotel Room Folio System**: Room check-in/out, room keys, night audit, minibar post, concierge requests.
- [ ] **Unified Reservation & Guest CRM**: Guest profiles, duplicate identification, shared guest history across properties.
- [ ] **Financial & Invoicing Subsystem**: High-precision decimal multi-currency ledger, split-folio payments, tax invoicing.
- [ ] **Housekeeping & Maintenance Tasking**: Real-time room and bed clean/dirty status transitions.
- [ ] **Role-based Auth Routes**: Production `/auth/login` and `/auth/refresh` with secure httpOnly cookies.
