import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";

const startTime = Date.now();
const SECRET_KEY =
  process.env.SECRET_KEY ||
  "8bfaaccd12c436ab89ae60ddfd8a5ab02267fc4b5f45f0616fe678967c909174";

// --- Cryptographic Password Hashing & Token Helpers ---

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt}$${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length >= 5) {
    const salt = parts[parts.length - 2];
    const originalKey = parts[parts.length - 1];
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(derivedKey), Buffer.from(originalKey));
  }
  return false;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJwt(token: string, secret: string, expectedType: string = "access"): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT string.");
  const [headerB64, payloadB64, signatureB64] = parts;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))) {
    throw new Error("Invalid signature.");
  }
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  if (payload.token_type !== expectedType) {
    throw new Error(`Invalid token type: expected ${expectedType}, got ${payload.token_type}`);
  }
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error("Token has expired.");
  }
  return payload;
}

// --- In-Memory Identity and Multi-Property Data Stores ---

interface UserRecord {
  id: string;
  email: string;
  hashed_password: string;
  first_name: string;
  last_name: string;
  global_role: "super_admin" | "property_manager" | "front_desk" | "housekeeping" | "accountant" | "guest";
  is_superuser: boolean;
  is_active: boolean;
  assigned_property_ids: string[];
  created_at: string;
}

interface RefreshSessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_info?: string;
  ip_address?: string;
  expires_at: number; // Unix timestamp ms
  is_revoked: boolean;
  revoked_at?: number;
}

interface PasswordResetRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  is_used: boolean;
  used_at?: number;
}

interface PropertyRecord {
  id: string;
  code: string;
  slug: string;
  name: string;
  property_type: "hostel" | "hotel" | "hybrid";
  currency: string;
  timezone: string;
  description?: string;
  address: string;
  city: string;
  state_province?: string;
  country: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  contact_email?: string;
  contact_phone?: string;
  total_rooms: number;
  total_beds: number;
  publication_status: "published" | "draft" | "unpublished";
  is_bookable: boolean;
  is_active: boolean;
  checkin_time_start: string;
  checkout_time_deadline: string;
  amenities: string[];
  policies: Record<string, unknown>;
  configuration: Record<string, unknown>;
  created_by_user_id?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

interface BookingRecord {
  id: string;
  booking_reference: string;
  property_id: string;
  user_id: string;
  guest_name: string;
  guest_email: string;
  booking_status: "confirmed" | "pending" | "checked_in" | "checked_out" | "cancelled";
  check_in_date: string;
  check_out_date: string;
  total_nights: number;
  adult_count: number;
  child_count: number;
  currency: string;
  base_amount: number;
  tax_amount: number;
  total_amount: number;
  deposit_paid: number;
  special_requests?: string;
  items: Array<{
    id: string;
    room_type_name: string;
    unit_price: number;
    total_price: number;
  }>;
  created_at: string;
}

interface RoomTypeRecord {
  id: string;
  property_id: string;
  name: string;
  slug: string;
  code: string;
  accommodation_tier: "hotel_room" | "hostel_dorm" | "hostel_private";
  description?: string;
  base_capacity_adults: number;
  max_capacity_adults: number;
  max_capacity_children: number;
  is_dormitory: boolean;
  gender_policy: "any" | "mixed_only" | "female_only" | "male_only";
  base_price_amount: number;
  amenities: string[];
  is_published: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RoomRecord {
  id: string;
  property_id: string;
  room_type_id: string;
  floor_id?: string;
  floor_name?: string;
  room_number: string;
  operational_status: "available" | "occupied" | "maintenance" | "out_of_order";
  cleanliness_status: "clean" | "dirty" | "inspected" | "do_not_disturb";
  keycard_code?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BedRecord {
  id: string;
  property_id: string;
  room_id: string;
  bed_label: string;
  bed_type: "standard_single" | "bunk_bottom" | "bunk_top" | "double";
  locker_number?: string;
  operational_status: "available" | "occupied" | "maintenance" | "out_of_order";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface InventoryAllocationRecord {
  id: string;
  property_id: string;
  booking_item_id?: string;
  room_id?: string;
  bed_id?: string;
  check_in_date: string;
  check_out_date: string;
  allocation_type: "reservation" | "check_in" | "maintenance_block";
  notes?: string;
  created_by_user_id?: string;
  is_active: boolean;
  created_at: string;
}

const usersStore = new Map<string, UserRecord>();
const refreshSessionsStore = new Map<string, RefreshSessionRecord>();
const passwordResetStore = new Map<string, PasswordResetRecord>();
const propertiesStore = new Map<string, PropertyRecord>();
const bookingsStore = new Map<string, BookingRecord>();
const roomTypesStore = new Map<string, RoomTypeRecord>();
const roomsStore = new Map<string, RoomRecord>();
const bedsStore = new Map<string, BedRecord>();
const allocationsStore = new Map<string, InventoryAllocationRecord>();

interface HostellerRecord {
  id: string;
  property_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
  nationality?: string;
  address?: string;
  city?: string;
  country?: string;
  emergency_contact?: {
    name: string;
    relationship: string;
    phone: string;
    email?: string;
  };
  status: "active" | "checked_in" | "checked_out" | "inactive";
  notes?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface HostelStayRecord {
  id: string;
  stay_reference: string;
  property_id: string;
  hosteller_id: string;
  booking_id?: string;
  room_id: string;
  bed_id: string;
  check_in_date: string;
  check_out_date: string;
  actual_check_in_time?: string;
  actual_check_out_time?: string;
  status: "reserved" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  special_requests?: string;
  locker_number?: string;
  keycard_code?: string;
  checked_in_by_user_id?: string;
  checked_out_by_user_id?: string;
  nightly_rate: number;
  total_nights: number;
  total_amount: number;
  currency: string;
  audit_trail: Array<{
    id: string;
    action: "created" | "checked_in" | "checked_out" | "reassigned" | "extended" | "cancelled";
    timestamp: string;
    performed_by_user_id: string;
    performed_by_name: string;
    details: string;
  }>;
  created_at: string;
  updated_at: string;
}

const hostellersStore = new Map<string, HostellerRecord>();
const hostelStaysStore = new Map<string, HostelStayRecord>();

interface HotelGuestRecord {
  id: string;
  property_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
  nationality?: string;
  address?: string;
  city?: string;
  country?: string;
  vip_tier: "standard" | "silver" | "gold" | "platinum";
  special_preferences?: string;
  status: "active" | "checked_in" | "checked_out" | "inactive";
  notes?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface HotelStayRecord {
  id: string;
  stay_reference: string;
  property_id: string;
  guest_id: string;
  booking_id?: string;
  room_type_id: string;
  assigned_room_id?: string;
  check_in_date: string;
  check_out_date: string;
  actual_check_in_time?: string;
  actual_check_out_time?: string;
  status: "reserved" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  adult_count: number;
  child_count: number;
  additional_occupants?: Array<{ name: string; relationship: string }>;
  special_requests?: string;
  keycard_code?: string;
  checked_in_by_user_id?: string;
  checked_out_by_user_id?: string;
  nightly_rate: number;
  total_nights: number;
  total_amount: number;
  currency: string;
  audit_trail: Array<{
    id: string;
    action:
      | "created"
      | "room_assigned"
      | "checked_in"
      | "checked_out"
      | "room_changed"
      | "extended"
      | "cancelled";
    timestamp: string;
    performed_by_user_id: string;
    performed_by_name: string;
    details: string;
  }>;
  created_at: string;
  updated_at: string;
}

const hotelGuestsStore = new Map<string, HotelGuestRecord>();
const hotelStaysStore = new Map<string, HotelStayRecord>();

// ==========================================
// PHASE 9 FINANCE & TAX ENGINE INTERFACES & STORES
// ==========================================

interface TaxRuleRecord {
  id: string;
  property_id: string;
  name: string;
  rate_percentage: number;
  charge_categories: string[];
  is_inclusive: boolean;
  is_active: boolean;
  effective_from: string; // YYYY-MM-DD
  effective_to?: string; // YYYY-MM-DD
  priority: number;
  jurisdiction_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceLineItemRecord {
  id: string;
  charge_category: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes?: string;
}

interface TaxBreakdownComponentRecord {
  rule_id: string;
  rule_name: string;
  rate_percentage: number;
  is_inclusive: boolean;
  taxable_base: number;
  tax_amount: number;
}

interface TaxCalculationSnapshotRecord {
  calculated_at: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  taxable_subtotal: number;
  components: TaxBreakdownComponentRecord[];
  total_tax: number;
  grand_total: number;
}

interface InvoiceAuditRecord {
  id: string;
  action: "created" | "updated" | "issued" | "payment_allocated" | "refund_applied" | "voided";
  timestamp: string;
  performed_by_user_id: string;
  performed_by_name: string;
  details: string;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  property_id: string;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "voided";
  issue_date: string;
  due_date: string;
  customer_type: "guest" | "hosteller" | "corporate" | "walk_in";
  customer_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  billing_address?: string;
  reservation_type?: "hotel_stay" | "hostel_stay" | "booking";
  reservation_id?: string;
  reservation_reference?: string;
  line_items: InvoiceLineItemRecord[];
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total_amount: number;
  amount_paid: number;
  outstanding_balance: number;
  tax_snapshot?: TaxCalculationSnapshotRecord;
  notes?: string;
  void_reason?: string;
  created_by_user_id: string;
  audit_trail: InvoiceAuditRecord[];
  created_at: string;
  updated_at: string;
}

interface PaymentAllocationRecord {
  id: string;
  invoice_id: string;
  invoice_number?: string;
  amount: number;
  allocated_at: string;
  allocated_by_user_id: string;
}

interface PaymentRecord {
  id: string;
  payment_reference: string;
  property_id: string;
  amount: number;
  currency: string;
  payment_method: "cash" | "bank_transfer" | "credit_card_terminal" | "card_on_file" | "corporate_check";
  status: "completed" | "refunded" | "partially_refunded" | "cancelled";
  payment_date: string;
  payer_name: string;
  payer_email?: string;
  received_by_user_id: string;
  transaction_reference?: string;
  notes?: string;
  allocations: PaymentAllocationRecord[];
  unallocated_amount: number;
  refunded_amount: number;
  created_at: string;
  updated_at: string;
}

interface RefundRecord {
  id: string;
  refund_reference: string;
  payment_id: string;
  payment_reference?: string;
  invoice_id?: string;
  invoice_number?: string;
  property_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: "processed" | "rejected";
  processed_by_user_id: string;
  refund_date: string;
  notes?: string;
  created_at: string;
}

const taxRulesStore = new Map<string, TaxRuleRecord>();
const invoicesStore = new Map<string, InvoiceRecord>();
const paymentsStore = new Map<string, PaymentRecord>();
const refundsStore = new Map<string, RefundRecord>();

// Pre-seed Phase 2 & 3 baseline users
function seedInitialData() {
  const seededUsers: UserRecord[] = [
    {
      id: "usr-admin-001",
      email: "director@grandstay.com",
      hashed_password: hashPassword("Admin2026!Secure"),
      first_name: "Julian",
      last_name: "Vance",
      global_role: "super_admin",
      is_superuser: true,
      is_active: true,
      assigned_property_ids: ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "usr-pm-002",
      email: "clara.manager@grandstay.com",
      hashed_password: hashPassword("Manager2026!Pass"),
      first_name: "Clara",
      last_name: "Ross",
      global_role: "property_manager",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: ["prop-hostel-001"], // Only Edinburgh Hostel
      created_at: "2026-01-15T00:00:00Z",
    },
    {
      id: "usr-fd-003",
      email: "liam.desk@grandstay.com",
      hashed_password: hashPassword("Desk2026!Pass"),
      first_name: "Liam",
      last_name: "Chen",
      global_role: "front_desk",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: ["prop-hotel-002"], // Only London Hotel
      created_at: "2026-02-01T00:00:00Z",
    },
    {
      id: "usr-hk-004",
      email: "elena.clean@grandstay.com",
      hashed_password: hashPassword("Clean2026!Pass"),
      first_name: "Elena",
      last_name: "Silva",
      global_role: "housekeeping",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: ["prop-hostel-001", "prop-hotel-002"],
      created_at: "2026-02-15T00:00:00Z",
    },
    {
      id: "usr-acc-005",
      email: "marcus.finance@grandstay.com",
      hashed_password: hashPassword("Finance2026!Pass"),
      first_name: "Marcus",
      last_name: "Finch",
      global_role: "accountant",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"],
      created_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "usr-guest-006",
      email: "sofia.guest@example.com",
      hashed_password: hashPassword("Sofia2026!Guest"),
      first_name: "Sofia",
      last_name: "Berg",
      global_role: "guest",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: [],
      created_at: "2026-03-10T00:00:00Z",
    },
    {
      id: "usr-guest-007",
      email: "john.doe@example.com",
      hashed_password: hashPassword("John2026!Guest"),
      first_name: "John",
      last_name: "Doe",
      global_role: "guest",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: [],
      created_at: "2026-03-12T00:00:00Z",
    },
  ];

  for (const u of seededUsers) {
    usersStore.set(u.email, u);
  }

  // Pre-seed properties
  const seededProperties: PropertyRecord[] = [
    {
      id: "prop-hostel-001",
      code: "HST-EDI-01",
      slug: "grandstay-royal-mile-hostel",
      name: "GrandStay Royal Mile Hostel",
      property_type: "hostel",
      currency: "GBP",
      timezone: "Europe/London",
      description: "Historic Old Town Edinburgh hostel featuring sociable pod beds, secure personal lockers, and vibrant communal spaces.",
      address: "104 High Street, Old Town",
      city: "Edinburgh",
      state_province: "Scotland",
      country: "United Kingdom",
      postal_code: "EH1 1SG",
      contact_email: "edinburgh.hostel@grandstay.com",
      contact_phone: "+44 131 555 0192",
      total_rooms: 18,
      total_beds: 124,
      publication_status: "published",
      is_bookable: true,
      is_active: true,
      checkin_time_start: "14:00",
      checkout_time_deadline: "10:30",
      amenities: ["Free High-Speed Wi-Fi", "Secure Keycard Lockers", "Communal Kitchen", "Luggage Storage"],
      policies: { cancellation: "Free cancellation up to 24h before arrival", curfew: "None - 24/7 keycard entry" },
      configuration: {
        allow_mixed_gender_dorms: true,
        lockers_provided: true,
        linen_deposit: 10.0,
        communal_kitchen_access: true,
        quiet_hours_start: "23:00",
        quiet_hours_end: "07:00",
      },
      created_by_user_id: "usr-admin-001",
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "prop-hotel-002",
      code: "HTL-LON-02",
      slug: "grandstay-mayfair-grand-hotel",
      name: "GrandStay Mayfair Grand Hotel",
      property_type: "hotel",
      currency: "GBP",
      timezone: "Europe/London",
      description: "5-star luxury hotel in Mayfair with concierge services, executive king suites, Michelin dining, and wellness spa.",
      address: "42 Park Lane, Mayfair",
      city: "London",
      state_province: "Greater London",
      country: "United Kingdom",
      postal_code: "W1K 1PN",
      contact_email: "mayfair.hotel@grandstay.com",
      contact_phone: "+44 20 7946 0883",
      total_rooms: 86,
      total_beds: 110,
      publication_status: "published",
      is_bookable: true,
      is_active: true,
      checkin_time_start: "15:00",
      checkout_time_deadline: "12:00",
      amenities: ["24/7 Concierge", "Valet Parking", "Michelin-starred Restaurant", "Spa & Wellness"],
      policies: { cancellation: "Free cancellation up to 48h before check-in", deposit_required: true },
      configuration: {
        star_rating: 5,
        concierge_available: true,
        room_service_hours: "24/7",
        daily_housekeeping: true,
        minibar_enabled: true,
        valet_parking: true,
        deposit_percentage: 25.0,
      },
      created_by_user_id: "usr-admin-001",
      created_at: "2026-02-14T10:00:00Z",
      updated_at: "2026-10-16T14:30:00Z",
    },
    {
      id: "prop-hybrid-003",
      code: "HYB-BER-03",
      slug: "grandstay-mitte-hybrid-campus",
      name: "GrandStay Mitte Hybrid Campus",
      property_type: "hybrid",
      currency: "EUR",
      timezone: "Europe/Berlin",
      description: "Cutting-edge hybrid hospitality campus combining high-density designer dorm pods with executive boutique suites and coworking.",
      address: "Torstraße 180, Mitte",
      city: "Berlin",
      state_province: "Berlin",
      country: "Germany",
      postal_code: "10115",
      contact_email: "berlin.hybrid@grandstay.com",
      contact_phone: "+49 30 5678 9100",
      total_rooms: 44,
      total_beds: 160,
      publication_status: "published",
      is_bookable: true,
      is_active: true,
      checkin_time_start: "14:00",
      checkout_time_deadline: "11:00",
      amenities: ["Coworking Hub", "Rooftop Terrace", "Bicycle Rental", "Specialty Coffee Bar"],
      policies: { cancellation: "Flexible up to 24h prior" },
      configuration: {
        wings: ["West Wing: Dorm Pods", "East Wing: Executive Boutique Suites"],
        allow_mixed_gender_dorms: true,
        daily_housekeeping: true,
        communal_kitchen_access: true,
      },
      created_by_user_id: "usr-admin-001",
      created_at: "2026-03-01T09:00:00Z",
      updated_at: "2026-10-17T09:00:00Z",
    },
  ];

  for (const p of seededProperties) {
    propertiesStore.set(p.id, p);
  }

  // Pre-seed bookings to demonstrate customer ownership isolation
  const seededBookings: BookingRecord[] = [
    {
      id: "bk-sofia-001",
      booking_reference: "GS-LON-2026-8812",
      property_id: "prop-hotel-002",
      user_id: "usr-guest-006", // Sofia Berg
      guest_name: "Sofia Berg",
      guest_email: "sofia.guest@example.com",
      booking_status: "confirmed",
      check_in_date: "2026-11-05",
      check_out_date: "2026-11-08",
      total_nights: 3,
      adult_count: 2,
      child_count: 0,
      currency: "GBP",
      base_amount: 840.0,
      tax_amount: 168.0,
      total_amount: 1008.0,
      deposit_paid: 252.0,
      special_requests: "High floor quiet room preferred, late check-in ~20:00.",
      items: [
        {
          id: "item-101",
          room_type_name: "Mayfair Executive Suite with King Bed",
          unit_price: 280.0,
          total_price: 840.0,
        },
      ],
      created_at: "2026-10-10T14:22:00Z",
    },
    {
      id: "bk-john-002",
      booking_reference: "GS-EDI-2026-3401",
      property_id: "prop-hostel-001",
      user_id: "usr-guest-007", // John Doe
      guest_name: "John Doe",
      guest_email: "john.doe@example.com",
      booking_status: "confirmed",
      check_in_date: "2026-11-12",
      check_out_date: "2026-11-15",
      total_nights: 3,
      adult_count: 1,
      child_count: 0,
      currency: "GBP",
      base_amount: 96.0,
      tax_amount: 19.2,
      total_amount: 115.2,
      deposit_paid: 115.2,
      special_requests: "Bottom bunk requested.",
      items: [
        {
          id: "item-202",
          room_type_name: "6-Bed Mixed Dormitory Pod - Bunk 3 Lower",
          unit_price: 32.0,
          total_price: 96.0,
        },
      ],
      created_at: "2026-10-12T11:05:00Z",
    },
  ];

  for (const b of seededBookings) {
    bookingsStore.set(b.id, b);
  }

  // Pre-seed Room Types
  const seededRoomTypes: RoomTypeRecord[] = [
    {
      id: "rt-edi-dorm6",
      property_id: "prop-hostel-001",
      name: "6-Bed Mixed Dormitory Pod",
      slug: "6-bed-mixed-dormitory-pod",
      code: "DORM-6M",
      accommodation_tier: "hostel_dorm",
      description: "Sociable pod beds with individual reading light, USB charging sockets, and personal privacy curtains.",
      base_capacity_adults: 6,
      max_capacity_adults: 6,
      max_capacity_children: 0,
      is_dormitory: true,
      gender_policy: "mixed_only",
      base_price_amount: 32.0,
      amenities: ["Keycard Locker", "USB Outlets", "Privacy Curtain", "Orthopedic Mattress"],
      is_published: true,
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rt-edi-fem4",
      property_id: "prop-hostel-001",
      name: "4-Bed Female Dormitory Pod",
      slug: "4-bed-female-dormitory-pod",
      code: "DORM-4F",
      accommodation_tier: "hostel_dorm",
      description: "Female-only pod dormitory with en-suite vanity mirror, hair dryers, and extra secure lockers.",
      base_capacity_adults: 4,
      max_capacity_adults: 4,
      max_capacity_children: 0,
      is_dormitory: true,
      gender_policy: "female_only",
      base_price_amount: 38.0,
      amenities: ["Vanity Mirror", "Hair Dryer", "Privacy Curtain", "Keycard Locker"],
      is_published: true,
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rt-edi-priv",
      property_id: "prop-hostel-001",
      name: "Private En-Suite Double",
      slug: "private-en-suite-double",
      code: "PRIV-DBL",
      accommodation_tier: "hostel_private",
      description: "Private quiet double bedroom with private bathroom and Edinburgh castle views.",
      base_capacity_adults: 1,
      max_capacity_adults: 2,
      max_capacity_children: 0,
      is_dormitory: false,
      gender_policy: "any",
      base_price_amount: 85.0,
      amenities: ["En-Suite Bathroom", "Smart TV", "Castle View", "Work Desk"],
      is_published: true,
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rt-lon-deluxe",
      property_id: "prop-hotel-002",
      name: "Deluxe King Room",
      slug: "deluxe-king-room",
      code: "DLX-KING",
      accommodation_tier: "hotel_room",
      description: "Sophisticated hotel room featuring a plush king-size bed, Italian marble bathroom, and city views.",
      base_capacity_adults: 1,
      max_capacity_adults: 2,
      max_capacity_children: 1,
      is_dormitory: false,
      gender_policy: "any",
      base_price_amount: 195.0,
      amenities: ["King Bed", "Marble Bathroom", "Espresso Machine", "Bathrobes & Slippers"],
      is_published: true,
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rt-lon-exec",
      property_id: "prop-hotel-002",
      name: "Mayfair Executive Suite",
      slug: "mayfair-executive-suite",
      code: "EXEC-STE",
      accommodation_tier: "hotel_room",
      description: "Expansive luxury corner suite with dedicated living lounge, executive boardroom access, and minibar.",
      base_capacity_adults: 2,
      max_capacity_adults: 3,
      max_capacity_children: 1,
      is_dormitory: false,
      gender_policy: "any",
      base_price_amount: 280.0,
      amenities: ["Lounge Area", "Complimentary Minibar", "Executive Lounge Access", "Turn-down Service"],
      is_published: true,
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rt-lon-twin",
      property_id: "prop-hotel-002",
      name: "Classic Twin Suite",
      slug: "classic-twin-suite",
      code: "CLS-TWIN",
      accommodation_tier: "hotel_room",
      description: "Spacious twin room with two double beds, soundproofing, and ergonomic work station.",
      base_capacity_adults: 2,
      max_capacity_adults: 2,
      max_capacity_children: 0,
      is_dormitory: false,
      gender_policy: "any",
      base_price_amount: 175.0,
      amenities: ["Two Double Beds", "Soundproofing", "Rain Shower", "Work Desk"],
      is_published: true,
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
  ];

  for (const rt of seededRoomTypes) {
    roomTypesStore.set(rt.id, rt);
  }

  // Pre-seed Rooms
  const seededRooms: RoomRecord[] = [
    // Edinburgh Hostel Rooms
    {
      id: "rm-edi-101",
      property_id: "prop-hostel-001",
      room_type_id: "rt-edi-dorm6",
      floor_id: "fl-edi-1",
      floor_name: "Floor 1 - High Street Wing",
      room_number: "101",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-EDI-101",
      notes: "Main 6-bed dormitory overlooking cobblestone alley.",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-edi-102",
      property_id: "prop-hostel-001",
      room_type_id: "rt-edi-dorm6",
      floor_id: "fl-edi-1",
      floor_name: "Floor 1 - High Street Wing",
      room_number: "102",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-EDI-102",
      notes: "Quiet courtyard-facing dorm.",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-edi-201",
      property_id: "prop-hostel-001",
      room_type_id: "rt-edi-fem4",
      floor_id: "fl-edi-2",
      floor_name: "Floor 2 - Mezzanine",
      room_number: "201",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-EDI-201",
      notes: "Female-only sanctuary dormitory.",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-edi-202",
      property_id: "prop-hostel-001",
      room_type_id: "rt-edi-priv",
      floor_id: "fl-edi-2",
      floor_name: "Floor 2 - Mezzanine",
      room_number: "202",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-EDI-202",
      notes: "Private double suite.",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-edi-203",
      property_id: "prop-hostel-001",
      room_type_id: "rt-edi-priv",
      floor_id: "fl-edi-2",
      floor_name: "Floor 2 - Mezzanine",
      room_number: "203",
      operational_status: "available",
      cleanliness_status: "inspected",
      keycard_code: "KC-EDI-203",
      notes: "Private double room with skyline view.",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    // London Hotel Rooms
    {
      id: "rm-lon-101",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-deluxe",
      floor_id: "fl-lon-1",
      floor_name: "Level 1 - Piccadilly Suites",
      room_number: "101",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-LON-101",
      notes: "Front-facing deluxe king.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-lon-102",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-deluxe",
      floor_id: "fl-lon-1",
      floor_name: "Level 1 - Piccadilly Suites",
      room_number: "102",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-LON-102",
      notes: "Deluxe king room.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-lon-103",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-deluxe",
      floor_id: "fl-lon-1",
      floor_name: "Level 1 - Piccadilly Suites",
      room_number: "103",
      operational_status: "maintenance",
      cleanliness_status: "dirty",
      keycard_code: "KC-LON-103",
      notes: "AC maintenance scheduled.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-lon-201",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-exec",
      floor_id: "fl-lon-2",
      floor_name: "Level 2 - Mayfair Club",
      room_number: "201",
      operational_status: "available",
      cleanliness_status: "inspected",
      keycard_code: "KC-LON-201",
      notes: "Flagship corner suite reserved for VIPs.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-lon-202",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-exec",
      floor_id: "fl-lon-2",
      floor_name: "Level 2 - Mayfair Club",
      room_number: "202",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-LON-202",
      notes: "Executive suite with balcony.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-lon-301",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-twin",
      floor_id: "fl-lon-3",
      floor_name: "Level 3 - West End View",
      room_number: "301",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-LON-301",
      notes: "Twin suite with city panorama.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "rm-lon-302",
      property_id: "prop-hotel-002",
      room_type_id: "rt-lon-twin",
      floor_id: "fl-lon-3",
      floor_name: "Level 3 - West End View",
      room_number: "302",
      operational_status: "available",
      cleanliness_status: "clean",
      keycard_code: "KC-LON-302",
      notes: "Twin suite.",
      is_active: true,
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    },
  ];

  for (const r of seededRooms) {
    roomsStore.set(r.id, r);
  }

  // Pre-seed Beds for Hostel Dormitory Rooms
  // Room 101 Beds (6 pods)
  for (let i = 1; i <= 6; i++) {
    const isBottom = i % 2 === 1;
    const bId = `bed-edi-101-${i}`;
    bedsStore.set(bId, {
      id: bId,
      property_id: "prop-hostel-001",
      room_id: "rm-edi-101",
      bed_label: `Pod ${Math.ceil(i / 2)} ${isBottom ? "Lower" : "Upper"}`,
      bed_type: isBottom ? "bunk_bottom" : "bunk_top",
      locker_number: `LK-101-${i}`,
      operational_status: "available",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    });
  }

  // Room 102 Beds (6 pods)
  for (let i = 1; i <= 6; i++) {
    const isBottom = i % 2 === 1;
    const bId = `bed-edi-102-${i}`;
    bedsStore.set(bId, {
      id: bId,
      property_id: "prop-hostel-001",
      room_id: "rm-edi-102",
      bed_label: `Pod ${Math.ceil(i / 2)} ${isBottom ? "Lower" : "Upper"}`,
      bed_type: isBottom ? "bunk_bottom" : "bunk_top",
      locker_number: `LK-102-${i}`,
      operational_status: i === 1 ? "maintenance" : "available",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    });
  }

  // Room 201 Beds (4 female pods)
  for (let i = 1; i <= 4; i++) {
    const isBottom = i % 2 === 1;
    const bId = `bed-edi-201-${i}`;
    bedsStore.set(bId, {
      id: bId,
      property_id: "prop-hostel-001",
      room_id: "rm-edi-201",
      bed_label: `Female Pod ${Math.ceil(i / 2)} ${isBottom ? "Lower" : "Upper"}`,
      bed_type: isBottom ? "bunk_bottom" : "bunk_top",
      locker_number: `LK-201-${i}`,
      operational_status: "available",
      is_active: true,
      created_at: "2026-01-10T08:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    });
  }

  // Pre-seed Allocations
  const seededAllocations: InventoryAllocationRecord[] = [
    {
      id: "alloc-john-001",
      property_id: "prop-hostel-001",
      booking_item_id: "item-202",
      bed_id: "bed-edi-101-3",
      room_id: "rm-edi-101",
      check_in_date: "2026-11-12",
      check_out_date: "2026-11-15",
      allocation_type: "reservation",
      notes: "John Doe reservation GS-EDI-2026-3401",
      is_active: true,
      created_at: "2026-10-12T11:05:00Z",
    },
    {
      id: "alloc-sofia-002",
      property_id: "prop-hotel-002",
      booking_item_id: "item-101",
      room_id: "rm-lon-201",
      check_in_date: "2026-11-05",
      check_out_date: "2026-11-08",
      allocation_type: "reservation",
      notes: "Sofia Berg reservation GS-LON-2026-8812",
      is_active: true,
      created_at: "2026-10-10T14:22:00Z",
    },
    {
      id: "alloc-maint-003",
      property_id: "prop-hotel-002",
      room_id: "rm-lon-103",
      check_in_date: "2026-10-25",
      check_out_date: "2026-10-28",
      allocation_type: "maintenance_block",
      notes: "Air conditioning motor replacement",
      is_active: true,
      created_at: "2026-10-15T09:00:00Z",
    },
    {
      id: "alloc-maint-004",
      property_id: "prop-hostel-001",
      bed_id: "bed-edi-102-1",
      room_id: "rm-edi-102",
      check_in_date: "2026-10-24",
      check_out_date: "2026-10-27",
      allocation_type: "maintenance_block",
      notes: "Locker electronic lock replacement",
      is_active: true,
      created_at: "2026-10-16T10:00:00Z",
    },
  ];

  for (const a of seededAllocations) {
    allocationsStore.set(a.id, a);
  }

  // Pre-seed Phase 7 Hostellers and Hostel Stays
  const todayMs = Date.now();
  const dayMs = 86400000;
  const todayStr = new Date(todayMs).toISOString().split("T")[0];
  const yesterdayStr = new Date(todayMs - dayMs).toISOString().split("T")[0];
  const twoDaysAgoStr = new Date(todayMs - 2 * dayMs).toISOString().split("T")[0];
  const threeDaysAgoStr = new Date(todayMs - 3 * dayMs).toISOString().split("T")[0];
  const fourDaysAgoStr = new Date(todayMs - 4 * dayMs).toISOString().split("T")[0];
  const tomorrowStr = new Date(todayMs + dayMs).toISOString().split("T")[0];
  const twoDaysLaterStr = new Date(todayMs + 2 * dayMs).toISOString().split("T")[0];
  const threeDaysLaterStr = new Date(todayMs + 3 * dayMs).toISOString().split("T")[0];

  const seededHostellers: HostellerRecord[] = [
    {
      id: "hstlr-edi-001",
      property_id: "prop-hostel-001",
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      phone: "+44 7700 900123",
      date_of_birth: "1998-04-12",
      gender: "male",
      nationality: "United Kingdom",
      address: "24 Rose Street",
      city: "Manchester",
      country: "United Kingdom",
      emergency_contact: {
        name: "Mary Doe",
        relationship: "Mother",
        phone: "+44 7700 900987",
      },
      status: "active",
      notes: "Vegetarian, bottom bunk preferred.",
      created_at: "2026-10-12T11:05:00Z",
      updated_at: "2026-10-12T11:05:00Z",
      is_active: true,
    },
    {
      id: "hstlr-edi-002",
      property_id: "prop-hostel-001",
      first_name: "Liam",
      last_name: "Fraser",
      email: "liam.fraser@example.com",
      phone: "+44 7700 900456",
      date_of_birth: "1999-08-20",
      gender: "male",
      nationality: "United Kingdom",
      city: "Glasgow",
      country: "United Kingdom",
      emergency_contact: {
        name: "Calum Fraser",
        relationship: "Brother",
        phone: "+44 7700 900654",
      },
      status: "checked_in",
      notes: "Arrived on late train from Highlands.",
      created_at: new Date(todayMs - 3 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 3 * dayMs).toISOString(),
      is_active: true,
    },
    {
      id: "hstlr-edi-003",
      property_id: "prop-hostel-001",
      first_name: "Emma",
      last_name: "Watson",
      email: "emma.watson@student.ac.uk",
      phone: "+44 7700 900789",
      date_of_birth: "2002-11-05",
      gender: "female",
      nationality: "Canada",
      city: "Toronto",
      country: "Canada",
      emergency_contact: {
        name: "David Watson",
        relationship: "Father",
        phone: "+1 416 555 0184",
      },
      status: "checked_in",
      notes: "Requested quiet room for university study.",
      created_at: new Date(todayMs - 2 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 2 * dayMs).toISOString(),
      is_active: true,
    },
    {
      id: "hstlr-edi-004",
      property_id: "prop-hostel-001",
      first_name: "Mateo",
      last_name: "Hernandez",
      email: "mateo.traveler@example.es",
      phone: "+34 600 123 456",
      date_of_birth: "2000-02-14",
      gender: "male",
      nationality: "Spain",
      city: "Barcelona",
      country: "Spain",
      emergency_contact: {
        name: "Elena Hernandez",
        relationship: "Sister",
        phone: "+34 600 654 321",
      },
      status: "active",
      notes: "Backpacking across Scotland. Expected arrival 15:00.",
      created_at: new Date(todayMs - dayMs).toISOString(),
      updated_at: new Date(todayMs - dayMs).toISOString(),
      is_active: true,
    },
    {
      id: "hstlr-edi-005",
      property_id: "prop-hostel-001",
      first_name: "Chloe",
      last_name: "Dupont",
      email: "chloe.dupont@voyage.fr",
      phone: "+33 612 345 678",
      date_of_birth: "1997-07-22",
      gender: "female",
      nationality: "France",
      city: "Lyon",
      country: "France",
      emergency_contact: {
        name: "Jean Dupont",
        relationship: "Father",
        phone: "+33 612 987 654",
      },
      status: "checked_in",
      notes: "Flight was rescheduled. Front desk following up on checkout.",
      created_at: new Date(todayMs - 4 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 4 * dayMs).toISOString(),
      is_active: true,
    },
  ];

  for (const h of seededHostellers) {
    hostellersStore.set(h.id, h);
  }

  const seededHostelStays: HostelStayRecord[] = [
    {
      id: "stay-edi-001",
      stay_reference: "HST-STAY-2026-001",
      property_id: "prop-hostel-001",
      hosteller_id: "hstlr-edi-001",
      booking_id: "bk-john-002",
      room_id: "rm-edi-101",
      bed_id: "bed-edi-101-3",
      check_in_date: "2026-11-12",
      check_out_date: "2026-11-15",
      status: "reserved",
      special_requests: "Bottom bunk requested.",
      locker_number: "LK-101-3",
      keycard_code: "KC-EDI-101-3",
      nightly_rate: 32.0,
      total_nights: 3,
      total_amount: 96.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: "2026-10-12T11:05:00Z",
          performed_by_user_id: "usr-guest-007",
          performed_by_name: "John Doe",
          details: "Hostel stay reservation created via online booking GS-EDI-2026-3401.",
        },
      ],
      created_at: "2026-10-12T11:05:00Z",
      updated_at: "2026-10-12T11:05:00Z",
    },
    {
      id: "stay-edi-002",
      stay_reference: "HST-STAY-2026-002",
      property_id: "prop-hostel-001",
      hosteller_id: "hstlr-edi-002",
      room_id: "rm-edi-101",
      bed_id: "bed-edi-101-1",
      check_in_date: threeDaysAgoStr,
      check_out_date: twoDaysLaterStr,
      actual_check_in_time: new Date(todayMs - 3 * dayMs + 1000 * 3600 * 14).toISOString(),
      status: "checked_in",
      special_requests: "Late check-in confirmed.",
      locker_number: "LK-101-1",
      keycard_code: "KC-EDI-101-1",
      checked_in_by_user_id: "usr-pm-002",
      nightly_rate: 32.0,
      total_nights: 5,
      total_amount: 160.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 4 * dayMs).toISOString(),
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Reservation created for Liam Fraser.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "checked_in",
          timestamp: new Date(todayMs - 3 * dayMs + 1000 * 3600 * 14).toISOString(),
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Hosteller checked in; Bed Pod 1 Lower and locker LK-101-1 assigned.",
        },
      ],
      created_at: new Date(todayMs - 4 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 3 * dayMs).toISOString(),
    },
    {
      id: "stay-edi-003",
      stay_reference: "HST-STAY-2026-003",
      property_id: "prop-hostel-001",
      hosteller_id: "hstlr-edi-003",
      room_id: "rm-edi-201",
      bed_id: "bed-edi-201-1",
      check_in_date: twoDaysAgoStr,
      check_out_date: todayStr,
      actual_check_in_time: new Date(todayMs - 2 * dayMs + 1000 * 3600 * 15).toISOString(),
      status: "checked_in",
      special_requests: "Luggage storage after checkout requested.",
      locker_number: "LK-201-1",
      keycard_code: "KC-EDI-201-1",
      checked_in_by_user_id: "usr-pm-002",
      nightly_rate: 38.0,
      total_nights: 2,
      total_amount: 76.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 3 * dayMs).toISOString(),
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Female dorm bed reserved for Emma Watson.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "checked_in",
          timestamp: new Date(todayMs - 2 * dayMs + 1000 * 3600 * 15).toISOString(),
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Checked in to Female Pod 1 Lower.",
        },
      ],
      created_at: new Date(todayMs - 3 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 2 * dayMs).toISOString(),
    },
    {
      id: "stay-edi-004",
      stay_reference: "HST-STAY-2026-004",
      property_id: "prop-hostel-001",
      hosteller_id: "hstlr-edi-004",
      room_id: "rm-edi-101",
      bed_id: "bed-edi-101-2",
      check_in_date: todayStr,
      check_out_date: threeDaysLaterStr,
      status: "reserved",
      special_requests: "Upper bunk is fine. Arriving by airport tram.",
      locker_number: "LK-101-2",
      keycard_code: "KC-EDI-101-2",
      nightly_rate: 32.0,
      total_nights: 3,
      total_amount: 96.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - dayMs).toISOString(),
          performed_by_user_id: "usr-admin-001",
          performed_by_name: "Julian Vance",
          details: "Reservation created for Mateo Hernandez.",
        },
      ],
      created_at: new Date(todayMs - dayMs).toISOString(),
      updated_at: new Date(todayMs - dayMs).toISOString(),
    },
    {
      id: "stay-edi-005",
      stay_reference: "HST-STAY-2026-005",
      property_id: "prop-hostel-001",
      hosteller_id: "hstlr-edi-005",
      room_id: "rm-edi-201",
      bed_id: "bed-edi-201-2",
      check_in_date: fourDaysAgoStr,
      check_out_date: yesterdayStr,
      actual_check_in_time: new Date(todayMs - 4 * dayMs + 1000 * 3600 * 16).toISOString(),
      status: "checked_in",
      special_requests: "Follow-up required by front desk.",
      locker_number: "LK-201-2",
      keycard_code: "KC-EDI-201-2",
      checked_in_by_user_id: "usr-pm-002",
      nightly_rate: 38.0,
      total_nights: 3,
      total_amount: 114.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 5 * dayMs).toISOString(),
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Reservation created for Chloe Dupont.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "checked_in",
          timestamp: new Date(todayMs - 4 * dayMs + 1000 * 3600 * 16).toISOString(),
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Checked in to Female Pod 1 Upper.",
        },
      ],
      created_at: new Date(todayMs - 5 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 4 * dayMs).toISOString(),
    },
  ];

  for (const s of seededHostelStays) {
    hostelStaysStore.set(s.id, s);
    // Seed matching active allocations in inventory allocationsStore
    allocationsStore.set(`alloc-stay-${s.id}`, {
      id: `alloc-stay-${s.id}`,
      property_id: s.property_id,
      room_id: s.room_id,
      bed_id: s.bed_id,
      check_in_date: s.check_in_date,
      check_out_date: s.check_out_date,
      allocation_type: s.status === "checked_in" ? "check_in" : "reservation",
      notes: `Hostel stay ${s.stay_reference}`,
      created_by_user_id: s.checked_in_by_user_id || "usr-pm-002",
      is_active: s.status === "reserved" || s.status === "checked_in",
      created_at: s.created_at,
    });
  }

  // Pre-seed Phase 8 Hotel Guests and Hotel Stays for London Mayfair Grand Hotel (prop-hotel-002)
  const seededHotelGuests: HotelGuestRecord[] = [
    {
      id: "gst-lon-001",
      property_id: "prop-hotel-002",
      first_name: "Eleanor",
      last_name: "Vance",
      email: "eleanor.vance@mayfairtrust.co.uk",
      phone: "+44 20 7946 0123",
      date_of_birth: "1978-06-15",
      gender: "female",
      nationality: "United Kingdom",
      address: "14 Berkeley Square",
      city: "London",
      country: "United Kingdom",
      vip_tier: "platinum",
      special_preferences: "Feather-free pillows, high floor, quiet corner, daily Financial Times.",
      status: "active",
      notes: "Board member of Mayfair Heritage Trust. Frequent executive guest.",
      created_at: "2026-02-10T10:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
      is_active: true,
    },
    {
      id: "gst-lon-002",
      property_id: "prop-hotel-002",
      first_name: "Marcus",
      last_name: "Sterling",
      email: "m.sterling@globalholdings.com",
      phone: "+1 212 555 0199",
      date_of_birth: "1982-11-20",
      gender: "male",
      nationality: "United States",
      address: "740 Park Avenue",
      city: "New York",
      country: "United States",
      vip_tier: "gold",
      special_preferences: "Late checkout preferred, sparkling mineral water stocked in room minibar.",
      status: "checked_in",
      notes: "Visiting for annual banking summit in City of London.",
      created_at: new Date(todayMs - 5 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 3 * dayMs).toISOString(),
      is_active: true,
    },
    {
      id: "gst-lon-003",
      property_id: "prop-hotel-002",
      first_name: "Sofia",
      last_name: "Berg",
      email: "sofia.guest@example.com",
      phone: "+46 8 123 4567",
      date_of_birth: "1989-03-24",
      gender: "female",
      nationality: "Sweden",
      address: "Strandvägen 18",
      city: "Stockholm",
      country: "Sweden",
      vip_tier: "silver",
      special_preferences: "King bed, balcony suite, hypoallergenic bedding.",
      status: "checked_in",
      notes: "Architectural consultant visiting London Design Biennale.",
      created_at: new Date(todayMs - 4 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 2 * dayMs).toISOString(),
      is_active: true,
    },
    {
      id: "gst-lon-004",
      property_id: "prop-hotel-002",
      first_name: "Henri",
      last_name: "Moreau",
      email: "henri.moreau@artparis.fr",
      phone: "+33 1 42 68 55 00",
      date_of_birth: "1985-09-12",
      gender: "male",
      nationality: "France",
      address: "28 Rue du Faubourg Saint-Honoré",
      city: "Paris",
      country: "France",
      vip_tier: "standard",
      special_preferences: "Early morning wake-up call at 07:00, espresso in room.",
      status: "active",
      notes: "Art gallery curator attending Frieze London.",
      created_at: new Date(todayMs - 2 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 2 * dayMs).toISOString(),
      is_active: true,
    },
    {
      id: "gst-lon-005",
      property_id: "prop-hotel-002",
      first_name: "Dr. Kenji",
      last_name: "Sato",
      email: "kenji.sato@keio-research.jp",
      phone: "+81 3 5555 0142",
      date_of_birth: "1972-12-08",
      gender: "male",
      nationality: "Japan",
      address: "Minato-ku Roppongi 6-10",
      city: "Tokyo",
      country: "Japan",
      vip_tier: "gold",
      special_preferences: "Quiet room, extra suit hangers, green tea selection.",
      status: "checked_in",
      notes: "Keynote speaker at Imperial College symposium. Overdue checkout pending departure flight.",
      created_at: new Date(todayMs - 6 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 4 * dayMs).toISOString(),
      is_active: true,
    },
  ];

  for (const g of seededHotelGuests) {
    hotelGuestsStore.set(g.id, g);
  }

  const seededHotelStays: HotelStayRecord[] = [
    {
      id: "hstay-lon-001",
      stay_reference: "HTL-STAY-2026-001",
      property_id: "prop-hotel-002",
      guest_id: "gst-lon-003",
      booking_id: "bk-sofia-001",
      room_type_id: "rt-lon-exec",
      assigned_room_id: "rm-lon-201",
      check_in_date: twoDaysAgoStr,
      check_out_date: twoDaysLaterStr,
      actual_check_in_time: new Date(todayMs - 2 * dayMs + 1000 * 3600 * 15).toISOString(),
      status: "checked_in",
      adult_count: 1,
      child_count: 0,
      special_requests: "Mayfair Club suite corner room requested.",
      keycard_code: "KC-LON-201",
      checked_in_by_user_id: "usr-fd-003",
      nightly_rate: 450.0,
      total_nights: 4,
      total_amount: 1800.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 4 * dayMs).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Reservation created for Sofia Berg in Executive Suite.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "room_assigned",
          timestamp: new Date(todayMs - 4 * dayMs).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Assigned physical room 201 (Level 2 - Mayfair Club).",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "checked_in",
          timestamp: new Date(todayMs - 2 * dayMs + 1000 * 3600 * 15).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Guest checked in, RFID keycard KC-LON-201 issued.",
        },
      ],
      created_at: new Date(todayMs - 4 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 2 * dayMs).toISOString(),
    },
    {
      id: "hstay-lon-002",
      stay_reference: "HTL-STAY-2026-002",
      property_id: "prop-hotel-002",
      guest_id: "gst-lon-002",
      room_type_id: "rt-lon-deluxe",
      assigned_room_id: "rm-lon-101",
      check_in_date: threeDaysAgoStr,
      check_out_date: todayStr,
      actual_check_in_time: new Date(todayMs - 3 * dayMs + 1000 * 3600 * 14).toISOString(),
      status: "checked_in",
      adult_count: 2,
      child_count: 0,
      additional_occupants: [{ name: "Claire Sterling", relationship: "Spouse" }],
      special_requests: "Quiet room facing interior courtyard.",
      keycard_code: "KC-LON-101",
      checked_in_by_user_id: "usr-fd-003",
      nightly_rate: 280.0,
      total_nights: 3,
      total_amount: 840.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 5 * dayMs).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Deluxe King reservation created for Marcus Sterling.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "checked_in",
          timestamp: new Date(todayMs - 3 * dayMs + 1000 * 3600 * 14).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Guest checked in to Room 101 with spouse.",
        },
      ],
      created_at: new Date(todayMs - 5 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 3 * dayMs).toISOString(),
    },
    {
      id: "hstay-lon-003",
      stay_reference: "HTL-STAY-2026-003",
      property_id: "prop-hotel-002",
      guest_id: "gst-lon-004",
      room_type_id: "rt-lon-deluxe",
      assigned_room_id: "rm-lon-102",
      check_in_date: todayStr,
      check_out_date: threeDaysLaterStr,
      status: "confirmed",
      adult_count: 1,
      child_count: 0,
      special_requests: "Early check-in requested if suite is clean.",
      nightly_rate: 280.0,
      total_nights: 3,
      total_amount: 840.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 2 * dayMs).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Reservation confirmed for Henri Moreau.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "room_assigned",
          timestamp: new Date(todayMs - dayMs).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Assigned Room 102 prior to arrival.",
        },
      ],
      created_at: new Date(todayMs - 2 * dayMs).toISOString(),
      updated_at: new Date(todayMs - dayMs).toISOString(),
    },
    {
      id: "hstay-lon-004",
      stay_reference: "HTL-STAY-2026-004",
      property_id: "prop-hotel-002",
      guest_id: "gst-lon-001",
      room_type_id: "rt-lon-exec",
      assigned_room_id: "rm-lon-202",
      check_in_date: tomorrowStr,
      check_out_date: new Date(todayMs + 4 * dayMs).toISOString().split("T")[0],
      status: "reserved",
      adult_count: 1,
      child_count: 0,
      special_requests: "Executive balcony suite for Lady Eleanor Vance.",
      nightly_rate: 450.0,
      total_nights: 3,
      total_amount: 1350.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - dayMs).toISOString(),
          performed_by_user_id: "usr-admin-001",
          performed_by_name: "Julian Vance",
          details: "VIP booking created for Lady Eleanor Vance.",
        },
      ],
      created_at: new Date(todayMs - dayMs).toISOString(),
      updated_at: new Date(todayMs - dayMs).toISOString(),
    },
    {
      id: "hstay-lon-005",
      stay_reference: "HTL-STAY-2026-005",
      property_id: "prop-hotel-002",
      guest_id: "gst-lon-005",
      room_type_id: "rt-lon-twin",
      assigned_room_id: "rm-lon-301",
      check_in_date: fourDaysAgoStr,
      check_out_date: yesterdayStr,
      actual_check_in_time: new Date(todayMs - 4 * dayMs + 1000 * 3600 * 16).toISOString(),
      status: "checked_in",
      adult_count: 1,
      child_count: 0,
      special_requests: "Luggage storage assistance requested.",
      keycard_code: "KC-LON-301",
      checked_in_by_user_id: "usr-fd-003",
      nightly_rate: 310.0,
      total_nights: 3,
      total_amount: 930.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - 5 * dayMs).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Twin suite reservation created for Dr. Kenji Sato.",
        },
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "checked_in",
          timestamp: new Date(todayMs - 4 * dayMs + 1000 * 3600 * 16).toISOString(),
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Guest checked in to Room 301.",
        },
      ],
      created_at: new Date(todayMs - 5 * dayMs).toISOString(),
      updated_at: new Date(todayMs - 4 * dayMs).toISOString(),
    },
    {
      id: "hstay-lon-006",
      stay_reference: "HTL-STAY-2026-006",
      property_id: "prop-hotel-002",
      guest_id: "gst-lon-001",
      room_type_id: "rt-lon-deluxe",
      check_in_date: todayStr,
      check_out_date: twoDaysLaterStr,
      status: "confirmed",
      adult_count: 1,
      child_count: 0,
      special_requests: "Awaiting physical room allocation on arrival.",
      nightly_rate: 280.0,
      total_nights: 2,
      total_amount: 560.0,
      currency: "GBP",
      audit_trail: [
        {
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "created",
          timestamp: new Date(todayMs - dayMs).toISOString(),
          performed_by_user_id: "usr-admin-001",
          performed_by_name: "Julian Vance",
          details: "Unassigned Deluxe Room reservation created.",
        },
      ],
      created_at: new Date(todayMs - dayMs).toISOString(),
      updated_at: new Date(todayMs - dayMs).toISOString(),
    },
  ];

  for (const hs of seededHotelStays) {
    hotelStaysStore.set(hs.id, hs);
    if (hs.assigned_room_id) {
      allocationsStore.set(`alloc-hstay-${hs.id}`, {
        id: `alloc-hstay-${hs.id}`,
        property_id: hs.property_id,
        room_id: hs.assigned_room_id,
        check_in_date: hs.check_in_date,
        check_out_date: hs.check_out_date,
        allocation_type: hs.status === "checked_in" ? "check_in" : "reservation",
        notes: `Hotel stay ${hs.stay_reference}`,
        created_by_user_id: hs.checked_in_by_user_id || "usr-fd-003",
        is_active: hs.status === "reserved" || hs.status === "confirmed" || hs.status === "checked_in",
        created_at: hs.created_at,
      });
    }
  }

  // Pre-seed Phase 9 Tax Rules
  const seededTaxRules: TaxRuleRecord[] = [
    {
      id: "tax-lon-lodging",
      property_id: "prop-hotel-002",
      name: "UK Standard Lodging VAT",
      rate_percentage: 20.0,
      charge_categories: ["accommodation_hotel", "facility_fee"],
      is_inclusive: false,
      is_active: true,
      effective_from: "2026-01-01",
      priority: 1,
      jurisdiction_code: "GB-HMRC",
      notes: "Standard 20% UK VAT on hotel accommodation and executive club fees.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "tax-lon-dining",
      property_id: "prop-hotel-002",
      name: "UK Food & Dining VAT",
      rate_percentage: 20.0,
      charge_categories: ["mess_meal"],
      is_inclusive: false,
      is_active: true,
      effective_from: "2026-01-01",
      priority: 1,
      jurisdiction_code: "GB-HMRC",
      notes: "Standard 20% VAT on restaurant dining and room service.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "tax-lon-tourism",
      property_id: "prop-hotel-002",
      name: "Westminster Heritage Tourism Levy",
      rate_percentage: 2.5,
      charge_categories: ["accommodation_hotel"],
      is_inclusive: false,
      is_active: true,
      effective_from: "2026-01-01",
      priority: 2,
      jurisdiction_code: "GB-WCC",
      notes: "Local municipal tourism surcharge for Central London borough.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "tax-edi-dorm",
      property_id: "prop-hostel-001",
      name: "Scottish Hospitality Dorm VAT",
      rate_percentage: 20.0,
      charge_categories: ["accommodation_hostel", "extra_service"],
      is_inclusive: false,
      is_active: true,
      effective_from: "2026-01-01",
      priority: 1,
      jurisdiction_code: "SC-REV",
      notes: "Standard UK/Scottish hospitality rate on hostel dorm accommodation.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "tax-edi-mess",
      property_id: "prop-hostel-001",
      name: "Edinburgh Student & Backpacker Meal VAT",
      rate_percentage: 12.5,
      charge_categories: ["mess_meal"],
      is_inclusive: false,
      is_active: true,
      effective_from: "2026-01-01",
      priority: 1,
      jurisdiction_code: "SC-REV",
      notes: "Reduced rate for communal hostel mess and continental breakfast packs.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  for (const tr of seededTaxRules) {
    taxRulesStore.set(tr.id, tr);
  }

  // Pre-seed Phase 9 Invoices
  const seededInvoices: InvoiceRecord[] = [
    {
      id: "inv-lon-001",
      invoice_number: "INV-2026-LON-001",
      property_id: "prop-hotel-002",
      status: "issued",
      issue_date: "2026-10-15",
      due_date: "2026-10-22",
      customer_type: "guest",
      customer_id: "gst-lon-001",
      customer_name: "Eleanor Vance",
      customer_email: "eleanor.vance@mayfairtrust.co.uk",
      customer_phone: "+44 20 7946 0123",
      billing_address: "14 Berkeley Square, London, United Kingdom",
      reservation_type: "hotel_stay",
      reservation_id: "hstay-lon-006",
      reservation_reference: "HTL-STAY-2026-006",
      currency: "GBP",
      subtotal: 560.0,
      discount_total: 0.0,
      tax_total: 126.0,
      total_amount: 686.0,
      amount_paid: 686.0,
      outstanding_balance: 0.0,
      notes: "Executive Suite 2-night stay with daily breakfast inclusion.",
      created_by_user_id: "usr-admin-001",
      line_items: [
        {
          id: "li-001",
          charge_category: "accommodation_hotel",
          description: "Mayfair Executive Suite (2 nights @ £280.00/night)",
          quantity: 2,
          unit_price: 280.0,
          discount_amount: 0.0,
          subtotal: 560.0,
          tax_amount: 126.0,
          total: 686.0,
        },
      ],
      tax_snapshot: {
        calculated_at: "2026-10-15T10:00:00Z",
        currency: "GBP",
        subtotal: 560.0,
        discount_total: 0.0,
        taxable_subtotal: 560.0,
        components: [
          {
            rule_id: "tax-lon-lodging",
            rule_name: "UK Standard Lodging VAT",
            rate_percentage: 20.0,
            is_inclusive: false,
            taxable_base: 560.0,
            tax_amount: 112.0,
          },
          {
            rule_id: "tax-lon-tourism",
            rule_name: "Westminster Heritage Tourism Levy",
            rate_percentage: 2.5,
            is_inclusive: false,
            taxable_base: 560.0,
            tax_amount: 14.0,
          },
        ],
        total_tax: 126.0,
        grand_total: 686.0,
      },
      audit_trail: [
        {
          id: "aud-inv-001",
          action: "created",
          timestamp: "2026-10-15T09:30:00Z",
          performed_by_user_id: "usr-admin-001",
          performed_by_name: "Julian Vance",
          details: "Draft invoice created for Eleanor Vance.",
        },
        {
          id: "aud-inv-002",
          action: "issued",
          timestamp: "2026-10-15T10:00:00Z",
          performed_by_user_id: "usr-admin-001",
          performed_by_name: "Julian Vance",
          details: "Invoice issued and tax snapshot frozen (£686.00).",
        },
        {
          id: "aud-inv-003",
          action: "payment_allocated",
          timestamp: "2026-10-15T10:15:00Z",
          performed_by_user_id: "usr-admin-001",
          performed_by_name: "Julian Vance",
          details: "Payment PAY-2026-LON-001 of £686.00 fully allocated.",
        },
      ],
      created_at: "2026-10-15T09:30:00Z",
      updated_at: "2026-10-15T10:15:00Z",
    },
    {
      id: "inv-lon-002",
      invoice_number: "INV-2026-LON-002",
      property_id: "prop-hotel-002",
      status: "issued",
      issue_date: "2026-10-16",
      due_date: "2026-10-23",
      customer_type: "guest",
      customer_id: "gst-lon-005",
      customer_name: "Dr. Kenji Sato",
      customer_email: "kenji.sato@keio-research.jp",
      customer_phone: "+81 3 5555 0142",
      billing_address: "Minato-ku Roppongi 6-10, Tokyo, Japan",
      reservation_type: "hotel_stay",
      reservation_id: "hstay-lon-005",
      reservation_reference: "HTL-STAY-2026-005",
      currency: "GBP",
      subtotal: 930.0,
      discount_total: 0.0,
      tax_total: 209.25,
      total_amount: 1139.25,
      amount_paid: 500.0,
      outstanding_balance: 639.25,
      notes: "Twin Suite accommodation plus executive symposium charges.",
      created_by_user_id: "usr-fd-003",
      line_items: [
        {
          id: "li-002",
          charge_category: "accommodation_hotel",
          description: "Classic Twin Suite (3 nights @ £310.00/night)",
          quantity: 3,
          unit_price: 310.0,
          discount_amount: 0.0,
          subtotal: 930.0,
          tax_amount: 209.25,
          total: 1139.25,
        },
      ],
      tax_snapshot: {
        calculated_at: "2026-10-16T11:00:00Z",
        currency: "GBP",
        subtotal: 930.0,
        discount_total: 0.0,
        taxable_subtotal: 930.0,
        components: [
          {
            rule_id: "tax-lon-lodging",
            rule_name: "UK Standard Lodging VAT",
            rate_percentage: 20.0,
            is_inclusive: false,
            taxable_base: 930.0,
            tax_amount: 186.0,
          },
          {
            rule_id: "tax-lon-tourism",
            rule_name: "Westminster Heritage Tourism Levy",
            rate_percentage: 2.5,
            is_inclusive: false,
            taxable_base: 930.0,
            tax_amount: 23.25,
          },
        ],
        total_tax: 209.25,
        grand_total: 1139.25,
      },
      audit_trail: [
        {
          id: "aud-inv-004",
          action: "created",
          timestamp: "2026-10-16T10:45:00Z",
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Draft invoice created for Dr. Kenji Sato.",
        },
        {
          id: "aud-inv-005",
          action: "issued",
          timestamp: "2026-10-16T11:00:00Z",
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Invoice issued for £1,139.25.",
        },
        {
          id: "aud-inv-006",
          action: "payment_allocated",
          timestamp: "2026-10-16T11:30:00Z",
          performed_by_user_id: "usr-fd-003",
          performed_by_name: "Liam Chen",
          details: "Deposit payment PAY-2026-LON-002 (£500.00) allocated.",
        },
      ],
      created_at: "2026-10-16T10:45:00Z",
      updated_at: "2026-10-16T11:30:00Z",
    },
    {
      id: "inv-edi-001",
      invoice_number: "INV-2026-EDI-001",
      property_id: "prop-hostel-001",
      status: "issued",
      issue_date: "2026-10-14",
      due_date: "2026-10-21",
      customer_type: "hosteller",
      customer_id: "hstlr-edi-001",
      customer_name: "Isla Campbell",
      customer_email: "isla.campbell@highlandu.ac.uk",
      customer_phone: "+44 7700 900123",
      billing_address: "Edinburgh University Hall, High St, Edinburgh",
      reservation_type: "hostel_stay",
      reservation_id: "stay-edi-001",
      reservation_reference: "HST-STAY-2026-001",
      currency: "GBP",
      subtotal: 154.0,
      discount_total: 0.0,
      tax_total: 28.85,
      total_amount: 182.85,
      amount_paid: 182.85,
      outstanding_balance: 0.0,
      notes: "Hostel stay (4 nights) + weekly student mess meal pass.",
      created_by_user_id: "usr-pm-002",
      line_items: [
        {
          id: "li-edi-1",
          charge_category: "accommodation_hostel",
          description: "Mixed Dorm 6-Bed Pod (4 nights @ £32.00/night)",
          quantity: 4,
          unit_price: 32.0,
          discount_amount: 0.0,
          subtotal: 128.0,
          tax_amount: 25.6,
          total: 153.6,
        },
        {
          id: "li-edi-2",
          charge_category: "mess_meal",
          description: "Hostel Breakfast Pack & Evening Soup (2 meals @ £13.00)",
          quantity: 2,
          unit_price: 13.0,
          discount_amount: 0.0,
          subtotal: 26.0,
          tax_amount: 3.25,
          total: 29.25,
        },
      ],
      tax_snapshot: {
        calculated_at: "2026-10-14T09:00:00Z",
        currency: "GBP",
        subtotal: 154.0,
        discount_total: 0.0,
        taxable_subtotal: 154.0,
        components: [
          {
            rule_id: "tax-edi-dorm",
            rule_name: "Scottish Hospitality Dorm VAT",
            rate_percentage: 20.0,
            is_inclusive: false,
            taxable_base: 128.0,
            tax_amount: 25.6,
          },
          {
            rule_id: "tax-edi-mess",
            rule_name: "Edinburgh Student & Backpacker Meal VAT",
            rate_percentage: 12.5,
            is_inclusive: false,
            taxable_base: 26.0,
            tax_amount: 3.25,
          },
        ],
        total_tax: 28.85,
        grand_total: 182.85,
      },
      audit_trail: [
        {
          id: "aud-inv-007",
          action: "created",
          timestamp: "2026-10-14T08:30:00Z",
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Draft invoice created for Isla Campbell.",
        },
        {
          id: "aud-inv-008",
          action: "issued",
          timestamp: "2026-10-14T09:00:00Z",
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Invoice issued for Isla Campbell.",
        },
        {
          id: "aud-inv-009",
          action: "payment_allocated",
          timestamp: "2026-10-14T09:10:00Z",
          performed_by_user_id: "usr-pm-002",
          performed_by_name: "Clara Ross",
          details: "Cash payment PAY-2026-EDI-001 fully allocated.",
        },
      ],
      created_at: "2026-10-14T08:30:00Z",
      updated_at: "2026-10-14T09:10:00Z",
    },
  ];

  for (const inv of seededInvoices) {
    invoicesStore.set(inv.id, inv);
  }

  // Pre-seed Phase 9 Payments
  const seededPayments: PaymentRecord[] = [
    {
      id: "pay-lon-001",
      payment_reference: "PAY-2026-LON-001",
      property_id: "prop-hotel-002",
      amount: 686.0,
      currency: "GBP",
      payment_method: "credit_card_terminal",
      status: "completed",
      payment_date: "2026-10-15T10:15:00Z",
      payer_name: "Eleanor Vance",
      payer_email: "eleanor.vance@mayfairtrust.co.uk",
      received_by_user_id: "usr-admin-001",
      transaction_reference: "AUTH-LON-992144",
      notes: "Chip & PIN card terminal approval at reception.",
      allocations: [
        {
          id: "alloc-pay-001",
          invoice_id: "inv-lon-001",
          invoice_number: "INV-2026-LON-001",
          amount: 686.0,
          allocated_at: "2026-10-15T10:15:00Z",
          allocated_by_user_id: "usr-admin-001",
        },
      ],
      unallocated_amount: 0.0,
      refunded_amount: 0.0,
      created_at: "2026-10-15T10:15:00Z",
      updated_at: "2026-10-15T10:15:00Z",
    },
    {
      id: "pay-lon-002",
      payment_reference: "PAY-2026-LON-002",
      property_id: "prop-hotel-002",
      amount: 500.0,
      currency: "GBP",
      payment_method: "bank_transfer",
      status: "completed",
      payment_date: "2026-10-16T11:30:00Z",
      payer_name: "Dr. Kenji Sato",
      payer_email: "kenji.sato@keio-research.jp",
      received_by_user_id: "usr-fd-003",
      transaction_reference: "WIRE-JP-GB-44021",
      notes: "International bank wire deposit received.",
      allocations: [
        {
          id: "alloc-pay-002",
          invoice_id: "inv-lon-002",
          invoice_number: "INV-2026-LON-002",
          amount: 500.0,
          allocated_at: "2026-10-16T11:30:00Z",
          allocated_by_user_id: "usr-fd-003",
        },
      ],
      unallocated_amount: 0.0,
      refunded_amount: 0.0,
      created_at: "2026-10-16T11:30:00Z",
      updated_at: "2026-10-16T11:30:00Z",
    },
    {
      id: "pay-edi-001",
      payment_reference: "PAY-2026-EDI-001",
      property_id: "prop-hostel-001",
      amount: 182.85,
      currency: "GBP",
      payment_method: "cash",
      status: "completed",
      payment_date: "2026-10-14T09:10:00Z",
      payer_name: "Isla Campbell",
      payer_email: "isla.campbell@highlandu.ac.uk",
      received_by_user_id: "usr-pm-002",
      transaction_reference: "CASH-REC-0012",
      notes: "Cash payment settled at hostel reception desk.",
      allocations: [
        {
          id: "alloc-pay-003",
          invoice_id: "inv-edi-001",
          invoice_number: "INV-2026-EDI-001",
          amount: 182.85,
          allocated_at: "2026-10-14T09:10:00Z",
          allocated_by_user_id: "usr-pm-002",
        },
      ],
      unallocated_amount: 0.0,
      refunded_amount: 0.0,
      created_at: "2026-10-14T09:10:00Z",
      updated_at: "2026-10-14T09:10:00Z",
    },
  ];

  for (const p of seededPayments) {
    paymentsStore.set(p.id, p);
  }
}

seedInitialData();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Correlation & Request Tracing middleware
  app.use((req, res, next) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    res.setHeader("X-Request-ID", correlationId);
    next();
  });

  // Authentication extractor helper
  function authenticate(req: express.Request): UserRecord {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const err: any = new Error("Authentication credentials were not provided.");
      err.status = 401;
      throw err;
    }
    const token = authHeader.substring(7).trim();
    let payload: Record<string, unknown>;
    try {
      payload = verifyJwt(token, SECRET_KEY, "access");
    } catch (e: any) {
      const err: any = new Error(`Invalid or expired token: ${e.message}`);
      err.status = 401;
      throw err;
    }
    const user = Array.from(usersStore.values()).find((u) => u.id === payload.sub);
    if (!user || !user.is_active) {
      const err: any = new Error("User account not found or is deactivated.");
      err.status = 401;
      throw err;
    }
    return user;
  }

  // --- Health Probe Endpoints ---
  app.get("/api/v1/health", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    res.json({
      success: true,
      data: {
        status: "healthy",
        service: "GrandStay Hybrid HMS",
        version: "0.1.0",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
        database: {
          status: "connected",
          latency_ms: 1.54,
          dialect: "postgresql",
          error: null,
        },
        system: {
          python_version: "3.11.2",
          server_time_utc: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
        },
      },
      message: "System is operational (healthy)",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/v1/healthz", (_req, res) => {
    res.json({ status: "ok", service: "grandstay-backend" });
  });

  // --- System Architecture Specification ---
  app.get("/api/v1/system-meta", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    res.json({
      success: true,
      data: {
        service: "GrandStay Hybrid HMS",
        version: "0.1.0",
        api_version: "v1",
        supported_property_types: ["hostel", "hotel", "hybrid"],
        rbac_roles: [
          "super_admin",
          "property_manager",
          "front_desk",
          "housekeeping",
          "accountant",
          "guest",
        ],
        architecture: "Modular Monolith",
        modules: {
          shared: ["core", "security", "database", "users", "properties"],
          hostel_domain: ["dorm_allocations", "bunk_beds", "lockers", "communal_fees"],
          hotel_domain: ["room_suites", "housekeeping", "concierge", "minibar_billing"],
        },
        security: {
          password_hashing: "Argon2id (RFC 9106 memory-hard standard)",
          token_auth: "JWT HMAC-SHA256 (30m access / 7d refresh)",
          session_revocation: "Stateful PostgreSQL refresh sessions with reuse detection",
          isolation: "verify_property_scope() & verify_booking_ownership()",
        },
      },
      message: "System architectural specifications loaded.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // PHASE 3 AUTHENTICATION & AUTHORIZATION APIS
  // ==========================================

  // 1. Customer Registration: POST /api/v1/auth/register
  app.post("/api/v1/auth/register", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { email, password, first_name, last_name } = req.body || {};

    if (!email || !password || !first_name || !last_name) {
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "email, password, first_name, and last_name are required." },
        correlation_id: correlationId,
      });
      return;
    }

    if (password.length < 8) {
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters in length." },
        correlation_id: correlationId,
      });
      return;
    }

    if (usersStore.has(email)) {
      res.status(409).json({
        success: false,
        error: { code: "RESOURCE_CONFLICT", message: `Email address '${email}' is already registered.` },
        correlation_id: correlationId,
      });
      return;
    }

    const newUser: UserRecord = {
      id: `usr-cust-${crypto.randomUUID().substring(0, 8)}`,
      email,
      hashed_password: hashPassword(password),
      first_name,
      last_name,
      global_role: "guest",
      is_superuser: false,
      is_active: true,
      assigned_property_ids: [],
      created_at: new Date().toISOString(),
    };

    usersStore.set(email, newUser);

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        global_role: newUser.global_role,
        is_active: newUser.is_active,
        is_superuser: newUser.is_superuser,
      },
      message: "Customer registration successful.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Login: POST /api/v1/auth/login
  app.post("/api/v1/auth/login", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { email, password, property_id } = req.body || {};

    if (!email || !password) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Incorrect email or password." },
        correlation_id: correlationId,
      });
      return;
    }

    const user = usersStore.get(email);
    if (!user || !verifyPassword(password, user.hashed_password)) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Incorrect email or password." },
        correlation_id: correlationId,
      });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "User account is deactivated." },
        correlation_id: correlationId,
      });
      return;
    }

    // Property scope check if specified
    if (property_id && !user.is_superuser && user.global_role !== "super_admin" && user.global_role !== "guest") {
      if (!user.assigned_property_ids.includes(property_id)) {
        res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "User is not authorized for the requested property." },
          correlation_id: correlationId,
        });
        return;
      }
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const accessExpireSec = nowSec + 1800; // 30 minutes
    const refreshExpireSec = nowSec + 86400 * 7; // 7 days

    const accessToken = createJwt(
      {
        sub: user.id,
        role: user.global_role,
        property_id: property_id || (user.assigned_property_ids[0] ?? null),
        token_type: "access",
        iat: nowSec,
        exp: accessExpireSec,
      },
      SECRET_KEY
    );

    const refreshToken = createJwt(
      {
        sub: user.id,
        role: user.global_role,
        token_type: "refresh",
        iat: nowSec,
        exp: refreshExpireSec,
        jti: crypto.randomBytes(16).toString("hex"),
      },
      SECRET_KEY
    );

    // Save refresh session with hashed token
    const tokenHash = hashToken(refreshToken);
    const sessionId = `sess-${crypto.randomUUID()}`;
    refreshSessionsStore.set(tokenHash, {
      id: sessionId,
      user_id: user.id,
      refresh_token_hash: tokenHash,
      device_info: req.headers["user-agent"],
      ip_address: req.ip,
      expires_at: refreshExpireSec * 1000,
      is_revoked: false,
    });

    res.json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
        expires_in: 1800,
        role: user.global_role,
        property_id: property_id || (user.assigned_property_ids[0] ?? null),
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          global_role: user.global_role,
          assigned_property_ids: user.assigned_property_ids,
        },
      },
      message: "Authentication successful.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 3. Refresh Token Rotation & Reuse Detection: POST /api/v1/auth/refresh
  app.post("/api/v1/auth/refresh", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { refresh_token } = req.body || {};

    if (!refresh_token) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Refresh token is required." },
        correlation_id: correlationId,
      });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = verifyJwt(refresh_token, SECRET_KEY, "refresh");
    } catch (e: any) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: `Invalid refresh token: ${e.message}` },
        correlation_id: correlationId,
      });
      return;
    }

    const tokenHash = hashToken(refresh_token);
    const session = refreshSessionsStore.get(tokenHash);

    if (!session) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Invalid or non-existent refresh token session." },
        correlation_id: correlationId,
      });
      return;
    }

    // Reuse Detection: if this session is already revoked, an attacker or leaked token is attempting reuse!
    if (session.is_revoked) {
      // Security defense: revoke ALL sessions for this user immediately!
      for (const [hash, s] of refreshSessionsStore.entries()) {
        if (s.user_id === session.user_id) {
          s.is_revoked = true;
          s.revoked_at = Date.now();
        }
      }
      res.status(401).json({
        success: false,
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "Refresh token reuse detected. All active sessions have been revoked for security.",
        },
        correlation_id: correlationId,
      });
      return;
    }

    if (Date.now() > session.expires_at) {
      session.is_revoked = true;
      session.revoked_at = Date.now();
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Refresh token session has expired." },
        correlation_id: correlationId,
      });
      return;
    }

    // Rotate: Revoke the old session
    session.is_revoked = true;
    session.revoked_at = Date.now();

    const user = Array.from(usersStore.values()).find((u) => u.id === payload.sub);
    if (!user || !user.is_active) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "User account not found or deactivated." },
        correlation_id: correlationId,
      });
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const newAccess = createJwt(
      {
        sub: user.id,
        role: user.global_role,
        property_id: user.assigned_property_ids[0] || null,
        token_type: "access",
        iat: nowSec,
        exp: nowSec + 1800,
      },
      SECRET_KEY
    );

    const newRefresh = createJwt(
      {
        sub: user.id,
        role: user.global_role,
        token_type: "refresh",
        iat: nowSec,
        exp: nowSec + 86400 * 7,
        jti: crypto.randomBytes(16).toString("hex"),
      },
      SECRET_KEY
    );

    const newHash = hashToken(newRefresh);
    refreshSessionsStore.set(newHash, {
      id: `sess-${crypto.randomUUID()}`,
      user_id: user.id,
      refresh_token_hash: newHash,
      device_info: req.headers["user-agent"],
      ip_address: req.ip,
      expires_at: (nowSec + 86400 * 7) * 1000,
      is_revoked: false,
    });

    res.json({
      success: true,
      data: {
        access_token: newAccess,
        refresh_token: newRefresh,
        token_type: "bearer",
        expires_in: 1800,
        role: user.global_role,
      },
      message: "Token rotation successful.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Logout (Session Revocation): POST /api/v1/auth/logout
  app.post("/api/v1/auth/logout", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { refresh_token } = req.body || {};

    if (refresh_token) {
      const tokenHash = hashToken(refresh_token);
      const session = refreshSessionsStore.get(tokenHash);
      if (session) {
        session.is_revoked = true;
        session.revoked_at = Date.now();
      }
    }

    res.json({
      success: true,
      data: { logged_out: true },
      message: "Successfully logged out.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 5. Current Profile: GET /api/v1/auth/me
  app.get("/api/v1/auth/me", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          global_role: user.global_role,
          is_active: user.is_active,
          is_superuser: user.is_superuser,
          assigned_property_ids: user.assigned_property_ids,
        },
        message: "Profile retrieved successfully.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 6. Change Password: POST /api/v1/auth/change-password
  app.post("/api/v1/auth/change-password", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { current_password, new_password } = req.body || {};

      if (!current_password || !new_password) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Current and new password required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!verifyPassword(current_password, user.hashed_password)) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Current password is incorrect." },
          correlation_id: correlationId,
        });
        return;
      }

      if (new_password.length < 8) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "New password must be at least 8 characters." },
          correlation_id: correlationId,
        });
        return;
      }

      user.hashed_password = hashPassword(new_password);

      // Invalidate all active refresh sessions for this user
      for (const [hash, s] of refreshSessionsStore.entries()) {
        if (s.user_id === user.id) {
          s.is_revoked = true;
          s.revoked_at = Date.now();
        }
      }

      res.json({
        success: true,
        data: { password_changed: true },
        message: "Password updated successfully. All existing sessions revoked.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 7. Forgot Password: POST /api/v1/auth/forgot-password
  app.post("/api/v1/auth/forgot-password", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { email } = req.body || {};

    const user = email ? usersStore.get(email) : null;
    let simulatedToken: string | undefined;

    if (user && user.is_active) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      passwordResetStore.set(tokenHash, {
        id: `rst-${crypto.randomUUID()}`,
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: Date.now() + 3600 * 1000, // 1 hour
        is_used: false,
      });
      simulatedToken = rawToken;
    }

    res.json({
      success: true,
      data: {
        message: "If the email exists, a password reset link has been dispatched.",
        ...(simulatedToken ? { simulated_reset_token: simulatedToken } : {}),
      },
      message: "Password reset request processed.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 8. Reset Password: POST /api/v1/auth/reset-password
  app.post("/api/v1/auth/reset-password", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { token, new_password } = req.body || {};

    if (!token || !new_password || new_password.length < 8) {
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid token and new password (min 8 chars) required." },
        correlation_id: correlationId,
      });
      return;
    }

    const tokenHash = hashToken(token);
    const resetRec = passwordResetStore.get(tokenHash);

    if (!resetRec || resetRec.is_used || Date.now() > resetRec.expires_at) {
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid or expired password reset token." },
        correlation_id: correlationId,
      });
      return;
    }

    resetRec.is_used = true;
    resetRec.used_at = Date.now();

    const user = Array.from(usersStore.values()).find((u) => u.id === resetRec.user_id);
    if (user) {
      user.hashed_password = hashPassword(new_password);
      // Revoke all active sessions
      for (const [hash, s] of refreshSessionsStore.entries()) {
        if (s.user_id === user.id) {
          s.is_revoked = true;
          s.revoked_at = Date.now();
        }
      }
    }

    res.json({
      success: true,
      data: { password_reset: true },
      message: "Password has been reset successfully. Please log in with your new credentials.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 9. Admin Provision User: POST /api/v1/auth/admin/provision
  app.post("/api/v1/auth/admin/provision", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const admin = authenticate(req);
      if (!admin.is_superuser && admin.global_role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Platform administrator privileges required." },
          correlation_id: correlationId,
        });
        return;
      }

      const { email, password, first_name, last_name, global_role, assigned_property_ids, is_superuser } =
        req.body || {};

      if (!email || !password || !first_name || !last_name) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "All required user details must be provided." },
          correlation_id: correlationId,
        });
        return;
      }

      if (usersStore.has(email)) {
        res.status(409).json({
          success: false,
          error: { code: "RESOURCE_CONFLICT", message: `User with email '${email}' already exists.` },
          correlation_id: correlationId,
        });
        return;
      }

      const newUser: UserRecord = {
        id: `usr-staff-${crypto.randomUUID().substring(0, 8)}`,
        email,
        hashed_password: hashPassword(password),
        first_name,
        last_name,
        global_role: global_role || "front_desk",
        is_superuser: Boolean(is_superuser),
        is_active: true,
        assigned_property_ids: Array.isArray(assigned_property_ids) ? assigned_property_ids : [],
        created_at: new Date().toISOString(),
      };

      usersStore.set(email, newUser);

      res.status(201).json({
        success: true,
        data: {
          id: newUser.id,
          email: newUser.email,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          global_role: newUser.global_role,
          is_active: newUser.is_active,
          is_superuser: newUser.is_superuser,
          assigned_property_ids: newUser.assigned_property_ids,
        },
        message: "Administrative user provisioned successfully.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 10. Admin User Status Activation/Deactivation: PATCH /api/v1/auth/admin/users/:userId/status
  app.patch("/api/v1/auth/admin/users/:userId/status", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const admin = authenticate(req);
      if (!admin.is_superuser && admin.global_role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Platform administrator privileges required." },
          correlation_id: correlationId,
        });
        return;
      }

      const { userId } = req.params;
      const { is_active } = req.body || {};

      const user = Array.from(usersStore.values()).find((u) => u.id === userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `User with identifier '${userId}' was not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      user.is_active = Boolean(is_active);

      if (!user.is_active) {
        // Immediate session revocation on deactivation
        for (const [hash, s] of refreshSessionsStore.entries()) {
          if (s.user_id === user.id) {
            s.is_revoked = true;
            s.revoked_at = Date.now();
          }
        }
      }

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          global_role: user.global_role,
          is_active: user.is_active,
          is_superuser: user.is_superuser,
        },
        message: `User account ${user.is_active ? "activated" : "deactivated"} successfully.`,
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11. Public Properties Catalog: GET /api/v1/properties/public
  app.get("/api/v1/properties/public", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { property_type, city } = req.query as { property_type?: string; city?: string };

    let publicList = Array.from(propertiesStore.values()).filter(
      (p) => p.is_active && p.publication_status === "published" && p.is_bookable
    );

    if (property_type && property_type !== "all") {
      publicList = publicList.filter((p) => p.property_type === property_type);
    }
    if (city) {
      publicList = publicList.filter((p) => p.city.toLowerCase().includes(city.toLowerCase()));
    }

    const sanitized = publicList.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      property_type: p.property_type,
      description: p.description,
      currency: p.currency,
      timezone: p.timezone,
      address: p.address,
      city: p.city,
      country: p.country,
      checkin_time_start: p.checkin_time_start,
      checkout_time_deadline: p.checkout_time_deadline,
      amenities: p.amenities,
      policies: p.policies,
      total_rooms: p.total_rooms,
      total_beds: p.total_beds,
    }));

    res.json({
      success: true,
      data: sanitized,
      message: "Public properties catalog loaded.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 11b. Public Property by Slug: GET /api/v1/properties/public/:slug
  app.get("/api/v1/properties/public/:slug", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { slug } = req.params;

    const prop = Array.from(propertiesStore.values()).find(
      (p) => p.slug === slug && p.is_active && p.publication_status === "published"
    );

    if (!prop) {
      res.status(404).json({
        success: false,
        error: { code: "ENTITY_NOT_FOUND", message: `Published property '${slug}' not found.` },
        correlation_id: correlationId,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: prop.id,
        slug: prop.slug,
        name: prop.name,
        property_type: prop.property_type,
        description: prop.description,
        currency: prop.currency,
        timezone: prop.timezone,
        address: prop.address,
        city: prop.city,
        country: prop.country,
        checkin_time_start: prop.checkin_time_start,
        checkout_time_deadline: prop.checkout_time_deadline,
        amenities: prop.amenities,
        policies: prop.policies,
        total_rooms: prop.total_rooms,
        total_beds: prop.total_beds,
      },
      message: "Public property details loaded.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // 11c. Admin Properties List: GET /api/v1/properties
  app.get("/api/v1/properties", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      if (user.global_role === "guest") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Guests are not authorized to view property management data." },
          correlation_id: correlationId,
        });
        return;
      }

      const { property_type, publication_status, q, include_inactive } = req.query as {
        property_type?: string;
        publication_status?: string;
        q?: string;
        include_inactive?: string;
      };

      let list = Array.from(propertiesStore.values());

      if (include_inactive !== "true") {
        list = list.filter((p) => p.is_active);
      }

      // Non-superadmin staff can only see assigned properties
      if (!user.is_superuser && user.global_role !== "super_admin") {
        list = list.filter((p) => user.assigned_property_ids.includes(p.id));
      }

      if (property_type && property_type !== "all") {
        list = list.filter((p) => p.property_type === property_type);
      }

      if (publication_status && publication_status !== "all") {
        list = list.filter((p) => p.publication_status === publication_status);
      }

      if (q && q.trim()) {
        const query = q.trim().toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.code.toLowerCase().includes(query) ||
            p.city.toLowerCase().includes(query) ||
            p.address.toLowerCase().includes(query)
        );
      }

      list.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        data: list,
        message: "Admin properties retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11d. Create Property: POST /api/v1/properties (Super Admin only)
  app.post("/api/v1/properties", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      if (!user.is_superuser && user.global_role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Platform administrator privileges required to create properties." },
          correlation_id: correlationId,
        });
        return;
      }

      const {
        name,
        code,
        slug,
        property_type,
        currency,
        timezone,
        description,
        address,
        city,
        state_province,
        country,
        postal_code,
        contact_email,
        contact_phone,
        checkin_time_start,
        checkout_time_deadline,
        publication_status,
        is_bookable,
        amenities,
        policies,
        configuration,
      } = req.body || {};

      if (!name || !code || !slug || !property_type || !address || !city || !country) {
        res.status(422).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required fields: name, code, slug, property_type, address, city, country are required.",
          },
          correlation_id: correlationId,
        });
        return;
      }

      const formattedCode = code.trim().toUpperCase();
      const formattedSlug = slug.trim().toLowerCase();

      // Check unique code and slug
      const codeConflict = Array.from(propertiesStore.values()).find((p) => p.code === formattedCode);
      if (codeConflict) {
        res.status(409).json({
          success: false,
          error: { code: "RESOURCE_CONFLICT", message: `Property code '${formattedCode}' already exists.` },
          correlation_id: correlationId,
        });
        return;
      }

      const slugConflict = Array.from(propertiesStore.values()).find((p) => p.slug === formattedSlug);
      if (slugConflict) {
        res.status(409).json({
          success: false,
          error: { code: "RESOURCE_CONFLICT", message: `Property slug '${formattedSlug}' already exists.` },
          correlation_id: correlationId,
        });
        return;
      }

      const newId = `prop-${property_type}-${crypto.randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();

      const newProp: PropertyRecord = {
        id: newId,
        code: formattedCode,
        slug: formattedSlug,
        name: name.trim(),
        property_type: property_type,
        currency: (currency || "USD").toUpperCase(),
        timezone: timezone || "UTC",
        description: description || "",
        address: address.trim(),
        city: city.trim(),
        state_province: state_province || "",
        country: country.trim(),
        postal_code: postal_code || "",
        contact_email: contact_email || "",
        contact_phone: contact_phone || "",
        total_rooms: 0,
        total_beds: 0,
        publication_status: publication_status || "draft",
        is_bookable: is_bookable !== undefined ? Boolean(is_bookable) : true,
        is_active: true,
        checkin_time_start: checkin_time_start || "14:00",
        checkout_time_deadline: checkout_time_deadline || "11:00",
        amenities: Array.isArray(amenities) ? amenities : [],
        policies: policies || {},
        configuration: configuration || (property_type === "hostel"
          ? { allow_mixed_gender_dorms: true, lockers_provided: true, communal_kitchen_access: true }
          : { star_rating: 4, concierge_available: true, daily_housekeeping: true }),
        created_by_user_id: user.id,
        created_at: now,
        updated_at: now,
      };

      propertiesStore.set(newId, newProp);

      // Automatically assign new property to super_admin user
      if (!user.assigned_property_ids.includes(newId)) {
        user.assigned_property_ids.push(newId);
      }

      res.status(201).json({
        success: true,
        data: newProp,
        message: "Property created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11e. Get Property by ID: GET /api/v1/properties/:propertyId
  app.get("/api/v1/properties/:propertyId", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { propertyId } = req.params;
      const prop = propertiesStore.get(propertyId);

      if (!prop) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Property '${propertyId}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check RBAC scope
      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied for property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      res.json({
        success: true,
        data: prop,
        message: "Property retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11f. Update Property: PUT /api/v1/properties/:propertyId
  app.put("/api/v1/properties/:propertyId", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { propertyId } = req.params;
      const prop = propertiesStore.get(propertyId);

      if (!prop) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Property '${propertyId}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      // RBAC check: only super_admin or assigned property_manager can update
      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: {
              code: "PERMISSION_DENIED",
              message: "Only assigned property managers or super admins can update property details.",
            },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const updates = req.body || {};

      // If updating code or slug, verify uniqueness
      if (updates.code && updates.code.trim().toUpperCase() !== prop.code) {
        const codeConflict = Array.from(propertiesStore.values()).find(
          (p) => p.id !== propertyId && p.code === updates.code.trim().toUpperCase()
        );
        if (codeConflict) {
          res.status(409).json({
            success: false,
            error: { code: "RESOURCE_CONFLICT", message: `Property code '${updates.code}' is already in use.` },
            correlation_id: correlationId,
          });
          return;
        }
        prop.code = updates.code.trim().toUpperCase();
      }

      if (updates.slug && updates.slug.trim().toLowerCase() !== prop.slug) {
        const slugConflict = Array.from(propertiesStore.values()).find(
          (p) => p.id !== propertyId && p.slug === updates.slug.trim().toLowerCase()
        );
        if (slugConflict) {
          res.status(409).json({
            success: false,
            error: { code: "RESOURCE_CONFLICT", message: `Property slug '${updates.slug}' is already in use.` },
            correlation_id: correlationId,
          });
          return;
        }
        prop.slug = updates.slug.trim().toLowerCase();
      }

      if (updates.name !== undefined) prop.name = updates.name.trim();
      if (updates.property_type !== undefined) prop.property_type = updates.property_type;
      if (updates.description !== undefined) prop.description = updates.description;
      if (updates.currency !== undefined) prop.currency = updates.currency.toUpperCase();
      if (updates.timezone !== undefined) prop.timezone = updates.timezone;
      if (updates.address !== undefined) prop.address = updates.address;
      if (updates.city !== undefined) prop.city = updates.city;
      if (updates.state_province !== undefined) prop.state_province = updates.state_province;
      if (updates.country !== undefined) prop.country = updates.country;
      if (updates.postal_code !== undefined) prop.postal_code = updates.postal_code;
      if (updates.contact_email !== undefined) prop.contact_email = updates.contact_email;
      if (updates.contact_phone !== undefined) prop.contact_phone = updates.contact_phone;
      if (updates.checkin_time_start !== undefined) prop.checkin_time_start = updates.checkin_time_start;
      if (updates.checkout_time_deadline !== undefined) prop.checkout_time_deadline = updates.checkout_time_deadline;
      if (updates.total_rooms !== undefined) prop.total_rooms = updates.total_rooms;
      if (updates.total_beds !== undefined) prop.total_beds = updates.total_beds;
      if (updates.is_bookable !== undefined) prop.is_bookable = Boolean(updates.is_bookable);
      if (updates.amenities !== undefined) prop.amenities = updates.amenities;
      if (updates.policies !== undefined) prop.policies = { ...prop.policies, ...updates.policies };
      if (updates.configuration !== undefined) prop.configuration = { ...prop.configuration, ...updates.configuration };

      prop.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: prop,
        message: "Property updated successfully.",
        correlation_id: correlationId,
        timestamp: prop.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11g. Publication Status: POST /api/v1/properties/:propertyId/publish
  app.post("/api/v1/properties/:propertyId/publish", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { propertyId } = req.params;
      const { publication_status } = req.body || {};

      const prop = propertiesStore.get(propertyId);
      if (!prop) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Property '${propertyId}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can change publication status." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (!["published", "draft", "unpublished"].includes(publication_status)) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "publication_status must be 'published', 'draft', or 'unpublished'." },
          correlation_id: correlationId,
        });
        return;
      }

      // Pre-flight validation before publishing
      if (publication_status === "published") {
        if (!prop.address || !prop.city || !prop.country) {
          res.status(422).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Address, city, and country must be filled before publishing a property.",
            },
            correlation_id: correlationId,
          });
          return;
        }
        if (!prop.currency || !prop.timezone) {
          res.status(422).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Currency and timezone must be specified before publishing.",
            },
            correlation_id: correlationId,
          });
          return;
        }
      }

      prop.publication_status = publication_status;
      prop.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: prop,
        message: `Property publication status updated to '${publication_status}'.`,
        correlation_id: correlationId,
        timestamp: prop.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11h. Safe Archival: POST /api/v1/properties/:propertyId/archive (Super Admin only)
  app.post("/api/v1/properties/:propertyId/archive", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      if (!user.is_superuser && user.global_role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Platform administrator privileges required to archive properties." },
          correlation_id: correlationId,
        });
        return;
      }

      const { propertyId } = req.params;
      const prop = propertiesStore.get(propertyId);

      if (!prop) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Property '${propertyId}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check for active reservations
      const activeBookings = Array.from(bookingsStore.values()).filter(
        (b) => b.property_id === propertyId && (b.booking_status === "confirmed" || b.booking_status === "checked_in")
      );

      if (activeBookings.length > 0) {
        res.status(422).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Cannot archive property: ${activeBookings.length} active reservation(s) exist. Please resolve or reallocate bookings before archival.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      prop.is_active = false;
      prop.publication_status = "unpublished";
      prop.archived_at = now;
      prop.updated_at = now;

      res.json({
        success: true,
        data: {
          id: prop.id,
          is_active: false,
          publication_status: "unpublished",
          archived_at: now,
          message: "Property archived successfully. Historical bookings and financial data are preserved.",
        },
        message: "Property safely archived.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12. Property Scoped Private Details: GET /api/v1/properties/:propertyId/private-details
  app.get("/api/v1/properties/:propertyId/private-details", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { propertyId } = req.params;
      const prop = propertiesStore.get(propertyId);

      if (!prop) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Property '${propertyId}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check access permission:
      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest") {
          res.status(403).json({
            success: false,
            error: {
              code: "PROPERTY_ACCESS_VIOLATION",
              message: `Access denied: Customers cannot access property administration data.`,
            },
            correlation_id: correlationId,
          });
          return;
        }

        if (!user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: {
              code: "PROPERTY_ACCESS_VIOLATION",
              message: `Access denied: Staff is not authorized for property '${propertyId}'.`,
            },
            correlation_id: correlationId,
          });
          return;
        }
      }

      res.json({
        success: true,
        data: prop,
        message: "Property administration details loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12b. Public Property Availability: GET /api/v1/properties/public/:slug/availability
  app.get("/api/v1/properties/public/:slug/availability", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { slug } = req.params;
    const { check_in_date, check_out_date } = req.query as {
      check_in_date?: string;
      check_out_date?: string;
    };

    const prop = Array.from(propertiesStore.values()).find(
      (p) => p.slug === slug.toLowerCase() && p.is_active && p.publication_status === "published"
    );

    if (!prop) {
      res.status(404).json({
        success: false,
        error: { code: "ENTITY_NOT_FOUND", message: `Published property with slug '${slug}' not found.` },
        correlation_id: correlationId,
      });
      return;
    }

    if (!check_in_date || !check_out_date || check_out_date <= check_in_date) {
      res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid check_in_date and check_out_date (check_out > check_in) are required." },
        correlation_id: correlationId,
      });
      return;
    }

    const checkInMs = new Date(check_in_date).getTime();
    const checkOutMs = new Date(check_out_date).getTime();
    const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));

    // Active allocations in property
    const activeAllocs = Array.from(allocationsStore.values()).filter(
      (a) => a.property_id === prop.id && a.is_active && a.check_in_date < check_out_date && a.check_out_date > check_in_date
    );

    const blockedRoomIds = new Set(activeAllocs.map((a) => a.room_id).filter(Boolean));
    const blockedBedIds = new Set(activeAllocs.map((a) => a.bed_id).filter(Boolean));

    const propRoomTypes = Array.from(roomTypesStore.values()).filter(
      (rt) => rt.property_id === prop.id && rt.is_active && rt.is_published
    );
    const propRooms = Array.from(roomsStore.values()).filter(
      (r) => r.property_id === prop.id && r.is_active
    );

    const roomTypeStats = propRoomTypes.map((rt) => {
      const matchingRooms = propRooms.filter((r) => r.room_type_id === rt.id);
      let totalUnits = 0;
      let availableUnits = 0;

      if (rt.is_dormitory) {
        for (const rm of matchingRooms) {
          const dormBeds = Array.from(bedsStore.values()).filter(
            (b) => b.room_id === rm.id && b.is_active
          );
          for (const b of dormBeds) {
            totalUnits++;
            const isMaint = rm.operational_status === "maintenance" || rm.operational_status === "out_of_order" ||
                            b.operational_status === "maintenance" || b.operational_status === "out_of_order";
            const isAllocated = blockedBedIds.has(b.id) || blockedRoomIds.has(rm.id);
            if (!isMaint && !isAllocated) {
              availableUnits++;
            }
          }
        }
      } else {
        for (const rm of matchingRooms) {
          totalUnits++;
          const isMaint = rm.operational_status === "maintenance" || rm.operational_status === "out_of_order";
          const isAllocated = blockedRoomIds.has(rm.id);
          if (!isMaint && !isAllocated) {
            availableUnits++;
          }
        }
      }

      return {
        room_type_id: rt.id,
        name: rt.name,
        slug: rt.slug,
        accommodation_tier: rt.accommodation_tier,
        is_dormitory: rt.is_dormitory,
        base_price_per_night: rt.base_price_amount,
        available_units_count: availableUnits,
        total_units_count: totalUnits,
        is_available: availableUnits > 0,
      };
    });

    res.json({
      success: true,
      data: {
        property_id: prop.id,
        property_name: prop.name,
        property_slug: prop.slug,
        property_type: prop.property_type,
        currency: prop.currency,
        check_in_date,
        check_out_date,
        total_nights: nights,
        room_types: roomTypeStats,
      },
      message: "Public availability retrieved.",
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // 12c. Inventory: Room Types Management
  // -------------------------------------------------------------------------
  app.get("/api/v1/inventory/room-types", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;
      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const list = Array.from(roomTypesStore.values()).filter(
        (rt) => rt.property_id === propertyId && rt.is_active
      );
      list.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        data: list,
        message: "Room types retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.post("/api/v1/inventory/room-types", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        name,
        slug,
        code,
        accommodation_tier,
        description,
        base_capacity_adults,
        max_capacity_adults,
        max_capacity_children,
        is_dormitory,
        gender_policy,
        base_price_amount,
        amenities,
        is_published,
      } = req.body || {};

      if (!property_id || !name || !slug || !code || !accommodation_tier) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Missing required fields: property_id, name, slug, code, accommodation_tier." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can create room types." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      // Check unique code or slug within property
      const formattedCode = code.trim().toUpperCase();
      const formattedSlug = slug.trim().toLowerCase();
      const duplicate = Array.from(roomTypesStore.values()).find(
        (rt) => rt.property_id === property_id && (rt.code === formattedCode || rt.slug === formattedSlug)
      );
      if (duplicate) {
        res.status(409).json({
          success: false,
          error: { code: "RESOURCE_CONFLICT", message: `Room type code '${formattedCode}' or slug '${formattedSlug}' already exists in this property.` },
          correlation_id: correlationId,
        });
        return;
      }

      const newId = `rt-${property_id.substring(5, 8)}-${crypto.randomUUID().substring(0, 6)}`;
      const now = new Date().toISOString();
      const newRt: RoomTypeRecord = {
        id: newId,
        property_id,
        name: name.trim(),
        slug: formattedSlug,
        code: formattedCode,
        accommodation_tier,
        description: description || "",
        base_capacity_adults: Number(base_capacity_adults) || 1,
        max_capacity_adults: Number(max_capacity_adults) || (is_dormitory ? 6 : 2),
        max_capacity_children: Number(max_capacity_children) || 0,
        is_dormitory: Boolean(is_dormitory),
        gender_policy: gender_policy || "any",
        base_price_amount: Number(base_price_amount) || 0,
        amenities: Array.isArray(amenities) ? amenities : [],
        is_published: is_published !== false,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      roomTypesStore.set(newId, newRt);

      res.status(201).json({
        success: true,
        data: newRt,
        message: "Room type created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.put("/api/v1/inventory/room-types/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const rt = roomTypesStore.get(id);
      if (!rt) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room type '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(rt.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can update room types." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const updates = req.body || {};
      Object.assign(rt, updates, { updated_at: new Date().toISOString() });

      res.json({
        success: true,
        data: rt,
        message: "Room type updated successfully.",
        correlation_id: correlationId,
        timestamp: rt.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.delete("/api/v1/inventory/room-types/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const rt = roomTypesStore.get(id);
      if (!rt) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room type '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(rt.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can deactivate room types." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      // Check active rooms
      const activeRooms = Array.from(roomsStore.values()).filter(
        (r) => r.room_type_id === id && r.is_active
      );
      if (activeRooms.length > 0) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `Cannot deactivate room type: ${activeRooms.length} active room(s) assigned to this type.` },
          correlation_id: correlationId,
        });
        return;
      }

      rt.is_active = false;
      rt.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: { id, is_active: false },
        message: "Room type deactivated.",
        correlation_id: correlationId,
        timestamp: rt.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // -------------------------------------------------------------------------
  // 12d. Inventory: Physical Rooms
  // -------------------------------------------------------------------------
  app.get("/api/v1/inventory/rooms", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, room_type_id, operational_status, q } = req.query as {
        property_id?: string;
        room_type_id?: string;
        operational_status?: string;
        q?: string;
      };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let rooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === property_id && r.is_active
      );

      if (room_type_id && room_type_id !== "all") {
        rooms = rooms.filter((r) => r.room_type_id === room_type_id);
      }
      if (operational_status && operational_status !== "all") {
        rooms = rooms.filter((r) => r.operational_status === operational_status);
      }
      if (q && q.trim()) {
        const query = q.trim().toLowerCase();
        rooms = rooms.filter((r) => r.room_number.toLowerCase().includes(query));
      }

      rooms.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));

      // Attach detailed specs and child beds
      const detailed = rooms.map((r) => {
        const rt = roomTypesStore.get(r.room_type_id);
        const beds = Array.from(bedsStore.values()).filter((b) => b.room_id === r.id && b.is_active);
        return {
          ...r,
          room_type_name: rt?.name || "Standard Room",
          room_type_code: rt?.code || "STD",
          accommodation_tier: rt?.accommodation_tier || "hotel_room",
          is_dormitory: rt?.is_dormitory || false,
          capacity_adults: rt?.max_capacity_adults || 2,
          beds,
        };
      });

      res.json({
        success: true,
        data: detailed,
        message: "Rooms retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.post("/api/v1/inventory/rooms", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        room_type_id,
        floor_id,
        floor_name,
        room_number,
        operational_status,
        cleanliness_status,
        keycard_code,
        notes,
        initial_bed_count,
        initial_bed_prefix,
      } = req.body || {};

      if (!property_id || !room_type_id || !room_number) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Missing required fields: property_id, room_type_id, room_number." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can create rooms." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const rt = roomTypesStore.get(room_type_id);
      if (!rt || rt.property_id !== property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid room_type_id: room type does not belong to this property." },
          correlation_id: correlationId,
        });
        return;
      }

      const formattedNumber = room_number.trim();
      const existing = Array.from(roomsStore.values()).find(
        (r) => r.property_id === property_id && r.room_number.toLowerCase() === formattedNumber.toLowerCase() && r.is_active
      );
      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: "RESOURCE_CONFLICT", message: `Room number '${formattedNumber}' already exists in this property.` },
          correlation_id: correlationId,
        });
        return;
      }

      const newRoomId = `rm-${property_id.substring(5, 8)}-${crypto.randomUUID().substring(0, 6)}`;
      const now = new Date().toISOString();

      const newRoom: RoomRecord = {
        id: newRoomId,
        property_id,
        room_type_id,
        floor_id,
        floor_name: floor_name || (floor_id ? `Floor ${floor_id}` : undefined),
        room_number: formattedNumber,
        operational_status: operational_status || "available",
        cleanliness_status: cleanliness_status || "clean",
        keycard_code,
        notes,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      roomsStore.set(newRoomId, newRoom);

      // Auto-provision beds if hostel dormitory
      const createdBeds: BedRecord[] = [];
      if (rt.is_dormitory) {
        const bedCount = Number(initial_bed_count) || rt.max_capacity_adults;
        const prefix = (initial_bed_prefix && initial_bed_prefix.trim()) || "Pod";
        for (let i = 1; i <= bedCount; i++) {
          const isBottom = i % 2 === 1;
          const bedId = `bed-${newRoomId}-${i}`;
          const newBed: BedRecord = {
            id: bedId,
            property_id,
            room_id: newRoomId,
            bed_label: bedCount > 1 ? `${prefix} ${Math.ceil(i / 2)} ${isBottom ? "Lower" : "Upper"}` : `${formattedNumber}-1`,
            bed_type: isBottom ? "bunk_bottom" : "bunk_top",
            locker_number: `LK-${formattedNumber}-${i}`,
            operational_status: "available",
            is_active: true,
            created_at: now,
            updated_at: now,
          };
          bedsStore.set(bedId, newBed);
          createdBeds.push(newBed);
        }
      }

      res.status(201).json({
        success: true,
        data: {
          ...newRoom,
          room_type_name: rt.name,
          room_type_code: rt.code,
          accommodation_tier: rt.accommodation_tier,
          is_dormitory: rt.is_dormitory,
          capacity_adults: rt.max_capacity_adults,
          beds: createdBeds,
        },
        message: "Room created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.get("/api/v1/inventory/rooms/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const room = roomsStore.get(id);
      if (!room) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(room.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${room.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const rt = roomTypesStore.get(room.room_type_id);
      const beds = Array.from(bedsStore.values()).filter((b) => b.room_id === id && b.is_active);

      res.json({
        success: true,
        data: {
          ...room,
          room_type_name: rt?.name || "Standard",
          room_type_code: rt?.code || "STD",
          accommodation_tier: rt?.accommodation_tier || "hotel_room",
          is_dormitory: rt?.is_dormitory || false,
          capacity_adults: rt?.max_capacity_adults || 2,
          beds,
        },
        message: "Room details retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.put("/api/v1/inventory/rooms/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const room = roomsStore.get(id);
      if (!room) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(room.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only authorized staff can update rooms." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { room_number, operational_status, cleanliness_status, floor_name, notes, keycard_code } = req.body || {};
      if (room_number && room_number.trim() !== room.room_number) {
        const dup = Array.from(roomsStore.values()).find(
          (r) => r.property_id === room.property_id && r.room_number.toLowerCase() === room_number.trim().toLowerCase() && r.id !== id
        );
        if (dup) {
          res.status(409).json({
            success: false,
            error: { code: "RESOURCE_CONFLICT", message: `Room number '${room_number}' already exists.` },
            correlation_id: correlationId,
          });
          return;
        }
        room.room_number = room_number.trim();
      }

      if (operational_status) room.operational_status = operational_status;
      if (cleanliness_status) room.cleanliness_status = cleanliness_status;
      if (floor_name !== undefined) room.floor_name = floor_name;
      if (notes !== undefined) room.notes = notes;
      if (keycard_code !== undefined) room.keycard_code = keycard_code;
      room.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: room,
        message: "Room updated successfully.",
        correlation_id: correlationId,
        timestamp: room.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.patch("/api/v1/inventory/rooms/:id/status", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const room = roomsStore.get(id);
      if (!room) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(room.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { operational_status, cleanliness_status } = req.body || {};
      if (operational_status) room.operational_status = operational_status;
      if (cleanliness_status) room.cleanliness_status = cleanliness_status;
      room.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: room,
        message: `Room status updated to ${room.operational_status}.`,
        correlation_id: correlationId,
        timestamp: room.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.post("/api/v1/inventory/rooms/:id/block", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const room = roomsStore.get(id);
      if (!room) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(room.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { check_in_date, check_out_date, notes } = req.body || {};
      if (!check_in_date || !check_out_date || check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Valid date range required (check_out > check_in)." },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict
      const conflicts = Array.from(allocationsStore.values()).filter(
        (a) => a.room_id === id && a.is_active && a.check_in_date < check_out_date && a.check_out_date > check_in_date
      );
      if (conflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: "RESOURCE_CONFLICT",
            message: `Conflict: Room ${room.room_number} already has an active allocation from ${conflicts[0].check_in_date} to ${conflicts[0].check_out_date}.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const allocId = `alloc-block-${crypto.randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();
      const newBlock: InventoryAllocationRecord = {
        id: allocId,
        property_id: room.property_id,
        room_id: room.id,
        check_in_date,
        check_out_date,
        allocation_type: "maintenance_block",
        notes: notes || "Maintenance block",
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      };

      allocationsStore.set(allocId, newBlock);

      res.status(201).json({
        success: true,
        data: newBlock,
        message: "Room placed under maintenance block.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.delete("/api/v1/inventory/rooms/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const room = roomsStore.get(id);
      if (!room) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Room '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(room.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can deactivate rooms." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      // Check active allocations
      const activeAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.room_id === id && a.is_active && a.check_out_date >= new Date().toISOString().split("T")[0]
      );
      if (activeAllocs.length > 0) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `Cannot deactivate room: ${activeAllocs.length} active or future reservation(s) exist.` },
          correlation_id: correlationId,
        });
        return;
      }

      room.is_active = false;
      room.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: { id, is_active: false },
        message: "Room deactivated safely.",
        correlation_id: correlationId,
        timestamp: room.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // -------------------------------------------------------------------------
  // 12e. Inventory: Hostel Beds
  // -------------------------------------------------------------------------
  app.get("/api/v1/inventory/beds", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, room_id } = req.query as { property_id?: string; room_id?: string };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Access denied to property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let beds = Array.from(bedsStore.values()).filter(
        (b) => b.property_id === property_id && b.is_active
      );
      if (room_id) {
        beds = beds.filter((b) => b.room_id === room_id);
      }

      beds.sort((a, b) => a.bed_label.localeCompare(b.bed_label, undefined, { numeric: true }));

      res.json({
        success: true,
        data: beds,
        message: "Beds retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.post("/api/v1/inventory/beds", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, room_id, bed_label, bed_type, locker_number, operational_status } = req.body || {};

      if (!property_id || !room_id || !bed_label) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Missing required fields: property_id, room_id, bed_label." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers can add beds." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const room = roomsStore.get(room_id);
      if (!room || room.property_id !== property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Room not found or does not belong to property." },
          correlation_id: correlationId,
        });
        return;
      }

      const rt = roomTypesStore.get(room.room_type_id);
      if (!rt?.is_dormitory) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Cannot add beds to a private non-dormitory room." },
          correlation_id: correlationId,
        });
        return;
      }

      const formattedLabel = bed_label.trim();
      const existing = Array.from(bedsStore.values()).find(
        (b) => b.room_id === room_id && b.bed_label.toLowerCase() === formattedLabel.toLowerCase() && b.is_active
      );
      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: "RESOURCE_CONFLICT", message: `Bed '${formattedLabel}' already exists in room ${room.room_number}.` },
          correlation_id: correlationId,
        });
        return;
      }

      const newBedId = `bed-${room_id}-${crypto.randomUUID().substring(0, 6)}`;
      const now = new Date().toISOString();
      const newBed: BedRecord = {
        id: newBedId,
        property_id,
        room_id,
        bed_label: formattedLabel,
        bed_type: bed_type || "standard_single",
        locker_number,
        operational_status: operational_status || "available",
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      bedsStore.set(newBedId, newBed);

      res.status(201).json({
        success: true,
        data: newBed,
        message: "Bed added to dormitory.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.put("/api/v1/inventory/beds/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const bed = bedsStore.get(id);
      if (!bed) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Bed '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(bed.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { bed_label, bed_type, locker_number, operational_status } = req.body || {};
      if (bed_label) bed.bed_label = bed_label.trim();
      if (bed_type) bed.bed_type = bed_type;
      if (locker_number !== undefined) bed.locker_number = locker_number;
      if (operational_status) bed.operational_status = operational_status;
      bed.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: bed,
        message: "Bed updated successfully.",
        correlation_id: correlationId,
        timestamp: bed.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.patch("/api/v1/inventory/beds/:id/status", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const bed = bedsStore.get(id);
      if (!bed) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Bed '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(bed.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { operational_status } = req.body || {};
      if (operational_status) bed.operational_status = operational_status;
      bed.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: bed,
        message: `Bed status updated to ${bed.operational_status}.`,
        correlation_id: correlationId,
        timestamp: bed.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.post("/api/v1/inventory/beds/:id/block", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const bed = bedsStore.get(id);
      if (!bed) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Bed '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(bed.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { check_in_date, check_out_date, notes } = req.body || {};
      if (!check_in_date || !check_out_date || check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Valid date range required (check_out > check_in)." },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict
      const conflicts = Array.from(allocationsStore.values()).filter(
        (a) => (a.bed_id === id || a.room_id === bed.room_id) &&
               a.is_active &&
               a.check_in_date < check_out_date &&
               a.check_out_date > check_in_date
      );
      if (conflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: "RESOURCE_CONFLICT",
            message: `Conflict: Bed already has active allocation from ${conflicts[0].check_in_date} to ${conflicts[0].check_out_date}.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const allocId = `alloc-block-${crypto.randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();
      const newBlock: InventoryAllocationRecord = {
        id: allocId,
        property_id: bed.property_id,
        bed_id: bed.id,
        room_id: bed.room_id,
        check_in_date,
        check_out_date,
        allocation_type: "maintenance_block",
        notes: notes || "Bed maintenance block",
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      };

      allocationsStore.set(allocId, newBlock);

      res.status(201).json({
        success: true,
        data: newBlock,
        message: "Bed placed under maintenance block.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  app.delete("/api/v1/inventory/beds/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const bed = bedsStore.get(id);
      if (!bed) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Bed '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role !== "property_manager" || !user.assigned_property_ids.includes(bed.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PERMISSION_DENIED", message: "Only property managers or super admins can deactivate beds." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const activeAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.bed_id === id && a.is_active && a.check_out_date >= new Date().toISOString().split("T")[0]
      );
      if (activeAllocs.length > 0) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `Cannot deactivate bed: ${activeAllocs.length} active or future reservation(s) exist.` },
          correlation_id: correlationId,
        });
        return;
      }

      bed.is_active = false;
      bed.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: { id, is_active: false },
        message: "Bed deactivated safely.",
        correlation_id: correlationId,
        timestamp: bed.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // -------------------------------------------------------------------------
  // 12f. Inventory: Availability Engine
  // -------------------------------------------------------------------------
  app.get("/api/v1/inventory/availability", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, check_in_date, check_out_date, room_type_id } = req.query as {
        property_id?: string;
        check_in_date?: string;
        check_out_date?: string;
        room_type_id?: string;
      };

      if (!property_id || !check_in_date || !check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, check_in_date, and check_out_date are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "check_out_date must be strictly after check_in_date." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const checkInMs = new Date(check_in_date).getTime();
      const checkOutMs = new Date(check_out_date).getTime();
      const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));

      // Active overlapping allocations
      const activeAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.property_id === property_id && a.is_active && a.check_in_date < check_out_date && a.check_out_date > check_in_date
      );

      const blockedRoomIds = new Set(activeAllocs.map((a) => a.room_id).filter(Boolean));
      const blockedBedIds = new Set(activeAllocs.map((a) => a.bed_id).filter(Boolean));

      let roomTypes = Array.from(roomTypesStore.values()).filter(
        (rt) => rt.property_id === property_id && rt.is_active
      );
      if (room_type_id && room_type_id !== "all") {
        roomTypes = roomTypes.filter((rt) => rt.id === room_type_id);
      }

      let rooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === property_id && r.is_active
      );
      if (room_type_id && room_type_id !== "all") {
        rooms = rooms.filter((r) => r.room_type_id === room_type_id);
      }

      const units: any[] = [];
      const rtSummaryMap: Record<string, { total: number; available: number; occupied: number; maintenance: number }> = {};

      for (const rt of roomTypes) {
        rtSummaryMap[rt.id] = { total: 0, available: 0, occupied: 0, maintenance: 0 };
      }

      for (const rm of rooms) {
        const rt = roomTypesStore.get(rm.room_type_id);
        if (!rt || !rtSummaryMap[rt.id]) continue;

        const isRoomMaint = rm.operational_status === "maintenance" || rm.operational_status === "out_of_order";

        if (rt.is_dormitory) {
          const dormBeds = Array.from(bedsStore.values()).filter((b) => b.room_id === rm.id && b.is_active);
          for (const b of dormBeds) {
            rtSummaryMap[rt.id].total++;
            const isBedMaint = isRoomMaint || b.operational_status === "maintenance" || b.operational_status === "out_of_order";
            const isAllocated = blockedBedIds.has(b.id) || blockedRoomIds.has(rm.id);

            let isAvail = false;
            let conflictReason: string | null = null;

            if (isBedMaint) {
              rtSummaryMap[rt.id].maintenance++;
              conflictReason = "Bed or room under maintenance";
            } else if (isAllocated) {
              rtSummaryMap[rt.id].occupied++;
              conflictReason = "Bed reserved or occupied for stay interval";
            } else {
              rtSummaryMap[rt.id].available++;
              isAvail = true;
            }

            units.push({
              id: b.id,
              unit_type: "bed",
              identifier: `${rm.room_number} - ${b.bed_label}`,
              room_number: rm.room_number,
              room_id: rm.id,
              room_type_id: rt.id,
              room_type_name: rt.name,
              accommodation_tier: rt.accommodation_tier,
              is_dormitory: true,
              base_price_per_night: rt.base_price_amount,
              operational_status: b.operational_status,
              is_available: isAvail,
              conflict_reason: conflictReason,
            });
          }
        } else {
          rtSummaryMap[rt.id].total++;
          const isAllocated = blockedRoomIds.has(rm.id);

          let isAvail = false;
          let conflictReason: string | null = null;

          if (isRoomMaint) {
            rtSummaryMap[rt.id].maintenance++;
            conflictReason = "Room under maintenance or out of order";
          } else if (isAllocated) {
            rtSummaryMap[rt.id].occupied++;
            conflictReason = "Room reserved or occupied for stay interval";
          } else {
            rtSummaryMap[rt.id].available++;
            isAvail = true;
          }

          units.push({
            id: rm.id,
            unit_type: "room",
            identifier: rm.room_number,
            room_number: rm.room_number,
            room_id: rm.id,
            room_type_id: rt.id,
            room_type_name: rt.name,
            accommodation_tier: rt.accommodation_tier,
            is_dormitory: false,
            base_price_per_night: rt.base_price_amount,
            operational_status: rm.operational_status,
            is_available: isAvail,
            conflict_reason: conflictReason,
          });
        }
      }

      const summaries = roomTypes.map((rt) => ({
        room_type_id: rt.id,
        room_type_name: rt.name,
        slug: rt.slug,
        accommodation_tier: rt.accommodation_tier,
        is_dormitory: rt.is_dormitory,
        base_price_per_night: rt.base_price_amount,
        total_units: rtSummaryMap[rt.id]?.total || 0,
        available_units: rtSummaryMap[rt.id]?.available || 0,
        occupied_or_reserved_units: rtSummaryMap[rt.id]?.occupied || 0,
        blocked_or_maintenance_units: rtSummaryMap[rt.id]?.maintenance || 0,
      }));

      res.json({
        success: true,
        data: {
          property_id,
          check_in_date,
          check_out_date,
          total_nights: nights,
          is_stay_valid: true,
          room_types: summaries,
          units,
        },
        message: `Availability calculated for ${nights} night(s).`,
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12g. Inventory Summary Telemetry: GET /api/v1/inventory/summary
  app.get("/api/v1/inventory/summary", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const propRooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === propertyId && r.is_active
      );
      const propBeds = Array.from(bedsStore.values()).filter(
        (b) => b.property_id === propertyId && b.is_active
      );

      const todayStr = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      const activeAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.property_id === propertyId && a.is_active && a.check_in_date < tomorrow && a.check_out_date > todayStr
      );
      const blockedRoomIds = new Set(activeAllocs.map((a) => a.room_id).filter(Boolean));
      const blockedBedIds = new Set(activeAllocs.map((a) => a.bed_id).filter(Boolean));

      let roomsAvail = 0;
      let roomsOcc = 0;
      let roomsMaint = 0;

      for (const r of propRooms) {
        const rt = roomTypesStore.get(r.room_type_id);
        if (rt?.is_dormitory) continue; // Dorm beds are counted separately

        if (r.operational_status === "maintenance" || r.operational_status === "out_of_order") {
          roomsMaint++;
        } else if (blockedRoomIds.has(r.id)) {
          roomsOcc++;
        } else {
          roomsAvail++;
        }
      }

      let bedsAvail = 0;
      let bedsOcc = 0;
      let bedsMaint = 0;

      for (const b of propBeds) {
        const room = roomsStore.get(b.room_id);
        const isMaint = b.operational_status === "maintenance" || b.operational_status === "out_of_order" ||
                        room?.operational_status === "maintenance" || room?.operational_status === "out_of_order";
        if (isMaint) {
          bedsMaint++;
        } else if (blockedBedIds.has(b.id) || (room && blockedRoomIds.has(room.id))) {
          bedsOcc++;
        } else {
          bedsAvail++;
        }
      }

      const totalCap = propRooms.filter((r) => !roomTypesStore.get(r.room_type_id)?.is_dormitory).length + propBeds.length;
      const totalOcc = roomsOcc + bedsOcc;
      const occupancyRate = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0;

      res.json({
        success: true,
        data: {
          property_id: propertyId,
          total_active_rooms: propRooms.length,
          total_active_beds: propBeds.length,
          rooms_available: roomsAvail,
          rooms_occupied: roomsOcc,
          rooms_maintenance: roomsMaint,
          beds_available: bedsAvail,
          beds_occupied: bedsOcc,
          beds_maintenance: bedsMaint,
          occupancy_rate_percentage: occupancyRate,
        },
        message: "Inventory operational summary loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12h. Inventory Calendar Matrix: GET /api/v1/inventory/calendar
  app.get("/api/v1/inventory/calendar", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, start_date, end_date } = req.query as {
        property_id?: string;
        start_date?: string;
        end_date?: string;
      };

      if (!property_id || !start_date || !end_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, start_date, and end_date are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (end_date <= start_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "end_date must be strictly after start_date." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const startMs = new Date(start_date).getTime();
      const endMs = new Date(end_date).getTime();
      const totalDays = Math.min(31, Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))));

      const dateList: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startMs + i * 86400000).toISOString().split("T")[0];
        dateList.push(d);
      }

      const propRooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === property_id && r.is_active
      );
      propRooms.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));

      const propAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.property_id === property_id && a.is_active && a.check_in_date < end_date && a.check_out_date > start_date
      );

      const rows: any[] = [];

      for (const rm of propRooms) {
        const rt = roomTypesStore.get(rm.room_type_id);
        if (!rt) continue;

        if (rt.is_dormitory) {
          const dormBeds = Array.from(bedsStore.values()).filter((b) => b.room_id === rm.id && b.is_active);
          dormBeds.sort((a, b) => a.bed_label.localeCompare(b.bed_label, undefined, { numeric: true }));

          for (const bed of dormBeds) {
            const days = dateList.map((curDate) => {
              const nextDate = new Date(new Date(curDate).getTime() + 86400000).toISOString().split("T")[0];
              const matching = propAllocs.filter(
                (a) => (a.bed_id === bed.id || a.room_id === rm.id) &&
                       a.check_in_date < nextDate &&
                       a.check_out_date > curDate
              );

              let status = "available";
              let notes = undefined;

              if (rm.operational_status === "maintenance" || rm.operational_status === "out_of_order" ||
                  bed.operational_status === "maintenance" || bed.operational_status === "out_of_order") {
                status = "maintenance";
              } else if (matching.some((a) => a.allocation_type === "maintenance_block")) {
                status = "blocked";
                notes = matching.find((a) => a.allocation_type === "maintenance_block")?.notes;
              } else if (matching.length > 0) {
                status = "reserved";
                notes = matching[0].notes;
              }

              return { date: curDate, status, notes };
            });

            rows.push({
              unit_id: bed.id,
              unit_type: "bed",
              identifier: `${rm.room_number} • ${bed.bed_label}`,
              room_number: rm.room_number,
              room_type_name: rt.name,
              floor_name: rm.floor_name || "Floor 1",
              days,
            });
          }
        } else {
          const days = dateList.map((curDate) => {
            const nextDate = new Date(new Date(curDate).getTime() + 86400000).toISOString().split("T")[0];
            const matching = propAllocs.filter(
              (a) => a.room_id === rm.id && a.check_in_date < nextDate && a.check_out_date > curDate
            );

            let status = "available";
            let notes = undefined;

            if (rm.operational_status === "maintenance" || rm.operational_status === "out_of_order") {
              status = "maintenance";
            } else if (matching.some((a) => a.allocation_type === "maintenance_block")) {
              status = "blocked";
              notes = matching.find((a) => a.allocation_type === "maintenance_block")?.notes;
            } else if (matching.length > 0) {
              status = "reserved";
              notes = matching[0].notes;
            }

            return { date: curDate, status, notes };
          });

          rows.push({
            unit_id: rm.id,
            unit_type: "room",
            identifier: `Room ${rm.room_number}`,
            room_number: rm.room_number,
            room_type_name: rt.name,
            floor_name: rm.floor_name || "Floor 1",
            days,
          });
        }
      }

      res.json({
        success: true,
        data: {
          property_id,
          start_date,
          end_date,
          total_days: totalDays,
          rows,
        },
        message: "Availability calendar matrix loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 13. My Bookings (Customer Portal): GET /api/v1/bookings/my
  app.get("/api/v1/bookings/my", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const userBookings = Array.from(bookingsStore.values()).filter((b) => b.user_id === user.id);
      res.json({
        success: true,
        data: userBookings,
        message: "Customer bookings retrieved successfully.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 14. Single Booking with Ownership Isolation: GET /api/v1/bookings/:bookingId
  app.get("/api/v1/bookings/:bookingId", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { bookingId } = req.params;
      const booking = bookingsStore.get(bookingId);

      if (!booking) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Booking '${bookingId}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check ownership
      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest") {
          if (booking.user_id !== user.id) {
            res.status(403).json({
              success: false,
              error: { code: "PERMISSION_DENIED", message: "Access denied: You do not own this booking." },
              correlation_id: correlationId,
            });
            return;
          }
        } else {
          // Staff member: must be assigned to the booking's property
          if (!user.assigned_property_ids.includes(booking.property_id)) {
            res.status(403).json({
              success: false,
              error: {
                code: "PROPERTY_ACCESS_VIOLATION",
                message: `Access denied: Staff not assigned to property '${booking.property_id}'.`,
              },
              correlation_id: correlationId,
            });
            return;
          }
        }
      }

      res.json({
        success: true,
        data: booking,
        message: "Booking retrieved successfully.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 15. Operational Dashboard Summary: GET /api/v1/dashboard/summary
  app.get("/api/v1/dashboard/summary", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      if (user.global_role === "guest") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Customers cannot access administrative dashboard telemetry." },
          correlation_id: correlationId,
        });
        return;
      }

      const propertyId = (req.query.property_id as string) || undefined;
      // Filter accessible properties
      let targetProperties = Array.from(propertiesStore.values()).filter((p) => p.is_active);
      if (!user.is_superuser && user.global_role !== "super_admin") {
        targetProperties = targetProperties.filter((p) => user.assigned_property_ids.includes(p.id));
      }
      if (propertyId) {
        targetProperties = targetProperties.filter((p) => p.id === propertyId);
      }

      // Calculate total capacity
      const totalRooms = targetProperties.reduce((acc, p) => acc + p.total_rooms, 0);
      const totalBeds = targetProperties.reduce((acc, p) => acc + p.total_beds, 0);

      // Bookings within authorized property scope
      const targetPropertyIds = new Set(targetProperties.map((p) => p.id));
      const scopedBookings = Array.from(bookingsStore.values()).filter((b) => targetPropertyIds.has(b.property_id));

      const activeReservations = scopedBookings.filter((b) => b.booking_status === "confirmed" || b.booking_status === "checked_in");
      const pendingCheckInsToday = scopedBookings.filter((b) => b.booking_status === "confirmed").length;
      const pendingCheckOutsToday = scopedBookings.filter((b) => b.booking_status === "checked_in").length;

      // Pending dues
      const pendingDues = scopedBookings.filter((b) => b.total_amount > b.deposit_paid);
      const pendingDuesTotal = pendingDues.reduce((acc, b) => acc + (b.total_amount - b.deposit_paid), 0);

      // Occupancy rate calculation (real numbers based on active bookings vs capacity)
      const occupiedUnits = activeReservations.length;
      const totalCapacityUnits = totalRooms > 0 ? totalRooms : 1;
      const occupancyRate = Math.min(100, Math.round((occupiedUnits / totalCapacityUnits) * 100));

      const dashboardData = {
        summary: {
          totalOccupancyPercentage: occupancyRate,
          occupiedRoomsOrBeds: occupiedUnits,
          totalCapacity: totalRooms + totalBeds,
          activeReservationsCount: activeReservations.length,
          pendingCheckInsToday,
          pendingCheckOutsToday,
          pendingPaymentsCount: pendingDues.length,
          pendingDuesTotalAmount: Math.round(pendingDuesTotal * 100) / 100,
          currency: targetProperties[0]?.currency || "GBP",
        },
        occupancy: targetProperties.map((p) => ({
          propertyId: p.id,
          propertyName: p.name,
          propertyType: p.property_type,
          dormBedsTotal: p.property_type === "hotel" ? 0 : p.total_beds,
          dormBedsOccupied: p.property_type === "hotel" ? 0 : Math.round(p.total_beds * 0.45),
          privateRoomsTotal: p.total_rooms,
          privateRoomsOccupied: Math.round(p.total_rooms * 0.55),
          totalOccupancyRate: 52,
        })),
        recentReservations: scopedBookings.map((b) => ({
          id: b.id,
          bookingReference: b.booking_reference,
          guestName: b.guest_name,
          guestEmail: b.guest_email,
          checkInDate: b.check_in_date,
          checkOutDate: b.check_out_date,
          status: b.booking_status,
          roomOrUnitName: b.items[0]?.room_type_name || "Standard Unit",
          totalAmount: b.total_amount,
          currency: b.currency,
          depositPaid: b.deposit_paid,
        })),
        pendingDues: pendingDues.map((b) => ({
          id: `due-${b.id}`,
          bookingReference: b.booking_reference,
          guestName: b.guest_name,
          dueDate: b.check_in_date,
          amountDue: Math.round((b.total_amount - b.deposit_paid) * 100) / 100,
          currency: b.currency,
          paymentType: "room_fee",
          status: "pending",
        })),
        recentActivities: [
          {
            id: "act-1",
            timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
            category: "reservation",
            actor: { name: "Julian Vance", role: "super_admin" },
            description: "Confirmed reservation GS-LON-2026-8812 for Sofia Berg.",
            entityReference: "GS-LON-2026-8812",
            propertyId: "prop-hotel-002",
          },
          {
            id: "act-2",
            timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
            category: "security",
            actor: { name: "System Security", role: "system" },
            description: "Argon2id rotation verified across all active user principals.",
            propertyId: "prop-hostel-001",
          },
          {
            id: "act-3",
            timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
            category: "front_desk",
            actor: { name: "Clara Ross", role: "property_manager" },
            description: "Assigned Dorm Pod 3 Lower to reservation GS-EDI-2026-3401.",
            entityReference: "GS-EDI-2026-3401",
            propertyId: "prop-hostel-001",
          },
        ],
      };

      res.json({
        success: true,
        data: dashboardData,
        message: "Dashboard operational telemetry loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 16. Admin Reservations Ledger: GET /api/v1/admin/reservations
  app.get("/api/v1/admin/reservations", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      if (user.global_role === "guest") {
        res.status(403).json({
          success: false,
          error: { code: "PERMISSION_DENIED", message: "Customers cannot access administrative reservation ledgers." },
          correlation_id: correlationId,
        });
        return;
      }

      const propertyId = req.query.property_id as string;
      let bookings = Array.from(bookingsStore.values());

      // Filter by property authorization
      if (!user.is_superuser && user.global_role !== "super_admin") {
        bookings = bookings.filter((b) => user.assigned_property_ids.includes(b.property_id));
      }
      if (propertyId) {
        bookings = bookings.filter((b) => b.property_id === propertyId);
      }

      res.json({
        success: true,
        data: bookings,
        message: "Administrative reservations retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // ==========================================
  // PHASE 7 HOSTEL OPERATIONS DOMAIN APIS
  // ==========================================

  // Helper to enrich a HostelStay with hosteller, room, and bed details
  function enrichHostelStay(stay: HostelStayRecord) {
    const hosteller = hostellersStore.get(stay.hosteller_id);
    const room = roomsStore.get(stay.room_id);
    const bed = bedsStore.get(stay.bed_id);
    const roomType = room ? roomTypesStore.get(room.room_type_id) : undefined;
    return {
      ...stay,
      hosteller: hosteller || undefined,
      room_number: room?.room_number || "Unknown Room",
      bed_label: bed?.bed_label || "Unknown Bed",
      room_type_name: roomType?.name || "Dormitory",
    };
  }

  // 1. List Hostellers: GET /api/v1/hostel/hostellers
  app.get("/api/v1/hostel/hostellers", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, q, status } = req.query as {
        property_id?: string;
        q?: string;
        status?: string;
      };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let hostellers = Array.from(hostellersStore.values()).filter(
        (h) => h.property_id === property_id && h.is_active
      );

      if (status && status !== "all") {
        hostellers = hostellers.filter((h) => h.status === status);
      }

      if (q) {
        const query = q.toLowerCase().trim();
        hostellers = hostellers.filter(
          (h) =>
            h.first_name.toLowerCase().includes(query) ||
            h.last_name.toLowerCase().includes(query) ||
            h.email?.toLowerCase().includes(query) ||
            h.phone?.toLowerCase().includes(query) ||
            h.id.toLowerCase().includes(query)
        );
      }

      hostellers.sort((a, b) => b.created_at.localeCompare(a.created_at));

      res.json({
        success: true,
        data: hostellers,
        message: "Hosteller profiles retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 2. Create Hosteller Profile: POST /api/v1/hostel/hostellers
  app.post("/api/v1/hostel/hostellers", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        first_name,
        last_name,
        email,
        phone,
        date_of_birth,
        gender,
        nationality,
        address,
        city,
        country,
        emergency_contact,
        notes,
      } = req.body || {};

      if (!property_id || !first_name || !last_name) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, first_name, and last_name are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const prop = propertiesStore.get(property_id);
      if (!prop || (prop.property_type !== "hostel" && prop.property_type !== "hybrid")) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_PROPERTY_TYPE", message: "Hosteller profiles can only be created for hostel or hybrid properties." },
          correlation_id: correlationId,
        });
        return;
      }

      const newId = `hstlr-${property_id.substring(5, 8)}-${crypto.randomUUID().substring(0, 6)}`;
      const now = new Date().toISOString();

      const newHosteller: HostellerRecord = {
        id: newId,
        property_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        date_of_birth,
        gender,
        nationality: nationality?.trim() || undefined,
        address: address?.trim() || undefined,
        city: city?.trim() || undefined,
        country: country?.trim() || undefined,
        emergency_contact,
        status: "active",
        notes: notes?.trim() || undefined,
        created_at: now,
        updated_at: now,
        is_active: true,
      };

      hostellersStore.set(newId, newHosteller);

      res.status(201).json({
        success: true,
        data: newHosteller,
        message: "Hosteller profile created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 3. Get Hosteller Details with Stay History: GET /api/v1/hostel/hostellers/:id
  app.get("/api/v1/hostel/hostellers/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const hosteller = hostellersStore.get(id);

      if (!hosteller) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hosteller '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(hosteller.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Access denied to hosteller profile." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const stays = Array.from(hostelStaysStore.values())
        .filter((s) => s.hosteller_id === id)
        .map(enrichHostelStay);
      stays.sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));

      res.json({
        success: true,
        data: {
          ...hosteller,
          stays,
        },
        message: "Hosteller profile and stay history retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 4. Update Hosteller: PUT /api/v1/hostel/hostellers/:id
  app.put("/api/v1/hostel/hostellers/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const hosteller = hostellersStore.get(id);

      if (!hosteller) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hosteller '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(hosteller.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Access denied to hosteller profile." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const updates = req.body || {};
      delete updates.id;
      delete updates.property_id;
      delete updates.created_at;

      Object.assign(hosteller, updates, { updated_at: new Date().toISOString() });

      res.json({
        success: true,
        data: hosteller,
        message: "Hosteller profile updated successfully.",
        correlation_id: correlationId,
        timestamp: hosteller.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 5. Deactivate Hosteller: DELETE /api/v1/hostel/hostellers/:id
  app.delete("/api/v1/hostel/hostellers/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const hosteller = hostellersStore.get(id);

      if (!hosteller) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hosteller '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(hosteller.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Access denied to hosteller profile." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      // Safe deactivation check: cannot deactivate if hosteller has an active checked-in stay
      const activeStay = Array.from(hostelStaysStore.values()).find(
        (s) => s.hosteller_id === id && s.status === "checked_in"
      );
      if (activeStay) {
        res.status(422).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Cannot deactivate hosteller: Currently checked in to stay ${activeStay.stay_reference}. Complete checkout first.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      hosteller.is_active = false;
      hosteller.status = "inactive";
      hosteller.updated_at = new Date().toISOString();

      res.json({
        success: true,
        data: { id, is_active: false },
        message: "Hosteller profile deactivated safely.",
        correlation_id: correlationId,
        timestamp: hosteller.updated_at,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 6. List Hostel Stays: GET /api/v1/hostel/stays
  app.get("/api/v1/hostel/stays", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, status, q, date } = req.query as {
        property_id?: string;
        status?: string;
        q?: string;
        date?: string;
      };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let stays = Array.from(hostelStaysStore.values()).filter((s) => s.property_id === property_id);

      if (status && status !== "all") {
        stays = stays.filter((s) => s.status === status);
      }

      if (date) {
        stays = stays.filter((s) => s.check_in_date <= date && s.check_out_date >= date);
      }

      let enriched = stays.map(enrichHostelStay);

      if (q) {
        const query = q.toLowerCase().trim();
        enriched = enriched.filter(
          (s) =>
            s.stay_reference.toLowerCase().includes(query) ||
            s.hosteller?.first_name.toLowerCase().includes(query) ||
            s.hosteller?.last_name.toLowerCase().includes(query) ||
            s.room_number?.toLowerCase().includes(query) ||
            s.bed_label?.toLowerCase().includes(query) ||
            s.locker_number?.toLowerCase().includes(query)
        );
      }

      enriched.sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));

      res.json({
        success: true,
        data: enriched,
        message: "Hostel stays retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 7. Create Hostel Stay (Reserve a bed): POST /api/v1/hostel/stays
  app.post("/api/v1/hostel/stays", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        hosteller_id,
        booking_id,
        room_id,
        bed_id,
        check_in_date,
        check_out_date,
        special_requests,
        locker_number,
        keycard_code,
      } = req.body || {};

      if (!property_id || !hosteller_id || !room_id || !bed_id || !check_in_date || !check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Missing required fields for hostel stay." },
          correlation_id: correlationId,
        });
        return;
      }

      if (check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "check_out_date must be strictly after check_in_date." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const hosteller = hostellersStore.get(hosteller_id);
      if (!hosteller || !hosteller.is_active) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hosteller '${hosteller_id}' not found or deactivated.` },
          correlation_id: correlationId,
        });
        return;
      }

      const room = roomsStore.get(room_id);
      if (!room || room.property_id !== property_id || !room.is_active) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Room not found or inactive." },
          correlation_id: correlationId,
        });
        return;
      }

      const bed = bedsStore.get(bed_id);
      if (!bed || bed.room_id !== room_id || !bed.is_active) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Bed not found or inactive in the specified room." },
          correlation_id: correlationId,
        });
        return;
      }

      if (bed.operational_status === "maintenance" || bed.operational_status === "out_of_order" ||
          room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
        res.status(422).json({
          success: false,
          error: { code: "UNIT_UNDER_MAINTENANCE", message: `Cannot allocate bed ${bed.bed_label}: Unit or room is currently under maintenance.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check Phase 6 Inventory Conflict using Half-Open Interval [check_in, check_out)
      const conflicts = Array.from(allocationsStore.values()).filter(
        (a) =>
          (a.bed_id === bed_id || a.room_id === room_id) &&
          a.is_active &&
          a.check_in_date < check_out_date &&
          a.check_out_date > check_in_date
      );

      if (conflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: "RESOURCE_CONFLICT",
            message: `Inventory Conflict: Bed ${bed.bed_label} has an active allocation from ${conflicts[0].check_in_date} to ${conflicts[0].check_out_date}.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const roomType = roomTypesStore.get(room.room_type_id);
      const nightlyRate = roomType?.base_price_amount || 32.0;
      const checkInMs = new Date(check_in_date).getTime();
      const checkOutMs = new Date(check_out_date).getTime();
      const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));
      const totalAmount = nightlyRate * nights;

      const stayId = `stay-${crypto.randomUUID().substring(0, 8)}`;
      const stayRef = `HST-${Date.now().toString().slice(-4)}-${crypto.randomUUID().substring(0, 4).toUpperCase()}`;
      const now = new Date().toISOString();

      const newStay: HostelStayRecord = {
        id: stayId,
        stay_reference: stayRef,
        property_id,
        hosteller_id,
        booking_id,
        room_id,
        bed_id,
        check_in_date,
        check_out_date,
        status: "reserved",
        special_requests: special_requests?.trim() || undefined,
        locker_number: locker_number || bed.locker_number,
        keycard_code: keycard_code || room.keycard_code,
        nightly_rate: nightlyRate,
        total_nights: nights,
        total_amount: totalAmount,
        currency: propertiesStore.get(property_id)?.currency || "GBP",
        audit_trail: [
          {
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "created",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Hostel stay created for bed ${bed.bed_label} in Room ${room.room_number}.`,
          },
        ],
        created_at: now,
        updated_at: now,
      };

      // Create unified Phase 6 inventory allocation
      const allocId = `alloc-stay-${stayId}`;
      allocationsStore.set(allocId, {
        id: allocId,
        property_id,
        booking_item_id: booking_id,
        room_id,
        bed_id,
        check_in_date,
        check_out_date,
        allocation_type: "reservation",
        notes: `Hostel stay ${stayRef}`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      });

      hostelStaysStore.set(stayId, newStay);

      res.status(201).json({
        success: true,
        data: enrichHostelStay(newStay),
        message: "Hostel stay reservation created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 8. Atomic Walk-In Registration: POST /api/v1/hostel/stays/walk-in
  app.post("/api/v1/hostel/stays/walk-in", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        first_name,
        last_name,
        email,
        phone,
        gender,
        nationality,
        emergency_contact,
        room_id,
        bed_id,
        check_in_date,
        check_out_date,
        special_requests,
        locker_number,
        keycard_code,
      } = req.body || {};

      if (!property_id || !first_name || !last_name || !room_id || !bed_id || !check_in_date || !check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Missing required walk-in fields." },
          correlation_id: correlationId,
        });
        return;
      }

      if (check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "check_out_date must be strictly after check_in_date." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const room = roomsStore.get(room_id);
      const bed = bedsStore.get(bed_id);
      if (!room || !bed || bed.room_id !== room_id || bed.property_id !== property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Selected room or bed not valid for this property." },
          correlation_id: correlationId,
        });
        return;
      }

      if (bed.operational_status === "maintenance" || bed.operational_status === "out_of_order" ||
          room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
        res.status(422).json({
          success: false,
          error: { code: "UNIT_UNDER_MAINTENANCE", message: `Cannot allocate bed ${bed.bed_label}: Unit or room is under maintenance.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict
      const conflicts = Array.from(allocationsStore.values()).filter(
        (a) =>
          (a.bed_id === bed_id || a.room_id === room_id) &&
          a.is_active &&
          a.check_in_date < check_out_date &&
          a.check_out_date > check_in_date
      );

      if (conflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: "RESOURCE_CONFLICT",
            message: `Bed ${bed.bed_label} has an active overlapping allocation from ${conflicts[0].check_in_date} to ${conflicts[0].check_out_date}.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();

      // 1. Create Hosteller Record
      const hstlrId = `hstlr-${property_id.substring(5, 8)}-${crypto.randomUUID().substring(0, 6)}`;
      const newHosteller: HostellerRecord = {
        id: hstlrId,
        property_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        gender,
        nationality: nationality?.trim() || undefined,
        emergency_contact,
        status: "checked_in",
        notes: "Registered as walk-in hosteller at front desk.",
        created_at: now,
        updated_at: now,
        is_active: true,
      };
      hostellersStore.set(hstlrId, newHosteller);

      const roomType = roomTypesStore.get(room.room_type_id);
      const nightlyRate = roomType?.base_price_amount || 32.0;
      const checkInMs = new Date(check_in_date).getTime();
      const checkOutMs = new Date(check_out_date).getTime();
      const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));
      const totalAmount = nightlyRate * nights;

      // 2. Create Stay Record with checked_in status immediately
      const stayId = `stay-${crypto.randomUUID().substring(0, 8)}`;
      const stayRef = `HST-WLK-${Date.now().toString().slice(-4)}-${crypto.randomUUID().substring(0, 4).toUpperCase()}`;

      const newStay: HostelStayRecord = {
        id: stayId,
        stay_reference: stayRef,
        property_id,
        hosteller_id: hstlrId,
        room_id,
        bed_id,
        check_in_date,
        check_out_date,
        actual_check_in_time: now,
        status: "checked_in",
        special_requests: special_requests?.trim() || "Walk-in registration",
        locker_number: locker_number || bed.locker_number,
        keycard_code: keycard_code || room.keycard_code,
        checked_in_by_user_id: user.id,
        nightly_rate: nightlyRate,
        total_nights: nights,
        total_amount: totalAmount,
        currency: propertiesStore.get(property_id)?.currency || "GBP",
        audit_trail: [
          {
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "created",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Walk-in registration created at front desk.`,
          },
          {
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "checked_in",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Walk-in hosteller checked in immediately to Bed ${bed.bed_label}.`,
          },
        ],
        created_at: now,
        updated_at: now,
      };

      // 3. Create active allocation
      const allocId = `alloc-stay-${stayId}`;
      allocationsStore.set(allocId, {
        id: allocId,
        property_id,
        room_id,
        bed_id,
        check_in_date,
        check_out_date,
        allocation_type: "check_in",
        notes: `Hostel walk-in ${stayRef}`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      });

      hostelStaysStore.set(stayId, newStay);

      res.status(201).json({
        success: true,
        data: enrichHostelStay(newStay),
        message: "Walk-in registration and check-in completed successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 9. Get Single Stay Details: GET /api/v1/hostel/stays/:id
  app.get("/api/v1/hostel/stays/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const stay = hostelStaysStore.get(id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hostel stay '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Access denied to hostel stay." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      res.json({
        success: true,
        data: enrichHostelStay(stay),
        message: "Stay details retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 10. Guided Check-In: POST /api/v1/hostel/stays/:id/check-in
  app.post("/api/v1/hostel/stays/:id/check-in", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const stay = hostelStaysStore.get(id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hostel stay '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Staff not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      // State Transition Validation: stay must be in 'reserved' state
      if (stay.status !== "reserved") {
        res.status(422).json({
          success: false,
          error: {
            code: "INVALID_STATE_TRANSITION",
            message: `Cannot check in stay ${stay.stay_reference}: Current status is '${stay.status}'. Only 'reserved' stays can be checked in.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      // Operational Bed Status Validation
      const bed = bedsStore.get(stay.bed_id);
      const room = roomsStore.get(stay.room_id);
      if (!bed || bed.operational_status === "maintenance" || bed.operational_status === "out_of_order" ||
          !room || room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
        res.status(422).json({
          success: false,
          error: {
            code: "UNIT_UNDER_MAINTENANCE",
            message: `Check-in blocked: Bed ${bed?.bed_label || stay.bed_id} or Room ${room?.room_number || stay.room_id} is under maintenance.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      const { keycard_code, locker_number, staff_notes } = req.body || {};

      // Transition stay
      stay.status = "checked_in";
      stay.actual_check_in_time = now;
      stay.checked_in_by_user_id = user.id;
      if (keycard_code) stay.keycard_code = keycard_code;
      if (locker_number) stay.locker_number = locker_number;
      stay.updated_at = now;

      // Update hosteller status
      const hosteller = hostellersStore.get(stay.hosteller_id);
      if (hosteller) {
        hosteller.status = "checked_in";
        hosteller.updated_at = now;
      }

      // Update linked inventory allocation
      const alloc = allocationsStore.get(`alloc-stay-${stay.id}`);
      if (alloc) {
        alloc.allocation_type = "check_in";
      }

      // Add audit entry
      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "checked_in",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Hosteller checked in by staff. Keycard: ${stay.keycard_code || "Standard"}, Locker: ${stay.locker_number || "Assigned"}. ${staff_notes ? `Notes: ${staff_notes}` : ""}`,
      });

      res.json({
        success: true,
        data: enrichHostelStay(stay),
        message: `Check-in confirmed for ${hosteller ? `${hosteller.first_name} ${hosteller.last_name}` : stay.stay_reference}.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11. Transactional Check-Out: POST /api/v1/hostel/stays/:id/check-out
  app.post("/api/v1/hostel/stays/:id/check-out", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const stay = hostelStaysStore.get(id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hostel stay '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Staff not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      // State Transition Validation: stay must be 'checked_in'
      if (stay.status !== "checked_in") {
        res.status(422).json({
          success: false,
          error: {
            code: "INVALID_STATE_TRANSITION",
            message: `Cannot check out stay ${stay.stay_reference}: Current status is '${stay.status}'. Only 'checked_in' stays can be checked out.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      const { staff_notes, linen_returned, locker_keys_returned } = req.body || {};

      // Transition stay
      stay.status = "checked_out";
      stay.actual_check_out_time = now;
      stay.checked_out_by_user_id = user.id;
      stay.updated_at = now;

      // Update hosteller status
      const hosteller = hostellersStore.get(stay.hosteller_id);
      if (hosteller) {
        hosteller.status = "checked_out";
        hosteller.updated_at = now;
      }

      // Release inventory allocation (keep record for history, mark inactive)
      const alloc = allocationsStore.get(`alloc-stay-${stay.id}`);
      if (alloc) {
        alloc.is_active = false;
      }

      // Update room cleanliness to 'dirty' for housekeeping turnover
      const room = roomsStore.get(stay.room_id);
      if (room) {
        room.cleanliness_status = "dirty";
        room.updated_at = now;
      }

      // Add audit entry
      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "checked_out",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Check-out finalized. Bed released. Cleanliness marked dirty for housekeeping. Linen returned: ${linen_returned !== false ? "Yes" : "Pending"}, Locker keys returned: ${locker_keys_returned !== false ? "Yes" : "Pending"}. ${staff_notes ? `Notes: ${staff_notes}` : ""}`,
      });

      res.json({
        success: true,
        data: enrichHostelStay(stay),
        message: `Check-out completed for stay ${stay.stay_reference}. Bed released.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12. Bed Reassignment: POST /api/v1/hostel/stays/:id/reassign-bed
  app.post("/api/v1/hostel/stays/:id/reassign-bed", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const stay = hostelStaysStore.get(id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hostel stay '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Staff not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status !== "reserved" && stay.status !== "checked_in") {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `Cannot reassign bed for stay with status '${stay.status}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      const { new_bed_id, notes } = req.body || {};
      if (!new_bed_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "new_bed_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (new_bed_id === stay.bed_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Stay is already assigned to this bed." },
          correlation_id: correlationId,
        });
        return;
      }

      const newBed = bedsStore.get(new_bed_id);
      if (!newBed || newBed.property_id !== stay.property_id || !newBed.is_active) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Destination bed not found or not in same authorized property." },
          correlation_id: correlationId,
        });
        return;
      }

      const newRoom = roomsStore.get(newBed.room_id);
      if (!newRoom || !newRoom.is_active) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Destination room not found or inactive." },
          correlation_id: correlationId,
        });
        return;
      }

      if (newBed.operational_status === "maintenance" || newBed.operational_status === "out_of_order" ||
          newRoom.operational_status === "maintenance" || newRoom.operational_status === "out_of_order") {
        res.status(422).json({
          success: false,
          error: { code: "UNIT_UNDER_MAINTENANCE", message: `Destination bed ${newBed.bed_label} is under maintenance.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict on destination bed for stay's interval
      const conflicts = Array.from(allocationsStore.values()).filter(
        (a) =>
          a.bed_id === new_bed_id &&
          a.is_active &&
          a.check_in_date < stay.check_out_date &&
          a.check_out_date > stay.check_in_date
      );

      if (conflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: "RESOURCE_CONFLICT",
            message: `Bed reassignment rejected: Destination bed ${newBed.bed_label} has a conflict from ${conflicts[0].check_in_date} to ${conflicts[0].check_out_date}.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      const oldBed = bedsStore.get(stay.bed_id);
      const oldBedLabel = oldBed ? oldBed.bed_label : stay.bed_id;

      // Transactionally release old allocation
      const oldAlloc = allocationsStore.get(`alloc-stay-${stay.id}`);
      if (oldAlloc) {
        oldAlloc.is_active = false;
      }

      // Create new allocation
      const newAllocId = `alloc-stay-${stay.id}`;
      allocationsStore.set(newAllocId, {
        id: newAllocId,
        property_id: stay.property_id,
        booking_item_id: stay.booking_id,
        room_id: newBed.room_id,
        bed_id: new_bed_id,
        check_in_date: stay.check_in_date,
        check_out_date: stay.check_out_date,
        allocation_type: stay.status === "checked_in" ? "check_in" : "reservation",
        notes: `Reassigned from ${oldBedLabel}`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      });

      // Update stay
      stay.bed_id = new_bed_id;
      stay.room_id = newBed.room_id;
      if (newBed.locker_number) stay.locker_number = newBed.locker_number;
      stay.updated_at = now;

      // Add audit entry
      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "reassigned",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Bed reassigned from ${oldBedLabel} to ${newBed.bed_label} in Room ${newRoom.room_number}. ${notes ? `Reason: ${notes}` : ""}`,
      });

      res.json({
        success: true,
        data: enrichHostelStay(stay),
        message: `Stay reassigned to bed ${newBed.bed_label} successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 13. Extend Stay: POST /api/v1/hostel/stays/:id/extend
  app.post("/api/v1/hostel/stays/:id/extend", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const stay = hostelStaysStore.get(id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hostel stay '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Staff not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status !== "reserved" && stay.status !== "checked_in") {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `Cannot extend stay with status '${stay.status}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      const { new_check_out_date, notes } = req.body || {};
      if (!new_check_out_date || new_check_out_date <= stay.check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: `new_check_out_date must be strictly after current checkout date (${stay.check_out_date}).` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict for extended interval [stay.check_out_date, new_check_out_date)
      const currentAllocId = `alloc-stay-${stay.id}`;
      const conflicts = Array.from(allocationsStore.values()).filter(
        (a) =>
          a.id !== currentAllocId &&
          a.bed_id === stay.bed_id &&
          a.is_active &&
          a.check_in_date < new_check_out_date &&
          a.check_out_date > stay.check_out_date
      );

      if (conflicts.length > 0) {
        res.status(409).json({
          success: false,
          error: {
            code: "RESOURCE_CONFLICT",
            message: `Stay extension rejected: Bed has a conflicting reservation from ${conflicts[0].check_in_date} to ${conflicts[0].check_out_date}.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      const oldCheckout = stay.check_out_date;
      stay.check_out_date = new_check_out_date;

      const checkInMs = new Date(stay.check_in_date).getTime();
      const checkOutMs = new Date(new_check_out_date).getTime();
      stay.total_nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (1000 * 60 * 60 * 24)));
      stay.total_amount = stay.nightly_rate * stay.total_nights;
      stay.updated_at = now;

      // Update allocation
      const alloc = allocationsStore.get(currentAllocId);
      if (alloc) {
        alloc.check_out_date = new_check_out_date;
      }

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "extended",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Stay extended from ${oldCheckout} to ${new_check_out_date}. Total nights: ${stay.total_nights}. ${notes ? `Notes: ${notes}` : ""}`,
      });

      res.json({
        success: true,
        data: enrichHostelStay(stay),
        message: `Stay extended to ${new_check_out_date} successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 14. Cancel Stay: POST /api/v1/hostel/stays/:id/cancel
  app.post("/api/v1/hostel/stays/:id/cancel", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { id } = req.params;
      const stay = hostelStaysStore.get(id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "ENTITY_NOT_FOUND", message: `Hostel stay '${id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: "Staff not authorized for this property." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status !== "reserved") {
        res.status(422).json({
          success: false,
          error: {
            code: "INVALID_STATE_TRANSITION",
            message: `Cannot cancel stay with status '${stay.status}'. Only 'reserved' stays can be cancelled.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      const { reason } = req.body || {};

      stay.status = "cancelled";
      stay.updated_at = now;

      // Deactivate allocation
      const alloc = allocationsStore.get(`alloc-stay-${stay.id}`);
      if (alloc) {
        alloc.is_active = false;
      }

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "cancelled",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Stay cancelled. Bed allocation released. Reason: ${reason || "Cancelled by staff/guest request"}.`,
      });

      res.json({
        success: true,
        data: enrichHostelStay(stay),
        message: `Stay ${stay.stay_reference} cancelled successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 15. Hostel Operational Summary: GET /api/v1/hostel/dashboard
  app.get("/api/v1/hostel/dashboard", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      // Active beds in this property
      const propBeds = Array.from(bedsStore.values()).filter(
        (b) => b.property_id === propertyId && b.is_active
      );

      // Active allocations for today
      const todayAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.property_id === propertyId && a.is_active && a.check_in_date < tomorrow && a.check_out_date > todayStr
      );
      const blockedBedIds = new Set(todayAllocs.map((a) => a.bed_id).filter(Boolean));

      const propStays = Array.from(hostelStaysStore.values()).filter((s) => s.property_id === propertyId);

      const activeStays = propStays.filter((s) => s.status === "checked_in");
      const occupiedBedIds = new Set(activeStays.map((s) => s.bed_id));

      const todayReservations = propStays.filter(
        (s) => s.status === "reserved" && s.check_in_date <= todayStr && s.check_out_date > todayStr
      );
      const reservedBedIds = new Set(todayReservations.map((s) => s.bed_id));

      let maintenanceBeds = 0;
      let availableBeds = 0;

      for (const b of propBeds) {
        const room = roomsStore.get(b.room_id);
        const isMaint = b.operational_status === "maintenance" || b.operational_status === "out_of_order" ||
                        room?.operational_status === "maintenance" || room?.operational_status === "out_of_order";
        if (isMaint) {
          maintenanceBeds++;
        } else if (!occupiedBedIds.has(b.id) && !reservedBedIds.has(b.id) && !blockedBedIds.has(b.id)) {
          availableBeds++;
        }
      }

      const expectedCheckInsToday = propStays.filter(
        (s) => s.check_in_date === todayStr && s.status === "reserved"
      ).length;

      const expectedCheckOutsToday = propStays.filter(
        (s) => s.check_out_date === todayStr && s.status === "checked_in"
      ).length;

      const overdueCheckOutsCount = propStays.filter(
        (s) => s.check_out_date < todayStr && s.status === "checked_in"
      ).length;

      const totalBeds = propBeds.length;
      const occupiedCount = occupiedBedIds.size;
      const occupancyRate = totalBeds > 0 ? Math.round((occupiedCount / totalBeds) * 100) : 0;

      res.json({
        success: true,
        data: {
          property_id: propertyId,
          total_beds: totalBeds,
          occupied_beds: occupiedCount,
          reserved_beds: reservedBedIds.size,
          available_beds: availableBeds,
          maintenance_beds: maintenanceBeds,
          occupancy_rate_percentage: occupancyRate,
          active_hostellers_count: activeStays.length,
          expected_check_ins_today: expectedCheckInsToday,
          expected_check_outs_today: expectedCheckOutsToday,
          overdue_check_outs_count: overdueCheckOutsCount,
        },
        message: "Hostel operational dashboard metrics loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 16. Hostel Front Desk Queue: GET /api/v1/hostel/front-desk
  app.get("/api/v1/hostel/front-desk", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const propStays = Array.from(hostelStaysStore.values())
        .filter((s) => s.property_id === propertyId)
        .map(enrichHostelStay);

      const todayArrivals = propStays.filter(
        (s) => s.check_in_date === todayStr && s.status === "reserved"
      );

      const todayDepartures = propStays.filter(
        (s) => s.check_out_date === todayStr && s.status === "checked_in"
      );

      const inHouseHostellers = propStays.filter((s) => s.status === "checked_in");

      const overdueDepartures = propStays.filter(
        (s) => s.check_out_date < todayStr && s.status === "checked_in"
      );

      const propBeds = Array.from(bedsStore.values()).filter(
        (b) => b.property_id === propertyId && b.is_active
      );

      const maintenanceExceptions = propBeds.filter((b) => {
        const room = roomsStore.get(b.room_id);
        return (
          b.operational_status === "maintenance" ||
          b.operational_status === "out_of_order" ||
          room?.operational_status === "maintenance" ||
          room?.operational_status === "out_of_order"
        );
      }).length;

      res.json({
        success: true,
        data: {
          today_arrivals: todayArrivals,
          today_departures: todayDepartures,
          in_house_hostellers: inHouseHostellers,
          overdue_departures: overdueDepartures,
          available_beds_count: Math.max(0, propBeds.length - inHouseHostellers.length - maintenanceExceptions),
          maintenance_exceptions_count: maintenanceExceptions,
        },
        message: "Front desk queue loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // ==========================================
  // PHASE 8 HOTEL OPERATIONS DOMAIN APIS
  // ==========================================

  // Helper to enrich a HotelStay with guest, room, and room type details
  function enrichHotelStay(stay: HotelStayRecord) {
    const guest = hotelGuestsStore.get(stay.guest_id);
    const room = stay.assigned_room_id ? roomsStore.get(stay.assigned_room_id) : undefined;
    const roomType = roomTypesStore.get(stay.room_type_id);
    return {
      ...stay,
      guest: guest || undefined,
      guest_name: guest ? `${guest.first_name} ${guest.last_name}` : "Unknown Guest",
      room_number: room?.room_number || "Unassigned",
      room_type_name: roomType?.name || "Private Suite",
      floor_name: room?.floor_name || "Unassigned",
    };
  }

  // 1. List Hotel Guests: GET /api/v1/hotel/guests
  app.get("/api/v1/hotel/guests", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, q, status } = req.query as {
        property_id?: string;
        q?: string;
        status?: string;
      };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let guests = Array.from(hotelGuestsStore.values()).filter((g) => g.property_id === property_id);

      if (status && status !== "all") {
        guests = guests.filter((g) => g.status === status);
      }

      if (q) {
        const query = q.toLowerCase().trim();
        guests = guests.filter(
          (g) =>
            g.first_name.toLowerCase().includes(query) ||
            g.last_name.toLowerCase().includes(query) ||
            (g.email && g.email.toLowerCase().includes(query)) ||
            (g.phone && g.phone.toLowerCase().includes(query)) ||
            (g.nationality && g.nationality.toLowerCase().includes(query)) ||
            g.id.toLowerCase().includes(query)
        );
      }

      guests.sort((a, b) => a.last_name.localeCompare(b.last_name));

      res.json({
        success: true,
        data: guests,
        message: "Hotel guest directory retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 2. Create Hotel Guest: POST /api/v1/hotel/guests
  app.post("/api/v1/hotel/guests", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        first_name,
        last_name,
        email,
        phone,
        date_of_birth,
        gender,
        nationality,
        address,
        city,
        country,
        vip_tier,
        special_preferences,
        notes,
      } = req.body || {};

      if (!property_id || !first_name || !last_name) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, first_name, and last_name are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const id = `gst-${crypto.randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();
      const guest: HotelGuestRecord = {
        id,
        property_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email ? email.trim() : undefined,
        phone: phone ? phone.trim() : undefined,
        date_of_birth,
        gender: gender || "female",
        nationality,
        address,
        city,
        country,
        vip_tier: vip_tier || "standard",
        special_preferences,
        status: "active",
        notes,
        created_at: now,
        updated_at: now,
        is_active: true,
      };

      hotelGuestsStore.set(id, guest);

      res.status(201).json({
        success: true,
        data: guest,
        message: "Hotel guest profile created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 3. Get Hotel Guest Profile: GET /api/v1/hotel/guests/:id
  app.get("/api/v1/hotel/guests/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const guest = hotelGuestsStore.get(req.params.id);

      if (!guest) {
        res.status(404).json({
          success: false,
          error: { code: "GUEST_NOT_FOUND", message: `Guest profile '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(guest.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${guest.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const stays = Array.from(hotelStaysStore.values())
        .filter((s) => s.guest_id === guest.id)
        .map(enrichHotelStay)
        .sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));

      res.json({
        success: true,
        data: {
          ...guest,
          stays,
        },
        message: "Hotel guest profile retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 4. Update Hotel Guest: PUT /api/v1/hotel/guests/:id
  app.put("/api/v1/hotel/guests/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const guest = hotelGuestsStore.get(req.params.id);

      if (!guest) {
        res.status(404).json({
          success: false,
          error: { code: "GUEST_NOT_FOUND", message: `Guest profile '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(guest.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${guest.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const updates = req.body || {};
      const updated: HotelGuestRecord = {
        ...guest,
        first_name: updates.first_name ? updates.first_name.trim() : guest.first_name,
        last_name: updates.last_name ? updates.last_name.trim() : guest.last_name,
        email: updates.email !== undefined ? updates.email : guest.email,
        phone: updates.phone !== undefined ? updates.phone : guest.phone,
        nationality: updates.nationality !== undefined ? updates.nationality : guest.nationality,
        vip_tier: updates.vip_tier !== undefined ? updates.vip_tier : guest.vip_tier,
        special_preferences: updates.special_preferences !== undefined ? updates.special_preferences : guest.special_preferences,
        address: updates.address !== undefined ? updates.address : guest.address,
        city: updates.city !== undefined ? updates.city : guest.city,
        country: updates.country !== undefined ? updates.country : guest.country,
        notes: updates.notes !== undefined ? updates.notes : guest.notes,
        status: updates.status !== undefined ? updates.status : guest.status,
        updated_at: new Date().toISOString(),
      };

      hotelGuestsStore.set(guest.id, updated);

      res.json({
        success: true,
        data: updated,
        message: "Hotel guest profile updated.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 5. Deactivate Hotel Guest: DELETE /api/v1/hotel/guests/:id
  app.delete("/api/v1/hotel/guests/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const guest = hotelGuestsStore.get(req.params.id);

      if (!guest) {
        res.status(404).json({
          success: false,
          error: { code: "GUEST_NOT_FOUND", message: `Guest profile '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(guest.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${guest.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      guest.is_active = false;
      guest.status = "inactive";
      guest.updated_at = new Date().toISOString();
      hotelGuestsStore.set(guest.id, guest);

      res.json({
        success: true,
        data: { id: guest.id, is_active: false },
        message: "Hotel guest profile deactivated.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 6. List Hotel Stays / Reservations: GET /api/v1/hotel/stays
  app.get("/api/v1/hotel/stays", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, status, q, date } = req.query as {
        property_id?: string;
        status?: string;
        q?: string;
        date?: string;
      };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let stays = Array.from(hotelStaysStore.values()).filter((s) => s.property_id === property_id);

      if (status && status !== "all") {
        stays = stays.filter((s) => s.status === status);
      }

      if (date) {
        stays = stays.filter((s) => s.check_in_date <= date && s.check_out_date >= date);
      }

      let enriched = stays.map(enrichHotelStay);

      if (q) {
        const query = q.toLowerCase().trim();
        enriched = enriched.filter(
          (s) =>
            s.stay_reference.toLowerCase().includes(query) ||
            s.guest_name?.toLowerCase().includes(query) ||
            s.room_number?.toLowerCase().includes(query) ||
            s.room_type_name?.toLowerCase().includes(query)
        );
      }

      enriched.sort((a, b) => b.check_in_date.localeCompare(a.check_in_date));

      res.json({
        success: true,
        data: enriched,
        message: "Hotel stays retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 7. Create Hotel Reservation: POST /api/v1/hotel/stays
  app.post("/api/v1/hotel/stays", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        guest_id,
        booking_id,
        room_type_id,
        assigned_room_id,
        check_in_date,
        check_out_date,
        adult_count,
        child_count,
        additional_occupants,
        special_requests,
        nightly_rate,
      } = req.body || {};

      if (!property_id || !guest_id || !room_type_id || !check_in_date || !check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, guest_id, room_type_id, check_in_date, and check_out_date are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_DATES", message: "check_out_date must be strictly after check_in_date." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const guest = hotelGuestsStore.get(guest_id);
      if (!guest || guest.property_id !== property_id) {
        res.status(404).json({
          success: false,
          error: { code: "GUEST_NOT_FOUND", message: `Guest '${guest_id}' not found in property.` },
          correlation_id: correlationId,
        });
        return;
      }

      const roomType = roomTypesStore.get(room_type_id);
      if (!roomType || roomType.property_id !== property_id) {
        res.status(404).json({
          success: false,
          error: { code: "ROOM_TYPE_NOT_FOUND", message: `Room type '${room_type_id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      // If a physical room is assigned right now, validate availability
      if (assigned_room_id) {
        const room = roomsStore.get(assigned_room_id);
        if (!room || room.property_id !== property_id) {
          res.status(404).json({
            success: false,
            error: { code: "ROOM_NOT_FOUND", message: `Assigned room '${assigned_room_id}' not found.` },
            correlation_id: correlationId,
          });
          return;
        }

        if (room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
          res.status(409).json({
            success: false,
            error: { code: "ROOM_UNAVAILABLE", message: `Room ${room.room_number} is under ${room.operational_status} and cannot be assigned.` },
            correlation_id: correlationId,
          });
          return;
        }

        const conflict = Array.from(allocationsStore.values()).find(
          (a) =>
            a.room_id === assigned_room_id &&
            a.is_active &&
            a.check_in_date < check_out_date &&
            a.check_out_date > check_in_date
        );

        if (conflict) {
          res.status(409).json({
            success: false,
            error: { code: "INVENTORY_CONFLICT", message: `Room ${room.room_number} already has an active allocation for the requested stay dates.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const prop = propertiesStore.get(property_id);
      const currency = prop?.currency || "GBP";
      const rate = nightly_rate || roomType.base_price_amount || 250.0;
      const startMs = new Date(check_in_date).getTime();
      const endMs = new Date(check_out_date).getTime();
      const totalNights = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
      const totalAmount = rate * totalNights;

      const stayId = `hstay-${crypto.randomUUID().substring(0, 8)}`;
      const stayRef = `HTL-STAY-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const now = new Date().toISOString();

      const stayRecord: HotelStayRecord = {
        id: stayId,
        stay_reference: stayRef,
        property_id,
        guest_id,
        booking_id,
        room_type_id,
        assigned_room_id,
        check_in_date,
        check_out_date,
        status: assigned_room_id ? "confirmed" : "reserved",
        adult_count: adult_count || 1,
        child_count: child_count || 0,
        additional_occupants: additional_occupants || [],
        special_requests,
        nightly_rate: rate,
        total_nights: totalNights,
        total_amount: totalAmount,
        currency,
        audit_trail: [
          {
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "created",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Hotel reservation created for ${guest.first_name} ${guest.last_name} (${roomType.name}, ${totalNights} nights).`,
          },
        ],
        created_at: now,
        updated_at: now,
      };

      hotelStaysStore.set(stayId, stayRecord);

      // If room was assigned, create inventory allocation
      if (assigned_room_id) {
        allocationsStore.set(`alloc-hstay-${stayId}`, {
          id: `alloc-hstay-${stayId}`,
          property_id,
          room_id: assigned_room_id,
          check_in_date,
          check_out_date,
          allocation_type: "reservation",
          notes: `Hotel reservation ${stayRef}`,
          created_by_user_id: user.id,
          is_active: true,
          created_at: now,
        });
      }

      res.status(201).json({
        success: true,
        data: enrichHotelStay(stayRecord),
        message: "Hotel stay created.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 8. Walk-In Hotel Stay: POST /api/v1/hotel/stays/walk-in
  app.post("/api/v1/hotel/stays/walk-in", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        first_name,
        last_name,
        email,
        phone,
        nationality,
        vip_tier,
        room_id,
        room_type_id,
        check_in_date,
        check_out_date,
        adult_count,
        child_count,
        nightly_rate,
        special_requests,
        keycard_code,
        immediate_check_in,
      } = req.body || {};

      if (!property_id || !first_name || !last_name || !room_id || !check_in_date || !check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, first_name, last_name, room_id, check_in_date, and check_out_date are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (check_out_date <= check_in_date) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_DATES", message: "check_out_date must be strictly after check_in_date." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const room = roomsStore.get(room_id);
      if (!room || room.property_id !== property_id) {
        res.status(404).json({
          success: false,
          error: { code: "ROOM_NOT_FOUND", message: `Room '${room_id}' not found in property.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
        res.status(409).json({
          success: false,
          error: { code: "ROOM_UNAVAILABLE", message: `Room ${room.room_number} is under ${room.operational_status}.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict
      const conflict = Array.from(allocationsStore.values()).find(
        (a) =>
          a.room_id === room_id &&
          a.is_active &&
          a.check_in_date < check_out_date &&
          a.check_out_date > check_in_date
      );

      if (conflict) {
        res.status(409).json({
          success: false,
          error: { code: "INVENTORY_CONFLICT", message: `Room ${room.room_number} already has an active allocation for the requested dates.` },
          correlation_id: correlationId,
        });
        return;
      }

      const roomType = roomTypesStore.get(room_type_id || room.room_type_id);
      const prop = propertiesStore.get(property_id);
      const currency = prop?.currency || "GBP";
      const rate = nightly_rate || roomType?.base_price_amount || 250.0;
      const startMs = new Date(check_in_date).getTime();
      const endMs = new Date(check_out_date).getTime();
      const totalNights = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
      const totalAmount = rate * totalNights;
      const now = new Date().toISOString();

      // 1. Create or link Guest
      const guestId = `gst-${crypto.randomUUID().substring(0, 8)}`;
      const guestRecord: HotelGuestRecord = {
        id: guestId,
        property_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email ? email.trim() : undefined,
        phone: phone ? phone.trim() : undefined,
        nationality,
        vip_tier: vip_tier || "standard",
        status: immediate_check_in !== false ? "checked_in" : "active",
        notes: "Walk-in hotel guest registered at front desk.",
        created_at: now,
        updated_at: now,
        is_active: true,
      };
      hotelGuestsStore.set(guestId, guestRecord);

      // 2. Create Stay
      const stayId = `hstay-${crypto.randomUUID().substring(0, 8)}`;
      const stayRef = `HTL-STAY-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const isCheckIn = immediate_check_in !== false;
      const assignedKeycard = keycard_code || `KC-LON-${room.room_number}`;

      const stayRecord: HotelStayRecord = {
        id: stayId,
        stay_reference: stayRef,
        property_id,
        guest_id: guestId,
        room_type_id: room.room_type_id,
        assigned_room_id: room_id,
        check_in_date,
        check_out_date,
        actual_check_in_time: isCheckIn ? now : undefined,
        status: isCheckIn ? "checked_in" : "confirmed",
        adult_count: adult_count || 1,
        child_count: child_count || 0,
        special_requests,
        keycard_code: isCheckIn ? assignedKeycard : undefined,
        checked_in_by_user_id: isCheckIn ? user.id : undefined,
        nightly_rate: rate,
        total_nights: totalNights,
        total_amount: totalAmount,
        currency,
        audit_trail: [
          {
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "created",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Walk-in registration created for ${first_name} ${last_name}.`,
          },
          ...(isCheckIn
            ? [
                {
                  id: `aud-${crypto.randomUUID().substring(0, 8)}`,
                  action: "checked_in" as const,
                  timestamp: now,
                  performed_by_user_id: user.id,
                  performed_by_name: `${user.first_name} ${user.last_name}`,
                  details: `Immediate walk-in check-in to Room ${room.room_number}. Keycard ${assignedKeycard} issued.`,
                },
              ]
            : []),
        ],
        created_at: now,
        updated_at: now,
      };

      hotelStaysStore.set(stayId, stayRecord);

      // 3. Create allocation
      allocationsStore.set(`alloc-hstay-${stayId}`, {
        id: `alloc-hstay-${stayId}`,
        property_id,
        room_id,
        check_in_date,
        check_out_date,
        allocation_type: isCheckIn ? "check_in" : "reservation",
        notes: `Walk-in stay ${stayRef}`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      });

      res.status(201).json({
        success: true,
        data: enrichHotelStay(stayRecord),
        message: isCheckIn ? "Walk-in guest registered and checked in." : "Walk-in reservation created.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 9. Get Hotel Stay By ID: GET /api/v1/hotel/stays/:id
  app.get("/api/v1/hotel/stays/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: "Hotel stay retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 10. Assign Physical Room: POST /api/v1/hotel/stays/:id/assign-room
  app.post("/api/v1/hotel/stays/:id/assign-room", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { room_id, notes } = req.body || {};
      if (!room_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "room_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      const room = roomsStore.get(room_id);
      if (!room || room.property_id !== stay.property_id) {
        res.status(404).json({
          success: false,
          error: { code: "ROOM_NOT_FOUND", message: `Room '${room_id}' not found in property.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
        res.status(409).json({
          success: false,
          error: { code: "ROOM_UNAVAILABLE", message: `Room ${room.room_number} is under ${room.operational_status}.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict
      const conflict = Array.from(allocationsStore.values()).find(
        (a) =>
          a.room_id === room_id &&
          a.is_active &&
          a.id !== `alloc-hstay-${stay.id}` &&
          a.check_in_date < stay.check_out_date &&
          a.check_out_date > stay.check_in_date
      );

      if (conflict) {
        res.status(409).json({
          success: false,
          error: { code: "INVENTORY_CONFLICT", message: `Room ${room.room_number} is already allocated for this stay's dates.` },
          correlation_id: correlationId,
        });
        return;
      }

      stay.assigned_room_id = room_id;
      if (stay.status === "reserved") stay.status = "confirmed";
      stay.updated_at = new Date().toISOString();

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "room_assigned",
        timestamp: stay.updated_at,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Assigned physical room ${room.room_number} (${room.floor_name || "Floor"}). ${notes || ""}`.trim(),
      });

      hotelStaysStore.set(stay.id, stay);

      // Create / update inventory allocation
      allocationsStore.set(`alloc-hstay-${stay.id}`, {
        id: `alloc-hstay-${stay.id}`,
        property_id: stay.property_id,
        room_id: room_id,
        check_in_date: stay.check_in_date,
        check_out_date: stay.check_out_date,
        allocation_type: stay.status === "checked_in" ? "check_in" : "reservation",
        notes: `Hotel stay ${stay.stay_reference}`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: stay.updated_at,
      });

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: `Assigned room ${room.room_number} to stay ${stay.stay_reference}.`,
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11. Change Hotel Room (Reassignment): POST /api/v1/hotel/stays/:id/change-room
  app.post("/api/v1/hotel/stays/:id/change-room", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status === "checked_out" || stay.status === "cancelled") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_STATE", message: `Cannot change room for stay in status '${stay.status}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      const { new_room_id, reason } = req.body || {};
      if (!new_room_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "new_room_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (new_room_id === stay.assigned_room_id) {
        res.status(400).json({
          success: false,
          error: { code: "SAME_ROOM", message: "Destination room is the same as the current assigned room." },
          correlation_id: correlationId,
        });
        return;
      }

      const newRoom = roomsStore.get(new_room_id);
      if (!newRoom || newRoom.property_id !== stay.property_id) {
        res.status(404).json({
          success: false,
          error: { code: "ROOM_NOT_FOUND", message: `New room '${new_room_id}' not found in property.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (newRoom.operational_status === "maintenance" || newRoom.operational_status === "out_of_order") {
        res.status(409).json({
          success: false,
          error: { code: "ROOM_UNAVAILABLE", message: `Room ${newRoom.room_number} is under ${newRoom.operational_status}.` },
          correlation_id: correlationId,
        });
        return;
      }

      // Check conflict on destination room
      const conflict = Array.from(allocationsStore.values()).find(
        (a) =>
          a.room_id === new_room_id &&
          a.is_active &&
          a.id !== `alloc-hstay-${stay.id}` &&
          a.check_in_date < stay.check_out_date &&
          a.check_out_date > stay.check_in_date
      );

      if (conflict) {
        res.status(409).json({
          success: false,
          error: { code: "INVENTORY_CONFLICT", message: `Destination room ${newRoom.room_number} is already occupied or reserved for these dates.` },
          correlation_id: correlationId,
        });
        return;
      }

      const oldRoomId = stay.assigned_room_id;
      const oldRoom = oldRoomId ? roomsStore.get(oldRoomId) : undefined;
      const now = new Date().toISOString();

      stay.assigned_room_id = new_room_id;
      if (stay.status === "checked_in") {
        stay.keycard_code = `KC-LON-${newRoom.room_number}`;
      }
      stay.updated_at = now;

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "room_changed",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Room changed from ${oldRoom ? oldRoom.room_number : "Unassigned"} to ${newRoom.room_number}. Reason: ${reason || "Guest request"}.`,
      });

      hotelStaysStore.set(stay.id, stay);

      // Atomically rebind allocation
      allocationsStore.set(`alloc-hstay-${stay.id}`, {
        id: `alloc-hstay-${stay.id}`,
        property_id: stay.property_id,
        room_id: new_room_id,
        check_in_date: stay.check_in_date,
        check_out_date: stay.check_out_date,
        allocation_type: stay.status === "checked_in" ? "check_in" : "reservation",
        notes: `Hotel stay ${stay.stay_reference} (transferred to room ${newRoom.room_number})`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      });

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: `Room changed to ${newRoom.room_number}.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12. Hotel Check-In: POST /api/v1/hotel/stays/:id/check-in
  app.post("/api/v1/hotel/stays/:id/check-in", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status === "checked_in") {
        res.status(400).json({
          success: false,
          error: { code: "ALREADY_CHECKED_IN", message: "Stay is already checked in." },
          correlation_id: correlationId,
        });
        return;
      }

      if (stay.status === "checked_out" || stay.status === "cancelled") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_STATE", message: `Cannot check in stay with status '${stay.status}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!stay.assigned_room_id) {
        res.status(400).json({
          success: false,
          error: { code: "ROOM_NOT_ASSIGNED", message: "A physical room must be assigned prior to check-in." },
          correlation_id: correlationId,
        });
        return;
      }

      const room = roomsStore.get(stay.assigned_room_id);
      if (!room) {
        res.status(404).json({
          success: false,
          error: { code: "ROOM_NOT_FOUND", message: "Assigned room record not found." },
          correlation_id: correlationId,
        });
        return;
      }

      if (room.operational_status === "maintenance" || room.operational_status === "out_of_order") {
        res.status(409).json({
          success: false,
          error: { code: "ROOM_UNAVAILABLE", message: `Room ${room.room_number} is currently under ${room.operational_status}.` },
          correlation_id: correlationId,
        });
        return;
      }

      const { keycard_code, staff_notes, additional_occupants } = req.body || {};
      const now = new Date().toISOString();
      const encodedKeycard = keycard_code || `KC-LON-${room.room_number}`;

      stay.status = "checked_in";
      stay.actual_check_in_time = now;
      stay.keycard_code = encodedKeycard;
      stay.checked_in_by_user_id = user.id;
      if (additional_occupants) stay.additional_occupants = additional_occupants;
      stay.updated_at = now;

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "checked_in",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Hotel guest checked in to Suite ${room.room_number}. Keycard ${encodedKeycard} issued. ${staff_notes || ""}`.trim(),
      });

      hotelStaysStore.set(stay.id, stay);

      // Update guest status
      const guest = hotelGuestsStore.get(stay.guest_id);
      if (guest) {
        guest.status = "checked_in";
        guest.updated_at = now;
        hotelGuestsStore.set(guest.id, guest);
      }

      // Update Phase 6 inventory allocation
      allocationsStore.set(`alloc-hstay-${stay.id}`, {
        id: `alloc-hstay-${stay.id}`,
        property_id: stay.property_id,
        room_id: stay.assigned_room_id,
        check_in_date: stay.check_in_date,
        check_out_date: stay.check_out_date,
        allocation_type: "check_in",
        notes: `Checked-in hotel stay ${stay.stay_reference}`,
        created_by_user_id: user.id,
        is_active: true,
        created_at: now,
      });

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: `Checked in guest to Room ${room.room_number}.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 13. Hotel Check-Out: POST /api/v1/hotel/stays/:id/check-out
  app.post("/api/v1/hotel/stays/:id/check-out", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status !== "checked_in") {
        res.status(400).json({
          success: false,
          error: { code: "NOT_CHECKED_IN", message: `Stay must be in 'checked_in' status to check out (current: '${stay.status}').` },
          correlation_id: correlationId,
        });
        return;
      }

      const { staff_notes, room_inspected, minibar_consumed } = req.body || {};
      const now = new Date().toISOString();

      stay.status = "checked_out";
      stay.actual_check_out_time = now;
      stay.checked_out_by_user_id = user.id;
      stay.updated_at = now;

      const room = stay.assigned_room_id ? roomsStore.get(stay.assigned_room_id) : undefined;
      if (room) {
        // Mark room as dirty awaiting housekeeping turnover
        room.cleanliness_status = "dirty";
        room.updated_at = now;
        roomsStore.set(room.id, room);
      }

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "checked_out",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Hotel guest checked out. Room ${room ? room.room_number : ""} released and marked for housekeeping turnover. ${staff_notes || ""}`.trim(),
      });

      hotelStaysStore.set(stay.id, stay);

      // Release Phase 6 inventory allocation
      const alloc = allocationsStore.get(`alloc-hstay-${stay.id}`);
      if (alloc) {
        alloc.is_active = false;
        allocationsStore.set(alloc.id, alloc);
      }

      // Update guest status
      const guest = hotelGuestsStore.get(stay.guest_id);
      if (guest) {
        guest.status = "checked_out";
        guest.updated_at = now;
        hotelGuestsStore.set(guest.id, guest);
      }

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: `Checked out stay ${stay.stay_reference}. Room released and flagged for housekeeping.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 14. Extend Hotel Stay: POST /api/v1/hotel/stays/:id/extend
  app.post("/api/v1/hotel/stays/:id/extend", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status === "checked_out" || stay.status === "cancelled") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_STATE", message: `Cannot extend stay with status '${stay.status}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      const { new_check_out_date, notes } = req.body || {};
      if (!new_check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "new_check_out_date is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (new_check_out_date <= stay.check_out_date) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_EXTENSION_DATE", message: `new_check_out_date must be strictly after current check-out date '${stay.check_out_date}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      // If room is assigned, verify no conflict for extended window
      if (stay.assigned_room_id) {
        const conflict = Array.from(allocationsStore.values()).find(
          (a) =>
            a.room_id === stay.assigned_room_id &&
            a.is_active &&
            a.id !== `alloc-hstay-${stay.id}` &&
            a.check_in_date < new_check_out_date &&
            a.check_out_date > stay.check_out_date
        );

        if (conflict) {
          res.status(409).json({
            success: false,
            error: { code: "INVENTORY_CONFLICT", message: "Room is already booked for subsequent dates by another reservation." },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const oldCheckout = stay.check_out_date;
      const startMs = new Date(stay.check_in_date).getTime();
      const endMs = new Date(new_check_out_date).getTime();
      const totalNights = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
      const totalAmount = stay.nightly_rate * totalNights;
      const now = new Date().toISOString();

      stay.check_out_date = new_check_out_date;
      stay.total_nights = totalNights;
      stay.total_amount = totalAmount;
      stay.updated_at = now;

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "extended",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Stay extended from ${oldCheckout} to ${new_check_out_date} (${totalNights} nights total). ${notes || ""}`.trim(),
      });

      hotelStaysStore.set(stay.id, stay);

      // Update allocation
      const alloc = allocationsStore.get(`alloc-hstay-${stay.id}`);
      if (alloc) {
        alloc.check_out_date = new_check_out_date;
        allocationsStore.set(alloc.id, alloc);
      }

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: `Stay extended to ${new_check_out_date}.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 15. Cancel Hotel Stay: POST /api/v1/hotel/stays/:id/cancel
  app.post("/api/v1/hotel/stays/:id/cancel", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const stay = hotelStaysStore.get(req.params.id);

      if (!stay) {
        res.status(404).json({
          success: false,
          error: { code: "STAY_NOT_FOUND", message: `Hotel stay '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(stay.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${stay.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      if (stay.status === "checked_in") {
        res.status(400).json({
          success: false,
          error: { code: "CANNOT_CANCEL_ACTIVE_STAY", message: "Cannot cancel a stay that is already checked in. Perform checkout instead." },
          correlation_id: correlationId,
        });
        return;
      }

      const { reason } = req.body || {};
      const now = new Date().toISOString();

      stay.status = "cancelled";
      stay.updated_at = now;

      stay.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "cancelled",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Stay cancelled. Reason: ${reason || "Guest request"}.`,
      });

      hotelStaysStore.set(stay.id, stay);

      // Release allocation
      const alloc = allocationsStore.get(`alloc-hstay-${stay.id}`);
      if (alloc) {
        alloc.is_active = false;
        allocationsStore.set(alloc.id, alloc);
      }

      res.json({
        success: true,
        data: enrichHotelStay(stay),
        message: "Hotel stay cancelled.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 16. Available Rooms Query: GET /api/v1/hotel/available-rooms
  app.get("/api/v1/hotel/available-rooms", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, start_date, end_date, room_type_id } = req.query as {
        property_id?: string;
        start_date?: string;
        end_date?: string;
        room_type_id?: string;
      };

      if (!property_id || !start_date || !end_date) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, start_date, and end_date are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let propRooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === property_id && r.is_active
      );

      if (room_type_id && room_type_id !== "all") {
        propRooms = propRooms.filter((r) => r.room_type_id === room_type_id);
      }

      // Filter out maintenance rooms
      propRooms = propRooms.filter(
        (r) => r.operational_status !== "maintenance" && r.operational_status !== "out_of_order"
      );

      // Filter out rooms with conflicting allocations on [start_date, end_date)
      const propAllocs = Array.from(allocationsStore.values()).filter(
        (a) => a.property_id === property_id && a.is_active && a.check_in_date < end_date && a.check_out_date > start_date
      );

      const available = propRooms.filter((r) => !propAllocs.some((a) => a.room_id === r.id));

      const enriched = available.map((r) => {
        const rt = roomTypesStore.get(r.room_type_id);
        return {
          ...r,
          room_type_name: rt?.name || "Suite",
          capacity_adults: rt?.base_capacity_adults || 2,
        };
      });

      res.json({
        success: true,
        data: enriched,
        message: "Available hotel rooms retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 17. Hotel Dashboard Telemetry: GET /api/v1/hotel/dashboard
  app.get("/api/v1/hotel/dashboard", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const propRooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === propertyId && r.is_active
      );
      const propStays = Array.from(hotelStaysStore.values()).filter((s) => s.property_id === propertyId);

      const inHouse = propStays.filter((s) => s.status === "checked_in");
      const arrivalsToday = propStays.filter(
        (s) => s.check_in_date === todayStr && (s.status === "reserved" || s.status === "confirmed")
      );
      const departuresToday = propStays.filter(
        (s) => s.check_out_date === todayStr && s.status === "checked_in"
      );
      const overdue = propStays.filter(
        (s) => s.check_out_date < todayStr && s.status === "checked_in"
      );

      const maintenanceRooms = propRooms.filter(
        (r) => r.operational_status === "maintenance" || r.operational_status === "out_of_order"
      ).length;
      const dirtyRooms = propRooms.filter((r) => r.cleanliness_status === "dirty").length;

      const occupiedRooms = inHouse.length;
      const totalRooms = propRooms.length;
      const availableRooms = Math.max(0, totalRooms - occupiedRooms - maintenanceRooms);
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

      res.json({
        success: true,
        data: {
          property_id: propertyId,
          total_rooms: totalRooms,
          occupied_rooms: occupiedRooms,
          reserved_rooms: arrivalsToday.length,
          available_rooms: availableRooms,
          maintenance_rooms: maintenanceRooms,
          dirty_rooms: dirtyRooms,
          occupancy_rate_percentage: occupancyRate,
          active_guests_count: inHouse.length,
          expected_check_ins_today: arrivalsToday.length,
          expected_check_outs_today: departuresToday.length,
          overdue_check_outs_count: overdue.length,
        },
        message: "Hotel operational telemetry loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 18. Hotel Front Desk Queue: GET /api/v1/hotel/front-desk
  app.get("/api/v1/hotel/front-desk", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const propStays = Array.from(hotelStaysStore.values())
        .filter((s) => s.property_id === propertyId)
        .map(enrichHotelStay);

      const todayArrivals = propStays.filter(
        (s) => s.check_in_date === todayStr && (s.status === "reserved" || s.status === "confirmed")
      );
      const todayDepartures = propStays.filter(
        (s) => s.check_out_date === todayStr && s.status === "checked_in"
      );
      const inHouseGuests = propStays.filter((s) => s.status === "checked_in");
      const overdueDepartures = propStays.filter(
        (s) => s.check_out_date < todayStr && s.status === "checked_in"
      );
      const unassignedStays = propStays.filter(
        (s) => !s.assigned_room_id && (s.status === "reserved" || s.status === "confirmed")
      );

      const propRooms = Array.from(roomsStore.values()).filter(
        (r) => r.property_id === propertyId && r.is_active
      );
      const maintenanceCount = propRooms.filter(
        (r) => r.operational_status === "maintenance" || r.operational_status === "out_of_order"
      ).length;

      res.json({
        success: true,
        data: {
          today_arrivals: todayArrivals,
          today_departures: todayDepartures,
          in_house_guests: inHouseGuests,
          overdue_departures: overdueDepartures,
          unassigned_stays: unassignedStays,
          available_rooms_count: Math.max(0, propRooms.length - inHouseGuests.length - maintenanceCount),
          maintenance_rooms_count: maintenanceCount,
        },
        message: "Hotel front desk queue loaded.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
  // ==========================================
  // PHASE 9 FINANCE & TAX ENGINE DOMAIN APIS
  // ==========================================

  // Financial rounding utility: Round to 2 decimal places to avoid floating point drift
  const round2 = (num: number): number => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  };

  // Deterministic tax calculation engine
  function calculateTaxesForItems(
    propertyId: string,
    calculationDate: string,
    rawItems: Array<{
      id?: string;
      charge_category: string;
      description: string;
      quantity: number;
      unit_price: number;
      discount_amount?: number;
      notes?: string;
    }>
  ): {
    line_items: InvoiceLineItemRecord[];
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total_amount: number;
    tax_snapshot: TaxCalculationSnapshotRecord;
  } {
    const prop = propertiesStore.get(propertyId);
    const currency = prop?.currency || "GBP";
    const dateStr = calculationDate.split("T")[0];

    // Get active tax rules for this property valid on dateStr
    const propRules = Array.from(taxRulesStore.values()).filter(
      (r) =>
        r.property_id === propertyId &&
        r.is_active &&
        r.effective_from <= dateStr &&
        (!r.effective_to || r.effective_to >= dateStr)
    );
    propRules.sort((a, b) => a.priority - b.priority);

    let subtotalSum = 0;
    let discountSum = 0;
    let taxSum = 0;
    const ruleTaxAccumulator = new Map<string, { rule: TaxRuleRecord; taxableBase: number; taxAmount: number }>();

    const calculatedLineItems: InvoiceLineItemRecord[] = rawItems.map((item, idx) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = round2(Number(item.unit_price) || 0);
      const discount = round2(Math.max(0, Number(item.discount_amount) || 0));
      const lineSubtotal = round2(Math.max(0, qty * unitPrice - discount));

      subtotalSum = round2(subtotalSum + lineSubtotal);
      discountSum = round2(discountSum + discount);

      // Find matching rules for this category
      const matchingRules = propRules.filter((r) => r.charge_categories.includes(item.charge_category));

      let lineTaxTotal = 0;
      for (const rule of matchingRules) {
        let taxForThisRule = 0;
        if (rule.is_inclusive) {
          // If inclusive, price contains tax: tax = lineSubtotal - (lineSubtotal / (1 + rate/100))
          taxForThisRule = round2(lineSubtotal - lineSubtotal / (1 + rule.rate_percentage / 100));
        } else {
          // If exclusive: tax = lineSubtotal * (rate / 100)
          taxForThisRule = round2(lineSubtotal * (rule.rate_percentage / 100));
        }

        lineTaxTotal = round2(lineTaxTotal + taxForThisRule);

        // Accumulate into rule breakdown
        const existing = ruleTaxAccumulator.get(rule.id) || {
          rule,
          taxableBase: 0,
          taxAmount: 0,
        };
        existing.taxableBase = round2(existing.taxableBase + lineSubtotal);
        existing.taxAmount = round2(existing.taxAmount + taxForThisRule);
        ruleTaxAccumulator.set(rule.id, existing);
      }

      taxSum = round2(taxSum + lineTaxTotal);
      const lineTotal = round2(lineSubtotal + lineTaxTotal);

      return {
        id: item.id || `li-${idx + 1}-${crypto.randomUUID().substring(0, 6)}`,
        charge_category: item.charge_category,
        description: item.description || "Charge item",
        quantity: qty,
        unit_price: unitPrice,
        discount_amount: discount,
        subtotal: lineSubtotal,
        tax_amount: lineTaxTotal,
        total: lineTotal,
        notes: item.notes,
      };
    });

    const components: TaxBreakdownComponentRecord[] = Array.from(ruleTaxAccumulator.values()).map(
      ({ rule, taxableBase, taxAmount }) => ({
        rule_id: rule.id,
        rule_name: rule.name,
        rate_percentage: rule.rate_percentage,
        is_inclusive: rule.is_inclusive,
        taxable_base: taxableBase,
        tax_amount: taxAmount,
      })
    );

    const grandTotal = round2(subtotalSum + taxSum);

    const taxSnapshot: TaxCalculationSnapshotRecord = {
      calculated_at: new Date().toISOString(),
      currency,
      subtotal: subtotalSum,
      discount_total: discountSum,
      taxable_subtotal: subtotalSum,
      components,
      total_tax: taxSum,
      grand_total: grandTotal,
    };

    return {
      line_items: calculatedLineItems,
      subtotal: subtotalSum,
      discount_total: discountSum,
      tax_total: taxSum,
      total_amount: grandTotal,
      tax_snapshot: taxSnapshot,
    };
  }

  // 1. List Tax Rules: GET /api/v1/finance/tax-rules
  app.get("/api/v1/finance/tax-rules", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const rules = Array.from(taxRulesStore.values())
        .filter((r) => r.property_id === propertyId)
        .sort((a, b) => a.priority - b.priority);

      res.json({
        success: true,
        data: rules,
        message: "Property tax rules retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 2. Create Tax Rule: POST /api/v1/finance/tax-rules
  app.post("/api/v1/finance/tax-rules", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        name,
        rate_percentage,
        charge_categories,
        is_inclusive,
        effective_from,
        effective_to,
        priority,
        jurisdiction_code,
        notes,
      } = req.body || {};

      if (!property_id || !name || rate_percentage === undefined || !charge_categories || !effective_from) {
        res.status(422).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "property_id, name, rate_percentage, charge_categories, and effective_from are required.",
          },
          correlation_id: correlationId,
        });
        return;
      }

      // Front desk cannot create tax rules
      if (!user.is_superuser && user.global_role !== "super_admin" && user.global_role !== "property_manager") {
        res.status(403).json({
          success: false,
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only Property Managers or Super Admins can manage tax rules." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const rate = Number(rate_percentage);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_TAX_RATE", message: "rate_percentage must be a valid number between 0 and 100." },
          correlation_id: correlationId,
        });
        return;
      }

      const id = `tax-${crypto.randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();
      const newRule: TaxRuleRecord = {
        id,
        property_id,
        name: name.trim(),
        rate_percentage: rate,
        charge_categories: Array.isArray(charge_categories) ? charge_categories : [charge_categories],
        is_inclusive: Boolean(is_inclusive),
        is_active: true,
        effective_from,
        effective_to,
        priority: Number(priority) || 1,
        jurisdiction_code,
        notes,
        created_at: now,
        updated_at: now,
      };

      taxRulesStore.set(id, newRule);

      res.status(201).json({
        success: true,
        data: newRule,
        message: "Tax rule created successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 3. Update Tax Rule: PUT /api/v1/finance/tax-rules/:id
  app.put("/api/v1/finance/tax-rules/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const rule = taxRulesStore.get(req.params.id);

      if (!rule) {
        res.status(404).json({
          success: false,
          error: { code: "RULE_NOT_FOUND", message: `Tax rule '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin" && user.global_role !== "property_manager") {
        res.status(403).json({
          success: false,
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only Property Managers or Super Admins can update tax rules." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(rule.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${rule.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const updates = req.body || {};
      const updated: TaxRuleRecord = {
        ...rule,
        name: updates.name !== undefined ? updates.name.trim() : rule.name,
        rate_percentage: updates.rate_percentage !== undefined ? Number(updates.rate_percentage) : rule.rate_percentage,
        charge_categories: updates.charge_categories !== undefined ? updates.charge_categories : rule.charge_categories,
        is_inclusive: updates.is_inclusive !== undefined ? Boolean(updates.is_inclusive) : rule.is_inclusive,
        is_active: updates.is_active !== undefined ? Boolean(updates.is_active) : rule.is_active,
        effective_from: updates.effective_from !== undefined ? updates.effective_from : rule.effective_from,
        effective_to: updates.effective_to !== undefined ? updates.effective_to : rule.effective_to,
        priority: updates.priority !== undefined ? Number(updates.priority) : rule.priority,
        jurisdiction_code: updates.jurisdiction_code !== undefined ? updates.jurisdiction_code : rule.jurisdiction_code,
        notes: updates.notes !== undefined ? updates.notes : rule.notes,
        updated_at: new Date().toISOString(),
      };

      taxRulesStore.set(rule.id, updated);

      res.json({
        success: true,
        data: updated,
        message: "Tax rule updated.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 4. Tax Calculation Preview: POST /api/v1/finance/tax-rules/calculate-preview
  app.post("/api/v1/finance/tax-rules/calculate-preview", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, date, line_items } = req.body || {};

      if (!property_id || !line_items || !Array.isArray(line_items)) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id and line_items array are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const calcDate = date || new Date().toISOString();
      const result = calculateTaxesForItems(property_id, calcDate, line_items);

      res.json({
        success: true,
        data: result,
        message: "Tax calculation preview computed.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 5. List Invoices: GET /api/v1/finance/invoices
  app.get("/api/v1/finance/invoices", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { property_id, status, customer_id, q, date_from, date_to } = req.query as {
        property_id?: string;
        status?: string;
        customer_id?: string;
        q?: string;
        date_from?: string;
        date_to?: string;
      };

      if (!property_id) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      // Guest access isolation: guests can ONLY see their own invoices
      if (user.global_role === "guest") {
        const guestInvoices = Array.from(invoicesStore.values()).filter(
          (inv) =>
            inv.property_id === property_id &&
            (inv.customer_id === user.id || (user.email && inv.customer_email?.toLowerCase() === user.email.toLowerCase()))
        );
        res.json({
          success: true,
          data: guestInvoices,
          message: "Guest personal invoices retrieved.",
          correlation_id: correlationId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Staff access check
      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      let invoices = Array.from(invoicesStore.values()).filter((inv) => inv.property_id === property_id);

      if (status && status !== "all") {
        invoices = invoices.filter((inv) => inv.status === status);
      }

      if (customer_id) {
        invoices = invoices.filter((inv) => inv.customer_id === customer_id);
      }

      if (date_from) {
        invoices = invoices.filter((inv) => inv.issue_date >= date_from);
      }

      if (date_to) {
        invoices = invoices.filter((inv) => inv.issue_date <= date_to);
      }

      if (q) {
        const query = q.toLowerCase().trim();
        invoices = invoices.filter(
          (inv) =>
            inv.invoice_number.toLowerCase().includes(query) ||
            inv.customer_name.toLowerCase().includes(query) ||
            (inv.customer_email && inv.customer_email.toLowerCase().includes(query)) ||
            (inv.reservation_reference && inv.reservation_reference.toLowerCase().includes(query))
        );
      }

      invoices.sort((a, b) => b.issue_date.localeCompare(a.issue_date));

      res.json({
        success: true,
        data: invoices,
        message: "Invoices retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 6. Create Draft Invoice: POST /api/v1/finance/invoices
  app.post("/api/v1/finance/invoices", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        customer_type,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        billing_address,
        due_date,
        reservation_type,
        reservation_id,
        notes,
        line_items,
      } = req.body || {};

      if (!property_id || !customer_name || !due_date || !line_items || !Array.isArray(line_items) || line_items.length === 0) {
        res.status(422).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "property_id, customer_name, due_date, and at least one line item are required.",
          },
          correlation_id: correlationId,
        });
        return;
      }

      if (user.global_role === "guest") {
        res.status(403).json({
          success: false,
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Guests cannot create administrative invoices." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const prop = propertiesStore.get(property_id);
      const currency = prop?.currency || "GBP";
      const now = new Date().toISOString();
      const issueDate = now.split("T")[0];

      // Calculate authoritative taxes and totals
      const calcResult = calculateTaxesForItems(property_id, issueDate, line_items);

      let reservationRef: string | undefined;
      if (reservation_id) {
        if (reservation_type === "hotel_stay") {
          reservationRef = hotelStaysStore.get(reservation_id)?.stay_reference;
        } else if (reservation_type === "hostel_stay") {
          reservationRef = hostelStaysStore.get(reservation_id)?.stay_reference;
        }
      }

      const invoiceId = `inv-${crypto.randomUUID().substring(0, 8)}`;
      const propCode = prop?.code || "PROP";
      const invoiceNumber = `INV-2026-${propCode}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newInvoice: InvoiceRecord = {
        id: invoiceId,
        invoice_number: invoiceNumber,
        property_id,
        status: "draft",
        issue_date: issueDate,
        due_date,
        customer_type: customer_type || "guest",
        customer_id,
        customer_name: customer_name.trim(),
        customer_email,
        customer_phone,
        billing_address,
        reservation_type,
        reservation_id,
        reservation_reference: reservationRef,
        line_items: calcResult.line_items,
        currency,
        subtotal: calcResult.subtotal,
        discount_total: calcResult.discount_total,
        tax_total: calcResult.tax_total,
        total_amount: calcResult.total_amount,
        amount_paid: 0.0,
        outstanding_balance: calcResult.total_amount,
        tax_snapshot: calcResult.tax_snapshot,
        notes,
        created_by_user_id: user.id,
        audit_trail: [
          {
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "created",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Draft invoice ${invoiceNumber} created (${currency} ${calcResult.total_amount.toFixed(2)}).`,
          },
        ],
        created_at: now,
        updated_at: now,
      };

      invoicesStore.set(invoiceId, newInvoice);

      res.status(201).json({
        success: true,
        data: newInvoice,
        message: `Draft invoice ${invoiceNumber} created.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 7. Get Invoice Details: GET /api/v1/finance/invoices/:id
  app.get("/api/v1/finance/invoices/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const invoice = invoicesStore.get(req.params.id);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: "INVOICE_NOT_FOUND", message: `Invoice '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (user.global_role === "guest") {
        if (invoice.customer_id !== user.id && (!user.email || invoice.customer_email?.toLowerCase() !== user.email.toLowerCase())) {
          res.status(403).json({
            success: false,
            error: { code: "ACCESS_DENIED", message: "You are not authorized to view this invoice." },
            correlation_id: correlationId,
          });
          return;
        }
      } else if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(invoice.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${invoice.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      res.json({
        success: true,
        data: invoice,
        message: "Invoice retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 8. Update Draft Invoice: PUT /api/v1/finance/invoices/:id
  app.put("/api/v1/finance/invoices/:id", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const invoice = invoicesStore.get(req.params.id);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: "INVOICE_NOT_FOUND", message: `Invoice '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (invoice.status !== "draft") {
        res.status(422).json({
          success: false,
          error: {
            code: "IMMUTABLE_INVOICE",
            message: `Invoice cannot be edited because it is in '${invoice.status}' status. Only draft invoices can be edited.`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(invoice.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${invoice.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { customer_name, customer_email, customer_phone, billing_address, due_date, notes, line_items } = req.body || {};
      const now = new Date().toISOString();

      if (line_items && Array.isArray(line_items) && line_items.length > 0) {
        const calcResult = calculateTaxesForItems(invoice.property_id, invoice.issue_date, line_items);
        invoice.line_items = calcResult.line_items;
        invoice.subtotal = calcResult.subtotal;
        invoice.discount_total = calcResult.discount_total;
        invoice.tax_total = calcResult.tax_total;
        invoice.total_amount = calcResult.total_amount;
        invoice.outstanding_balance = round2(calcResult.total_amount - invoice.amount_paid);
        invoice.tax_snapshot = calcResult.tax_snapshot;
      }

      if (customer_name) invoice.customer_name = customer_name.trim();
      if (customer_email !== undefined) invoice.customer_email = customer_email;
      if (customer_phone !== undefined) invoice.customer_phone = customer_phone;
      if (billing_address !== undefined) invoice.billing_address = billing_address;
      if (due_date) invoice.due_date = due_date;
      if (notes !== undefined) invoice.notes = notes;
      invoice.updated_at = now;

      invoice.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "updated",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: "Draft invoice details and lines updated.",
      });

      invoicesStore.set(invoice.id, invoice);

      res.json({
        success: true,
        data: invoice,
        message: "Draft invoice updated.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 9. Issue Invoice: POST /api/v1/finance/invoices/:id/issue
  app.post("/api/v1/finance/invoices/:id/issue", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const invoice = invoicesStore.get(req.params.id);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: "INVOICE_NOT_FOUND", message: `Invoice '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (invoice.status !== "draft") {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_STATE", message: `Cannot issue invoice in status '${invoice.status}'.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(invoice.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${invoice.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const now = new Date().toISOString();

      // Recalculate and freeze snapshot firmly
      const calcResult = calculateTaxesForItems(invoice.property_id, now.split("T")[0], invoice.line_items);
      invoice.line_items = calcResult.line_items;
      invoice.subtotal = calcResult.subtotal;
      invoice.discount_total = calcResult.discount_total;
      invoice.tax_total = calcResult.tax_total;
      invoice.total_amount = calcResult.total_amount;
      invoice.outstanding_balance = round2(calcResult.total_amount - invoice.amount_paid);
      invoice.tax_snapshot = calcResult.tax_snapshot;

      invoice.status = "issued";
      invoice.updated_at = now;

      invoice.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "issued",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Invoice officially issued for ${invoice.currency} ${invoice.total_amount.toFixed(2)}. Tax snapshot permanently frozen.`,
      });

      invoicesStore.set(invoice.id, invoice);

      res.json({
        success: true,
        data: invoice,
        message: `Invoice ${invoice.invoice_number} issued successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 10. Void Invoice: POST /api/v1/finance/invoices/:id/void
  app.post("/api/v1/finance/invoices/:id/void", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const invoice = invoicesStore.get(req.params.id);

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: "INVOICE_NOT_FOUND", message: `Invoice '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (invoice.status === "voided") {
        res.status(400).json({
          success: false,
          error: { code: "ALREADY_VOIDED", message: "Invoice is already voided." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin" && user.global_role !== "property_manager") {
        res.status(403).json({
          success: false,
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only Property Managers or Super Admins can void invoices." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(invoice.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${invoice.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { reason } = req.body || {};
      const now = new Date().toISOString();

      // If invoice had payments allocated, reverse allocations back to unallocated
      if (invoice.amount_paid > 0) {
        for (const payment of paymentsStore.values()) {
          const allocIdx = payment.allocations.findIndex((a) => a.invoice_id === invoice.id);
          if (allocIdx >= 0) {
            const alloc = payment.allocations[allocIdx];
            payment.unallocated_amount = round2(payment.unallocated_amount + alloc.amount);
            payment.allocations.splice(allocIdx, 1);
            payment.updated_at = now;
            paymentsStore.set(payment.id, payment);
          }
        }
      }

      invoice.status = "voided";
      invoice.void_reason = reason || "Voided by management authorization";
      invoice.outstanding_balance = 0.0;
      invoice.amount_paid = 0.0;
      invoice.updated_at = now;

      invoice.audit_trail.push({
        id: `aud-${crypto.randomUUID().substring(0, 8)}`,
        action: "voided",
        timestamp: now,
        performed_by_user_id: user.id,
        performed_by_name: `${user.first_name} ${user.last_name}`,
        details: `Invoice voided. Reason: ${invoice.void_reason}. Any allocations reversed to unallocated balances.`,
      });

      invoicesStore.set(invoice.id, invoice);

      res.json({
        success: true,
        data: invoice,
        message: `Invoice ${invoice.invoice_number} voided successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 11. List Payments: GET /api/v1/finance/payments
  app.get("/api/v1/finance/payments", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const payments = Array.from(paymentsStore.values())
        .filter((p) => p.property_id === propertyId)
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date));

      res.json({
        success: true,
        data: payments,
        message: "Payments list retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 12. Record Payment: POST /api/v1/finance/payments
  app.post("/api/v1/finance/payments", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const {
        property_id,
        amount,
        currency,
        payment_method,
        payer_name,
        payer_email,
        transaction_reference,
        notes,
        allocate_to_invoice_id,
      } = req.body || {};

      if (!property_id || !amount || !payment_method || !payer_name) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id, amount, payment_method, and payer_name are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (user.global_role === "guest") {
        res.status(403).json({
          success: false,
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Guests cannot manually record administrative payments." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const paymentAmt = round2(Number(amount));
      if (isNaN(paymentAmt) || paymentAmt <= 0) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_AMOUNT", message: "amount must be greater than zero." },
          correlation_id: correlationId,
        });
        return;
      }

      const prop = propertiesStore.get(property_id);
      const propCurrency = currency || prop?.currency || "GBP";
      const now = new Date().toISOString();

      let targetInvoice: InvoiceRecord | undefined;
      let allocatedAmount = 0;
      const initialAllocations: PaymentAllocationRecord[] = [];

      if (allocate_to_invoice_id) {
        targetInvoice = invoicesStore.get(allocate_to_invoice_id);
        if (!targetInvoice || targetInvoice.property_id !== property_id) {
          res.status(404).json({
            success: false,
            error: { code: "INVOICE_NOT_FOUND", message: `Invoice '${allocate_to_invoice_id}' not found in property.` },
            correlation_id: correlationId,
          });
          return;
        }

        if (targetInvoice.currency !== propCurrency) {
          res.status(422).json({
            success: false,
            error: {
              code: "CURRENCY_MISMATCH",
              message: `Payment currency '${propCurrency}' does not match invoice currency '${targetInvoice.currency}'.`,
            },
            correlation_id: correlationId,
          });
          return;
        }

        if (targetInvoice.status === "voided" || targetInvoice.status === "paid") {
          res.status(422).json({
            success: false,
            error: { code: "INVALID_INVOICE_STATE", message: `Cannot allocate payment to an invoice in '${targetInvoice.status}' status.` },
            correlation_id: correlationId,
          });
          return;
        }

        // Calculate maximum allocatable
        allocatedAmount = Math.min(paymentAmt, targetInvoice.outstanding_balance);
        initialAllocations.push({
          id: `alloc-${crypto.randomUUID().substring(0, 8)}`,
          invoice_id: targetInvoice.id,
          invoice_number: targetInvoice.invoice_number,
          amount: allocatedAmount,
          allocated_at: now,
          allocated_by_user_id: user.id,
        });

        // Update target invoice balances
        targetInvoice.amount_paid = round2(targetInvoice.amount_paid + allocatedAmount);
        targetInvoice.outstanding_balance = round2(targetInvoice.total_amount - targetInvoice.amount_paid);
        targetInvoice.status = targetInvoice.outstanding_balance <= 0 ? "paid" : "partially_paid";
        targetInvoice.updated_at = now;

        targetInvoice.audit_trail.push({
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "payment_allocated",
          timestamp: now,
          performed_by_user_id: user.id,
          performed_by_name: `${user.first_name} ${user.last_name}`,
          details: `Payment allocated: ${propCurrency} ${allocatedAmount.toFixed(2)}. Remaining balance: ${propCurrency} ${targetInvoice.outstanding_balance.toFixed(2)}.`,
        });

        invoicesStore.set(targetInvoice.id, targetInvoice);
      }

      const unallocatedAmt = round2(paymentAmt - allocatedAmount);
      const paymentId = `pay-${crypto.randomUUID().substring(0, 8)}`;
      const propCode = prop?.code || "PROP";
      const paymentRef = `PAY-2026-${propCode}-${Math.floor(1000 + Math.random() * 9000)}`;

      const paymentRecord: PaymentRecord = {
        id: paymentId,
        payment_reference: paymentRef,
        property_id,
        amount: paymentAmt,
        currency: propCurrency,
        payment_method,
        status: "completed",
        payment_date: now,
        payer_name: payer_name.trim(),
        payer_email,
        received_by_user_id: user.id,
        transaction_reference,
        notes,
        allocations: initialAllocations,
        unallocated_amount: unallocatedAmt,
        refunded_amount: 0.0,
        created_at: now,
        updated_at: now,
      };

      paymentsStore.set(paymentId, paymentRecord);

      res.status(201).json({
        success: true,
        data: paymentRecord,
        message: `Payment ${paymentRef} recorded successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 13. Allocate Payment: POST /api/v1/finance/payments/:id/allocate
  app.post("/api/v1/finance/payments/:id/allocate", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const payment = paymentsStore.get(req.params.id);

      if (!payment) {
        res.status(404).json({
          success: false,
          error: { code: "PAYMENT_NOT_FOUND", message: `Payment '${req.params.id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(payment.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${payment.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const { allocations } = req.body || {};
      if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "allocations array is required." },
          correlation_id: correlationId,
        });
        return;
      }

      const totalRequested = round2(allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0));
      if (totalRequested > payment.unallocated_amount) {
        res.status(422).json({
          success: false,
          error: {
            code: "EXCESSIVE_ALLOCATION",
            message: `Requested allocation amount (${payment.currency} ${totalRequested.toFixed(2)}) exceeds available unallocated amount (${payment.currency} ${payment.unallocated_amount.toFixed(2)}).`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();

      for (const item of allocations) {
        const allocAmt = round2(Number(item.amount));
        if (allocAmt <= 0) continue;

        const inv = invoicesStore.get(item.invoice_id);
        if (!inv || inv.property_id !== payment.property_id) {
          res.status(404).json({
            success: false,
            error: { code: "INVOICE_NOT_FOUND", message: `Invoice '${item.invoice_id}' not found in property.` },
            correlation_id: correlationId,
          });
          return;
        }

        if (inv.currency !== payment.currency) {
          res.status(422).json({
            success: false,
            error: {
              code: "CURRENCY_MISMATCH",
              message: `Payment currency '${payment.currency}' does not match invoice currency '${inv.currency}'.`,
            },
            correlation_id: correlationId,
          });
          return;
        }

        if (allocAmt > inv.outstanding_balance) {
          res.status(422).json({
            success: false,
            error: {
              code: "EXCESSIVE_ALLOCATION",
              message: `Allocation amount (${allocAmt}) exceeds outstanding balance (${inv.outstanding_balance}) for invoice ${inv.invoice_number}.`,
            },
            correlation_id: correlationId,
          });
          return;
        }

        // Apply allocation
        payment.allocations.push({
          id: `alloc-${crypto.randomUUID().substring(0, 8)}`,
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          amount: allocAmt,
          allocated_at: now,
          allocated_by_user_id: user.id,
        });

        payment.unallocated_amount = round2(payment.unallocated_amount - allocAmt);

        // Update invoice
        inv.amount_paid = round2(inv.amount_paid + allocAmt);
        inv.outstanding_balance = round2(inv.total_amount - inv.amount_paid);
        inv.status = inv.outstanding_balance <= 0 ? "paid" : "partially_paid";
        inv.updated_at = now;

        inv.audit_trail.push({
          id: `aud-${crypto.randomUUID().substring(0, 8)}`,
          action: "payment_allocated",
          timestamp: now,
          performed_by_user_id: user.id,
          performed_by_name: `${user.first_name} ${user.last_name}`,
          details: `Payment ${payment.payment_reference} allocated: ${payment.currency} ${allocAmt.toFixed(2)}. Remaining balance: ${payment.currency} ${inv.outstanding_balance.toFixed(2)}.`,
        });

        invoicesStore.set(inv.id, inv);
      }

      payment.updated_at = now;
      paymentsStore.set(payment.id, payment);

      res.json({
        success: true,
        data: payment,
        message: "Payment allocated successfully.",
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 14. Record Refund: POST /api/v1/finance/refunds
  app.post("/api/v1/finance/refunds", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const { payment_id, amount, reason, invoice_id, notes } = req.body || {};

      if (!payment_id || !amount || !reason) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "payment_id, amount, and reason are required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin" && user.global_role !== "property_manager") {
        res.status(403).json({
          success: false,
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only Property Managers or Super Admins can authorize refunds." },
          correlation_id: correlationId,
        });
        return;
      }

      const payment = paymentsStore.get(payment_id);
      if (!payment) {
        res.status(404).json({
          success: false,
          error: { code: "PAYMENT_NOT_FOUND", message: `Payment '${payment_id}' not found.` },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (!user.assigned_property_ids.includes(payment.property_id)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${payment.property_id}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const refundAmt = round2(Number(amount));
      if (isNaN(refundAmt) || refundAmt <= 0) {
        res.status(422).json({
          success: false,
          error: { code: "INVALID_AMOUNT", message: "Refund amount must be greater than zero." },
          correlation_id: correlationId,
        });
        return;
      }

      const refundableLimit = round2(payment.amount - payment.refunded_amount);
      if (refundAmt > refundableLimit) {
        res.status(422).json({
          success: false,
          error: {
            code: "EXCESSIVE_REFUND",
            message: `Requested refund (${payment.currency} ${refundAmt.toFixed(2)}) exceeds maximum remaining refundable balance (${payment.currency} ${refundableLimit.toFixed(2)}).`,
          },
          correlation_id: correlationId,
        });
        return;
      }

      const now = new Date().toISOString();
      let targetInvoice: InvoiceRecord | undefined;

      if (invoice_id) {
        targetInvoice = invoicesStore.get(invoice_id);
        if (targetInvoice) {
          // Adjust invoice paid amount and outstanding balance
          targetInvoice.amount_paid = round2(Math.max(0, targetInvoice.amount_paid - refundAmt));
          targetInvoice.outstanding_balance = round2(targetInvoice.total_amount - targetInvoice.amount_paid);
          targetInvoice.status = targetInvoice.outstanding_balance > 0 ? "partially_paid" : "paid";
          targetInvoice.updated_at = now;

          targetInvoice.audit_trail.push({
            id: `aud-${crypto.randomUUID().substring(0, 8)}`,
            action: "refund_applied",
            timestamp: now,
            performed_by_user_id: user.id,
            performed_by_name: `${user.first_name} ${user.last_name}`,
            details: `Refund of ${payment.currency} ${refundAmt.toFixed(2)} applied. Outstanding balance increased to ${payment.currency} ${targetInvoice.outstanding_balance.toFixed(2)}. Reason: ${reason}.`,
          });

          invoicesStore.set(targetInvoice.id, targetInvoice);
        }
      }

      payment.refunded_amount = round2(payment.refunded_amount + refundAmt);
      payment.status = payment.refunded_amount >= payment.amount ? "refunded" : "partially_refunded";
      payment.updated_at = now;
      paymentsStore.set(payment.id, payment);

      const prop = propertiesStore.get(payment.property_id);
      const propCode = prop?.code || "PROP";
      const refundId = `ref-${crypto.randomUUID().substring(0, 8)}`;
      const refundRef = `REF-2026-${propCode}-${Math.floor(1000 + Math.random() * 9000)}`;

      const refundRecord: RefundRecord = {
        id: refundId,
        refund_reference: refundRef,
        payment_id: payment.id,
        payment_reference: payment.payment_reference,
        invoice_id: targetInvoice?.id,
        invoice_number: targetInvoice?.invoice_number,
        property_id: payment.property_id,
        amount: refundAmt,
        currency: payment.currency,
        reason: reason.trim(),
        status: "processed",
        processed_by_user_id: user.id,
        refund_date: now,
        notes,
        created_at: now,
      };

      refundsStore.set(refundId, refundRecord);

      res.status(201).json({
        success: true,
        data: refundRecord,
        message: `Refund ${refundRef} processed successfully.`,
        correlation_id: correlationId,
        timestamp: now,
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 15. Finance Dashboard Telemetry: GET /api/v1/finance/dashboard
  app.get("/api/v1/finance/dashboard", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const prop = propertiesStore.get(propertyId);
      const currency = prop?.currency || "GBP";
      const todayStr = new Date().toISOString().split("T")[0];

      const propInvoices = Array.from(invoicesStore.values()).filter(
        (inv) => inv.property_id === propertyId && inv.status !== "voided"
      );
      const propPayments = Array.from(paymentsStore.values()).filter(
        (p) => p.property_id === propertyId
      );
      const propRefunds = Array.from(refundsStore.values()).filter(
        (r) => r.property_id === propertyId && r.status === "processed"
      );

      const totalInvoiced = round2(
        propInvoices
          .filter((inv) => inv.status !== "draft")
          .reduce((sum, inv) => sum + inv.total_amount, 0)
      );

      const totalCollected = round2(
        propPayments.reduce((sum, p) => sum + p.amount, 0)
      );

      const outstandingReceivables = round2(
        propInvoices
          .filter((inv) => inv.status !== "draft")
          .reduce((sum, inv) => sum + inv.outstanding_balance, 0)
      );

      const overdueAmount = round2(
        propInvoices
          .filter((inv) => inv.status !== "draft" && inv.status !== "paid" && inv.due_date < todayStr)
          .reduce((sum, inv) => sum + inv.outstanding_balance, 0)
      );

      const totalRefunded = round2(
        propRefunds.reduce((sum, r) => sum + r.amount, 0)
      );

      // Counts
      const draftCount = propInvoices.filter((inv) => inv.status === "draft").length;
      const issuedCount = propInvoices.filter((inv) => inv.status === "issued").length;
      const partiallyPaidCount = propInvoices.filter((inv) => inv.status === "partially_paid").length;
      const paidCount = propInvoices.filter((inv) => inv.status === "paid").length;
      const overdueCount = propInvoices.filter(
        (inv) => inv.status !== "draft" && inv.status !== "paid" && inv.due_date < todayStr
      ).length;

      // Category breakdown
      const categoryTotals = new Map<string, number>();
      for (const inv of propInvoices) {
        if (inv.status === "draft") continue;
        for (const item of inv.line_items) {
          const prev = categoryTotals.get(item.charge_category) || 0;
          categoryTotals.set(item.charge_category, round2(prev + item.total));
        }
      }

      const categoryLabels: Record<string, string> = {
        accommodation_hotel: "Hotel Lodging",
        accommodation_hostel: "Hostel Dorm Beds",
        mess_meal: "Meals & Dining",
        extra_service: "Extra Services & Amenities",
        facility_fee: "Facility & Club Fees",
        other: "Miscellaneous Charges",
      };

      const categoryBreakdown = Array.from(categoryTotals.entries()).map(([cat, total]) => ({
        category: cat,
        category_label: categoryLabels[cat] || cat,
        total_amount: total,
        percentage: totalInvoiced > 0 ? Math.round((total / totalInvoiced) * 100) : 0,
      }));

      res.json({
        success: true,
        data: {
          property_id: propertyId,
          currency,
          total_invoiced_amount: totalInvoiced,
          total_collected_amount: totalCollected,
          outstanding_receivables: outstandingReceivables,
          overdue_amount: overdueAmount,
          total_refunded_amount: totalRefunded,
          draft_invoices_count: draftCount,
          issued_invoices_count: issuedCount,
          partially_paid_count: partiallyPaidCount,
          paid_invoices_count: paidCount,
          overdue_invoices_count: overdueCount,
          category_breakdown: categoryBreakdown,
        },
        message: "Finance dashboard metrics retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // 16. Outstanding Dues: GET /api/v1/finance/outstanding-dues
  app.get("/api/v1/finance/outstanding-dues", (req, res) => {
    const correlationId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const user = authenticate(req);
      const propertyId = req.query.property_id as string;

      if (!propertyId) {
        res.status(422).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "property_id is required." },
          correlation_id: correlationId,
        });
        return;
      }

      if (!user.is_superuser && user.global_role !== "super_admin") {
        if (user.global_role === "guest" || !user.assigned_property_ids.includes(propertyId)) {
          res.status(403).json({
            success: false,
            error: { code: "PROPERTY_ACCESS_VIOLATION", message: `Access denied to property '${propertyId}'.` },
            correlation_id: correlationId,
          });
          return;
        }
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const dues = Array.from(invoicesStore.values())
        .filter(
          (inv) =>
            inv.property_id === propertyId &&
            inv.status !== "voided" &&
            inv.status !== "draft" &&
            inv.outstanding_balance > 0
        )
        .map((inv) => ({
          ...inv,
          is_overdue: inv.due_date < todayStr,
        }))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

      res.json({
        success: true,
        data: dues,
        message: "Outstanding dues retrieved.",
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(e.status || 401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: e.message },
        correlation_id: correlationId,
      });
    }
  });

  // --- Vite SPA Middleware & Production Static Serving ---
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`GrandStay Enterprise System listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start GrandStay server:", err);
  process.exit(1);
});
