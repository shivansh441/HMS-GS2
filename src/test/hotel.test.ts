import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  setTokens,
  fetchHotelGuests,
  createHotelGuest,
  fetchHotelGuestById,
  updateHotelGuest,
  deactivateHotelGuest,
  fetchHotelStays,
  createHotelStay,
  registerWalkInHotelStay,
  fetchHotelStayById,
  assignHotelRoom,
  changeHotelRoom,
  checkInHotelStay,
  checkOutHotelStay,
  extendHotelStay,
  cancelHotelStay,
  fetchHotelAvailableRooms,
  fetchHotelDashboard,
  fetchHotelFrontDesk,
  fetchRoomById,
} from "@/src/services/api-client";

describe("Phase 8 — Hotel Operations Domain & Operational Workflows", () => {
  let adminToken = "";
  let londonDeskToken = "";
  let edinburghManagerToken = "";
  let guestToken = "";

  const HOTEL_PROP_ID = "prop-hotel-002"; // London Mayfair Grand Hotel
  const HOSTEL_PROP_ID = "prop-hostel-001"; // Edinburgh Royal Mile Hostel

  // Unique timestamp suffix and non-overlapping date generator for idempotent test execution
  const runId = Date.now().toString().slice(-6);
  let dateCounter = Math.floor(Math.random() * 40000) + 500;
  function getUniqueStayDates(nights: number = 3): { checkIn: string; checkOut: string } {
    dateCounter += 10;
    const base = new Date(2028, 0, 1).getTime() + dateCounter * 86400000;
    const checkIn = new Date(base).toISOString().split("T")[0];
    const checkOut = new Date(base + nights * 86400000).toISOString().split("T")[0];
    return { checkIn, checkOut };
  }

  beforeAll(async () => {
    // 1. Platform Super Admin (Julian Vance)
    const adminRes = await loginUser("director@grandstay.com", "Admin2026!Secure");
    adminToken = adminRes.data.access_token;

    // 2. Front Desk Liam Chen (assigned to prop-hotel-002 London Hotel)
    const deskRes = await loginUser("liam.desk@grandstay.com", "Desk2026!Pass");
    londonDeskToken = deskRes.data.access_token;

    // 3. Property Manager Clara Ross (assigned to prop-hostel-001 Edinburgh Hostel ONLY)
    const managerRes = await loginUser("clara.manager@grandstay.com", "Manager2026!Pass");
    edinburghManagerToken = managerRes.data.access_token;

    // 4. Guest Sofia Berg
    const guestRes = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    guestToken = guestRes.data.access_token;
  });

  describe("1. Hotel Guest Profile Lifecycle & Data Integrity", () => {
    let createdGuestId = "";

    it("creates a new hotel guest profile with VIP tier and preferences", async () => {
      setTokens(londonDeskToken);
      const res = await createHotelGuest({
        property_id: HOTEL_PROP_ID,
        first_name: `Sir_Arthur_${runId}`,
        last_name: "Conan",
        email: `arthur.${runId}.${Date.now()}@bakerstreet.co.uk`,
        phone: "+44 20 7946 0999",
        nationality: "United Kingdom",
        vip_tier: "platinum",
        special_preferences: "Top floor suite, morning English breakfast, extra pillows.",
        address: "221B Baker Street",
        city: "London",
        country: "United Kingdom",
        notes: "Esteemed author and patron of the arts.",
      });

      expect(res.success).toBe(true);
      expect(res.data.id).toBeDefined();
      expect(res.data.first_name).toBe(`Sir_Arthur_${runId}`);
      expect(res.data.vip_tier).toBe("platinum");
      expect(res.data.status).toBe("active");
      createdGuestId = res.data.id;
    });

    it("searches and filters hotel guest directory by query string and status", async () => {
      setTokens(londonDeskToken);
      const list = await fetchHotelGuests(HOTEL_PROP_ID, { q: `Sir_Arthur_${runId}` });
      expect(list.success).toBe(true);
      expect(list.data.length).toBeGreaterThanOrEqual(1);
      expect(list.data[0].id).toBe(createdGuestId);
    });

    it("retrieves hotel guest details including historical stay records", async () => {
      setTokens(londonDeskToken);
      const detail = await fetchHotelGuestById(createdGuestId);
      expect(detail.success).toBe(true);
      expect(detail.data.id).toBe(createdGuestId);
      expect(Array.isArray(detail.data.stays)).toBe(true);
    });

    it("updates hotel guest preferences and contact details", async () => {
      setTokens(londonDeskToken);
      const updated = await updateHotelGuest(createdGuestId, {
        phone: "+44 20 7946 8888",
        special_preferences: "Top floor suite, morning Earl Grey tea, daily Times newspaper.",
      });
      expect(updated.success).toBe(true);
      expect(updated.data.phone).toBe("+44 20 7946 8888");
      expect(updated.data.special_preferences).toContain("Earl Grey");
    });

    it("soft-deactivates hotel guest profile without deleting historical records", async () => {
      setTokens(londonDeskToken);
      const deact = await deactivateHotelGuest(createdGuestId);
      expect(deact.success).toBe(true);
      expect(deact.data.is_active).toBe(false);

      const check = await fetchHotelGuestById(createdGuestId);
      expect(check.data.is_active).toBe(false);
      expect(check.data.status).toBe("inactive");
    });
  });

  describe("2. Hotel Stay Lifecycle & Phase 6 Room Inventory Interlocking", () => {
    let testStayId = "";
    const testDates = getUniqueStayDates(3);

    it("creates a hotel stay reserving an available physical room", async () => {
      setTokens(londonDeskToken);
      const res = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-001",
        room_type_id: "rt-lon-deluxe",
        assigned_room_id: "rm-lon-101",
        check_in_date: testDates.checkIn,
        check_out_date: testDates.checkOut,
        adult_count: 2,
        special_requests: "Quiet suite overlooking courtyard.",
      });

      expect(res.success).toBe(true);
      expect(res.data.id).toBeDefined();
      expect(res.data.stay_reference).toMatch(/^HTL-STAY-2026-\d+/);
      expect(res.data.status).toBe("confirmed");
      expect(res.data.assigned_room_id).toBe("rm-lon-101");
      expect(res.data.room_number).toBe("101");
      expect(res.data.total_nights).toBe(3);
      testStayId = res.data.id;
    });

    it("rejects booking a room that conflicts with an existing reservation on overlapping dates", async () => {
      setTokens(londonDeskToken);
      // Attempt to book rm-lon-101 on overlapping dates
      await expect(
        createHotelStay({
          property_id: HOTEL_PROP_ID,
          guest_id: "gst-lon-004",
          room_type_id: "rt-lon-deluxe",
          assigned_room_id: "rm-lon-101",
          check_in_date: testDates.checkIn,
          check_out_date: testDates.checkOut,
        })
      ).rejects.toThrow();
    });

    it("rejects booking a room that is under operational maintenance", async () => {
      setTokens(londonDeskToken);
      const dates = getUniqueStayDates(2);
      // rm-lon-103 is seeded under maintenance
      await expect(
        createHotelStay({
          property_id: HOTEL_PROP_ID,
          guest_id: "gst-lon-004",
          room_type_id: "rt-lon-deluxe",
          assigned_room_id: "rm-lon-103",
          check_in_date: dates.checkIn,
          check_out_date: dates.checkOut,
        })
      ).rejects.toThrow();
    });

    it("rejects booking with invalid dates (check_out <= check_in)", async () => {
      setTokens(londonDeskToken);
      await expect(
        createHotelStay({
          property_id: HOTEL_PROP_ID,
          guest_id: "gst-lon-004",
          room_type_id: "rt-lon-deluxe",
          check_in_date: "2027-05-10",
          check_out_date: "2027-05-09",
        })
      ).rejects.toThrow();
    });
  });

  describe("3. Physical Room Assignment for Unassigned Reservations", () => {
    let unassignedStayId = "";
    const dates = getUniqueStayDates(3);

    beforeAll(async () => {
      setTokens(londonDeskToken);
      const created = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-004",
        room_type_id: "rt-lon-twin",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
        special_requests: "Assign on check-in day.",
      });
      unassignedStayId = created.data.id;
    });

    it("assigns an available physical room to an unassigned reservation", async () => {
      setTokens(londonDeskToken);
      const assignRes = await assignHotelRoom(unassignedStayId, {
        room_id: "rm-lon-302",
        notes: "Assigned Twin Suite Room 302.",
      });

      expect(assignRes.success).toBe(true);
      expect(assignRes.data.assigned_room_id).toBe("rm-lon-302");
      expect(assignRes.data.room_number).toBe("302");
      expect(assignRes.data.status).toBe("confirmed");

      const audit = assignRes.data.audit_trail.find((a) => a.action === "room_assigned");
      expect(audit).toBeDefined();
      expect(audit?.details).toContain("302");
    });

    it("rejects room assignment if target room is under maintenance", async () => {
      setTokens(londonDeskToken);
      await expect(
        assignHotelRoom(unassignedStayId, {
          room_id: "rm-lon-103", // in maintenance
        })
      ).rejects.toThrow();
    });
  });

  describe("4. Room Changes During Active or Reserved Stays", () => {
    let stayToChangeId = "";
    const dates = getUniqueStayDates(4);

    beforeAll(async () => {
      setTokens(londonDeskToken);
      const created = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-002",
        room_type_id: "rt-lon-deluxe",
        assigned_room_id: "rm-lon-102",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      });
      stayToChangeId = created.data.id;
    });

    it("successfully moves guest to another available room and records audit trail", async () => {
      setTokens(londonDeskToken);
      const changeRes = await changeHotelRoom(stayToChangeId, {
        new_room_id: "rm-lon-101",
        reason: "Guest requested quiet courtyard facing suite.",
      });

      expect(changeRes.success).toBe(true);
      expect(changeRes.data.assigned_room_id).toBe("rm-lon-101");
      expect(changeRes.data.room_number).toBe("101");

      const audit = changeRes.data.audit_trail.find((a) => a.action === "room_changed");
      expect(audit).toBeDefined();
      expect(audit?.details).toContain("101");
    });

    it("rejects room change to the exact same room", async () => {
      setTokens(londonDeskToken);
      await expect(
        changeHotelRoom(stayToChangeId, {
          new_room_id: "rm-lon-101", // already in this room
        })
      ).rejects.toThrow();
    });

    it("rejects room change to a room under maintenance", async () => {
      setTokens(londonDeskToken);
      await expect(
        changeHotelRoom(stayToChangeId, {
          new_room_id: "rm-lon-103",
        })
      ).rejects.toThrow();
    });
  });

  describe("5. Guided Hotel Check-In & State Transitions", () => {
    let checkInStayId = "";
    const dates = getUniqueStayDates(3);

    beforeAll(async () => {
      setTokens(londonDeskToken);
      const created = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-004",
        room_type_id: "rt-lon-deluxe",
        assigned_room_id: "rm-lon-102",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      });
      checkInStayId = created.data.id;
    });

    it("successfully checks in a hotel reservation and encodes keycard", async () => {
      setTokens(londonDeskToken);
      const inRes = await checkInHotelStay(checkInStayId, {
        keycard_code: "KC-LON-102-VIP",
        staff_notes: "Passport verified, credit card pre-authorized for incidentals.",
        additional_occupants: [{ name: "Lucie Moreau", relationship: "Spouse" }],
      });

      expect(inRes.success).toBe(true);
      expect(inRes.data.status).toBe("checked_in");
      expect(inRes.data.actual_check_in_time).toBeDefined();
      expect(inRes.data.keycard_code).toBe("KC-LON-102-VIP");
      expect(inRes.data.checked_in_by_user_id).toBeDefined();

      const audit = inRes.data.audit_trail.find((a) => a.action === "checked_in");
      expect(audit).toBeDefined();
    });

    it("rejects check-in on a stay that is already checked in", async () => {
      setTokens(londonDeskToken);
      await expect(checkInHotelStay(checkInStayId)).rejects.toThrow();
    });

    it("rejects check-in on a reservation without an assigned physical room", async () => {
      setTokens(londonDeskToken);
      const d = getUniqueStayDates(2);
      const unassigned = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-001",
        room_type_id: "rt-lon-deluxe",
        check_in_date: d.checkIn,
        check_out_date: d.checkOut,
      });

      await expect(checkInHotelStay(unassigned.data.id)).rejects.toThrow();
    });
  });

  describe("6. Hotel Check-Out & Housekeeping Integration", () => {
    let checkOutStayId = "";
    const dates = getUniqueStayDates(3);

    beforeAll(async () => {
      setTokens(londonDeskToken);
      const created = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-002",
        room_type_id: "rt-lon-twin",
        assigned_room_id: "rm-lon-301",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
      });
      checkOutStayId = created.data.id;
      await checkInHotelStay(checkOutStayId);
    });

    it("successfully checks out guest, releases room allocation, and marks room dirty for housekeeping", async () => {
      setTokens(londonDeskToken);
      const outRes = await checkOutHotelStay(checkOutStayId, {
        staff_notes: "Minibar inspected, keycard returned, zero incidental balance.",
        room_inspected: true,
      });

      expect(outRes.success).toBe(true);
      expect(outRes.data.status).toBe("checked_out");
      expect(outRes.data.actual_check_out_time).toBeDefined();
      expect(outRes.data.checked_out_by_user_id).toBeDefined();

      // Verify physical room cleanliness status is updated to "dirty" for housekeeping
      const roomRes = await fetchRoomById("rm-lon-301");
      expect(roomRes.success).toBe(true);
      expect(roomRes.data.cleanliness_status).toBe("dirty");
    });

    it("rejects check-out on a stay that is not currently checked in", async () => {
      setTokens(londonDeskToken);
      // Repeating checkout on already checked out stay must fail
      await expect(checkOutHotelStay(checkOutStayId)).rejects.toThrow();
    });
  });

  describe("7. Stay Extension & Cancellation Workflows", () => {
    let extendStayId = "";
    let cancelStayId = "";
    let initialCheckout = "";

    beforeAll(async () => {
      setTokens(londonDeskToken);
      const d1 = getUniqueStayDates(3);
      initialCheckout = d1.checkOut;
      const s1 = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-003",
        room_type_id: "rt-lon-exec",
        assigned_room_id: "rm-lon-201",
        check_in_date: d1.checkIn,
        check_out_date: d1.checkOut,
      });
      extendStayId = s1.data.id;

      const d2 = getUniqueStayDates(3);
      const s2 = await createHotelStay({
        property_id: HOTEL_PROP_ID,
        guest_id: "gst-lon-004",
        room_type_id: "rt-lon-deluxe",
        assigned_room_id: "rm-lon-101",
        check_in_date: d2.checkIn,
        check_out_date: d2.checkOut,
      });
      cancelStayId = s2.data.id;
    });

    it("extends stay duration and recalculates total amount", async () => {
      setTokens(londonDeskToken);
      const extDate = new Date(new Date(initialCheckout).getTime() + 2 * 86400000)
        .toISOString()
        .split("T")[0];

      const extRes = await extendHotelStay(extendStayId, {
        new_check_out_date: extDate,
        notes: "Guest extended conference stay by 2 nights.",
      });

      expect(extRes.success).toBe(true);
      expect(extRes.data.check_out_date).toBe(extDate);
      expect(extRes.data.total_nights).toBe(5);
    });

    it("cancels a reserved stay and releases its room allocation", async () => {
      setTokens(londonDeskToken);
      const cancelRes = await cancelHotelStay(cancelStayId, {
        reason: "Client flight cancelled.",
      });

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.data.status).toBe("cancelled");
    });

    it("rejects cancellation of an active stay that is already checked in", async () => {
      setTokens(londonDeskToken);
      await checkInHotelStay(extendStayId);
      await expect(cancelHotelStay(extendStayId)).rejects.toThrow();
    });
  });

  describe("8. Walk-In Hotel Registration Workflow", () => {
    it("registers walk-in guest and immediately checks them in atomically", async () => {
      setTokens(londonDeskToken);
      const dates = getUniqueStayDates(2);

      const walkInRes = await registerWalkInHotelStay({
        property_id: HOTEL_PROP_ID,
        first_name: "Baroness_Helena",
        last_name: "De_Vries",
        email: `helena.${Date.now()}@vriesholdings.nl`,
        phone: "+31 20 555 1234",
        nationality: "Netherlands",
        vip_tier: "gold",
        room_id: "rm-lon-202",
        check_in_date: dates.checkIn,
        check_out_date: dates.checkOut,
        adult_count: 1,
        special_requests: "Executive floor walk-in guest.",
        immediate_check_in: true,
      });

      expect(walkInRes.success).toBe(true);
      expect(walkInRes.data.status).toBe("checked_in");
      expect(walkInRes.data.guest).toBeDefined();
      expect(walkInRes.data.guest?.first_name).toBe("Baroness_Helena");
      expect(walkInRes.data.assigned_room_id).toBe("rm-lon-202");
      expect(walkInRes.data.actual_check_in_time).toBeDefined();
    });
  });

  describe("9. Operational Front-Desk Queues & Multi-Property RBAC Security", () => {
    it("retrieves hotel front-desk queues (arrivals, departures, overdue, in-house)", async () => {
      setTokens(londonDeskToken);
      const queue = await fetchHotelFrontDesk(HOTEL_PROP_ID);
      expect(queue.success).toBe(true);
      expect(Array.isArray(queue.data.today_arrivals)).toBe(true);
      expect(Array.isArray(queue.data.today_departures)).toBe(true);
      expect(Array.isArray(queue.data.in_house_guests)).toBe(true);
      expect(Array.isArray(queue.data.overdue_departures)).toBe(true);
      expect(queue.data.available_rooms_count).toBeGreaterThanOrEqual(0);
    });

    it("retrieves hotel dashboard telemetry without hardcoding", async () => {
      setTokens(londonDeskToken);
      const dash = await fetchHotelDashboard(HOTEL_PROP_ID);
      expect(dash.success).toBe(true);
      expect(dash.data.total_rooms).toBeGreaterThan(0);
      expect(dash.data.occupancy_rate_percentage).toBeGreaterThanOrEqual(0);
    });

    it("enforces multi-property RBAC isolation: Edinburgh staff cannot access London Hotel data", async () => {
      setTokens(edinburghManagerToken); // assigned to prop-hostel-001 ONLY
      await expect(fetchHotelFrontDesk(HOTEL_PROP_ID)).rejects.toThrow();
      await expect(fetchHotelGuests(HOTEL_PROP_ID)).rejects.toThrow();
    });

    it("allows platform super-admin global bypass across all hotel properties", async () => {
      setTokens(adminToken);
      const queue = await fetchHotelFrontDesk(HOTEL_PROP_ID);
      expect(queue.success).toBe(true);
      expect(queue.data).toBeDefined();
    });
  });
});
