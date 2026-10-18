# GrandStay Local Development Guide

## 1. Prerequisites

Before setting up GrandStay locally, ensure you have:
- **Node.js**: v22.x LTS or higher
- **npm**: v10.x or higher
- **Git**
- *(Optional)* **Docker & Docker Compose**: v2.20+ if running containerized PostgreSQL

---

## 2. Quick Start

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/shivansh441/HMS-GS2.git
cd HMS-GS2

# Install dependencies cleanly
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
For local development, the default values in `.env.example` work out-of-the-box.

### 3. Start the Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000` with hot-module reload for the frontend and full REST API services on `/api/v1`.

---

## 3. Pre-Seeded Development Accounts

GrandStay comes pre-seeded with realistic baseline test accounts representing all 6 platform roles:

| Role | Email | Password | Assigned Properties |
|---|---|---|---|
| **Super Admin** | `director@grandstay.com` | `Admin2026!Secure` | All Properties (Global) |
| **Property Manager** | `clara.manager@grandstay.com` | `Manager2026!Pass` | `prop-hostel-001` (Edinburgh Hostel) |
| **Front Desk** | `liam.desk@grandstay.com` | `Desk2026!Pass` | `prop-hotel-002` (London Hotel) |
| **Housekeeping** | `elena.clean@grandstay.com` | `Clean2026!Pass` | Edinburgh Hostel & London Hotel |
| **Accountant** | `marcus.finance@grandstay.com` | `Finance2026!Pass` | Edinburgh, London & Berlin |
| **Guest / Customer** | `sofia.guest@example.com` | `Sofia2026!Guest` | None (Customer Portal) |
| **Hosteller** | `john.doe@example.com` | `John2026!Guest` | None (Customer Portal) |

---

## 4. Pre-Seeded Properties

1. **`prop-hostel-001` — GrandStay Royal Mile Hostel (Edinburgh)**
   - Type: `hostel`
   - Currency: `GBP (£)`
   - Inventory: 18 rooms, 124 beds (Pod dorms, female-only dorms, private ensuite doubles).
2. **`prop-hotel-002` — GrandStay Mayfair Grand Hotel (London)**
   - Type: `hotel`
   - Currency: `GBP (£)`
   - Inventory: 86 rooms, 110 beds (Deluxe King, Executive Suites, Classic Twin Suites).
3. **`prop-hybrid-003` — GrandStay Mitte Hybrid Campus (Berlin)**
   - Type: `hybrid`
   - Currency: `EUR (€)`
   - Inventory: 44 rooms, 160 beds (Designer dorm pods + Executive Boutique Suites + Coworking).

---

## 5. Running Automated Checks

### Run Unit & Domain Tests (Vitest)
Executes all 184 tests across all 11 test suites:
```bash
npm test
```

### Run Strict TypeScript Typechecking
```bash
npm run lint
```

### Run Production Build Verification
```bash
npm run build
```

---

## 6. Troubleshooting Common Issues

### Issue: Port 3000 already in use
```bash
# Terminate existing process on port 3000
fuser -k 3000/tcp || lsof -ti:3000 | xargs kill -9
```

### Issue: Vitest rate limit throttling
If running thousands of rapid automated tests, set `NODE_ENV=test` before executing `npm test` so the login rate limiter uses the test allowance.
