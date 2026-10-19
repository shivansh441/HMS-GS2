# GrandStay Architecture & System Design Documentation

## 1. Executive System Overview

GrandStay is a hybrid hospitality enterprise management system engineered to manage both **hostel dormitory operations** and **boutique hotel operations** within a unified multi-property platform.

Traditional Property Management Systems (PMS) struggle with the dual reality of hostels and hotels:
- **Hostels** operate on high-density, bed-level inventory, shared dorm allocations, bunk/locker assignments, gender-specific dorm policies, and shared mess hall meal plans.
- **Hotels** operate on whole-room inventory, multi-occupant suites, VIP concierge, daily housekeeping turn-down, room service, and personalized guest folio billing.
- **Hybrid Properties** operate both models under the same roof with shared accounting, tax compliance, and unified staff scheduling.

```
                      ┌────────────────────────────────────────────────────────┐
                      │        GrandStay React 19 Client SPA                   │
                      │  - Multi-Property Context Switcher                     │
                      │  - RBAC Simulator & Customer Self-Service Portal       │
                      │  - Dedicated Hostel, Hotel, Dining & Admin Workspaces  │
                      └───────────────────────────┬────────────────────────────┘
                                                  │ HTTPS / JSON REST API v1
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │              Nginx TLS 1.3 Reverse Proxy               │
                      │  - HTTPS Termination & Modern Cipher Suite             │
                      │  - Security Headers (HSTS, CSP, X-Frame-Options)       │
                      │  - Rate Limiting Zones (/api: 30r/s, /auth: 5r/s)      │
                      │  - Gzip Compression & Static Asset Cache (1y)          │
                      └───────────────────────────┬────────────────────────────┘
                                                  │ HTTP
                                                  ▼
                      ┌────────────────────────────────────────────────────────┐
                      │           Unified Application Server (server.ts)       │
                      │  - Express REST Gateway with correlation X-Request-ID  │
                      │  - Argon2id / Scrypt Cryptographic Security Engine     │
                      │  - HMAC-SHA256 JWT Token & Refresh Session Manager     │
                      │  - Multi-Tenant Property Scoping Middleware            │
                      └───────┬──────────────┬──────────────┬───────────┬──────┘
                              │              │              │           │
            ┌─────────────────┴─┐   ┌────────┴────────┐   ┌─┴─────────┐ └──────────────┐
            ▼                   ▼   ▼                 ▼   ▼           ▼                ▼
     ┌─────────────┐     ┌──────────────┐     ┌───────────────┐ ┌───────────┐   ┌─────────────┐
     │ Property    │     │ Hostel Ops   │     │ Hotel Ops     │ │ Finance   │   │ Mess & Food │
     │ Management  │     │ - Beds/Dorms │     │ - Suites      │ │ - Invoices│   │ - Meal plans│
     │ - Multi-prop│     │ - Bunks      │     │ - Concierge   │ │ - Tax Eng │   │ - Dining POS│
     │ - Policies  │     │ - Lockers    │     │ - Folios      │ │ - Refunds │   │ - Stock/Inv │
     └─────────────┘     └──────────────┘     └───────────────┘ └───────────┘   └─────────────┘
                                       │
                                       ▼
                      ┌────────────────────────────────────────────────────────┐
                      │             PostgreSQL 16 Enterprise Database          │
                      │  - Persistent Multi-Property Relational Schema         │
                      │  - Strong Isolation & Foreign Key Referential Integrity│
                      │  - Automated Gzip Backups & Safe Rollback Pipelines    │
                      └────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Pillars

### 2.1 Modular Monolith
The architecture follows a strict Modular Monolith pattern. Each business domain maintains explicit separation of concerns, isolated stores, and clear interface boundaries:
1. **Foundation & Core Security**: User identity, JWT validation, cryptographic password hashing, role permissions.
2. **Property Management**: Multi-property configuration, address coordinates, policies, operating hours.
3. **Inventory Engine**: Floors, rooms, beds, accommodation tiers, operational states (available, occupied, maintenance, out-of-order).
4. **Hostel Operations**: Hosteller profiles, dorm stays, bed assignment, lockers, walk-ins, keycards.
5. **Hotel Operations**: Hotel guest profiles, suite bookings, VIP tiers, additional occupants, stay extensions.
6. **Finance & Tax Engine**: Invoices, tax rules, multi-jurisdiction calculation snapshots, payments, partial refunds.
7. **Mess & Restaurant**: Meal plans, dietary flags, hosteller entitlements, dining POS orders, kitchen inventory.
8. **Staff & Operations**: Employee directories, department shifts, housekeeping tasks, maintenance work orders.
9. **Reports & Analytics**: Consolidated and property-scoped executive summaries, occupancy performance, cash-flow reconciliation, secure CSV export.

---

## 3. Data Isolation & Multi-Tenancy

Multi-tenancy in GrandStay is strictly **property-isolated**:
- Every operational entity (`Room`, `Bed`, `Booking`, `Stay`, `Invoice`, `StaffMember`, `MaintenanceOrder`) belongs to a `property_id`.
- The authorization dependency `authenticate(req)` inspects JWT claims and the user's `assigned_property_ids`.
- **Super Administrators** have cross-property visibility (`assigned_property_ids: ["*"]` or superuser flag).
- **Property Managers**, **Front Desk**, **Housekeeping**, and **Staff** are strictly confined to their assigned properties. Attempting to query or modify entities belonging to another property immediately throws `403 PROPERTY_ACCESS_VIOLATION`.
- **Guests** and **Hostellers** can only access records where their `user_id` matches the reservation owner (`verify_booking_ownership`).

---

## 4. Concurrency & Double-Booking Invariants

Double bookings are prevented through strict interval validation:
- When creating a hostel stay or hotel reservation for dates `[check_in, check_out)`, the system checks active stays in the database or store.
- If any active reservation on that specific room or bed overlaps with `(new_check_in < existing_check_out AND new_check_out > existing_check_in)`, the request is rejected with `409 RESOURCE_CONFLICT`.
- Stays that meet on the same day (one checks out at 11:00 and another checks in at 14:00) succeed as a standard half-open interval `[check_in, check_out)`.

---

## 5. Financial & Tax Calculation Flow

1. An invoice is created with individual line items (`charge_category`, `unit_price`, `quantity`, `discount_amount`).
2. Active tax rules for the property are matched against line item categories.
3. Multi-component tax breakdown is calculated and frozen into a `TaxCalculationSnapshot` on the invoice.
4. Payments are allocated against invoices. The invoice balance and payment status are updated atomically.
5. Refunds can only be authorized by Property Managers or Super Admins, cannot exceed remaining refundable balances, and adjust the target invoice balance with full audit trails.
