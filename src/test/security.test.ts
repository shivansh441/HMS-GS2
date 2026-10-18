import { describe, it, expect } from "vitest";
import {
  loginUser,
  registerCustomer,
  rotateRefreshToken,
  requestForgotPassword,
  submitPasswordReset,
  fetchPropertyPrivateDetails,
  fetchBookingById,
  adminProvisionUser,
  adminUpdateUserStatus,
  createHostelStay,
  createHotelStay,
  setTokens,
  apiFetch,
} from "@/src/services/api-client";

describe("Phase 13 Comprehensive Security & Automated Testing Verification", () => {
  // --------------------------------------------------------------------------
  // 1. Authentication & Session Security
  // --------------------------------------------------------------------------
  describe("1. Authentication & Session Security Invariants", () => {
    it("validates email formatting and normalizes case on registration", async () => {
      const mixedCaseEmail = `SecTest.${Date.now()}@Example.COM`;
      const regRes = await registerCustomer({
        email: mixedCaseEmail,
        password: "ValidPass1234!",
        first_name: "Security",
        last_name: "Tester",
      });

      expect(regRes.success).toBe(true);
      expect(regRes.data.email).toBe(mixedCaseEmail.toLowerCase());

      // Attempt invalid email syntax
      await expect(
        registerCustomer({
          email: "invalid-email-address",
          password: "ValidPass1234!",
          first_name: "Bad",
          last_name: "Email",
        })
      ).rejects.toThrow();
    });

    it("enforces minimum password length of 8 characters", async () => {
      await expect(
        registerCustomer({
          email: `shortpass.${Date.now()}@example.com`,
          password: "123",
          first_name: "Short",
          last_name: "Pass",
        })
      ).rejects.toThrow();
    });

    it("invalidates single-use password reset tokens upon first consumption", async () => {
      const email = `reset.${Date.now()}@example.com`;
      await registerCustomer({
        email,
        password: "InitialPassword123!",
        first_name: "Reset",
        last_name: "User",
      });

      const forgotRes = await requestForgotPassword(email);
      expect(forgotRes.success).toBe(true);
      const token = forgotRes.data.simulated_reset_token;
      expect(token).toBeDefined();

      if (token) {
        // First consumption must succeed
        const resetRes = await submitPasswordReset(token, "NewPassword5678!");
        expect(resetRes.success).toBe(true);

        // Reusing the same reset token MUST fail
        await expect(
          submitPasswordReset(token, "AnotherPassword9999!")
        ).rejects.toThrow();
      }
    });

    it("triggers refresh token family revocation upon token reuse attempt", async () => {
      const email = `reuse.${Date.now()}@example.com`;
      const password = "ReusePassword123!";
      await registerCustomer({
        email,
        password,
        first_name: "Token",
        last_name: "Reuse",
      });

      const loginRes = await loginUser(email, password);
      const initialRefresh = loginRes.data.refresh_token;

      // Rotate token once legitimately
      const rotateRes = await rotateRefreshToken(initialRefresh);
      expect(rotateRes.success).toBe(true);
      const secondRefresh = rotateRes.data.refresh_token;

      // Re-submitting the compromised initial token MUST trigger reuse detection
      await expect(rotateRefreshToken(initialRefresh)).rejects.toThrow();

      // Because reuse was detected, the whole token family must be invalidated
      await expect(rotateRefreshToken(secondRefresh)).rejects.toThrow();
    });

    it("blocks authentication for deactivated user accounts", async () => {
      // Super admin provisions a staff member
      const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
      setTokens(adminLogin.data.access_token);

      const staffEmail = `deact.${Date.now()}@grandstay.com`;
      const staffPass = "StaffPassword123!";
      const provRes = await adminProvisionUser({
        email: staffEmail,
        password: staffPass,
        first_name: "ToDeactivate",
        last_name: "Staff",
        global_role: "front_desk",
        assigned_property_ids: ["prop-hostel-001"],
      });

      expect(provRes.success).toBe(true);

      // Verify they can log in initially
      const staffLogin = await loginUser(staffEmail, staffPass);
      expect(staffLogin.success).toBe(true);

      // Deactivate the staff member
      setTokens(adminLogin.data.access_token);
      await adminUpdateUserStatus(provRes.data.id, false);

      // Subsequent login attempt must fail
      await expect(loginUser(staffEmail, staffPass)).rejects.toThrow();
    });

    it("prevents super admin from deactivating their own account", async () => {
      const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
      setTokens(adminLogin.data.access_token);

      // Director user id is usr-dir-001
      await expect(adminUpdateUserStatus("usr-dir-001", false)).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Authorization & Tenant Isolation
  // --------------------------------------------------------------------------
  describe("2. Multi-Tenant Authorization & Boundary Isolation", () => {
    it("denies front desk staff access to unauthorized properties (HTTP 403)", async () => {
      // Liam Chen is Front Desk at London Hotel only
      const liamLogin = await loginUser("liam.desk@grandstay.com", "Desk2026!Pass");
      setTokens(liamLogin.data.access_token);

      // Permitted on London Hotel
      const londonRes = await fetchPropertyPrivateDetails("prop-hotel-002");
      expect(londonRes.success).toBe(true);

      // Denied on Edinburgh Hostel
      await expect(fetchPropertyPrivateDetails("prop-hostel-001")).rejects.toThrow();
    });

    it("prevents guests from performing administrative payments (HTTP 403)", async () => {
      const sofiaLogin = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
      setTokens(sofiaLogin.data.access_token);

      await expect(
        apiFetch("/finance/payments", {
          method: "POST",
          body: JSON.stringify({
            property_id: "prop-hotel-002",
            amount: 100,
            currency: "GBP",
            payment_method: "cash",
            payer_name: "Sofia Guest",
          }),
        })
      ).rejects.toThrow();
    });

    it("enforces customer booking IDOR protection", async () => {
      const sofiaLogin = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
      setTokens(sofiaLogin.data.access_token);

      // Sofia can view her own booking
      const ownBooking = await fetchBookingById("bk-sofia-001");
      expect(ownBooking.success).toBe(true);

      // Sofia cannot view another customer's booking
      await expect(fetchBookingById("bk-john-002")).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Concurrency & Double-Booking Prevention
  // --------------------------------------------------------------------------
  describe("3. Concurrency & Double-Booking Invariants", () => {
    it("rejects overlapping hostel bed reservations for the same bed (HTTP 409)", async () => {
      const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
      setTokens(adminLogin.data.access_token);

      const checkIn = "2026-11-01";
      const checkOut = "2026-11-05";

      // 1. Create first stay for bed-edi-101-a
      const firstStay = await createHostelStay({
        property_id: "prop-hostel-001",
        hosteller_id: "hst-001",
        room_id: "rm-edi-101",
        bed_id: "bed-edi-101-a",
        check_in_date: checkIn,
        check_out_date: checkOut,
      });
      expect(firstStay.success).toBe(true);

      // 2. Attempt overlapping stay on same bed (2026-11-03 to 2026-11-07) -> MUST FAIL (409)
      await expect(
        createHostelStay({
          property_id: "prop-hostel-001",
          hosteller_id: "hst-002",
          room_id: "rm-edi-101",
          bed_id: "bed-edi-101-a",
          check_in_date: "2026-11-03",
          check_out_date: "2026-11-07",
        })
      ).rejects.toThrow();

      // 3. Adjacent non-overlapping stay (check_in equals checkOut of previous) -> MUST SUCCEED [half-open interval)
      const adjacentStay = await createHostelStay({
        property_id: "prop-hostel-001",
        hosteller_id: "hst-002",
        room_id: "rm-edi-101",
        bed_id: "bed-edi-101-a",
        check_in_date: "2026-11-05",
        check_out_date: "2026-11-08",
      });
      expect(adjacentStay.success).toBe(true);
    });

    it("rejects overlapping hotel room assignment for the same room (HTTP 409)", async () => {
      const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
      setTokens(adminLogin.data.access_token);

      const checkIn = "2026-12-10";
      const checkOut = "2026-12-15";

      // 1. Create hotel stay assigning Room 201
      const firstHotelStay = await createHotelStay({
        property_id: "prop-hotel-002",
        guest_id: "gst-001",
        room_type_id: "rt-htl-dlx",
        assigned_room_id: "rm-lon-201",
        check_in_date: checkIn,
        check_out_date: checkOut,
      });
      expect(firstHotelStay.success).toBe(true);

      // 2. Attempt overlapping stay assigning same room -> MUST FAIL (409)
      await expect(
        createHotelStay({
          property_id: "prop-hotel-002",
          guest_id: "gst-002",
          room_type_id: "rt-htl-dlx",
          assigned_room_id: "rm-lon-201",
          check_in_date: "2026-12-12",
          check_out_date: "2026-12-18",
        })
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Financial Integrity Invariants
  // --------------------------------------------------------------------------
  describe("4. Financial Integrity Invariants", () => {
    it("rejects zero or negative payment amounts with 422 INVALID_AMOUNT", async () => {
      const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
      setTokens(adminLogin.data.access_token);

      // Zero amount
      await expect(
        apiFetch("/finance/payments", {
          method: "POST",
          body: JSON.stringify({
            property_id: "prop-hotel-002",
            amount: 0,
            currency: "GBP",
            payment_method: "credit_card",
            payer_name: "Audit Tester",
          }),
        })
      ).rejects.toThrow();

      // Negative amount
      await expect(
        apiFetch("/finance/payments", {
          method: "POST",
          body: JSON.stringify({
            property_id: "prop-hotel-002",
            amount: -50.0,
            currency: "GBP",
            payment_method: "credit_card",
            payer_name: "Audit Tester",
          }),
        })
      ).rejects.toThrow();
    });

    it("rejects cross-property payment allocations", async () => {
      const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
      setTokens(adminLogin.data.access_token);

      // Record a payment for London Hotel (prop-hotel-002)
      const paymentRes = await apiFetch<any>("/finance/payments", {
        method: "POST",
        body: JSON.stringify({
          property_id: "prop-hotel-002",
          amount: 200,
          currency: "GBP",
          payment_method: "bank_transfer",
          payer_name: "Cross Property Test",
        }),
      });
      expect(paymentRes.success).toBe(true);
      const paymentId = paymentRes.data.id;

      // Attempt to allocate this payment to an Edinburgh Hostel invoice (inv-edi-001)
      await expect(
        apiFetch(`/finance/payments/${paymentId}/allocate`, {
          method: "POST",
          body: JSON.stringify({
            allocations: [{ invoice_id: "inv-edi-001", amount: 100 }],
          }),
        })
      ).rejects.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Security Headers & Observability
  // --------------------------------------------------------------------------
  describe("5. Security Headers & Request Correlation", () => {
    it("serves security headers and correlation ID on API responses", async () => {
      const res = await fetch("http://127.0.0.1:3000/api/v1/health");
      expect(res.ok).toBe(true);

      const headers = res.headers;
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.get("x-frame-options")).toBe("SAMEORIGIN");
      expect(headers.get("x-request-id")).toBeDefined();
      expect(headers.get("cache-control")).toContain("no-store");
    });
  });
});
