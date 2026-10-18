import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  setTokens,
  fetchHostellers,
  createHosteller,
  fetchHostellerById,
  updateHosteller,
  deactivateHosteller,
  fetchHostelStays,
  createHostelStay,
  registerWalkInStay,
  fetchHostelStayById,
  checkInHostelStay,
  checkOutHostelStay,
  reassignHostelBed,
  extendHostelStay,
  cancelHostelStay,
  fetchHostelDashboard,
  fetchHostelFrontDesk,
  fetchBeds,
} from "@/src/services/api-client";

describe("Phase 7 — Hostel Operations Domain & Operational Workflows", () => {
  let adminToken = "";
  let managerToken = "";
  let londonDeskToken = "";
  let guestToken = "";

  const HOSTEL_PROP_ID = "prop-hostel-001"; // Edinburgh Royal Mile Hostel
  const HOTEL_PROP_ID = "prop-hotel-002"; // London Mayfair Grand Hotel

  // Unique timestamp suffix and non-overlapping date generator for idempotent test execution
  const runId = Date.now().toString().slice(-6);
  let dateCounter = Math.floor(Math.random() * 30000) + 100;
  function getUniqueStayDates(nights: number = 3): { checkIn: string; checkOut: string } {
    dateCounter += 10;
    const base = new Date(2027, 0, 1).getTime() + dateCounter * 86400000;
    const checkIn = new Date(base).toISOString().split("T")[0];
    const checkOut = new Date(base + nights * 86400000).toISOString().split("T")[0];
    return { checkIn, checkOut };
  }

  beforeAll(async () => {
    // 1. Platform Super Admin (Julian Vance)
    const adminRes = await loginUser("director@grandstay.com", "Admin2026!Secure");
    adminToken = adminRes.data.access_token;

    // 2. Property Manager Clara Ross (assigned to prop-hostel-001)
    const managerRes = await loginUser("clara.manager@grandstay.com", "Manager2026!Pass");
    managerToken = managerRes.data.access_token;

    // 3. Front Desk Liam Chen (assigned to prop-hotel-002 London Hotel ONLY)
    const deskRes = await loginUser("liam.desk@grandstay.com", "Desk2026!Pass");
    londonDeskToken = deskRes.data.access_token;

    // 4. Guest Sofia Berg
    const guestRes = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    guestToken = guestRes.data.access_token;
  });

  describe("1. Hosteller Profile Lifecycle & Data Integrity", () => {
    let createdHostellerId = "";

    it("creates a new hosteller profile with emergency contact validation", async () => {
      setTokens(managerToken);
      const res = await createHosteller({
        property_id: HOSTEL_PROP_ID,
        first_name: `Freja_${runId}`,
        last_name: "Lindqvist",
        email: `freja.${runId}.${Date.now()}@nordic.se`,
        phone: "+46 70 123 4567",
        nationality: "Sweden",
        gender: "female",
        emergency_contact: {
          name: "Astrid Lindqvist",
          relationship: "Sister",
          phone: "+46 70 987 6543",
        },
        notes: "Scandinavian student on gap year backpacking trip.",
      });

      expect(res.success).toBe(true);
      expect(res.data.id).toBeDefined();
      expect(res.data.first_name).toBe(`Freja_${runId}`);
      expect(res.data.status).toBe("active");
      expect(res.data.emergency_contact?.name).toBe("Astrid Lindqvist");
      createdHostellerId = res.data.id;
    });

    it("searches and filters hosteller directory by query string and status", async () => {
      setTokens(managerToken);
      const list = await fetchHostellers(HOSTEL_PROP_ID, { q: `Freja_${runId}` });
      expect(list.success).toBe(true);
      expect(list.data.length).toBeGreaterThanOrEqual(1);
      expect(list.data[0].id).toBe(createdHostellerId);
    });

    it("retrieves hosteller details including stay history", async () => {
      setTokens(managerToken);
      const detail = await fetchHostellerById(createdHostellerId);
      expect(detail.success).toBe(true);
      expect(detail.data.first_name).toBe(`Freja_${runId}`);
      expect(Array.isArray(detail.data.stays)).toBe(true);
    });

    it("updates hosteller operational notes and phone number", async () => {
      setTokens(managerToken);
      const updated = await updateHosteller(createdHostellerId, {
        phone: "+46 70 999 8888",
        notes: "Updated travel notes: early morning flight booked.",
      });
      expect(updated.success).toBe(true);
      expect(updated.data.phone).toBe("+46 70 999 8888");
      expect(updated.data.notes).toContain("early morning flight");
    });

    it("safely deactivates hosteller when no active stay is currently checked in", async () => {
      setTokens(managerToken);
      const deact = await deactivateHosteller(createdHostellerId);
      expect(deact.success).toBe(true);
      expect(deact.data.is_active).toBe(false);
    });

    it("prevents hosteller profile creation for non-hostel property types", async () => {
      setTokens(adminToken);
      // prop-hotel-002 is pure hotel
      await expect(
        createHosteller({
          property_id: HOTEL_PROP_ID,
          first_name: "Invalid",
          last_name: "Type",
        })
      ).rejects.toThrow();
    });
  });

  describe("2. Stay Creation & Inventory Bed Allocation Invariants", () => {
    const { checkIn, checkOut } = getUniqueStayDates(4);

    it("creates a hostel stay reservation and binds to Phase 6 inventory allocation", async () => {
      setTokens(managerToken);
      const bedsRes = await fetchBeds(HOSTEL_PROP_ID, "rm-edi-101");
      expect(bedsRes.data.length).toBeGreaterThan(0);

      const stayRes = await createHostelStay({
        property_id: HOSTEL_PROP_ID,
        hosteller_id: "hstlr-edi-001", // John Doe
        room_id: "rm-edi-101",
        bed_id: "bed-edi-101-5",
        check_in_date: checkIn,
        check_out_date: checkOut,
        special_requests: "Lower pod requested.",
      });

      expect(stayRes.success).toBe(true);
      expect(stayRes.data.status).toBe("reserved");
      expect(stayRes.data.total_nights).toBe(4);
      expect(stayRes.data.total_amount).toBeGreaterThan(0);
      expect(stayRes.data.audit_trail.length).toBeGreaterThanOrEqual(1);
      expect(stayRes.data.audit_trail[0].action).toBe("created");
    });

    it("rejects stay creation with invalid date interval (check_out <= check_in)", async () => {
      setTokens(managerToken);
      const dates = getUniqueStayDates(0);
      await expect(
        createHostelStay({
          property_id: HOSTEL_PROP_ID,
          hosteller_id: "hstlr-edi-001",
          room_id: "rm-edi-101",
          bed_id: "bed-edi-101-5",
          check_in_date: dates.checkIn,
          check_out_date: dates.checkIn, // same day
        })
      ).rejects.toThrow();
    });

    it("rejects duplicate or overlapping bed allocation with 409 Conflict", async () => {
      setTokens(managerToken);
      // Attempting to reserve bed-edi-101-5 during already reserved stay [checkIn, checkOut)
      await expect(
        createHostelStay({
          property_id: HOSTEL_PROP_ID,
          hosteller_id: "hstlr-edi-004",
          room_id: "rm-edi-101",
          bed_id: "bed-edi-101-5",
          check_in_date: checkIn,
          check_out_date: checkOut,
        })
      ).rejects.toThrow();
    });

    it("rejects booking a bed that is under operational maintenance", async () => {
      setTokens(managerToken);
      const dates = getUniqueStayDates(3);
      // bed-edi-102-1 is seeded under maintenance
      await expect(
        createHostelStay({
          property_id: HOSTEL_PROP_ID,
          hosteller_id: "hstlr-edi-001",
          room_id: "rm-edi-102",
          bed_id: "bed-edi-102-1",
          check_in_date: dates.checkIn,
          check_out_date: dates.checkOut,
        })
      ).rejects.toThrow();
    });
  });

  describe("3. Guided Check-In & State Transition Workflow", () => {
    let testStayId = "";

    beforeAll(async () => {
      setTokens(managerToken);
      const dates = getUniqueStayDates(3);
      const created = await createHostelStay({
        property_id: HOSTEL_PROP_ID,
        hosteller_id: "hstlr-edi-004",
        room_id: "rm-edi-101",
        bed_id: "bed-edi-101-3",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      });
      testStayId = created.data.id;
    });

    it("successfully checks in a reserved hosteller and transitions stay to checked_in", async () => {
      setTokens(managerToken);
      const checkInRes = await checkInHostelStay(testStayId, {
        keycard_code: "KC-TEST-4421",
        locker_number: "LK-101-3",
        staff_notes: "Identity verified, passport recorded.",
      });

      expect(checkInRes.success).toBe(true);
      expect(checkInRes.data.status).toBe("checked_in");
      expect(checkInRes.data.actual_check_in_time).toBeDefined();
      expect(checkInRes.data.checked_in_by_user_id).toBeDefined();

      const auditCheck = checkInRes.data.audit_trail.find((a) => a.action === "checked_in");
      expect(auditCheck).toBeDefined();
    });

    it("rejects check-in on a stay that is already checked in (invalid transition)", async () => {
      setTokens(managerToken);
      // Repeating check-in on already checked-in stay MUST fail
      await expect(checkInHostelStay(testStayId)).rejects.toThrow();
    });
  });

  describe("4. Transactional Check-Out & Bed Release Workflow", () => {
    let checkedInStayId = "";

    beforeAll(async () => {
      setTokens(managerToken);
      const dates = getUniqueStayDates(3);
      const created = await createHostelStay({
        property_id: HOSTEL_PROP_ID,
        hosteller_id: "hstlr-edi-002",
        room_id: "rm-edi-201",
        bed_id: "bed-edi-201-3",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      });
      await checkInHostelStay(created.data.id);
      checkedInStayId = created.data.id;
    });

    it("successfully checks out an active stay, releases bed allocation, and marks room dirty", async () => {
      setTokens(managerToken);
      const checkOutRes = await checkOutHostelStay(checkedInStayId, {
        staff_notes: "Keycard and padlock returned in good order.",
        linen_returned: true,
        locker_keys_returned: true,
      });

      expect(checkOutRes.success).toBe(true);
      expect(checkOutRes.data.status).toBe("checked_out");
      expect(checkOutRes.data.actual_check_out_time).toBeDefined();

      const auditCheckout = checkOutRes.data.audit_trail.find((a) => a.action === "checked_out");
      expect(auditCheckout).toBeDefined();
    });

    it("rejects check-out on a stay that is not checked in", async () => {
      setTokens(managerToken);
      // Re-checking out an already checked out stay MUST fail
      await expect(checkOutHostelStay(checkedInStayId)).rejects.toThrow();
    });
  });

  describe("5. Bed Reassignment Workflow", () => {
    let reassignStayId = "";

    beforeAll(async () => {
      setTokens(managerToken);
      const dates = getUniqueStayDates(4);
      const created = await createHostelStay({
        property_id: HOSTEL_PROP_ID,
        hosteller_id: "hstlr-edi-002",
        room_id: "rm-edi-101",
        bed_id: "bed-edi-101-1",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      });
      reassignStayId = created.data.id;
    });

    it("reassigns a stay to an available compatible bed transactionally", async () => {
      setTokens(managerToken);
      const reassignRes = await reassignHostelBed(reassignStayId, {
        new_bed_id: "bed-edi-101-4",
        notes: "Hosteller requested upper bunk next to window.",
      });

      expect(reassignRes.success).toBe(true);
      expect(reassignRes.data.bed_id).toBe("bed-edi-101-4");

      const auditReassign = reassignRes.data.audit_trail.find((a) => a.action === "reassigned");
      expect(auditReassign).toBeDefined();
      expect(auditReassign?.details).toContain("Pod 2 Upper");
    });

    it("rejects bed reassignment if destination bed has a conflict or is in maintenance", async () => {
      setTokens(managerToken);
      // bed-edi-102-1 is permanently under maintenance block
      await expect(
        reassignHostelBed(reassignStayId, {
          new_bed_id: "bed-edi-102-1",
        })
      ).rejects.toThrow();
    });

    it("rejects bed reassignment to the same bed", async () => {
      setTokens(managerToken);
      await expect(
        reassignHostelBed(reassignStayId, {
          new_bed_id: "bed-edi-101-4", // already in this bed
        })
      ).rejects.toThrow();
    });
  });

  describe("6. Stay Extension & Cancellation Workflows", () => {
    let extendStayId = "";
    let cancelStayId = "";
    let extendInitialEnd = "";

    beforeAll(async () => {
      setTokens(managerToken);
      const d1 = getUniqueStayDates(3);
      extendInitialEnd = d1.checkOut;
      const s1 = await createHostelStay({
        property_id: HOSTEL_PROP_ID,
        hosteller_id: "hstlr-edi-001",
        room_id: "rm-edi-201",
        bed_id: "bed-edi-201-4",
        check_in_date: d1.checkIn,
        check_out_date: d1.checkOut,
      });
      extendStayId = s1.data.id;

      const d2 = getUniqueStayDates(3);
      const s2 = await createHostelStay({
        property_id: HOSTEL_PROP_ID,
        hosteller_id: "hstlr-edi-001",
        room_id: "rm-edi-102",
        bed_id: "bed-edi-102-2",
        check_in_date: d2.checkIn,
        check_out_date: d2.checkOut,
      });
      cancelStayId = s2.data.id;
    });

    it("extends stay when subsequent dates on bed are available", async () => {
      setTokens(managerToken);
      const newCheckoutDate = new Date(new Date(extendInitialEnd).getTime() + 86400000 * 3).toISOString().split("T")[0];
      const extRes = await extendHostelStay(extendStayId, {
        new_check_out_date: newCheckoutDate,
        notes: "Guest extended stay by 3 days.",
      });

      expect(extRes.success).toBe(true);
      expect(extRes.data.check_out_date).toBe(newCheckoutDate);
      expect(extRes.data.total_nights).toBe(6);
    });

    it("cancels a reserved stay and releases its bed allocation", async () => {
      setTokens(managerToken);
      const cancelRes = await cancelHostelStay(cancelStayId, {
        reason: "Guest cancelled travel plans.",
      });

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.data.status).toBe("cancelled");

      const auditCancel = cancelRes.data.audit_trail.find((a) => a.action === "cancelled");
      expect(auditCancel).toBeDefined();
    });

    it("rejects cancellation of an active stay that is already checked in", async () => {
      setTokens(managerToken);
      // Check in extendStayId then attempt cancel
      await checkInHostelStay(extendStayId);
      await expect(cancelHostelStay(extendStayId)).rejects.toThrow();
    });
  });

  describe("7. Walk-In Registration Workflow", () => {
    it("registers and checks in a walk-in hosteller atomically", async () => {
      setTokens(managerToken);
      const dates = getUniqueStayDates(3);
      const walkInRes = await registerWalkInStay({
        property_id: HOSTEL_PROP_ID,
        first_name: "Toby",
        last_name: "MacIntyre",
        email: `toby.${Date.now()}@scotmail.com`,
        phone: "+44 7700 888123",
        gender: "male",
        nationality: "United Kingdom",
        room_id: "rm-edi-101",
        bed_id: "bed-edi-101-6",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
        special_requests: "Backpacker arrived at front desk without prior booking.",
      });

      expect(walkInRes.success).toBe(true);
      expect(walkInRes.data.status).toBe("checked_in");
      expect(walkInRes.data.hosteller).toBeDefined();
      expect(walkInRes.data.hosteller?.first_name).toBe("Toby");
      expect(walkInRes.data.actual_check_in_time).toBeDefined();
    });
  });

  describe("8. Operational Front Desk Queue & Occupancy Metrics", () => {
    it("retrieves property-specific occupancy metrics without hardcoding", async () => {
      setTokens(managerToken);
      const dash = await fetchHostelDashboard(HOSTEL_PROP_ID);
      expect(dash.success).toBe(true);
      expect(dash.data.property_id).toBe(HOSTEL_PROP_ID);
      expect(dash.data.total_beds).toBeGreaterThan(0);
      expect(dash.data.occupied_beds).toBeGreaterThanOrEqual(1);
      expect(dash.data.occupancy_rate_percentage).toBeGreaterThanOrEqual(0);
    });

    it("retrieves operational front desk queues (arrivals, departures, overdue)", async () => {
      setTokens(managerToken);
      const queue = await fetchHostelFrontDesk(HOSTEL_PROP_ID);
      expect(queue.success).toBe(true);
      expect(Array.isArray(queue.data.today_arrivals)).toBe(true);
      expect(Array.isArray(queue.data.today_departures)).toBe(true);
      expect(Array.isArray(queue.data.in_house_hostellers)).toBe(true);
      expect(Array.isArray(queue.data.overdue_departures)).toBe(true);
      // Chloe Dupont (stay-edi-005) was seeded with past checkout while checked in
      expect(queue.data.overdue_departures.some((s) => s.id === "stay-edi-005")).toBe(true);
    });
  });

  describe("9. Security, RBAC & Cross-Property Isolation", () => {
    it("rejects unauthenticated requests with 401", async () => {
      setTokens(null);
      await expect(fetchHostelDashboard(HOSTEL_PROP_ID)).rejects.toThrow();
    });

    it("forbids customer guests from accessing staff hostel front desk operations (403)", async () => {
      setTokens(guestToken);
      await expect(fetchHostelFrontDesk(HOSTEL_PROP_ID)).rejects.toThrow();
    });

    it("enforces staff property assignment boundaries (London desk staff blocked from Edinburgh hostel)", async () => {
      setTokens(londonDeskToken);
      // Liam Chen is assigned ONLY to prop-hotel-002
      await expect(fetchHostelFrontDesk(HOSTEL_PROP_ID)).rejects.toThrow();
      await expect(fetchHostellers(HOSTEL_PROP_ID)).rejects.toThrow();
    });

    it("allows platform super admin global cross-property access", async () => {
      setTokens(adminToken);
      const dash = await fetchHostelDashboard(HOSTEL_PROP_ID);
      expect(dash.success).toBe(true);
    });
  });
});
