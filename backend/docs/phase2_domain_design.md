# Phase 2: Domain Design and Relational Entity Architecture
## Hostel-cum-Hotel Management System with Public Booking Website

### 1. Executive Domain Summary & Architectural Principles

The GrandStay system unites three distinct user experiences onto a shared relational PostgreSQL database:
1. **Public Booking Website**: Customers discover published properties, compare room types or dorm beds, review availability, calculate stay prices with real taxes, and book via instant confirmation or temporary hold (with guest checkout supported).
2. **Administrative Application**: Staff and property managers manage property profiles, inventory, room allocation, housekeeping, long-term hostel resident agreements, and billing folios.
3. **Shared Backend Engine**: A FastAPI / SQLAlchemy 2.0 asynchronous domain core providing data isolation, concurrency safety, and auditability.

```
                      +------------------------------------------------+
                      |                   PROPERTIES                   |
                      |  - slug (UQ), name, type (HOTEL/HOSTEL/HYBRID) |
                      |  - publication_status, is_bookable, policies   |
                      +-------+--------------------+-------------------+
                              |                    |
             +----------------+                    +-----------------+
             | 1:N                                                   | 1:N
             v                                                       v
+-------------------------+                               +--------------------+
|       ROOM_TYPES        |                               |     RATE_PLANS     |
| - slug, tier, capacity  |                               | - flexible, non-ref|
| - is_dorm, gender_policy|                               | - min/max nights   |
+------------+------------+                               +----------+---------+
             |                                                       |
             | 1:N                                                   | 1:N
             v                                                       v
+-------------------------+                               +--------------------+
|          ROOMS          |                               |    PRICE_RULES     |
| - room_number (UQ/prop) |                               | - start/end dates  |
| - operational_status    |                               | - price_per_night  |
+------------+------------+                               +--------------------+
             |
             | 1:N (For Hostels/Dorms)
             v
+-------------------------+
|          BEDS           |
| - bed_label (UQ/room)   |
| - bed_type, locker_no   |
+------------+------------+
             |
             +-----------------------+
                                     |
+-------------------------+          |           +-------------------------+
|         GUESTS          |          |           |   INVENTORY_ALLOCATIONS |
| - primary contact/ident |          |           | - stay_range [in, out)  |
| - guest checkout OK     |          |           | - EXCLUDE USING gist    |
+------------+------------+          |           +------------+------------+
             | 1:N                   |                        ^
             v                       v                        | 1:N
+-------------------------+    +-----+--------------------+   |
|        BOOKINGS         |--->|      BOOKING_ITEMS       +---+
| - booking_reference (UQ)|1:N | - allocated_room_id (FK) |
| - source: PUBLIC / ADMIN|    | - allocated_bed_id (FK)  |
| - lifecycle status      |    | - historical price snap  |
+------------+------------+    +--------------------------+
             |
             | 1:N
             v
+-------------------------+              +-------------------------+
|        INVOICES         |------------->|        PAYMENTS         |
| - subtotal, tax, total  | 1:N          | - method, status, ref   |
+-------------------------+              +-------------------------+
```

---

### 2. Entity Relationship Overview

#### A. Identity & Access Control
- `users`: Staff/Admin identity (email, hashed_password via bcrypt, global_role).
- `user_property_assignments`: Scoped property authorization enforcing strict multi-tenant boundaries.
- `guests`: Customer / Guest profiles (email, phone, first_name, last_name, identification_type/number, address). Can optionally link to `user_id` if the guest registers an account, or remain independent for public guest checkout.

#### B. Property Management
- `properties`: Multi-tenant root entity.
  - `slug`: Public URL identifier (e.g. `edinburgh-royal-mile-hostel`), indexed and unique.
  - `publication_status`: `DRAFT`, `PUBLISHED`, `UNPUBLISHED`.
  - `is_bookable`: Boolean toggle for real-time inventory discovery.
  - `checkin_time_start` & `checkout_time_deadline`: Standard daily operating hours.
  - `amenities`, `policies`, `configuration`: Isolated JSON/JSONB payloads.

#### C. Inventory Hierarchy
- `buildings` & `floors`: Physical layout grouping.
- `room_types` (Accommodation Category):
  - Differentiates Hotel suites (`HOTEL_ROOM`) from Hostel dormitories (`HOSTEL_DORM`) and private hostel rooms (`HOSTEL_PRIVATE`).
  - Strict occupancy limits: `base_capacity_adults`, `max_capacity_adults`, `max_capacity_children`.
  - Hostel gender policies: `ANY`, `MIXED_ONLY`, `FEMALE_ONLY`, `MALE_ONLY`.
- `rooms`: Physical room inventory (e.g., Room 101, Room 204).
- `beds`: Physical bed units in hostels (e.g., `BUNK-01-LOWER`, `BUNK-01-UPPER`) with personal locker linkage.

#### D. Pricing & Tax Structure
- `rate_plans`: Commercial conditions (e.g., "Best Available Rate", "Non-Refundable Early Bird").
- `price_rules`: Date-bounded rates per room type or bed category with minimum stay constraints.
- `property_taxes`: Property-specific tax configurations (percentage, fixed per-night, fixed per-stay, inclusive/exclusive).

#### E. Reservations & Lifecycle
- `bookings`: Master reservation entity.
  - `booking_reference`: Unique human-friendly reference (e.g. `GS-2026-X8R4P9`).
  - `booking_source`: `PUBLIC_WEBSITE`, `ADMIN`, `WALK_IN`, `PHONE_DIRECT`, `OTA_CHANNEL`.
  - `booking_status`: `PENDING`, `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED`, `EXPIRED`.
  - Stay convention: `[check_in_date, check_out_date)` (check-in inclusive, check-out exclusive).
  - Snapshot pricing: `base_amount`, `tax_amount`, `service_amount`, `total_amount`, `deposit_paid` (immutable historical record).
- `booking_items`: Individual room or bed reservations under a master booking.
- `inventory_allocations`: Realized room/bed physical block with PostgreSQL date range exclusion constraint.

#### F. Differentiated Operations
- **Hostel Operations**:
  - `hostel_resident_profiles`: KYC verification, emergency contacts, institution details.
  - `hostel_agreements`: Long-term/semester residency agreements with monthly rates and deposits.
- **Hotel Operations**:
  - `hotel_stay_records`: Keycard issuance, vehicle tracking, actual check-in/out timestamps.
  - `room_change_logs`: Audit trail for mid-stay room reassignments.
  - `housekeeping_tasks`: Room/bed clean, dirty, inspected, DND status tracking.

#### G. Financial Foundations & Audit Trail
- `invoices` & `invoice_items`: Formal billing documents with decimal precision (`Numeric(12, 2)`).
- `payments`: Transaction records (credit card, bank transfer, cash, POS).
- `audit_logs`: Entity mutation history (entity_type, entity_id, action, correlation_id, sanitized changes).

---

### 3. Inventory Conflict Prevention & Stay Conventions

1. **Standard Hospitality Stay Convention**:
   - Check-in date is inclusive; check-out date is exclusive.
   - Guest A: Check-in Oct 1, Check-out Oct 5.
   - Guest B: Check-in Oct 5, Check-out Oct 8.
   - Result: Both can legitimately use the same physical room or bed on Oct 5 because Guest A vacates by 11:00 and Guest B arrives after 14:00.

2. **Database-Level Conflict Guarantee (PostgreSQL GiST)**:
   - In PostgreSQL, physical inventory assignments use `DATERANGE(check_in_date, check_out_date, '[)')`.
   - Exclusion constraints with `btree_gist`:
     `EXCLUDE USING gist (room_id WITH =, stay_range WITH &&) WHERE (is_active = TRUE AND room_id IS NOT NULL)`
     `EXCLUDE USING gist (bed_id WITH =, stay_range WITH &&) WHERE (is_active = TRUE AND bed_id IS NOT NULL)`
   - Any attempt to concurrently insert overlapping allocations raises `IntegrityError` at the database kernel level.

3. **Temporary Holds & Self-Expiring Inventory**:
   - When a booking is created in `PENDING` status on the public website, `hold_expires_at` is set (e.g. 15 minutes).
   - Inquiries evaluate active allocations where:
     `booking_status IN ('CONFIRMED', 'CHECKED_IN') OR (booking_status = 'PENDING' AND hold_expires_at > CURRENT_TIMESTAMP)`
   - This prevents dead inventory blocks without requiring an asynchronous worker to run continuously.
