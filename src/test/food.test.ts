import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  setTokens,
  fetchFoodConfig,
  updateFoodConfig,
  fetchMenuItems,
  createMenuItem,
  updateMenuItem,
  fetchMealPlans,
  createMealPlan,
  fetchMealEntitlements,
  assignMealPlan,
  verifyEntitlement,
  fetchMealAttendance,
  recordMealAttendance,
  fetchRestaurantOrders,
  createRestaurantOrder,
  updateRestaurantOrderStatus,
  fetchFoodStock,
  createFoodStockItem,
  recordStockMovement,
  fetchFoodStockMovements,
  fetchFoodDashboard,
  fetchInvoices,
} from "@/src/services/api-client";

describe("Phase 10: Mess & Restaurant Management Domain Suite", () => {
  let adminToken: string;
  let hostelManagerToken: string;
  let guestToken: string;
  let testPlanId = "plan-edi-001";

  const hostelPropertyId = "prop-hostel-001"; // Edinburgh Waverley Castle Hostel
  const hotelPropertyId = "prop-hotel-002"; // Mayfair Grand Hotel London

  beforeAll(async () => {
    // 1. Authenticate Super Admin
    const adminRes = await loginUser("director@grandstay.com", "Admin2026!Secure");
    expect(adminRes.success).toBe(true);
    adminToken = adminRes.data!.access_token;

    // 2. Authenticate Property Manager (assigned to prop-hostel-001)
    const pmRes = await loginUser("clara.manager@grandstay.com", "Manager2026!Pass");
    expect(pmRes.success).toBe(true);
    hostelManagerToken = pmRes.data!.access_token;

    // 3. Authenticate Guest
    const guestRes = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    expect(guestRes.success).toBe(true);
    guestToken = guestRes.data!.access_token;
  });

  describe("1. Property Food Service Configuration & Multi-Tenant Isolation", () => {
    it("allows property manager to retrieve food service configuration for their assigned hostel", async () => {
      setTokens(hostelManagerToken);
      const res = await fetchFoodConfig(hostelPropertyId);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.property_id).toBe(hostelPropertyId);
      expect(res.data?.mess_enabled).toBe(true);
      expect(res.data?.currency).toBe("GBP");
      expect(res.data?.meal_periods.length).toBeGreaterThan(0);
    });

    it("rejects property manager attempting to access configuration for unassigned hotel property", async () => {
      setTokens(hostelManagerToken);
      try {
        await fetchFoodConfig(hotelPropertyId);
        expect.unreachable("Should have rejected access to unassigned property");
      } catch (e: any) {
        expect(e.status).toBe(403);
        expect(e.code).toBe("PROPERTY_ACCESS_VIOLATION");
      }
    });

    it("rejects non-staff guest user attempting to query food configuration", async () => {
      setTokens(guestToken);
      try {
        await fetchFoodConfig(hostelPropertyId);
        expect.unreachable("Should have rejected guest access");
      } catch (e: any) {
        expect(e.status).toBe(403);
        expect(e.code).toBe("PROPERTY_ACCESS_VIOLATION");
      }
    });

    it("allows authorized manager to update food policies and pay-per-meal prices", async () => {
      setTokens(hostelManagerToken);
      const updateRes = await updateFoodConfig({
        property_id: hostelPropertyId,
        mess_enabled: true,
        restaurant_enabled: false,
        allow_pay_per_meal: true,
        default_pay_per_meal_price: 12.5,
      });
      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.default_pay_per_meal_price).toBe(12.5);
      expect(updateRes.data?.mess_enabled).toBe(true);
      expect(updateRes.data?.restaurant_enabled).toBe(false);
    });
  });

  describe("2. Menu Item Management & Dietary Specifications", () => {
    let createdMenuItemId: string;

    it("allows super admin to query menu items filtered by property and service type", async () => {
      setTokens(adminToken);
      const res = await fetchMenuItems(hostelPropertyId, "mess");
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data!.length).toBeGreaterThan(0);
      for (const item of res.data!) {
        expect(item.property_id).toBe(hostelPropertyId);
        expect(["mess", "both"]).toContain(item.service_type);
      }
    });

    it("creates a new menu item with dietary flags, allergen tags, and active meal periods", async () => {
      setTokens(hostelManagerToken);
      const createRes = await createMenuItem({
        property_id: hostelPropertyId,
        name: "Scottish Porridge & Heather Honey Special",
        description: "Organic rolled oats simmered in oat milk with fresh berries and Scottish heather honey",
        service_type: "mess",
        category: "breakfast",
        price: 5.5,
        meal_periods: ["breakfast"],
        dietary_flags: ["vegetarian", "dairy_free"],
        allergens: ["oats"],
        is_available: true,
      });

      expect(createRes.success).toBe(true);
      expect(createRes.data).toBeDefined();
      expect(createRes.data?.name).toBe("Scottish Porridge & Heather Honey Special");
      expect(createRes.data?.price).toBe(5.5);
      expect(createRes.data?.dietary_flags).toContain("vegetarian");
      expect(createRes.data?.dietary_flags).toContain("dairy_free");
      createdMenuItemId = createRes.data!.id;
    });

    it("updates menu item availability and pricing", async () => {
      setTokens(hostelManagerToken);
      const updateRes = await updateMenuItem(createdMenuItemId, {
        price: 6.0,
        is_available: false, // 86'd / sold out
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.price).toBe(6.0);
      expect(updateRes.data?.is_available).toBe(false);
    });
  });

  describe("3. Hostel Meal Plans, Entitlements & Phase 9 Finance Integration", () => {
    const testHostellerId = "hstlr-edi-001"; // John Watson

    it("allows property manager to create a meal plan with period coverage and validity days", async () => {
      setTokens(hostelManagerToken);
      const planRes = await createMealPlan({
        property_id: hostelPropertyId,
        name: "Student 14-Day Full Dining Pass",
        description: "Breakfast and Dinner included for two weeks",
        plan_type: "all_meals",
        included_meal_periods: ["breakfast", "dinner"],
        price: 98.0,
        validity_days: 14,
      });

      expect(planRes.success).toBe(true);
      expect(planRes.data?.name).toBe("Student 14-Day Full Dining Pass");
      expect(planRes.data?.validity_days).toBe(14);
      expect(planRes.data?.price).toBe(98.0);
      testPlanId = planRes.data!.id;
    });

    const testServiceDate = `2026-12-${String(Math.floor(10 + Math.random() * 18)).padStart(2, "0")}`;

    it("assigns meal plan to hosteller and automatically generates Phase 9 folio invoice", async () => {
      setTokens(hostelManagerToken);

      const assignRes = await assignMealPlan({
        property_id: hostelPropertyId,
        hosteller_id: testHostellerId,
        meal_plan_id: testPlanId,
        start_date: testServiceDate,
        create_invoice: true, // triggers Phase 9 finance integration
      });

      expect(assignRes.success).toBe(true);
      expect(assignRes.data).toBeDefined();
      expect(assignRes.data?.hosteller_id).toBe(testHostellerId);
      expect(assignRes.data?.status).toBe("active");
      expect(assignRes.data?.invoice_id).toBeDefined();

      // Verify the generated invoice exists in Phase 9 Finance Engine
      const invoiceId = assignRes.data!.invoice_id!;
      const invoicesRes = await fetchInvoices({ property_id: hostelPropertyId });
      expect(invoicesRes.success).toBe(true);
      const generatedInvoice = invoicesRes.data!.find((inv) => inv.id === invoiceId);
      expect(generatedInvoice).toBeDefined();
      expect(generatedInvoice?.status).toBe("issued");
      expect(generatedInvoice?.total_amount).toBeGreaterThan(0);
      expect(generatedInvoice?.tax_snapshot).toBeDefined();
      expect(generatedInvoice?.line_items[0].charge_category).toBe("mess_meal");
    });

    it("queries meal entitlements filtered by hosteller resident", async () => {
      setTokens(hostelManagerToken);
      const res = await fetchMealEntitlements(hostelPropertyId, testHostellerId);
      expect(res.success).toBe(true);
      expect(res.data!.length).toBeGreaterThan(0);
      expect(res.data![0].hosteller_id).toBe(testHostellerId);
    });
  });

  describe("4. Meal Attendance, Verification & Duplicate Prevention", () => {
    const testHostellerId = "hstlr-edi-001";
    const testServiceDate = `2026-12-${String(Math.floor(10 + Math.random() * 18)).padStart(2, "0")}`;
    const testMealPeriod = "breakfast";

    it("verifies entitlement eligibility before meal redemption", async () => {
      setTokens(hostelManagerToken);
      // Ensure hosteller has active entitlement covering testServiceDate
      await assignMealPlan({
        property_id: hostelPropertyId,
        hosteller_id: testHostellerId,
        meal_plan_id: testPlanId,
        start_date: testServiceDate,
        create_invoice: false,
      });

      const verifyRes = await verifyEntitlement(hostelPropertyId, testHostellerId, testServiceDate, testMealPeriod);
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.data?.is_eligible).toBe(true);
      expect(verifyRes.data?.already_redeemed).toBe(false);
      expect(verifyRes.data?.has_active_entitlement).toBe(true);
    });

    it("successfully logs meal redemption at the mess hall kiosk", async () => {
      setTokens(hostelManagerToken);
      const attendRes = await recordMealAttendance({
        property_id: hostelPropertyId,
        hosteller_id: testHostellerId,
        service_date: testServiceDate,
        meal_period: testMealPeriod,
      });

      expect(attendRes.success).toBe(true);
      expect(attendRes.data?.meal_period).toBe(testMealPeriod);
      expect(attendRes.data?.is_pay_per_meal).toBe(false);
      expect(attendRes.data?.is_manual_override).toBe(false);
    });

    it("enforces transactional idempotency and blocks duplicate redemption on the same day and meal period (HTTP 409)", async () => {
      setTokens(hostelManagerToken);
      try {
        await recordMealAttendance({
          property_id: hostelPropertyId,
          hosteller_id: testHostellerId,
          service_date: testServiceDate,
          meal_period: testMealPeriod,
        });
        expect.unreachable("Should have thrown 409 duplicate redemption error");
      } catch (e: any) {
        expect(e.status).toBe(409);
        expect(e.code).toBe("DUPLICATE_REDEMPTION");
      }
    });

    it("allows authorized manager manual override for second meal redemption", async () => {
      setTokens(hostelManagerToken);
      const overrideRes = await recordMealAttendance({
        property_id: hostelPropertyId,
        hosteller_id: testHostellerId,
        service_date: testServiceDate,
        meal_period: testMealPeriod,
        is_manual_override: true,
        override_reason: "Special athletic team double breakfast authorized by hostel warden",
      });

      expect(overrideRes.success).toBe(true);
      expect(overrideRes.data?.is_manual_override).toBe(true);
      expect(overrideRes.data?.override_reason).toContain("Special athletic team");
    });

    it("supports pay-per-meal for resident without active plan when allowed by policy", async () => {
      setTokens(hostelManagerToken);
      // hstlr-edi-005 (Chloe) on a fresh date has no meal plan
      const unplanHostellerId = "hstlr-edi-005";
      const freshDate = new Date(Date.now() + (Math.floor(Math.random() * 20000) + 1000) * 86400000).toISOString().split("T")[0];
      const attendRes = await recordMealAttendance({
        property_id: hostelPropertyId,
        hosteller_id: unplanHostellerId,
        service_date: freshDate,
        meal_period: "lunch",
      });

      expect(attendRes.success).toBe(true);
      expect(attendRes.data?.is_pay_per_meal).toBe(true);
      expect(attendRes.data?.price_charged).toBe(12.5); // configured default
    });
  });

  describe("5. Hotel Restaurant Orders, Phase 9 Tax & Room Folio Billing", () => {
    let createdOrderId: string;
    const hotelStayId = "hstay-lon-001"; // Sofia Berg in Mayfair Grand Hotel London

    it("creates restaurant order with itemization and computes tax using Phase 9 tax engine", async () => {
      setTokens(adminToken);
      const orderRes = await createRestaurantOrder({
        property_id: hotelPropertyId,
        customer_type: "hotel_guest",
        customer_name: "Sofia Berg",
        hotel_stay_id: hotelStayId,
        room_number: "rm-lon-201",
        items: [
          { item_id: "menu-lon-001", quantity: 2 }, // Royal Mayfair Eggs Benedict (£24.00 ea)
          { item_id: "menu-lon-002", quantity: 1 }, // Pan-Seared Dover Sole (£46.00 ea)
        ],
        special_instructions: "Serve eggs first with gluten-free brioche",
        bill_to_room: true, // Trigger hotel room folio invoice creation in Phase 9 finance
      });

      expect(orderRes.success).toBe(true);
      expect(orderRes.data).toBeDefined();
      expect(orderRes.data?.order_number).toContain("ORD-2026-");
      expect(orderRes.data?.subtotal).toBe(94.0); // 2*24 + 46
      expect(orderRes.data?.tax_amount).toBeGreaterThan(0); // 20% VAT
      expect(orderRes.data?.total_amount).toBeGreaterThan(orderRes.data!.subtotal);
      expect(orderRes.data?.billing_status).toBe("billed_to_room");
      expect(orderRes.data?.invoice_id).toBeDefined();
      createdOrderId = orderRes.data!.id;

      // Verify folio invoice in Phase 9 Finance Engine
      const invoiceId = orderRes.data!.invoice_id!;
      const invoicesRes = await fetchInvoices({ property_id: hotelPropertyId });
      expect(invoicesRes.success).toBe(true);
      const folioInvoice = invoicesRes.data!.find((inv) => inv.id === invoiceId);
      expect(folioInvoice).toBeDefined();
      expect(folioInvoice?.reservation_type).toBe("hotel_stay");
      expect(folioInvoice?.reservation_id).toBe(hotelStayId);
      expect(folioInvoice?.total_amount).toBe(orderRes.data!.total_amount);
    });

    it("updates kitchen display system (KDS) order status through its lifecycle", async () => {
      setTokens(adminToken);

      // placed -> preparing
      const prepRes = await updateRestaurantOrderStatus(createdOrderId, "preparing");
      expect(prepRes.success).toBe(true);
      expect(prepRes.data?.status).toBe("preparing");

      // preparing -> ready
      const readyRes = await updateRestaurantOrderStatus(createdOrderId, "ready");
      expect(readyRes.success).toBe(true);
      expect(readyRes.data?.status).toBe("ready");

      // ready -> served
      const servedRes = await updateRestaurantOrderStatus(createdOrderId, "served");
      expect(servedRes.success).toBe(true);
      expect(servedRes.data?.status).toBe("served");

      // served -> completed
      const completeRes = await updateRestaurantOrderStatus(createdOrderId, "completed");
      expect(completeRes.success).toBe(true);
      expect(completeRes.data?.status).toBe("completed");
    });
  });

  describe("6. Food Stock Inventory & Consumption Tracking", () => {
    let createdStockId: string;

    it("lists food stock items and correctly detects low-stock threshold alerts", async () => {
      setTokens(hostelManagerToken);
      const stockRes = await fetchFoodStock(hostelPropertyId);
      expect(stockRes.success).toBe(true);
      expect(Array.isArray(stockRes.data)).toBe(true);
      expect(stockRes.data!.length).toBeGreaterThan(0);

      // Verify low stock logic
      for (const item of stockRes.data!) {
        if (item.current_quantity <= item.low_stock_threshold) {
          expect(item.is_low_stock).toBe(true);
        } else {
          expect(item.is_low_stock).toBe(false);
        }
      }
    });

    it("creates a new pantry ingredient stock record", async () => {
      setTokens(hostelManagerToken);
      const createRes = await createFoodStockItem({
        property_id: hostelPropertyId,
        name: "Artisan Sourdough Loaves",
        category: "grains_staples",
        unit_of_measure: "pieces",
        current_quantity: 15,
        low_stock_threshold: 4,
        cost_per_unit: 3.2,
        supplier_name: "Highland Bakery Co",
      });

      expect(createRes.success).toBe(true);
      expect(createRes.data?.name).toBe("Artisan Sourdough Loaves");
      expect(createRes.data?.current_quantity).toBe(15);
      createdStockId = createRes.data!.id;
    });

    it("records stock receipt delivery (+ delta) and creates movement audit trail", async () => {
      setTokens(hostelManagerToken);
      const moveRes = await recordStockMovement(createdStockId, {
        movement_type: "receipt",
        quantity_delta: 10,
        reason: "Morning fresh bread delivery batch",
      });

      expect(moveRes.success).toBe(true);
      expect(moveRes.data?.stock_item.current_quantity).toBe(25); // 15 + 10
      expect(moveRes.data?.movement.movement_type).toBe("receipt");
      expect(moveRes.data?.movement.quantity_delta).toBe(10);
      expect(moveRes.data?.movement.resulting_quantity).toBe(25);
    });

    it("records stock consumption (- delta) and triggers low stock alert when below threshold", async () => {
      setTokens(hostelManagerToken);
      const moveRes = await recordStockMovement(createdStockId, {
        movement_type: "consumption",
        quantity_delta: -23,
        reason: "Weekend hostel breakfast buffet consumption",
      });

      expect(moveRes.success).toBe(true);
      expect(moveRes.data?.stock_item.current_quantity).toBe(2); // 25 - 23 = 2 <= threshold 4
      expect(moveRes.data?.stock_item.is_low_stock).toBe(true);
    });

    it("queries stock movements audit trail", async () => {
      setTokens(hostelManagerToken);
      const movesRes = await fetchFoodStockMovements(hostelPropertyId);
      expect(movesRes.success).toBe(true);
      expect(movesRes.data!.length).toBeGreaterThanOrEqual(2);
      expect(movesRes.data![0].performed_by_name).toBeDefined();
    });
  });

  describe("7. Food Service Operational Dashboard Metrics", () => {
    it("retrieves operational dashboard summary with aggregated counts and meal breakdown", async () => {
      setTokens(hostelManagerToken);
      const todayStr = new Date().toISOString().split("T")[0];
      try {
        await recordMealAttendance({
          property_id: hostelPropertyId,
          hosteller_id: "hstlr-edi-002",
          service_date: todayStr,
          meal_period: "dinner",
        });
      } catch {
        // Attendance already recorded for today in server state
      }

      const dashRes = await fetchFoodDashboard(hostelPropertyId);
      expect(dashRes.success).toBe(true);
      expect(dashRes.data).toBeDefined();
      expect(dashRes.data?.property_id).toBe(hostelPropertyId);
      expect(dashRes.data?.today_meal_attendance_count).toBeGreaterThanOrEqual(1);
      expect(dashRes.data?.service_periods.length).toBeGreaterThan(0);
      expect(typeof dashRes.data?.low_stock_items_count).toBe("number");
    });
  });
});
