/**
 * Multi-property and workflow domain models.
 */

export type PropertyType = "hostel" | "hotel" | "hybrid";

export type PublicationStatus = "published" | "draft" | "unpublished";

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
  slug: string;
  name: string;
  property_type: PropertyType;
  currency: string;
  timezone: string;
  description?: string;
  address: string;
  city: string;
  state_province?: string;
  country: string;
  postal_code?: string;
  contact_email?: string;
  contact_phone?: string;
  latitude?: number;
  longitude?: number;
  total_rooms: number;
  total_beds: number;
  publication_status: PublicationStatus;
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

export interface PropertyCreateInput {
  name: string;
  code: string;
  slug: string;
  property_type: PropertyType;
  currency: string;
  timezone: string;
  description?: string;
  address: string;
  city: string;
  state_province?: string;
  country: string;
  postal_code?: string;
  contact_email?: string;
  contact_phone?: string;
  checkin_time_start?: string;
  checkout_time_deadline?: string;
  publication_status?: PublicationStatus;
  is_bookable?: boolean;
  amenities?: string[];
  policies?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
}

export interface PropertyUpdateInput {
  name?: string;
  code?: string;
  slug?: string;
  property_type?: PropertyType;
  currency?: string;
  timezone?: string;
  description?: string;
  address?: string;
  city?: string;
  state_province?: string;
  country?: string;
  postal_code?: string;
  contact_email?: string;
  contact_phone?: string;
  checkin_time_start?: string;
  checkout_time_deadline?: string;
  publication_status?: PublicationStatus;
  is_bookable?: boolean;
  amenities?: string[];
  policies?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  total_rooms?: number;
  total_beds?: number;
}

export interface PropertyFilters {
  property_type?: string;
  publication_status?: string;
  q?: string;
  include_inactive?: boolean;
}
