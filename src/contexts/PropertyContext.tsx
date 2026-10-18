import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Property, PropertyCreateInput, PropertyUpdateInput, PublicationStatus } from "@/src/types/property";
import {
  fetchAdminProperties,
  fetchPublicProperties,
  createProperty as apiCreateProperty,
  updateProperty as apiUpdateProperty,
  publishProperty as apiPublishProperty,
  archiveProperty as apiArchiveProperty,
  getAccessToken,
} from "@/src/services/api-client";

// Baseline multi-property profiles representing different business workflows
export const INITIAL_PROPERTIES: Property[] = [
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
    checkin_time_start: "14:00",
    checkout_time_deadline: "10:30",
    amenities: ["Free High-Speed Wi-Fi", "Secure Keycard Lockers", "Communal Kitchen", "Luggage Storage"],
    policies: { cancellation: "Free cancellation up to 24h before arrival", curfew: "None - 24/7 keycard entry" },
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
      room_allocation_rules: "Full private room inventory with keycard access",
    },
    is_active: true,
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
    checkin_time_start: "14:00",
    checkout_time_deadline: "11:00",
    amenities: ["Coworking Hub", "Rooftop Terrace", "Bicycle Rental", "Specialty Coffee Bar"],
    policies: { cancellation: "Flexible up to 24h prior" },
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
  isLoading: boolean;
  error: string | null;
  setActivePropertyId: (id: string) => void;
  refreshProperties: () => Promise<void>;
  createProperty: (payload: PropertyCreateInput) => Promise<Property>;
  updateProperty: (propertyId: string, payload: PropertyUpdateInput) => Promise<Property>;
  publishProperty: (propertyId: string, publicationStatus: PublicationStatus) => Promise<Property>;
  archiveProperty: (propertyId: string) => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<Property[]>(INITIAL_PROPERTIES);
  const [activePropertyId, setActivePropertyId] = useState<string>(INITIAL_PROPERTIES[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProperties = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (getAccessToken()) {
        const res = await fetchAdminProperties();
        if (res.data && res.data.length > 0) {
          setProperties(res.data);
          return;
        }
      }
      const publicRes = await fetchPublicProperties();
      if (publicRes.data && publicRes.data.length > 0) {
        setProperties(publicRes.data as Property[]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load properties");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProperties();
  }, [refreshProperties]);

  const createProperty = async (payload: PropertyCreateInput): Promise<Property> => {
    setIsLoading(true);
    try {
      const res = await apiCreateProperty(payload);
      if (res.data) {
        setProperties((prev) => [...prev, res.data]);
        setActivePropertyId(res.data.id);
        return res.data;
      }
      throw new Error("Failed to create property");
    } finally {
      setIsLoading(false);
    }
  };

  const updateProperty = async (
    propertyId: string,
    payload: PropertyUpdateInput
  ): Promise<Property> => {
    setIsLoading(true);
    try {
      const res = await apiUpdateProperty(propertyId, payload);
      if (res.data) {
        setProperties((prev) =>
          prev.map((p) => (p.id === propertyId ? { ...p, ...res.data } : p))
        );
        return res.data;
      }
      throw new Error("Failed to update property");
    } finally {
      setIsLoading(false);
    }
  };

  const publishProperty = async (
    propertyId: string,
    publicationStatus: PublicationStatus
  ): Promise<Property> => {
    setIsLoading(true);
    try {
      const res = await apiPublishProperty(propertyId, publicationStatus);
      if (res.data) {
        setProperties((prev) =>
          prev.map((p) => (p.id === propertyId ? { ...p, ...res.data } : p))
        );
        return res.data;
      }
      throw new Error("Failed to change publication status");
    } finally {
      setIsLoading(false);
    }
  };

  const archiveProperty = async (propertyId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await apiArchiveProperty(propertyId);
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propertyId
            ? { ...p, is_active: false, publication_status: "unpublished" as PublicationStatus }
            : p
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const activeProperty =
    properties.find((p) => p.id === activePropertyId && p.is_active) ||
    properties.find((p) => p.is_active) ||
    properties[0] ||
    INITIAL_PROPERTIES[0];

  return (
    <PropertyContext.Provider
      value={{
        properties,
        activeProperty,
        isLoading,
        error,
        setActivePropertyId,
        refreshProperties,
        createProperty,
        updateProperty,
        publishProperty,
        archiveProperty,
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
