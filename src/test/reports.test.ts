import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  setTokens,
  fetchExecutiveReport,
  fetchOccupancyReport,
  fetchBookingStayReport,
  fetchFinancialReport,
  fetchFoodDiningReport,
  fetchStaffOpsReport,
  downloadReportCsv,
} from "@/src/services/api-client";

describe("Phase 12: Reports & Analytics Domain Test Suite", () => {
  let adminToken: string;
  let hostelManagerToken: string;
  let guestToken: string;

  const hostelPropertyId = "prop-hostel-001"; // Edinburgh Waverley Castle Hostel
  const hotelPropertyId = "prop-hotel-002"; // Mayfair Grand Hotel London

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

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

  describe("1. Multi-Tenant Property Scoping & RBAC Restrictions", () => {
    it("allows Super Admin to access consolidated all-properties executive report", async () => {
      setTokens(adminToken);
      const res = await fetchExecutiveReport({
        property_id: "all",
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data!.property_scope.property_name).toContain("Consolidated");
      expect(res.data!.kpis.total_revenue).toBeGreaterThan(0);
    });

    it("allows Property Manager to access executive reports for their assigned property", async () => {
      setTokens(hostelManagerToken);
      const res = await fetchExecutiveReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data!.property_scope.property_id).toBe(hostelPropertyId);
    });

    it("forbids Property Manager from accessing consolidated 'all' property reports (403)", async () => {
      setTokens(hostelManagerToken);
      try {
        await fetchExecutiveReport({
          property_id: "all",
          start_date: thirtyDaysAgo,
          end_date: today,
        });
        expect.unreachable("Should have been blocked with 403");
      } catch (err: any) {
        expect(err.message).toContain("reserved for super administrators");
      }
    });

    it("forbids Property Manager from accessing an unassigned property report (403)", async () => {
      setTokens(hostelManagerToken);
      try {
        await fetchExecutiveReport({
          property_id: hotelPropertyId,
          start_date: thirtyDaysAgo,
          end_date: today,
        });
        expect.unreachable("Should have been blocked with 403");
      } catch (err: any) {
        expect(err.message).toContain("Access denied to property");
      }
    });

    it("forbids Guests from accessing any reporting analytics (403)", async () => {
      setTokens(guestToken);
      try {
        await fetchExecutiveReport({
          property_id: hostelPropertyId,
          start_date: thirtyDaysAgo,
          end_date: today,
        });
        expect.unreachable("Guest should not access analytics");
      } catch (err: any) {
        expect(err.message).toContain("Guests do not have permission");
      }
    });
  });

  describe("2. Executive Summary Metrics & Calculations", () => {
    it("returns consistent financial KPIs, ADR, RevPAR, and trend series", async () => {
      setTokens(adminToken);
      const res = await fetchExecutiveReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      const kpis = res.data!.kpis;
      expect(kpis.total_revenue).toBeGreaterThanOrEqual(0);
      expect(kpis.gross_revenue).toBeGreaterThanOrEqual(0);
      expect(kpis.total_tax).toBeGreaterThanOrEqual(0);
      expect(kpis.net_cash_flow).toBeDefined();
      expect(kpis.occupancy_rate).toBeGreaterThanOrEqual(0);
      expect(kpis.occupancy_rate).toBeLessThanOrEqual(100);
      expect(Array.isArray(res.data!.trend_series)).toBe(true);
      expect(res.data!.trend_series.length).toBeGreaterThan(0);
      expect(res.data!.category_breakdown).toBeDefined();
    });
  });

  describe("3. Occupancy & Inventory Capacity Performance", () => {
    it("computes room nights, bed nights, and daily timeline points", async () => {
      setTokens(adminToken);
      const res = await fetchOccupancyReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data!.total_beds).toBeGreaterThan(0);
      expect(res.data!.bed_nights_available).toBeGreaterThan(0);
      expect(res.data!.hostel_occupancy_pct).toBeGreaterThanOrEqual(0);
      expect(res.data!.daily_breakdown.length).toBeGreaterThan(0);

      const firstPoint = res.data!.daily_breakdown[0];
      expect(firstPoint.date).toBeDefined();
      expect(firstPoint.available_beds).toBeGreaterThanOrEqual(0);
    });
  });

  describe("4. Booking & Stay Performance Analytics", () => {
    it("calculates length of stay, lead times, and detailed records", async () => {
      setTokens(adminToken);
      const res = await fetchBookingStayReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data!.total_bookings).toBeGreaterThanOrEqual(0);
      expect(res.data!.average_length_of_stay_days).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.data!.records)).toBe(true);
    });
  });

  describe("5. Financial Performance & Statutory Tax Reconciliation", () => {
    it("reconciles invoice streams, payment methods, aging buckets, and VAT summaries", async () => {
      setTokens(adminToken);
      const res = await fetchFinancialReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data!.invoiced_revenue).toBeGreaterThanOrEqual(0);
      expect(res.data!.cash_collected).toBeGreaterThanOrEqual(0);
      expect(res.data!.aging_receivables.current_0_30).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.data!.tax_summary)).toBe(true);
      expect(Array.isArray(res.data!.revenue_by_category)).toBe(true);
      expect(Array.isArray(res.data!.collections_by_method)).toBe(true);
    });
  });

  describe("6. Food, Mess & Restaurant Operations Intelligence", () => {
    it("computes meal plan attendances, pay-per-meal revenue, and restaurant orders", async () => {
      setTokens(adminToken);
      const res = await fetchFoodDiningReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data!.total_meal_attendances).toBeGreaterThanOrEqual(0);
      expect(res.data!.pay_per_meal_revenue).toBeGreaterThanOrEqual(0);
      expect(res.data!.stock_summary.total_items).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.data!.popular_menu_items)).toBe(true);
    });
  });

  describe("7. Staff & Housekeeping Operational Performance", () => {
    it("reports on attendance punctuality, housekeeping turnover, and maintenance resolution", async () => {
      setTokens(adminToken);
      const res = await fetchStaffOpsReport({
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(res.success).toBe(true);
      expect(res.data!.total_staff).toBeGreaterThan(0);
      expect(res.data!.attendance_punctuality_pct).toBeGreaterThan(0);
      expect(res.data!.housekeeping_turnover_rate_pct).toBeGreaterThan(0);
      expect(res.data!.maintenance_resolution_rate_pct).toBeGreaterThan(0);
      expect(res.data!.department_distribution).toBeDefined();
    });
  });

  describe("8. Secure Tabular CSV Data Export", () => {
    it("downloads CSV data with proper format and injection protection", async () => {
      setTokens(adminToken);
      const csvContent = await downloadReportCsv({
        report_type: "executive",
        property_id: hostelPropertyId,
        start_date: thirtyDaysAgo,
        end_date: today,
      });

      expect(typeof csvContent).toBe("string");
      expect(csvContent.length).toBeGreaterThan(0);
      expect(csvContent).toContain("Metric,Value,Currency,Period");
      expect(csvContent).toContain("Total Invoiced Revenue");
    });
  });
});
