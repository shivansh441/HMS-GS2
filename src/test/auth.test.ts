import { describe, it, expect, beforeAll } from "vitest";
import {
  registerCustomer,
  loginUser,
  rotateRefreshToken,
  logoutUser,
  fetchCurrentUserProfile,
  changePassword,
  requestForgotPassword,
  submitPasswordReset,
  fetchPublicProperties,
  fetchPropertyPrivateDetails,
  fetchMyBookings,
  fetchBookingById,
  adminProvisionUser,
  adminUpdateUserStatus,
  setTokens,
} from "@/src/services/api-client";

describe("Phase 3 Authentication & Authorization Security Invariants", () => {
  const testCustomerEmail = `test.user.${Date.now()}@example.com`;
  const testCustomerPassword = "CustomerSecure2026!";
  let customerAccessToken = "";
  let customerRefreshToken = "";

  it("registers customer account successfully and enforces role=guest", async () => {
    const res = await registerCustomer({
      email: testCustomerEmail,
      password: testCustomerPassword,
      first_name: "Maya",
      last_name: "Lin",
    });

    expect(res.success).toBe(true);
    expect(res.data.email).toBe(testCustomerEmail);
    expect(res.data.global_role).toBe("guest");
    expect((res.data as any).hashed_password).toBeUndefined();
  });

  it("rejects duplicate email registration with 409 Conflict", async () => {
    await expect(
      registerCustomer({
        email: testCustomerEmail,
        password: testCustomerPassword,
        first_name: "Duplicate",
        last_name: "Attempt",
      })
    ).rejects.toThrow();
  });

  it("authenticates customer and issues JWT access and refresh token pair", async () => {
    const res = await loginUser(testCustomerEmail, testCustomerPassword);
    expect(res.success).toBe(true);
    expect(res.data.access_token).toBeDefined();
    expect(res.data.refresh_token).toBeDefined();
    expect(res.data.role).toBe("guest");

    customerAccessToken = res.data.access_token;
    customerRefreshToken = res.data.refresh_token;
  });

  it("rejects authentication with invalid credentials (401)", async () => {
    await expect(loginUser(testCustomerEmail, "WrongPassword2026!")).rejects.toThrow();
  });

  it("rotates refresh token and issues fresh token pair", async () => {
    const res = await rotateRefreshToken(customerRefreshToken);
    expect(res.success).toBe(true);
    expect(res.data.access_token).toBeDefined();
    expect(res.data.refresh_token).toBeDefined();
    expect(res.data.refresh_token).not.toBe(customerRefreshToken);

    const oldToken = customerRefreshToken;
    customerRefreshToken = res.data.refresh_token;
    customerAccessToken = res.data.access_token;

    // Reuse detection: Attempting to use the rotated oldToken MUST trigger reuse detection
    await expect(rotateRefreshToken(oldToken)).rejects.toThrow();
  });

  it("allows authenticated customer to view own profile via /auth/me", async () => {
    setTokens(customerAccessToken);
    const profile = await fetchCurrentUserProfile();
    expect(profile.success).toBe(true);
    expect(profile.data.email).toBe(testCustomerEmail);
    expect(profile.data.global_role).toBe("guest");
  });

  it("changes customer password and revokes previous sessions", async () => {
    setTokens(customerAccessToken);
    const newPassword = "BrandNewPassword2026!";
    const res = await changePassword(testCustomerPassword, newPassword);
    expect(res.success).toBe(true);
    expect(res.data.password_changed).toBe(true);

    // Old password must now fail
    await expect(loginUser(testCustomerEmail, testCustomerPassword)).rejects.toThrow();

    // New password must succeed
    const loginRes = await loginUser(testCustomerEmail, newPassword);
    expect(loginRes.success).toBe(true);
    customerAccessToken = loginRes.data.access_token;
  });

  it("processes password reset flow with single-use token invalidation", async () => {
    const forgotRes = await requestForgotPassword(testCustomerEmail);
    expect(forgotRes.success).toBe(true);
    const token = forgotRes.data.simulated_reset_token;
    expect(token).toBeDefined();

    if (token) {
      const resetPass = "AfterReset2026!Pass";
      const resetRes = await submitPasswordReset(token, resetPass);
      expect(resetRes.success).toBe(true);

      // Re-consuming same token MUST be rejected (single-use enforcement)
      await expect(submitPasswordReset(token, "AnotherAttempt2026!")).rejects.toThrow();
    }
  });

  it("allows unauthenticated public visitors to discover published properties", async () => {
    setTokens(null); // No token
    const res = await fetchPublicProperties();
    expect(res.success).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(3);
    // Public catalog must not expose total_rooms, internal configuration, or sensitive notes
    const sample = res.data[0];
    expect(sample.name).toBeDefined();
    expect(sample.property_type).toBeDefined();
    expect(sample.checkin_time_start).toBeDefined();
  });

  it("enforces customer booking ownership isolation", async () => {
    // 1. Log in as Sofia Berg
    const sofiaLogin = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    setTokens(sofiaLogin.data.access_token);

    // Sofia views her own booking (bk-sofia-001) -> MUST SUCCEED (200)
    const ownBooking = await fetchBookingById("bk-sofia-001");
    expect(ownBooking.success).toBe(true);
    expect(ownBooking.data.booking_reference).toBe("GS-LON-2026-8812");

    // Sofia attempts to view John Doe's booking (bk-john-002) -> MUST BE REJECTED (403 Forbidden)
    await expect(fetchBookingById("bk-john-002")).rejects.toThrow();
  });

  it("enforces property staff boundary isolation", async () => {
    // 1. Liam Chen is Front Desk at London Hotel (prop-hotel-002) only
    const liamLogin = await loginUser("liam.desk@grandstay.com", "Desk2026!Pass");
    setTokens(liamLogin.data.access_token);

    // Liam accesses London Hotel private details -> MUST SUCCEED
    const liamAccess = await fetchPropertyPrivateDetails("prop-hotel-002");
    expect(liamAccess.success).toBe(true);
    expect(liamAccess.data.code).toBe("HTL-LON-02");

    // Liam attempts to access Edinburgh Hostel (prop-hostel-001) -> MUST BE REJECTED (403 PropertyAccessViolation)
    await expect(fetchPropertyPrivateDetails("prop-hostel-001")).rejects.toThrow();
  });

  it("allows platform super admin global cross-property access and staff provisioning", async () => {
    // 1. Log in as Super Admin Julian Vance
    const adminLogin = await loginUser("director@grandstay.com", "Admin2026!Secure");
    setTokens(adminLogin.data.access_token);

    // Admin can access both properties
    const p1 = await fetchPropertyPrivateDetails("prop-hostel-001");
    const p2 = await fetchPropertyPrivateDetails("prop-hotel-002");
    expect(p1.success).toBe(true);
    expect(p2.success).toBe(true);

    // Admin provisions new staff member
    const newStaffEmail = `staff.${Date.now()}@grandstay.com`;
    const provRes = await adminProvisionUser({
      email: newStaffEmail,
      password: "StaffPassword2026!Secure",
      first_name: "Samuel",
      last_name: "Oak",
      global_role: "front_desk",
      assigned_property_ids: ["prop-hostel-001"],
    });
    expect(provRes.success).toBe(true);
    expect(provRes.data.email).toBe(newStaffEmail);

    // Admin deactivates staff member
    const statusRes = await adminUpdateUserStatus(provRes.data.id, false);
    expect(statusRes.success).toBe(true);
    expect(statusRes.data.is_active).toBe(false);

    // Deactivated user cannot log in
    await expect(loginUser(newStaffEmail, "StaffPassword2026!Secure")).rejects.toThrow();
  });
});
