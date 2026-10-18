/**
 * Inventory management domain models for rooms, beds, allocations, and availability.
 */

export type RoomOperationalStatus = "available" | "occupied" | "maintenance" | "out_of_order";

export type CleanlinessStatus = "clean" | "dirty" | "inspected" | "do_not_disturb";

export type BedType = "standard_single" | "bunk_bottom" | "bunk_top" | "double";

export type AccommodationTier = "hotel_room" | "hostel_dorm" | "hostel_private";

export type GenderPolicy = "any" | "mixed_only" | "female_only" | "male_only";

export interface RoomType {
  id: string;
  property_id: string;
  name: string;
  slug: string;
  code: string;
  accommodation_tier: AccommodationTier;
  description?: string;
  base_capacity_adults: number;
  max_capacity_adults: number;
  max_capacity_children: number;
  is_dormitory: boolean;
  gender_policy: GenderPolicy;
  base_price_amount: number;
  amenities: string[];
  is_published: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Bed {
  id: string;
  property_id: string;
  room_id: string;
  bed_label: string;
  bed_type: BedType;
  locker_number?: string;
  operational_status: RoomOperationalStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  property_id: string;
  room_type_id: string;
  floor_id?: string;
  floor_name?: string;
  room_number: string;
  operational_status: RoomOperationalStatus;
  cleanliness_status: CleanlinessStatus;
  keycard_code?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Enriched specs
  room_type_name?: string;
  room_type_code?: string;
  accommodation_tier?: AccommodationTier;
  is_dormitory?: boolean;
  capacity_adults?: number;
  beds?: Bed[];
}

export interface InventoryAllocation {
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

export interface AvailabilityUnit {
  id: string;
  unit_type: "room" | "bed";
  identifier: string;
  room_number: string;
  room_id: string;
  room_type_id: string;
  room_type_name: string;
  accommodation_tier: AccommodationTier;
  is_dormitory: boolean;
  base_price_per_night: number;
  operational_status: RoomOperationalStatus;
  is_available: boolean;
  conflict_reason?: string | null;
}

export interface RoomTypeAvailabilitySummary {
  room_type_id: string;
  room_type_name: string;
  slug: string;
  accommodation_tier: AccommodationTier;
  is_dormitory: boolean;
  base_price_per_night: number;
  total_units: number;
  available_units: number;
  occupied_or_reserved_units: number;
  blocked_or_maintenance_units: number;
}

export interface PropertyAvailabilityResponse {
  property_id: string;
  check_in_date: string;
  check_out_date: string;
  total_nights: number;
  is_stay_valid: boolean;
  room_types: RoomTypeAvailabilitySummary[];
  units: AvailabilityUnit[];
}

export interface InventorySummaryResponse {
  property_id: string;
  total_active_rooms: number;
  total_active_beds: number;
  rooms_available: number;
  rooms_occupied: number;
  rooms_maintenance: number;
  beds_available: number;
  beds_occupied: number;
  beds_maintenance: number;
  occupancy_rate_percentage: number;
}

export interface CalendarDayStatus {
  date: string;
  status: "available" | "reserved" | "occupied" | "maintenance" | "blocked";
  notes?: string;
}

export interface CalendarRowItem {
  unit_id: string;
  unit_type: "room" | "bed";
  identifier: string;
  room_number: string;
  room_type_name: string;
  floor_name?: string;
  days: CalendarDayStatus[];
}

export interface CalendarMatrixResponse {
  property_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  rows: CalendarRowItem[];
}
