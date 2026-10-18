import { describe, it, expect, beforeEach } from "vitest";

// Half-open stay interval logic: [check_in, check_out)
// Check-in date is inclusive; check-out date is exclusive.
function hasIntervalOverlap(
  allocIn: string,
  allocOut: string,
  candidateIn: string,
  candidateOut: string
): boolean {
  return allocIn < candidateOut && allocOut > candidateIn;
}

function validateStayDates(checkIn: string, checkOut: string): { valid: boolean; nights: number; error?: string } {
  const dIn = new Date(checkIn);
  const dOut = new Date(checkOut);
  if (isNaN(dIn.getTime()) || isNaN(dOut.getTime())) {
    return { valid: false, nights: 0, error: "Invalid date format." };
  }
  if (dOut <= dIn) {
    return { valid: false, nights: 0, error: "check_out must be strictly after check_in." };
  }
  const nights = Math.round((dOut.getTime() - dIn.getTime()) / (1000 * 60 * 60 * 24));
  return { valid: true, nights };
}

interface MockAllocation {
  id: string;
  property_id: string;
  room_id?: string;
  bed_id?: string;
  check_in_date: string;
  check_out_date: string;
  allocation_type: "reservation" | "maintenance_block";
  is_active: boolean;
}

describe("Phase 6 — Inventory & Availability Engine", () => {
  describe("1. Stay Interval Semantics & Same-Day Turnover", () => {
    it("permits same-day turnover without conflict (check-out exclusive, check-in inclusive)", () => {
      // Guest A checks out on Oct 15
      const allocA_in = "2026-10-10";
      const allocA_out = "2026-10-15";

      // Guest B checks in on Oct 15
      const allocB_in = "2026-10-15";
      const allocB_out = "2026-10-20";

      // Neither should overlap because allocA_out > allocB_in is FALSE (Oct 15 > Oct 15 is false)
      const overlaps = hasIntervalOverlap(allocA_in, allocA_out, allocB_in, allocB_out);
      expect(overlaps).toBe(false);
    });

    it("detects genuine overlap when stay dates collide", () => {
      // Existing reservation: Oct 10 -> Oct 15
      const existingIn = "2026-10-10";
      const existingOut = "2026-10-15";

      // Colliding request: Oct 12 -> Oct 16
      expect(hasIntervalOverlap(existingIn, existingOut, "2026-10-12", "2026-10-16")).toBe(true);

      // Colliding request: Oct 08 -> Oct 12 (overlaps on Oct 10 and 11)
      expect(hasIntervalOverlap(existingIn, existingOut, "2026-10-08", "2026-10-12")).toBe(true);

      // Encapsulating request: Oct 05 -> Oct 20
      expect(hasIntervalOverlap(existingIn, existingOut, "2026-10-05", "2026-10-20")).toBe(true);

      // Internal sub-stay: Oct 11 -> Oct 13
      expect(hasIntervalOverlap(existingIn, existingOut, "2026-10-11", "2026-10-13")).toBe(true);
    });

    it("rejects invalid date ranges where checkout is before or equal to checkin", () => {
      expect(validateStayDates("2026-10-15", "2026-10-15").valid).toBe(false);
      expect(validateStayDates("2026-10-15", "2026-10-14").valid).toBe(false);
      expect(validateStayDates("2026-10-15", "2026-10-18").valid).toBe(true);
      expect(validateStayDates("2026-10-15", "2026-10-18").nights).toBe(3);
    });
  });

  describe("2. Hostel Bed-Level vs Hotel Room-Level Inventory", () => {
    const hostelDorm = {
      id: "rm-dorm-101",
      property_id: "prop-hostel-001",
      room_number: "101",
      is_dormitory: true,
      operational_status: "available",
      beds: [
        { id: "bed-1", bed_label: "Pod 1 Lower", operational_status: "available", is_active: true },
        { id: "bed-2", bed_label: "Pod 1 Upper", operational_status: "available", is_active: true },
        { id: "bed-3", bed_label: "Pod 2 Lower", operational_status: "maintenance", is_active: true },
        { id: "bed-4", bed_label: "Pod 2 Upper", operational_status: "available", is_active: true },
      ],
    };

    const hotelSuite = {
      id: "rm-hotel-201",
      property_id: "prop-hotel-002",
      room_number: "201",
      is_dormitory: false,
      operational_status: "available",
    };

    it("treats hostel dormitory beds as individually bookable inventory units", () => {
      expect(hostelDorm.is_dormitory).toBe(true);
      expect(hostelDorm.beds.length).toBe(4);

      // Bed 3 is in maintenance -> unavailable
      const availableBeds = hostelDorm.beds.filter((b) => b.operational_status === "available");
      expect(availableBeds.length).toBe(3);
      expect(availableBeds.map((b) => b.id)).toEqual(["bed-1", "bed-2", "bed-4"]);
    });

    it("renders entire dormitory unavailable if room is marked for maintenance", () => {
      const dormUnderRepair = { ...hostelDorm, operational_status: "maintenance" };
      const isAvailable = (dorm: typeof hostelDorm, bed: (typeof hostelDorm.beds)[0]) => {
        if (dorm.operational_status !== "available") return false;
        return bed.operational_status === "available";
      };

      expect(isAvailable(dormUnderRepair, dormUnderRepair.beds[0])).toBe(false);
      expect(isAvailable(hostelDorm, hostelDorm.beds[0])).toBe(true);
    });

    it("treats hotel room as single atomic unit for allocations", () => {
      expect(hotelSuite.is_dormitory).toBe(false);
      const allocations: MockAllocation[] = [
        {
          id: "alloc-suite-1",
          property_id: hotelSuite.property_id,
          room_id: hotelSuite.id,
          check_in_date: "2026-11-01",
          check_out_date: "2026-11-04",
          allocation_type: "reservation",
          is_active: true,
        },
      ];

      // Request for Nov 02 -> Nov 05 collides with existing allocation
      const isRoomAvailable = (checkIn: string, checkOut: string) => {
        return !allocations.some(
          (a) => a.room_id === hotelSuite.id && a.is_active && hasIntervalOverlap(a.check_in_date, a.check_out_date, checkIn, checkOut)
        );
      };

      expect(isRoomAvailable("2026-11-02", "2026-11-05")).toBe(false);
      // Request for Nov 04 -> Nov 07 succeeds (same day turnover on checkout date)
      expect(isRoomAvailable("2026-11-04", "2026-11-07")).toBe(true);
    });
  });

  describe("3. Operational Maintenance Blocking", () => {
    it("correctly excludes units with active maintenance block from availability calculations", () => {
      const allocations: MockAllocation[] = [
        {
          id: "alloc-maint-01",
          property_id: "prop-hotel-002",
          room_id: "rm-hotel-103",
          check_in_date: "2026-10-25",
          check_out_date: "2026-10-28",
          allocation_type: "maintenance_block",
          is_active: true,
        },
      ];

      const isBlocked = (roomId: string, checkIn: string, checkOut: string) => {
        return allocations.some(
          (a) => a.room_id === roomId && a.is_active && hasIntervalOverlap(a.check_in_date, a.check_out_date, checkIn, checkOut)
        );
      };

      expect(isBlocked("rm-hotel-103", "2026-10-26", "2026-10-27")).toBe(true);
      expect(isBlocked("rm-hotel-103", "2026-10-28", "2026-10-30")).toBe(false);
    });
  });

  describe("4. Multi-Property Access Isolation & Public Filtering", () => {
    it("enforces staff property assignment boundaries", () => {
      const user = {
        id: "usr-fd-003",
        role: "front_desk",
        assigned_property_ids: ["prop-hotel-002"],
      };

      const checkAccess = (propId: string) => user.assigned_property_ids.includes(propId);

      expect(checkAccess("prop-hotel-002")).toBe(true);
      expect(checkAccess("prop-hostel-001")).toBe(false);
    });

    it("sanitizes public discovery responses to protect operational privacy", () => {
      const internalRoom = {
        room_number: "201",
        keycard_code: "SECRET-KEYCARD-991",
        notes: "Guest is a VIP, check plumbing daily",
        operational_status: "available",
        base_price_amount: 195,
      };

      // Public projection only exposes customer-facing properties
      const publicProjection = {
        is_available: internalRoom.operational_status === "available",
        base_price_amount: internalRoom.base_price_amount,
      };

      expect(publicProjection).not.toHaveProperty("keycard_code");
      expect(publicProjection).not.toHaveProperty("notes");
      expect(publicProjection.is_available).toBe(true);
    });
  });

  describe("5. Safe Deactivation Protection", () => {
    it("prevents deactivating rooms that hold active future allocations", () => {
      const futureAllocation: MockAllocation = {
        id: "alloc-fut-1",
        property_id: "prop-hostel-001",
        room_id: "rm-edi-101",
        check_in_date: "2026-11-12",
        check_out_date: "2026-11-15",
        allocation_type: "reservation",
        is_active: true,
      };

      const canDeactivate = (roomId: string, activeAllocations: MockAllocation[]) => {
        const today = "2026-10-17";
        const hasFutureAllocations = activeAllocations.some(
          (a) => a.room_id === roomId && a.is_active && a.check_out_date >= today
        );
        return !hasFutureAllocations;
      };

      expect(canDeactivate("rm-edi-101", [futureAllocation])).toBe(false);
      expect(canDeactivate("rm-edi-102", [futureAllocation])).toBe(true);
    });
  });
});
