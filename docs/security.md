# GrandStay Security Architecture & Baseline Guide

## 1. Authentication & Cryptography

### 1.1 Password Hashing
GrandStay enforces memory-hard cryptographic password hashing using the **Argon2id / Scrypt standard** (RFC 9106):
- Each password is salted with 16 bytes of cryptographically strong pseudo-random data from `crypto.randomBytes(16)`.
- Key derivation is computed using scrypt sync with `N=65536`, `r=3`, `p=4`, generating 64-byte derived keys.
- Verification uses `crypto.timingSafeEqual` to guarantee constant-time evaluation and prevent timing side-channel attacks.
- Dummy password verification is executed on unknown email lookups to prevent user enumeration attacks.

### 1.2 JWT Tokens & Session Management
- **Access Tokens**: Short-lived (30 minutes), signed with HMAC-SHA256 (`SECRET_KEY`), carrying `sub`, `email`, `role`, `assigned_properties`, and `exp`.
- **Refresh Tokens**: Long-lived (7 days), stored only as cryptographic SHA-256 hashes (`refresh_token_hash`) in the session store.
- **Refresh Token Rotation**: Each call to `/api/v1/auth/refresh` revokes the incoming token and issues a fresh token pair.
- **Session Revocation**: Calling `/api/v1/auth/logout` or changing an account password immediately revokes active refresh tokens.

---

## 2. Multi-Role Authorization & Property Scoping

### 2.1 Role-Based Access Control (RBAC)
GrandStay enforces 6 distinct roles:

| Role | Scope | Permissions |
|---|---|---|
| `super_admin` | Global (All Properties) | Full administrative access, property provisioning, user provisioning, global reporting. |
| `property_manager` | Assigned Properties | Operational management, rate rule updates, refund authorization, staff shift assignment. |
| `front_desk` | Assigned Properties | Check-ins, check-outs, room/bed assignment, walk-ins, dining order entry. |
| `housekeeping` | Assigned Properties | Cleanliness inspection, room/bed clean status updates, linen logging. |
| `accountant` | Assigned Properties | Invoicing, payments, tax calculations, financial reports. |
| `guest` | Own Bookings Only | Customer portal, viewing personal bookings and invoices. |

### 2.2 Property Boundary Isolation
Access control is enforced on every operational endpoint:
```typescript
if (!user.is_superuser && user.global_role !== "super_admin") {
  if (!user.assigned_property_ids.includes(propertyId)) {
    throw new ForbiddenError(`Access denied to property '${propertyId}'.`);
  }
}
```
Non-admin users cannot read or write data outside their assigned properties.

### 2.3 Customer Ownership Isolation
Guests cannot access bookings, invoices, or records belonging to other users. Attempting to query an alien booking ID returns `403 FORBIDDEN` or `404 NOT_FOUND`.

---

## 3. Defense-in-Depth Protections

### 3.1 Rate Limiting
In-memory and Nginx reverse proxy rate limiters protect sensitive endpoints:
- `/api/v1/auth/login`: 40 requests per minute per IP in production (burst: 10).
- `/api/v1/auth/register`: 30 requests per minute per IP.
- `/api/*`: 30 requests per second per IP (burst: 50).

### 3.2 Security Headers
Nginx and Express automatically inject:
```http
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cache-Control: no-store, no-cache, must-revalidate (for API routes)
```

### 3.3 Security Event Audit Logging
All security-relevant actions (logins, failed attempts, registrations, password changes, token rotations, refund authorizations) emit structured JSON audit entries tagged `[SECURITY_AUDIT]`. Sensitive attributes (passwords, tokens, secrets) are redacted before serialization.
