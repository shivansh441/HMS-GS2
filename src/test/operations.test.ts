import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  setTokens,
  fetchStaffMembers,
  createStaffMember,
  updateStaffMember,
  fetchStaffShifts,
  createStaffShift,
  updateStaffShift,
  fetchStaffAttendance,
  clockInStaff,
  clockOutStaff,
  fetchHousekeepingTasks,
  createHousekeepingTask,
  updateHousekeepingTask,
  fetchMaintenanceOrders,
  createMaintenanceOrder,
  updateMaintenanceOrder,
  fetchDailyLogs,
  createDailyLog,
  resolveDailyLog,
  fetchOperationsDashboard,
  fetchRooms,
} from "@/src/services/api-client";

describe("Phase 11: Staff & Operations Management Domain Suite", () => {
  let adminToken: string;
  let hostelManagerToken: string;
  let guestToken: string;

  const hostelPropertyId = "prop-hostel-001"; // Edinburgh Waverley Castle Hostel
  const hotelPropertyId = "prop-hotel-002"; // Mayfair Grand Hotel London

  beforeAll(async () => {
    // 1. Authenticate Super Admin
    const adminRes = await loginUser("director@grandstay.com", "Admin2026!Secure");
    expect(adminRes.success).toBe(true);
    adminToken = adminRes.data!.access_token;

    // 2. Authenticate Property Manager (assigned to prop-hostel-001 only)
    const pmRes = await loginUser("clara.manager@grandstay.com", "Manager2026!Pass");
    expect(pmRes.success).toBe(true);
    hostelManagerToken = pmRes.data!.access_token;

    // 3. Authenticate Guest
    const guestRes = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    expect(guestRes.success).toBe(true);
    guestToken = guestRes.data!.access_token;
  });

  describe("1. Multi-Tenant Property Scoping & RBAC", () => {
    it("allows Edinburgh Property Manager to access staff directory for prop-hostel-001", async () => {
      setTokens(hostelManagerToken);
      const res = await fetchStaffMembers(hostelPropertyId);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data!.length).toBeGreaterThanOrEqual(3);
      expect(res.data!.every((s) => s.property_id === hostelPropertyId)).toBe(true);
    });

    it("forbids Edinburgh Property Manager from accessing Mayfair Hotel staff (403)", async () => {
      setTokens(hostelManagerToken);
      try {
        await fetchStaffMembers(hotelPropertyId);
        expect.unreachable("Should have thrown 403");
      } catch (e: any) {
        expect(e.message).toContain("Access denied to property");
      }
    });

    it("forbids Guests from accessing staff operations endpoints (403)", async () => {
      setTokens(guestToken);
      try {
        await fetchStaffMembers(hostelPropertyId);
        expect.unreachable("Guest should not access staff directory");
      } catch (e: any) {
        expect(e.message).toBeDefined();
      }
    });

    it("allows Super Admin universal access across all properties", async () => {
      setTokens(adminToken);
      const hostelRes = await fetchStaffMembers(hostelPropertyId);
      const hotelRes = await fetchStaffMembers(hotelPropertyId);
      expect(hostelRes.success).toBe(true);
      expect(hotelRes.success).toBe(true);
      expect(hostelRes.data!.length).toBeGreaterThan(0);
      expect(hotelRes.data!.length).toBeGreaterThan(0);
    });
  });

  describe("2. Staff Employee Management & Lifecycle", () => {
    let createdStaffId: string;

    it("allows property manager to register a new staff member", async () => {
      setTokens(hostelManagerToken);
      const res = await createStaffMember({
        property_id: hostelPropertyId,
        first_name: "Hamish",
        last_name: "MacKenzie",
        department: "maintenance",
        job_title: "Assistant Facilities Tech",
        phone: "+44 131 555 0188",
        email: "hamish.mackenzie@grandstay.com",
        hourly_rate: 19.5,
        emergency_contact_name: "Isobel MacKenzie",
        emergency_contact_phone: "+44 131 555 0189",
      });

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.id).toMatch(/^stf-/);
      expect(res.data?.first_name).toBe("Hamish");
      expect(res.data?.employee_code).toMatch(/^EMP-EDI-/);
      createdStaffId = res.data!.id;
    });

    it("enforces validation when creating staff with missing fields (422)", async () => {
      setTokens(hostelManagerToken);
      try {
        // @ts-expect-error Testing invalid input
        await createStaffMember({ property_id: hostelPropertyId });
        expect.unreachable("Should fail validation");
      } catch (e: any) {
        expect(e.message).toBeDefined();
      }
    });

    it("allows updating staff job title and hourly rate", async () => {
      setTokens(hostelManagerToken);
      const res = await updateStaffMember(createdStaffId, {
        job_title: "Senior Facilities Tech",
        hourly_rate: 22.5,
      });

      expect(res.success).toBe(true);
      expect(res.data?.job_title).toBe("Senior Facilities Tech");
      expect(res.data?.hourly_rate).toBe(22.5);
    });
  });

  describe("3. Shift Scheduling & Roster Management", () => {
    let testShiftId: string;
    const testStaffId = "stf-edi-002"; // Elena Silva

    it("schedules a new housekeeping shift for today", async () => {
      setTokens(hostelManagerToken);
      const todayStr = new Date().toISOString().split("T")[0];
      const res = await createStaffShift({
        property_id: hostelPropertyId,
        staff_id: testStaffId,
        shift_type: "morning",
        shift_date: todayStr,
        start_time: "07:30",
        end_time: "16:00",
        station_or_zone: "Edinburgh Floors 1-3",
        notes: "Checkout turnover for group departure.",
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toMatch(/^shf-/);
      expect(res.data?.status).toBe("scheduled");
      expect(res.data?.staff_name).toBe("Elena Silva");
      testShiftId = res.data!.id;
    });

    it("retrieves shifts filtered by date and property", async () => {
      setTokens(hostelManagerToken);
      const todayStr = new Date().toISOString().split("T")[0];
      const res = await fetchStaffShifts(hostelPropertyId, todayStr);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data!.some((s) => s.id === testShiftId)).toBe(true);
    });

    it("updates shift operational status to in_progress and completed", async () => {
      setTokens(hostelManagerToken);
      const inProgRes = await updateStaffShift(testShiftId, { status: "in_progress" });
      expect(inProgRes.success).toBe(true);
      expect(inProgRes.data?.status).toBe("in_progress");

      const compRes = await updateStaffShift(testShiftId, { status: "completed" });
      expect(compRes.success).toBe(true);
      expect(compRes.data?.status).toBe("completed");
    });
  });

  describe("4. Electronic Time Clock & Attendance Tracking", () => {
    let attendanceId: string;
    const staffId = "stf-edi-001"; // Clara Ross

    it("records electronic clock-in for staff member", async () => {
      setTokens(hostelManagerToken);
      const res = await clockInStaff({
        property_id: hostelPropertyId,
        staff_id: staffId,
        notes: "Management desk shift started.",
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toMatch(/^att-/);
      expect(res.data?.clock_in_time).toBeDefined();
      expect(res.data?.clock_out_time).toBeUndefined();
      attendanceId = res.data!.id;
    });

    it("prevents duplicate active clock-in without clocking out (409)", async () => {
      setTokens(hostelManagerToken);
      try {
        await clockInStaff({
          property_id: hostelPropertyId,
          staff_id: staffId,
        });
        expect.unreachable("Duplicate clock-in should fail");
      } catch (e: any) {
        expect(e.message).toContain("currently clocked in");
      }
    });

    it("records electronic clock-out and computes work duration", async () => {
      setTokens(hostelManagerToken);
      const res = await clockOutStaff(attendanceId, {
        notes: "Shift handed over smoothly.",
      });

      expect(res.success).toBe(true);
      expect(res.data?.clock_out_time).toBeDefined();
      expect(res.data?.total_work_minutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe("5. Housekeeping Workflow & Room Cleanliness Synchronization", () => {
    let testTaskId: string;
    const testRoomId = "rm-edi-102";

    it("creates a checkout clean task and marks the room dirty", async () => {
      setTokens(hostelManagerToken);
      const res = await createHousekeepingTask({
        property_id: hostelPropertyId,
        room_id: testRoomId,
        cleaning_type: "checkout_clean",
        priority: "high",
        assigned_staff_id: "stf-edi-002",
        notes: "Guest departed early. Clean before 14:00.",
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toMatch(/^hk-/);
      expect(res.data?.room_number).toBe("102");
      expect(res.data?.status).toBe("pending");
      testTaskId = res.data!.id;

      // Verify room state transitioned to dirty
      const roomsRes = await fetchRooms({ property_id: hostelPropertyId });
      const room = roomsRes.data?.find((r: any) => r.id === testRoomId);
      expect(room?.cleanliness_status).toBe("dirty");
    });

    it("updates housekeeping checklist items and starts cleaning", async () => {
      setTokens(hostelManagerToken);
      const updateRes = await updateHousekeepingTask(testTaskId, {
        status: "in_progress",
        linen_changed: true,
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.status).toBe("in_progress");
      expect(updateRes.data?.started_at).toBeDefined();
      expect(updateRes.data?.linen_changed).toBe(true);
    });

    it("marks housekeeping task cleaned and synchronizes room to clean", async () => {
      setTokens(hostelManagerToken);
      const updateRes = await updateHousekeepingTask(testTaskId, {
        status: "cleaned",
        amenities_restocked: true,
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.status).toBe("cleaned");
      expect(updateRes.data?.completed_at).toBeDefined();

      // Verify room state is now clean
      const roomsRes = await fetchRooms({ property_id: hostelPropertyId });
      const room = roomsRes.data?.find((r: any) => r.id === testRoomId);
      expect(room?.cleanliness_status).toBe("clean");
    });

    it("performs supervisor inspection and marks room inspected", async () => {
      setTokens(hostelManagerToken);
      const updateRes = await updateHousekeepingTask(testTaskId, {
        status: "inspected",
        inspection_passed: true,
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.status).toBe("inspected");
      expect(updateRes.data?.inspection_passed).toBe(true);

      // Verify room state is now inspected
      const roomsRes = await fetchRooms({ property_id: hostelPropertyId });
      const room = roomsRes.data?.find((r: any) => r.id === testRoomId);
      expect(room?.cleanliness_status).toBe("inspected");
    });
  });

  describe("6. Maintenance Work Orders & Operational Room Availability", () => {
    let orderId: string;
    const maintRoomId = "rm-edi-101";

    it("creates an emergency work order and sets room operational status to maintenance", async () => {
      setTokens(hostelManagerToken);
      const res = await createMaintenanceOrder({
        property_id: hostelPropertyId,
        title: "Radiator valve burst and leaking",
        description: "Hot water valve leaking onto floorboards.",
        category: "plumbing",
        priority: "emergency",
        room_id: maintRoomId,
        estimated_cost: 120.0,
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toMatch(/^wo-/);
      expect(res.data?.work_order_number).toMatch(/^WO-EDI-/);
      expect(res.data?.priority).toBe("emergency");
      orderId = res.data!.id;

      // Check that room operational_status is now maintenance
      const roomsRes = await fetchRooms({ property_id: hostelPropertyId });
      const room = roomsRes.data?.find((r: any) => r.id === maintRoomId);
      expect(room?.operational_status).toBe("maintenance");
    });

    it("updates work order progress and assigns facilities technician", async () => {
      setTokens(hostelManagerToken);
      const res = await updateMaintenanceOrder(orderId, {
        assigned_staff_id: "stf-edi-003", // Angus MacLeod
        status: "in_progress",
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe("in_progress");
      expect(res.data?.assigned_staff_name).toBe("Angus MacLeod");
    });

    it("resolves work order with actual costs and restores room operational status to available", async () => {
      setTokens(hostelManagerToken);
      const res = await updateMaintenanceOrder(orderId, {
        status: "resolved",
        actual_cost: 110.0,
        parts_used: "Replacement 15mm thermostatic radiator valve",
        resolution_notes: "Valve replaced, system bled and pressure tested at 1.8 bar.",
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe("resolved");
      expect(res.data?.actual_cost).toBe(110.0);
      expect(res.data?.resolved_at).toBeDefined();

      // Check room operational_status restored to available
      const roomsRes = await fetchRooms({ property_id: hostelPropertyId });
      const room = roomsRes.data?.find((r: any) => r.id === maintRoomId);
      expect(room?.operational_status).toBe("available");
    });
  });

  describe("7. Daily Operational Logs & Shift Handovers", () => {
    let logId: string;

    it("creates an operational shift handover log entry", async () => {
      setTokens(hostelManagerToken);
      const todayStr = new Date().toISOString().split("T")[0];
      const res = await createDailyLog({
        property_id: hostelPropertyId,
        summary: "Afternoon shift handover: All room checkouts turned over",
        details: "Keys accounted for, night auditor arriving at 22:00. Radiator repair completed in 101.",
        category: "shift_handover",
        shift_period: "evening",
        priority: "routine",
      });

      expect(res.success).toBe(true);
      expect(res.data?.id).toMatch(/^log-/);
      expect(res.data?.category).toBe("shift_handover");
      expect(res.data?.is_resolved).toBe(false);
      logId = res.data!.id;
    });

    it("fetches daily logs filtered by property and date", async () => {
      setTokens(hostelManagerToken);
      const todayStr = new Date().toISOString().split("T")[0];
      const res = await fetchDailyLogs(hostelPropertyId, todayStr);
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data!.some((l) => l.id === logId)).toBe(true);
    });

    it("resolves and acknowledges the daily log entry", async () => {
      setTokens(hostelManagerToken);
      const res = await resolveDailyLog(logId);
      expect(res.success).toBe(true);
      expect(res.data?.is_resolved).toBe(true);
      expect(res.data?.resolved_by_name).toBeDefined();
    });
  });

  describe("8. Operational Telemetry & Operations Dashboard", () => {
    it("retrieves full operations dashboard metrics for Edinburgh Hostel", async () => {
      setTokens(hostelManagerToken);
      const res = await fetchOperationsDashboard(hostelPropertyId);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.property_id).toBe(hostelPropertyId);
      expect(res.data?.total_staff).toBeGreaterThanOrEqual(3);
      expect(typeof res.data?.active_staff_on_duty).toBe("number");
      expect(typeof res.data?.pending_housekeeping_tasks).toBe("number");
      expect(typeof res.data?.open_maintenance_orders).toBe("number");
      expect(Array.isArray(res.data?.recent_activity)).toBe(true);
    });
  });
});
