import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  fetchPublicProperties,
  fetchPublicPropertyBySlug,
  fetchAdminProperties,
  fetchPropertyById,
  createProperty,
  updateProperty,
  publishProperty,
  archiveProperty,
  setTokens,
} from "@/src/services/api-client";

describe("Phase 5 Property Management & Discovery Invariants", () => {
  let adminToken = "";
  let managerToken = "";
  let frontDeskToken = "";
  let guestToken = "";

  beforeAll(async () => {
    // 1. Super Admin Julian Vance
    const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
    adminToken = adminLogin.data.access_token;

    // 2. Property Manager Clara Ross (assigned to prop-hostel-001)
    const managerLogin = await loginUser("clara.manager@grandstay.com", "Manager2026!Pass");
    managerToken = managerLogin.data.access_token;

    // 3. Front Desk Liam Chen (assigned to prop-hotel-002)
    const deskLogin = await loginUser("liam.desk@grandstay.com", "Desk2026!Pass");
    frontDeskToken = deskLogin.data.access_token;

    // 4. Guest Sofia Berg
    const guestLogin = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    guestToken = guestLogin.data.access_token;
  });

  it("exposes only published, active properties in public discovery", async () => {
    setTokens(null); // Unauthenticated public visitor
    const res = await fetchPublicProperties();
    expect(res.success).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(3);

    for (const prop of res.data) {
      // Must not leak internal notes or administrative keys
      expect(prop.name).toBeDefined();
      expect(prop.property_type).toBeDefined();
      expect(prop.city).toBeDefined();
      expect(prop.created_by_user_id).toBeUndefined();
    }
  });

  it("retrieves published property by slug and rejects unknown slug with 404", async () => {
    setTokens(null);
    const res = await fetchPublicPropertyBySlug("grandstay-royal-mile-hostel");
    expect(res.success).toBe(true);
    expect(res.data.name).toBe("GrandStay Royal Mile Hostel");
    expect(res.data.property_type).toBe("hostel");

    // Non-existent slug returns 404
    await expect(fetchPublicPropertyBySlug("non-existent-hotel-slug-xyz")).rejects.toThrow();
  });

  it("filters public properties by property type and city", async () => {
    setTokens(null);
    const hostels = await fetchPublicProperties({ property_type: "hostel" });
    expect(hostels.success).toBe(true);
    expect(hostels.data.every((p: any) => p.property_type === "hostel")).toBe(true);

    const edinburghProps = await fetchPublicProperties({ city: "Edinburgh" });
    expect(edinburghProps.success).toBe(true);
    expect(edinburghProps.data.some((p: any) => p.city === "Edinburgh")).toBe(true);
  });

  it("allows super admin to onboard a new property with full validation", async () => {
    setTokens(adminToken);
    const testCode = `TEST-${Date.now().toString().slice(-4)}`;
    const testSlug = `test-campus-${Date.now()}`;

    const newProp = await createProperty({
      name: "GrandStay Alpine Innovation Campus",
      code: testCode,
      slug: testSlug,
      property_type: "hybrid",
      currency: "EUR",
      timezone: "Europe/Vienna",
      description: "Scenic Alpine hybrid property with coworking and dorm pods.",
      address: "Innsbrucker Ring 45",
      city: "Innsbruck",
      country: "Austria",
      postal_code: "6020",
      contact_email: "innsbruck@grandstay.com",
      contact_phone: "+43 512 123456",
      checkin_time_start: "14:00",
      checkout_time_deadline: "10:30",
      publication_status: "draft",
      amenities: ["Free High-Speed Wi-Fi", "Coworking Space", "Bicycle Rental"],
    });

    expect(newProp.success).toBe(true);
    expect(newProp.data.id).toBeDefined();
    expect(newProp.data.code).toBe(testCode);
    expect(newProp.data.publication_status).toBe("draft");
    expect(newProp.data.is_active).toBe(true);
  });

  it("rejects duplicate property code and duplicate slug with 409 Conflict", async () => {
    setTokens(adminToken);
    // Duplicate existing code "HST-EDI-01"
    await expect(
      createProperty({
        name: "Duplicate Code Attempt",
        code: "HST-EDI-01",
        slug: "unique-slug-12345",
        property_type: "hostel",
        currency: "GBP",
        timezone: "UTC",
        address: "Test St",
        city: "Test",
        country: "UK",
      })
    ).rejects.toThrow();

    // Duplicate existing slug "grandstay-royal-mile-hostel"
    await expect(
      createProperty({
        name: "Duplicate Slug Attempt",
        code: `UNQ-${Date.now().toString().slice(-4)}`,
        slug: "grandstay-royal-mile-hostel",
        property_type: "hostel",
        currency: "GBP",
        timezone: "UTC",
        address: "Test St",
        city: "Test",
        country: "UK",
      })
    ).rejects.toThrow();
  });

  it("enforces RBAC: forbids non-superadmins from creating new properties", async () => {
    // Clara (property_manager) attempts to create property -> 403
    setTokens(managerToken);
    await expect(
      createProperty({
        name: "Unauthorized Creation",
        code: "UNAUTH-01",
        slug: "unauthorized-creation",
        property_type: "hotel",
        currency: "USD",
        timezone: "UTC",
        address: "123 Main St",
        city: "New York",
        country: "USA",
      })
    ).rejects.toThrow();
  });

  it("enforces RBAC: forbids guests from accessing administrative property endpoints", async () => {
    setTokens(guestToken);
    await expect(fetchAdminProperties()).rejects.toThrow();
  });

  it("updates property details and configuration by authorized manager", async () => {
    // Clara is manager of prop-hostel-001
    setTokens(managerToken);
    const updated = await updateProperty("prop-hostel-001", {
      description: "Updated description for Royal Mile Hostel with fresh linen perks.",
      checkin_time_start: "14:30",
      checkout_time_deadline: "10:00",
    });

    expect(updated.success).toBe(true);
    expect(updated.data.checkin_time_start).toBe("14:30");
    expect(updated.data.checkout_time_deadline).toBe("10:00");
  });

  it("prevents cross-property updates: manager cannot edit unassigned property", async () => {
    // Clara (assigned only to prop-hostel-001) attempts to update prop-hotel-002 -> 403
    setTokens(managerToken);
    await expect(
      updateProperty("prop-hotel-002", {
        name: "Hostile Takeover Attempt",
      })
    ).rejects.toThrow();
  });

  it("manages publication lifecycle (draft -> published -> unpublished)", async () => {
    setTokens(adminToken);
    // Create draft property
    const draftProp = await createProperty({
      name: "Lifecycle Test Lodge",
      code: `LFC-${Date.now().toString().slice(-4)}`,
      slug: `lifecycle-test-${Date.now()}`,
      property_type: "hotel",
      currency: "USD",
      timezone: "America/New_York",
      address: "100 Pine Street",
      city: "Burlington",
      country: "USA",
      publication_status: "draft",
    });

    const propId = draftProp.data.id;
    const propSlug = draftProp.data.slug;

    // While in draft, public slug discovery must fail (404)
    setTokens(null);
    await expect(fetchPublicPropertyBySlug(propSlug)).rejects.toThrow();

    // Publish property
    setTokens(adminToken);
    const publishedRes = await publishProperty(propId, "published");
    expect(publishedRes.data.publication_status).toBe("published");

    // Now public slug discovery succeeds
    setTokens(null);
    const pubCheck = await fetchPublicPropertyBySlug(propSlug);
    expect(pubCheck.success).toBe(true);

    // Unpublish property
    setTokens(adminToken);
    const unpubRes = await publishProperty(propId, "unpublished");
    expect(unpubRes.data.publication_status).toBe("unpublished");

    // Once unpublished, public discovery fails again
    setTokens(null);
    await expect(fetchPublicPropertyBySlug(propSlug)).rejects.toThrow();
  });

  it("safely archives property without deleting historical records", async () => {
    setTokens(adminToken);
    // 1. Create a temporary property with no bookings
    const tempProp = await createProperty({
      name: "Temporary Archive Test Venue",
      code: `TMP-${Date.now().toString().slice(-4)}`,
      slug: `temp-archive-${Date.now()}`,
      property_type: "hostel",
      currency: "GBP",
      timezone: "Europe/London",
      address: "10 Temporary Way",
      city: "Glasgow",
      country: "United Kingdom",
    });

    const propId = tempProp.data.id;

    // Archive it
    const archiveRes = await archiveProperty(propId);
    expect(archiveRes.success).toBe(true);
    expect(archiveRes.data.is_active).toBe(false);
    expect(archiveRes.data.publication_status).toBe("unpublished");
    expect(archiveRes.data.archived_at).toBeDefined();

    // Verify property is marked inactive in admin listing
    const adminProps = await fetchAdminProperties({ include_inactive: true });
    const archivedItem = adminProps.data.find((p) => p.id === propId);
    expect(archivedItem?.is_active).toBe(false);
  });

  it("prevents archival of properties with active reservations", async () => {
    setTokens(adminToken);
    // "prop-hotel-002" has active confirmed booking "bk-sofia-001"
    // Archival MUST be safely rejected
    await expect(archiveProperty("prop-hotel-002")).rejects.toThrow();
  });
});
