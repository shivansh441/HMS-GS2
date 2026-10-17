/**
 * Multi-property and workflow domain models.
 */

export type PropertyType = "hostel" | "hotel" | "hybrid";

export type UserRole =
  | "super_admin"
  | "property_manager"
  | "front_desk"
  | "housekeeping"
  | "accountant"
  | "guest";

export interface HostelConfig {
  allow_mixed_gender_dorms: boolean;
  lockers_provided: boolean;
  linen_deposit: number;
  curfew_enabled: boolean;
  curfew_time?: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  communal_kitchen_access: boolean;
}

export interface HotelConfig {
  star_rating: number;
  concierge_available: boolean;
  room_service_hours: string;
  daily_housekeeping: boolean;
  minibar_enabled: boolean;
  valet_parking: boolean;
  deposit_percentage: number;
}

export interface Property {
  id: string;
  code: string;
  name: string;
  property_type: PropertyType;
  currency: string;
  timezone: string;
  address: string;
  city: string;
  country: string;
  postal_code?: string;
  contact_email?: string;
  contact_phone?: string;
  total_rooms: number;
  total_beds: number;
  configuration: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
