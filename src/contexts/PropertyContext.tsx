import React, { createContext, useContext, useState } from "react";
import { Property } from "@/src/types/property";

// Baseline multi-property profiles representing different business workflows
export const INITIAL_PROPERTIES: Property[] = [
  {
    id: "prop-hostel-001",
    code: "HST-EDI-01",
    name: "GrandStay Royal Mile Hostel",
    property_type: "hostel",
    currency: "GBP",
    timezone: "Europe/London",
    address: "104 High Street, Old Town",
    city: "Edinburgh",
    country: "United Kingdom",
    postal_code: "EH1 1SG",
    contact_email: "edinburgh.hostel@grandstay.com",
    contact_phone: "+44 131 555 0192",
    total_rooms: 18,
    total_beds: 124,
    configuration: {
      allow_mixed_gender_dorms: true,
      lockers_provided: true,
      linen_deposit: 10.0,
      curfew_enabled: false,
      quiet_hours_start: "23:00",
      quiet_hours_end: "07:00",
      communal_kitchen_access: true,
      dorm_sharing_rules: "Bed-level allocation with gender preference tags",
    },
    is_active: true,
    created_at: "2026-01-10T08:00:00Z",
    updated_at: "2026-10-15T12:00:00Z",
  },
  {
    id: "prop-hotel-002",
    code: "HTL-LON-02",
    name: "GrandStay Mayfair Grand Hotel",
    property_type: "hotel",
    currency: "GBP",
    timezone: "Europe/London",
    address: "42 Park Lane, Mayfair",
    city: "London",
    country: "United Kingdom",
    postal_code: "W1K 1PN",
    contact_email: "mayfair.hotel@grandstay.com",
    contact_phone: "+44 20 7946 0883",
    total_rooms: 86,
    total_beds: 110,
    configuration: {
      star_rating: 5,
      concierge_available: true,
      room_service_hours: "24/7",
      daily_housekeeping: true,
      minibar_enabled: true,
      valet_parking: true,
      deposit_percentage: 25.0,
      room_allocation_rules: "Full private room inventory with keycard access",
    },
    is_active: true,
    created_at: "2026-02-14T10:00:00Z",
    updated_at: "2026-10-16T14:30:00Z",
  },
  {
    id: "prop-hybrid-003",
    code: "HYB-BER-03",
    name: "GrandStay Mitte Hybrid Campus",
    property_type: "hybrid",
    currency: "EUR",
    timezone: "Europe/Berlin",
    address: "Torstraße 180, Mitte",
    city: "Berlin",
    country: "Germany",
    postal_code: "10115",
    contact_email: "berlin.hybrid@grandstay.com",
    contact_phone: "+49 30 5678 9100",
    total_rooms: 44,
    total_beds: 160,
    configuration: {
      wings: ["West Wing: Dorm Pods", "East Wing: Executive Boutique Suites"],
      allow_mixed_gender_dorms: true,
      daily_housekeeping: true,
      communal_kitchen_access: true,
      valet_parking: false,
    },
    is_active: true,
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-10-17T09:00:00Z",
  },
];

interface PropertyContextType {
  properties: Property[];
  activeProperty: Property;
  setActivePropertyId: (id: string) => void;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const [properties] = useState<Property[]>(INITIAL_PROPERTIES);
  const [activePropertyId, setActivePropertyId] = useState<string>(INITIAL_PROPERTIES[0].id);

  const activeProperty =
    properties.find((p) => p.id === activePropertyId) || properties[0];

  return (
    <PropertyContext.Provider
      value={{
        properties,
        activeProperty,
        setActivePropertyId,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperty() {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error("useProperty must be used within a PropertyProvider");
  }
  return context;
}
