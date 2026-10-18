/**
 * Phase 7: Hostel Operations Domain Types
 * Covers Hosteller profiles, stays, bed assignments, check-in/out workflows,
 * front-desk queues, and occupancy telemetry.
 */

export type HostellerStatus = "active" | "checked_in" | "checked_out" | "inactive";

export type HostelStayStatus =
  | "reserved"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export interface HostellerEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface HostellerProfile {
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
  emergency_contact?: HostellerEmergencyContact;
  status: HostellerStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface HostelStayAuditRecord {
  id: string;
  action: "created" | "checked_in" | "checked_out" | "reassigned" | "extended" | "cancelled";
  timestamp: string;
  performed_by_user_id: string;
  performed_by_name: string;
  details: string;
}

export interface HostelStay {
  id: string;
  stay_reference: string;
  property_id: string;
  hosteller_id: string;
  booking_id?: string;
  room_id: string;
  bed_id: string;
  check_in_date: string; // YYYY-MM-DD
  check_out_date: string; // YYYY-MM-DD
  actual_check_in_time?: string; // ISO
  actual_check_out_time?: string; // ISO
  status: HostelStayStatus;
  special_requests?: string;
  locker_number?: string;
  keycard_code?: string;
  checked_in_by_user_id?: string;
  checked_out_by_user_id?: string;
  nightly_rate: number;
  total_nights: number;
  total_amount: number;
  currency: string;
  audit_trail: HostelStayAuditRecord[];
  created_at: string;
  updated_at: string;

  // Enriched display fields
  hosteller?: HostellerProfile;
  hosteller_name?: string;
  room_number?: string;
  bed_label?: string;
  room_type_name?: string;
  is_dormitory?: boolean;
}

export interface HostelOperationalSummary {
  property_id: string;
  total_beds: number;
  occupied_beds: number;
  reserved_beds: number;
  available_beds: number;
  maintenance_beds: number;
  occupancy_rate_percentage: number;
  active_hostellers_count: number;
  expected_check_ins_today: number;
  expected_check_outs_today: number;
  overdue_check_outs_count: number;
}

export interface HostelFrontDeskQueue {
  today_arrivals: HostelStay[];
  today_departures: HostelStay[];
  in_house_hostellers: HostelStay[];
  overdue_departures: HostelStay[];
  available_beds_count: number;
  maintenance_exceptions_count: number;
}

export interface CreateHostellerInput {
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
  emergency_contact?: HostellerEmergencyContact;
  notes?: string;
}

export interface CreateHostelStayInput {
  property_id: string;
  hosteller_id: string;
  booking_id?: string;
  room_id: string;
  bed_id: string;
  check_in_date: string;
  check_out_date: string;
  special_requests?: string;
  locker_number?: string;
  keycard_code?: string;
}

export interface WalkInStayInput {
  property_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
  nationality?: string;
  emergency_contact?: HostellerEmergencyContact;
  room_id: string;
  bed_id: string;
  check_in_date: string;
  check_out_date: string;
  special_requests?: string;
  locker_number?: string;
  keycard_code?: string;
}
