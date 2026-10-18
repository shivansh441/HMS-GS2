/**
 * Phase 8: Hotel Operations Domain Types
 * Covers Hotel Guest profiles, room-level stays, physical room assignments,
 * check-in/out workflows, room changes, front-desk queues, and occupancy telemetry.
 */

export type HotelGuestStatus = "active" | "checked_in" | "checked_out" | "inactive";

export type HotelStayStatus =
  | "reserved"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export type VipTier = "standard" | "silver" | "gold" | "platinum";

export interface AdditionalOccupant {
  name: string;
  relationship: string;
}

export interface HotelGuestProfile {
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
  vip_tier: VipTier;
  special_preferences?: string;
  status: HotelGuestStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface HotelStayAuditRecord {
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
}

export interface HotelStay {
  id: string;
  stay_reference: string;
  property_id: string;
  guest_id: string;
  booking_id?: string;
  room_type_id: string;
  assigned_room_id?: string;
  check_in_date: string; // YYYY-MM-DD
  check_out_date: string; // YYYY-MM-DD
  actual_check_in_time?: string; // ISO
  actual_check_out_time?: string; // ISO
  status: HotelStayStatus;
  adult_count: number;
  child_count: number;
  additional_occupants?: AdditionalOccupant[];
  special_requests?: string;
  keycard_code?: string;
  checked_in_by_user_id?: string;
  checked_out_by_user_id?: string;
  nightly_rate: number;
  total_nights: number;
  total_amount: number;
  currency: string;
  audit_trail: HotelStayAuditRecord[];
  created_at: string;
  updated_at: string;

  // Enriched display fields
  guest?: HotelGuestProfile;
  guest_name?: string;
  room_number?: string;
  room_type_name?: string;
  floor_name?: string;
}

export interface HotelOperationalSummary {
  property_id: string;
  total_rooms: number;
  occupied_rooms: number;
  reserved_rooms: number;
  available_rooms: number;
  maintenance_rooms: number;
  dirty_rooms: number;
  occupancy_rate_percentage: number;
  active_guests_count: number;
  expected_check_ins_today: number;
  expected_check_outs_today: number;
  overdue_check_outs_count: number;
}

export interface HotelFrontDeskQueue {
  today_arrivals: HotelStay[];
  today_departures: HotelStay[];
  in_house_guests: HotelStay[];
  overdue_departures: HotelStay[];
  unassigned_stays: HotelStay[];
  available_rooms_count: number;
  maintenance_rooms_count: number;
}

export interface CreateHotelGuestInput {
  property_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  nationality?: string;
  vip_tier?: VipTier;
  special_preferences?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
}

export interface CreateHotelStayInput {
  property_id: string;
  guest_id: string;
  booking_id?: string;
  room_type_id: string;
  assigned_room_id?: string;
  check_in_date: string;
  check_out_date: string;
  adult_count?: number;
  child_count?: number;
  additional_occupants?: AdditionalOccupant[];
  special_requests?: string;
  nightly_rate?: number;
}

export interface WalkInHotelStayInput {
  property_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  nationality?: string;
  vip_tier?: VipTier;
  room_id: string;
  room_type_id?: string;
  check_in_date: string;
  check_out_date: string;
  adult_count?: number;
  child_count?: number;
  nightly_rate?: number;
  special_requests?: string;
  keycard_code?: string;
  immediate_check_in?: boolean;
}
