# GrandStay REST API v1 Specification & Endpoint Reference

All endpoints in GrandStay adhere to standard REST API v1 conventions mounted under `/api/v1`.

---

## 1. Request & Response Standards

### 1.1 Correlation & Tracing
Every request is stamped with an `X-Request-ID` header. If supplied by the caller, it is respected; otherwise a UUIDv4 is assigned and returned in the response header and body for auditability.

### 1.2 Standard Success Envelope (`ApiResponse<T>`)
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully.",
  "correlation_id": "c1f79590-7d12-4f11-9a99-90234d6182ef",
  "timestamp": "2026-10-18T10:00:00.000Z"
}
```

### 1.3 Standard Error Envelope (`ErrorResponse`)
```json
{
  "success": false,
  "error": {
    "code": "PROPERTY_ACCESS_VIOLATION",
    "message": "Access denied to property 'prop-hostel-001'."
  },
  "correlation_id": "c1f79590-7d12-4f11-9a99-90234d6182ef",
  "timestamp": "2026-10-18T10:00:00.000Z"
}
```

### 1.4 Authentication
Pass the JSON Web Token in the HTTP Authorization header:
```http
Authorization: Bearer <access_token>
```

---

## 2. API Endpoint Directory

### 2.1 System & Health Probes
- `GET /api/v1/health` — Comprehensive database and system health telemetry.
- `GET /api/v1/healthz` — Minimal liveness probe for Kubernetes and Docker healthchecks.
- `GET /api/v1/system-meta` — Architectural capabilities and security configurations.

### 2.2 Authentication & Identity
- `POST /api/v1/auth/register` — Self-service customer registration (`role: guest`).
- `POST /api/v1/auth/login` — Authenticate and receive `access_token` and `refresh_token`.
- `POST /api/v1/auth/refresh` — Rotate refresh token and issue a new access token.
- `POST /api/v1/auth/logout` — Revoke active refresh session.
- `GET /api/v1/auth/me` — Retrieve profile of currently authenticated user.
- `POST /api/v1/auth/change-password` — Change password and invalidate prior sessions.
- `POST /api/v1/auth/forgot-password` — Issue single-use password reset token.
- `POST /api/v1/auth/reset-password` — Reset account password with token.

### 2.3 Administrative User Management
- `GET /api/v1/admin/users` — List platform users (Super Admin or Property Manager).
- `POST /api/v1/admin/users` — Provision staff user with role and property assignments.
- `GET /api/v1/admin/users/:id` — Retrieve user profile and assignment details.
- `PATCH /api/v1/admin/users/:id` — Update role, properties, or active status.
- `DELETE /api/v1/admin/users/:id` — Deactivate user account.

### 2.4 Multi-Property Management
- `GET /api/v1/properties/public` — Unauthenticated catalog of published properties.
- `GET /api/v1/properties` — List properties scoped to caller's assignment.
- `POST /api/v1/properties` — Register new property (Super Admin only).
- `GET /api/v1/properties/:id` — Detailed property configuration and policies.
- `PATCH /api/v1/properties/:id` — Update property settings.
- `POST /api/v1/properties/:id/publish` — Update publication status (`published`, `draft`, `unpublished`).
- `POST /api/v1/properties/:id/archive` — Soft-archive property.

### 2.5 Room & Bed Inventory Matrix
- `GET /api/v1/inventory/room-types` — List room categories and dorm tiers.
- `POST /api/v1/inventory/room-types` — Create room type tier.
- `GET /api/v1/inventory/rooms` — List physical rooms with cleanliness and operational status.
- `POST /api/v1/inventory/rooms` — Create physical room.
- `PATCH /api/v1/inventory/rooms/:id/status` — Update clean/dirty or maintenance state.
- `GET /api/v1/inventory/beds` — List physical beds and dorm pods.
- `POST /api/v1/inventory/beds` — Create dorm bed pod.
- `GET /api/v1/inventory/allocations` — Date-range inventory allocation matrix.

### 2.6 Hostel Operations Domain
- `GET /api/v1/hostel/dashboard` — Active hosteller counts, check-ins/outs, occupancy.
- `GET /api/v1/hostel/front-desk` — Front desk arrivals, departures, and locker assignments.
- `GET /api/v1/hostel/hostellers` — Search hosteller profiles.
- `POST /api/v1/hostel/hostellers` — Create hosteller profile.
- `GET /api/v1/hostel/stays` — Search and filter hostel stays.
- `POST /api/v1/hostel/stays` — Reserve bed with double-booking prevention.
- `POST /api/v1/hostel/stays/:id/check-in` — Check in hosteller and issue keycard/locker.
- `POST /api/v1/hostel/stays/:id/check-out` — Complete checkout and release bed.
- `POST /api/v1/hostel/stays/:id/reassign-bed` — Reassign stay to a different bed.
- `POST /api/v1/hostel/stays/:id/extend` — Extend stay dates.
- `POST /api/v1/hostel/walk-in` — Register instant walk-in hosteller.

### 2.7 Hotel Operations Domain
- `GET /api/v1/hotel/dashboard` — Room occupancy, VIP arrivals, housekeeping backlog.
- `GET /api/v1/hotel/front-desk` — Hotel front desk queue and suite assignments.
- `GET /api/v1/hotel/guests` — Search guest profiles and VIP tiers.
- `POST /api/v1/hotel/guests` — Create hotel guest profile.
- `GET /api/v1/hotel/stays` — List hotel reservations.
- `POST /api/v1/hotel/stays` — Create hotel reservation with double-booking check.
- `POST /api/v1/hotel/stays/:id/check-in` — Hotel room check-in.
- `POST /api/v1/hotel/stays/:id/check-out` — Hotel room checkout and folio settlement.
- `POST /api/v1/hotel/stays/:id/assign-room` — Assign specific physical room.
- `POST /api/v1/hotel/stays/:id/change-room` — Move guest to another room.
- `POST /api/v1/hotel/stays/:id/extend` — Extend stay dates.
- `POST /api/v1/hotel/walk-in` — Instant walk-in hotel reservation.

### 2.8 Finance & Tax Engine
- `GET /api/v1/finance/dashboard` — Revenue, receivables, collections, tax metrics.
- `GET /api/v1/finance/tax-rules` — Property tax rates and category mappings.
- `POST /api/v1/finance/tax-rules` — Configure tax rule.
- `GET /api/v1/finance/invoices` — List invoices with outstanding balances.
- `POST /api/v1/finance/invoices` — Generate invoice with automated tax snapshot.
- `GET /api/v1/finance/invoices/:id` — Invoice details and line item breakdown.
- `POST /api/v1/finance/invoices/:id/issue` — Issue draft invoice to customer.
- `POST /api/v1/finance/payments` — Record payment and allocate across invoices.
- `POST /api/v1/finance/refunds` — Authorize and record partial or full refund.

### 2.9 Mess & Dining Operations
- `GET /api/v1/food/config` — Property mess hall and restaurant meal period settings.
- `GET /api/v1/food/menu-items` — Food catalog with dietary flags and allergens.
- `POST /api/v1/food/menu-items` — Create menu item.
- `GET /api/v1/food/meal-plans` — Hostel subscription meal plans.
- `GET /api/v1/food/entitlements` — Active hosteller meal plans.
- `POST /api/v1/food/attendance` — Record meal hall swipe / redemption.
- `POST /api/v1/food/orders` — Dining POS order billed to room or paid direct.
- `GET /api/v1/food/stock-items` — Kitchen inventory with low-stock alerts.
- `POST /api/v1/food/stock-movements` — Record consumption, receipt, or wastage.

### 2.10 Staff & Facilities Management
- `GET /api/v1/staff/dashboard` — Staffing levels, punctuality, open maintenance.
- `GET /api/v1/staff/members` — Employee directory with hourly rates and roles.
- `POST /api/v1/staff/members` — Onboard staff member.
- `GET /api/v1/staff/shifts` — Schedule department shifts.
- `POST /api/v1/staff/shifts` — Create work shift.
- `GET /api/v1/staff/attendance` — Clock-in/out records.
- `POST /api/v1/staff/attendance/clock-in` — Record attendance punch.
- `GET /api/v1/operations/housekeeping` — Room and bed cleaning queues.
- `PATCH /api/v1/operations/housekeeping/:id` — Update cleaning task status.
- `GET /api/v1/operations/maintenance` — Work orders (plumbing, electrical, HVAC).
- `POST /api/v1/operations/maintenance` — File maintenance request.
- `GET /api/v1/operations/daily-logs` — Shift handovers and incident logs.

### 2.11 Executive Reports & Export
- `GET /api/v1/reports/executive` — Consolidated KPIs (ADR, RevPAR, revenue, cashflow).
- `GET /api/v1/reports/occupancy` — Daily room and bed occupancy percentages.
- `GET /api/v1/reports/bookings` — Booking volume and length-of-stay distributions.
- `GET /api/v1/reports/finance` — Invoiced revenue, collections, aging receivables.
- `GET /api/v1/reports/food` — Meal redemptions, POS revenue, top dishes.
- `GET /api/v1/reports/staff-ops` — Labor hours, housekeeping turnaround times.
- `GET /api/v1/reports/export-csv` — Sanitized tabular CSV export for external reporting.
