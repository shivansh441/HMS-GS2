# Haven Stays Backend
FastAPI + SQLAlchemy 2.0 + Alembic backend service.

## Property inventory

Inventory APIs are mounted under `/api/v1`: authenticated property list/detail, fee configuration, unit creation, bulk generation, unit matrix, and public availability search. Only admins can mutate properties or units; staff inventory reads are scoped to assigned properties and do not expose fee configurations, deposit amounts, or smart-lock IDs.

Bulk room codes combine the floor number and a two-digit room number: floor 3, room 4 is `304`; ground floor 0, room 4 is `004`; basement floor -1, room 4 is `B1-04`. Generated beds append alphabetic labels (`304-A`, `304-B`, ... `304-Z`, `304-AA`).

Hostel and co-living rooms/beds support `sharingType` (`SINGLE`, `DOUBLE`, `TRIPLE`, or `DORMITORY`) and a standard monthly baseline via `baseRateMonthly`. Public clients can list active properties with `GET /api/v1/public/properties` and available, standard-priced inventory with `GET /api/v1/public/units/search?propertyId=...`; desk-negotiated rates are not exposed there.

Hostel Rent (`UNIT_FEE`) is automatically enabled for each hostel and has no property-level amount; its price is set per stay assignment. `MESS_FEE` and `SECURITY_DEPOSIT` are fixed flat amounts. `ELECTRICITY_FEE` uses a per-kWh meter rate and is billed in arrears; `WATER_CHARGE` is only an on/off property setting and has no fixed amount or per-liter rate. Front-desk staff and admins record completed-period electricity readings at `POST /api/v1/properties/{property_id}/utility-meter-readings`; the computed amount is queued as arrears. Manual assignments use `POST /api/v1/stay/assignments`; an optional `agreedRate` is stored for that assignment only.

Schema changes for sharing rates, utility readings, assignment-priced hostel rent, and the water setting are in Alembic revisions `007_sharing_and_utility_pricing` and `008_rent_water_flags`; apply pending revisions with `alembic upgrade head` before deploying these APIs.
