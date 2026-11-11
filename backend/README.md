# Haven Stays Backend
FastAPI + SQLAlchemy 2.0 + Alembic backend service.

Apply the database schema before starting the API with `alembic upgrade head`. The API does not create or update tables on startup; Alembic is the source of truth for schema changes.

## Property inventory

Inventory APIs are mounted under `/api/v1`: authenticated property list/detail, fee configuration, unit creation, bulk generation, unit matrix, and public availability search. Only admins can mutate properties or units; staff inventory reads are scoped to assigned properties and do not expose fee configurations, deposit amounts, or smart-lock IDs.

Bulk room codes combine the floor number and a two-digit room number: floor 3, room 4 is `304`; ground floor 0, room 4 is `004`; basement floor -1, room 4 is `B1-04`. Generated beds append alphabetic labels (`304-A`, `304-B`, ... `304-Z`, `304-AA`).

Hostel and co-living rooms/beds support `sharingType` (`SINGLE`, `DOUBLE`, `TRIPLE`, or `DORMITORY`) and a standard monthly baseline via `baseRateMonthly`. Public clients can list active properties with `GET /api/v1/public/properties` and available, standard-priced inventory with `GET /api/v1/public/units/search?propertyId=...`; desk-negotiated rates are not exposed there.

Hostel Rent (`UNIT_FEE`) is automatically enabled for each hostel and has no property-level amount; its price comes from the bed's standard monthly rate unless a walk-in's `agreedRate` is set on that assignment. `MESS_FEE` and `SECURITY_DEPOSIT` are fixed property-wide flat amounts. Both `ELECTRICITY_FEE` and `WATER_CHARGE` use configured meter rates and are billed only in arrears; their property fee configuration has no flat amount. Front-desk staff and admins record completed calendar-month meter readings at `POST /api/v1/properties/{property_id}/utility-meter-readings`; the computed amount is queued and added to the next monthly invoice as a previous-month arrear.

The financial ledger exposes `POST /api/v1/billing/invoices/generate-monthly` (admin, optionally `propertyId` and `billingMonth=YYYY-MM`), property-scoped invoice/deposit/receipt reads, customer-owned invoices and receipts at `GET /api/v1/billing/me/invoices` and `/api/v1/billing/me/receipts`, and payment receipt endpoints for invoices and deposit escrows. Meter readings can be submitted through `POST /api/v1/billing/utility-readings`; the property-scoped `/api/v1/properties/{property_id}/utility-meter-readings` endpoint remains available. Invoice generation is idempotent per assignment and month. Schedule `python scripts/generate_monthly_invoices.py` hourly so each property's local first-of-month date is observed; the admin endpoint supports controlled backfills. Invoices include current monthly rent and mess charges plus queued utility amounts from the prior calendar month. Configured security deposits are collected in full at check-in and logged as receipts in escrow.

Customer UPI/Card checkout uses Razorpay Orders and Checkout. Configure `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the backend environment; use Razorpay test credentials during development. The backend verifies the checkout signature and confirms the captured payment with Razorpay before updating an invoice or issuing a uniquely numbered receipt. If credentials are absent, online checkout returns service unavailable; staff-recorded Cash, UPI, Card, and Bank Transfer receipts remain available to authorized desk staff.

Existing water fee configurations are migrated to metered arrears pricing. Since the previous water setting did not store a rate, admins must set the water rate and unit of measure in Property Fee Settings before month-end readings can be recorded.

Schema changes for sharing rates, utility readings, assignment-priced hostel rent, and the financial ledger are in Alembic revisions `007_sharing_and_utility_pricing` through `015_billing_receipts`; revision 015 adds unique receipt numbers and invoice update timestamps. Apply pending revisions with `alembic upgrade head` before deploying these APIs.

## Audit logging and security monitoring

Revision `017_audit_security_monitoring` extends the existing append-only audit ledger and creates security alerts; apply it with `alembic upgrade head`. The HTTP audit middleware records mutating API requests with actor, method, URL, status, IP, entity, and a redacted JSON request payload. Credentials, identity documents, email addresses, and phone numbers are redacted; existing business-level audit entries also populate actor and entity metadata. ORM updates and deletes to audit events are rejected.

Admins can query `GET /api/v1/audit/logs` with `page`, `page_size`, `user_id`, `property_id`, `action`, `entity_name`, `start_date`, `end_date`, `actor`, `client_ip`, and `privileged_only`. `GET /api/v1/audit/alerts` supports `severity` and `is_resolved`; resolve an alert using `PATCH /api/v1/audit/alerts/{alert_id}/resolve` with an optional `resolutionNote`. `GET /api/v1/audit/summary` returns event, high-severity alert, active-lockout, and recent privileged-action counts. The admin dashboard is `/admin/audit`; the previous `/audit` page and `/api/v1/admin/audit` endpoint remain available.

The middleware alerts on more than five failed logins from one IP within 15 minutes, forbidden property-resource access by non-admins, and rate-limit responses. Rate variance and high-refund alerts use `AUDIT_RATE_VARIANCE_LIMIT` (default `0.20`, relative difference) and `AUDIT_HIGH_REFUND_THRESHOLD` (default `10000`, in the property's currency); configure both in the backend environment to match operational policy. Rate overrides require a comparable standard rate in the request or inventory record; refund alerts require a refund route or `refundAmount`/`amount` field.

## Mess management

Enable `hasMessFacility` for a hostel in its property settings to expose Mess Management in the admin panel. Enabling it provisions a default `Main Mess`; additional facilities are available through `POST /api/v1/mess/facilities`, and one facility remains the default. `GET /api/v1/mess/facilities` lists facilities in the authenticated admin's property scope; add `propertyId` to filter to one hostel.

Admins maintain the shared meal library with `GET`/`POST /api/v1/mess/meals` and `PUT`/`DELETE /api/v1/mess/meals/{meal_id}`. Meal categories are `BREAKFAST`, `LUNCH`, `SNACKS`, and `DINNER`; dietary types are `VEG`, `NON_VEG`, and `EGGETARIAN`. Read a facility's menu with `GET /api/v1/mess/{mess_id}/menu?date=YYYY-MM-DD`; replace its future-date menu with `POST /api/v1/mess/{mess_id}/menu` and `{ "scheduledDate": "YYYY-MM-DD", "mealItemIds": [1, 2] }`. Today and past dates are read-only. Mess models and the per-hostel unique-default constraint are added in Alembic revision `016_mess_management`; apply `alembic upgrade head` before enabling the UI.

## Reservations and lead management

Public guests can submit a reservation request with `POST /api/v1/reservations`. The public website form is available at `/book`; successful requests return a tracking `requestCode`. Admins and front-desk staff can review the property-scoped pipeline with `GET /api/v1/reservations`, filtering by `propertyId`, comma-separated `status`, `dateFrom`, and `dateTo`. Requests can be approved, waitlisted, rejected (with a required reason), or cancelled through `PATCH /api/v1/reservations/{id}/status`.

Approved requests expose matching available units at `GET /api/v1/reservations/{id}/available-units`. `POST /api/v1/reservations/{id}/convert` atomically claims an available unit, creates a unit assignment and stay record, and marks the request converted. Reservation requests and occupants were introduced in Alembic revision `004_reservations_and_stays`; revision `009_reservation_occupant_identity` adds occupant ID-proof fields. Apply pending revisions with `alembic upgrade head` before deploying.

## Stay logistics

`POST /api/v1/stay/assignments` supports an immediate desk check-in (the backward-compatible default) or a pre-allocation with `checkInNow: false`. Pre-allocation marks the unit and assignment `RESERVED`; `POST /api/v1/stay/assignments/{assignment_id}/check-in` atomically changes them to `OCCUPIED` / `CHECKED_IN` and creates the assignment-linked stay record. Configured security deposits are collected during check-in. If the agreed rate differs from the unit's standard rate, supply `rateOverrideReason`; the assignment stores the standard and agreed rates, reason, and staff actor.

`GET /api/v1/stay/assignments/active` returns property-scoped checked-in assignments and accepts `propertyId` and `unitType` filters. `POST /api/v1/stay/assignments/{assignment_id}/check-out` requires `folioSettled` and `keycardReturned`, closes the assignment and stay record, records `finalAmountPaid`, and marks the unit `DIRTY` for housekeeping. Staff can read a customer's property-scoped stay history at `GET /api/v1/stay/customers/{account_id}/history`; the customer portal uses `GET /api/v1/stay/me/history` for the authenticated account.

The admin active-stays dashboard is at `/admin/stays`; the customer stay dashboard is at `/portal/my-stay`. Portal folios are browser-printable and can be saved as PDF. The current platform does not issue digital door codes, so the portal directs guests to the property team for access details rather than exposing internal lock identifiers. Stay lifecycle and assignment-linked ledger fields are added by Alembic revision `012_stay_logistics`.

## Staff management and payroll

Admins create invited staff accounts with `POST /api/v1/staff`; the user receives an account-activation invitation and is assigned to the selected property. `GET /api/v1/staff` lists property-scoped profiles with the selected `year` and `month` attendance/payroll summary. `PUT /api/v1/staff/{id}` updates profile details, base salary, or active status. Deactivation suspends the linked login and revokes its sessions.

Record or update a month's attendance with `POST /api/v1/staff/{id}/attendance`; worked days are validated against that calendar month's 28–31 days. `POST /api/v1/payroll/disburse` calculates `(base monthly salary / days in month) × worked days`, rounded to two decimal places. Omit payment details to save a pending payroll calculation; provide `paymentStatus: "PAID"` and a payment mode (`CASH`, `BANK_TRANSFER`, or `UPI`) to record a disbursement and optional transaction reference. A paid period cannot be paid twice. Staff data is restricted to admins and authorized property scope. Schema is added by Alembic revision `013_staff_payroll`; apply pending revisions with `alembic upgrade head` before deploying.
