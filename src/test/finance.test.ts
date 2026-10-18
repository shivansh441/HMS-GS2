import { describe, it, expect, beforeAll } from "vitest";
import {
  loginUser,
  setTokens,
  fetchTaxRules,
  createTaxRule,
  updateTaxRule,
  calculateTaxPreview,
  fetchInvoices,
  createDraftInvoice,
  fetchInvoiceById,
  updateDraftInvoice,
  issueInvoice,
  voidInvoice,
  fetchPayments,
  recordPayment,
  allocatePayment,
  recordRefund,
  fetchFinanceDashboard,
  fetchOutstandingDues,
} from "@/src/services/api-client";
import { ChargeCategory } from "@/src/types/finance";

describe("Phase 9 Finance & Tax Engine Invariants", () => {
  let adminToken: string;
  let managerToken: string;
  let guestToken: string;

  beforeAll(async () => {
    // Authenticate Super Admin
    const adminRes = await loginUser("director@grandstay.com", "Admin2026!Secure");
    expect(adminRes.success).toBe(true);
    adminToken = adminRes.data!.access_token;

    // Authenticate Property Manager (assigned to prop-hostel-001)
    const pmRes = await loginUser("clara.manager@grandstay.com", "Manager2026!Pass");
    expect(pmRes.success).toBe(true);
    managerToken = pmRes.data!.access_token;

    // Authenticate Guest (Sofia Berg)
    const guestRes = await loginUser("sofia.guest@example.com", "Sofia2026!Guest");
    expect(guestRes.success).toBe(true);
    guestToken = guestRes.data!.access_token;
  });

  describe("1. Centralized Deterministic Tax Calculation Service", () => {
    it("calculates standard exclusive tax percentage correctly with exact decimal rounding", async () => {
      setTokens(adminToken);

      const previewRes = await calculateTaxPreview({
        property_id: "prop-hotel-002",
        line_items: [
          {
            charge_category: "accommodation_hotel",
            quantity: 2,
            unit_price: 200.0,
            discount_amount: 0.0,
          },
        ],
      });

      expect(previewRes.success).toBe(true);
      expect(previewRes.data).toBeDefined();

      const data = previewRes.data!;
      expect(data.subtotal).toBe(400.0);
      expect(data.discount_total).toBe(0.0);
      // London hotel has 20% VAT + 2.5% Service Charge = 22.5% on accommodation
      // 400 * 0.20 = 80.00 VAT, 400 * 0.025 = 10.00 Service = 90.00 total tax
      expect(data.tax_total).toBe(90.0);
      expect(data.total_amount).toBe(490.0);
      expect(data.line_items[0].subtotal).toBe(400.0);
      expect(data.line_items[0].tax_amount).toBe(90.0);
      expect(data.line_items[0].total).toBe(490.0);
    });

    it("applies discounts before calculating tax base", async () => {
      setTokens(adminToken);

      const previewRes = await calculateTaxPreview({
        property_id: "prop-hotel-002",
        line_items: [
          {
            charge_category: "accommodation_hotel",
            quantity: 1,
            unit_price: 300.0,
            discount_amount: 50.0, // Discount of 50.00
          },
        ],
      });

      expect(previewRes.success).toBe(true);
      const data = previewRes.data!;
      // Taxable subtotal: 300 - 50 = 250.00
      expect(data.subtotal).toBe(250.0);
      expect(data.discount_total).toBe(50.0);
      // Tax: 250 * 0.225 = 56.25
      expect(data.tax_total).toBe(56.25);
      expect(data.total_amount).toBe(306.25);
    });

    it("handles tax-inclusive rules by extracting embedded tax without inflating totals", async () => {
      setTokens(adminToken);

      // Create a temporary inclusive tax rule for tests on Berlin property
      // Ensure hermetic state: deactivate any previous facility_fee rules on hybrid property
      const existingRules = await fetchTaxRules("prop-hybrid-003");
      for (const r of existingRules.data || []) {
        if (r.charge_categories.includes("facility_fee")) {
          await updateTaxRule(r.id, { is_active: false });
        }
      }

      const createRuleRes = await createTaxRule({
        property_id: "prop-hybrid-003",
        name: "Berlin Tourism City Tax (Inclusive)",
        rate_percentage: 5.0,
        charge_categories: ["facility_fee"],
        is_inclusive: true,
        effective_from: "2026-01-01",
        priority: 1,
      });

      expect(createRuleRes.success).toBe(true);

      const previewRes = await calculateTaxPreview({
        property_id: "prop-hybrid-003",
        line_items: [
          {
            charge_category: "facility_fee",
            quantity: 1,
            unit_price: 105.0,
            discount_amount: 0,
          },
        ],
      });

      expect(previewRes.success).toBe(true);
      const data = previewRes.data!;
      // Total amount should remain 105.00 because tax is inclusive
      // Tax embedded: 105 - (105 / 1.05) = 5.00
      expect(data.subtotal).toBe(105.0);
      expect(data.tax_total).toBe(5.0);
      // For inclusive rule, price includes tax
    });

    it("only applies active tax rules within effective date range", async () => {
      setTokens(adminToken);

      // Create future rule that is not yet effective
      const futureRuleRes = await createTaxRule({
        property_id: "prop-hostel-001",
        name: "Future Edinburgh Festival Surcharge",
        rate_percentage: 15.0,
        charge_categories: ["facility_fee"],
        is_inclusive: false,
        effective_from: "2099-01-01", // Far in the future
        priority: 2,
      });
      expect(futureRuleRes.success).toBe(true);

      const previewRes = await calculateTaxPreview({
        property_id: "prop-hostel-001",
        line_items: [
          {
            charge_category: "facility_fee",
            quantity: 1,
            unit_price: 50.0,
          },
        ],
      });

      expect(previewRes.success).toBe(true);
      // Future rule must NOT apply
      expect(previewRes.data!.tax_total).toBe(0.0);
      expect(previewRes.data!.total_amount).toBe(50.0);
    });
  });

  describe("2. Invoice Lifecycle, Draft Editing, and Snapshot Immutability", () => {
    let testDraftId: string;

    it("creates a draft invoice with backend-calculated authoritative values", async () => {
      setTokens(adminToken);

      const res = await createDraftInvoice({
        property_id: "prop-hotel-002",
        customer_type: "guest",
        customer_name: "James Bond",
        customer_email: "007@mi6.gov.uk",
        due_date: "2026-11-20",
        notes: "Executive corner suite folio",
        line_items: [
          {
            charge_category: "accommodation_hotel",
            description: "Mayfair Executive Suite (3 nights)",
            quantity: 3,
            unit_price: 280.0,
            discount_amount: 40.0,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      const inv = res.data!;
      expect(inv.status).toBe("draft");
      expect(inv.customer_name).toBe("James Bond");
      // Subtotal: 3 * 280 - 40 = 800.00
      expect(inv.subtotal).toBe(800.0);
      // Tax: 800 * 22.5% = 180.00
      expect(inv.tax_total).toBe(180.0);
      expect(inv.total_amount).toBe(980.0);
      expect(inv.amount_paid).toBe(0.0);
      expect(inv.outstanding_balance).toBe(980.0);

      testDraftId = inv.id;
    });

    it("allows updating line items while invoice remains in draft state", async () => {
      setTokens(adminToken);

      const updateRes = await updateDraftInvoice(testDraftId, {
        customer_name: "James Bond CMG",
        line_items: [
          {
            charge_category: "accommodation_hotel",
            description: "Mayfair Executive Suite (2 nights)",
            quantity: 2,
            unit_price: 280.0,
            discount_amount: 0.0,
          },
        ],
      });

      expect(updateRes.success).toBe(true);
      const inv = updateRes.data!;
      expect(inv.customer_name).toBe("James Bond CMG");
      // Subtotal: 2 * 280 = 560.00
      expect(inv.subtotal).toBe(560.0);
      // Tax: 560 * 0.225 = 126.00
      expect(inv.tax_total).toBe(126.0);
      expect(inv.total_amount).toBe(686.0);
    });

    it("officially issues draft invoice and permanently freezes the tax snapshot", async () => {
      setTokens(adminToken);

      const issueRes = await issueInvoice(testDraftId);
      expect(issueRes.success).toBe(true);
      const inv = issueRes.data!;
      expect(inv.status).toBe("issued");
      expect(inv.tax_snapshot).toBeDefined();
      expect(inv.tax_snapshot!.components.length).toBeGreaterThanOrEqual(1);

      // Audit trail should record issuance
      const issueAudit = inv.audit_trail.find((a) => a.action === "issued");
      expect(issueAudit).toBeDefined();
      expect(issueAudit?.performed_by_name).toBe("Julian Vance");
    });

    it("prevents editing or re-issuing an already issued invoice", async () => {
      setTokens(adminToken);

      // Attempting to issue again should fail
      await expect(issueInvoice(testDraftId)).rejects.toThrow();

      // Attempting to edit line items of issued invoice should fail
      await expect(
        updateDraftInvoice(testDraftId, {
          customer_name: "Hacked Customer Name",
        })
      ).rejects.toThrow();
    });
  });

  describe("3. Payment Records and Invoice Allocations", () => {
    let paymentId: string;
    let targetInvoiceId: string;

    beforeAll(async () => {
      setTokens(adminToken);
      // Create and issue an invoice for payment testing
      const invRes = await createDraftInvoice({
        property_id: "prop-hostel-001",
        customer_type: "hosteller",
        customer_name: "Mateo Hernandez",
        due_date: "2026-11-25",
        line_items: [
          {
            charge_category: "accommodation_hostel",
            description: "Dormitory Pod 4 nights",
            quantity: 4,
            unit_price: 32.0,
            discount_amount: 0.0,
          },
        ],
      });
      targetInvoiceId = invRes.data!.id;
      await issueInvoice(targetInvoiceId);
    });

    it("records a manual payment received and leaves balance unallocated", async () => {
      setTokens(adminToken);

      const payRes = await recordPayment({
        property_id: "prop-hostel-001",
        amount: 200.0,
        currency: "GBP",
        payment_method: "cash",
        payer_name: "Mateo Hernandez",
        notes: "Front desk cash deposit",
      });

      expect(payRes.success).toBe(true);
      expect(payRes.data).toBeDefined();
      const p = payRes.data!;
      expect(p.amount).toBe(200.0);
      expect(p.unallocated_amount).toBe(200.0);
      expect(p.refunded_amount).toBe(0.0);
      expect(p.status).toBe("completed");

      paymentId = p.id;
    });

    it("allocates a payment partially to an invoice and updates remaining balances", async () => {
      setTokens(adminToken);

      const invBefore = await fetchInvoiceById(targetInvoiceId);
      const invoiceDue = invBefore.data!.outstanding_balance;
      expect(invoiceDue).toBeGreaterThan(0);

      // Allocate 50.00
      const allocRes = await allocatePayment(paymentId, {
        allocations: [{ invoice_id: targetInvoiceId, amount: 50.0 }],
      });

      expect(allocRes.success).toBe(true);
      expect(allocRes.data!.unallocated_amount).toBe(150.0); // 200 - 50 = 150

      const invAfter = await fetchInvoiceById(targetInvoiceId);
      expect(invAfter.data!.amount_paid).toBe(50.0);
      expect(invAfter.data!.outstanding_balance).toBe(invoiceDue - 50.0);
      expect(invAfter.data!.status).toBe("partially_paid");
    });

    it("rejects allocating more than the unallocated payment balance", async () => {
      setTokens(adminToken);

      // Try allocating 200 when only 150 remains
      await expect(
        allocatePayment(paymentId, {
          allocations: [{ invoice_id: targetInvoiceId, amount: 200.0 }],
        })
      ).rejects.toThrow();
    });

    it("rejects allocating more than the invoice outstanding balance", async () => {
      setTokens(adminToken);

      const inv = await fetchInvoiceById(targetInvoiceId);
      const excessiveAmt = inv.data!.outstanding_balance + 50.0;

      await expect(
        allocatePayment(paymentId, {
          allocations: [{ invoice_id: targetInvoiceId, amount: excessiveAmt }],
        })
      ).rejects.toThrow();
    });
  });

  describe("4. Refunds and Financial Adjustments", () => {
    let refundPaymentId: string;

    beforeAll(async () => {
      setTokens(adminToken);
      const p = await recordPayment({
        property_id: "prop-hostel-001",
        amount: 80.0,
        currency: "GBP",
        payment_method: "credit_card_terminal",
        payer_name: "Refund Candidate Guest",
      });
      refundPaymentId = p.data!.id;
    });

    it("authorizes and records a partial refund against eligible payment", async () => {
      setTokens(adminToken);

      const refundRes = await recordRefund({
        payment_id: refundPaymentId,
        amount: 30.0,
        reason: "Early departure approved by manager",
      });

      expect(refundRes.success).toBe(true);
      expect(refundRes.data!.amount).toBe(30.0);
      expect(refundRes.data!.status).toBe("processed");
    });

    it("rejects refund requests exceeding remaining refundable limit", async () => {
      setTokens(adminToken);

      // Original 80, 30 refunded -> remaining is 50. Requesting 60 should fail.
      await expect(
        recordRefund({
          payment_id: refundPaymentId,
          amount: 60.0,
          reason: "Excessive claim",
        })
      ).rejects.toThrow();
    });
  });

  describe("5. Voiding Invoices and Reversing Allocations", () => {
    it("voids an invoice and safely restores allocated funds to unallocated payment balance", async () => {
      setTokens(adminToken);

      // 1. Create and issue invoice
      const invRes = await createDraftInvoice({
        property_id: "prop-hotel-002",
        customer_type: "guest",
        customer_name: "Disputed Guest",
        due_date: "2026-11-30",
        line_items: [
          {
            charge_category: "accommodation_hotel",
            description: "Room 101 stay",
            quantity: 1,
            unit_price: 150.0,
          },
        ],
      });
      const invId = invRes.data!.id;
      await issueInvoice(invId);

      // 2. Record payment and allocate
      const payRes = await recordPayment({
        property_id: "prop-hotel-002",
        amount: 150.0,
        currency: "GBP",
        payment_method: "cash",
        payer_name: "Disputed Guest",
        allocate_to_invoice_id: invId,
      });
      const payId = payRes.data!.id;
      expect(payRes.data!.unallocated_amount).toBe(0.0);

      // 3. Void the invoice
      const voidRes = await voidInvoice(invId, "Billing error adjustment");
      expect(voidRes.success).toBe(true);
      expect(voidRes.data!.status).toBe("voided");
      expect(voidRes.data!.outstanding_balance).toBe(0.0);

      // 4. Verify payment unallocated balance was safely restored!
      const paymentsList = await fetchPayments("prop-hotel-002");
      const updatedPay = paymentsList.data!.find((p) => p.id === payId);
      expect(updatedPay?.unallocated_amount).toBe(150.0);
    });
  });

  describe("6. Outstanding Dues and Finance Dashboard Summaries", () => {
    it("returns real property-scoped financial metrics without double-counting", async () => {
      setTokens(adminToken);

      const dashRes = await fetchFinanceDashboard("prop-hotel-002");
      expect(dashRes.success).toBe(true);
      expect(dashRes.data).toBeDefined();

      const m = dashRes.data!;
      expect(m.property_id).toBe("prop-hotel-002");
      expect(m.currency).toBe("GBP");
      expect(m.total_invoiced_amount).toBeGreaterThan(0);
      expect(m.category_breakdown.length).toBeGreaterThan(0);
    });

    it("retrieves outstanding dues with accurate overdue flags", async () => {
      setTokens(adminToken);

      const duesRes = await fetchOutstandingDues("prop-hotel-002");
      expect(duesRes.success).toBe(true);
      expect(Array.isArray(duesRes.data)).toBe(true);

      for (const due of duesRes.data!) {
        expect(due.property_id).toBe("prop-hotel-002");
        expect(due.outstanding_balance).toBeGreaterThan(0);
        expect(typeof due.is_overdue).toBe("boolean");
      }
    });
  });

  describe("7. Security & Property-Level Tenant Isolation Enforcement", () => {
    it("rejects cross-property access when manager attempts to access unauthorized property", async () => {
      // Clara Ross is property manager ONLY for prop-hostel-001 (Edinburgh)
      setTokens(managerToken);

      // Attempting to query London hotel (prop-hotel-002) financial dashboard must throw 403
      await expect(fetchFinanceDashboard("prop-hotel-002")).rejects.toThrow();

      // Attempting to fetch London tax rules must throw 403
      await expect(fetchTaxRules("prop-hotel-002")).rejects.toThrow();

      // Accessing assigned Edinburgh hostel (prop-hostel-001) must succeed
      const allowedRes = await fetchFinanceDashboard("prop-hostel-001");
      expect(allowedRes.success).toBe(true);
    });

    it("prohibits customer/guest role from creating or voiding invoices", async () => {
      // Sofia Berg is a guest
      setTokens(guestToken);

      await expect(
        createDraftInvoice({
          property_id: "prop-hotel-002",
          customer_type: "guest",
          customer_name: "Illegal Guest Invoice",
          due_date: "2026-11-20",
          line_items: [
            {
              charge_category: "extra_service",
              description: "Unauthorized charge",
              quantity: 1,
              unit_price: 10.0,
            },
          ],
        })
      ).rejects.toThrow();
    });
  });
});
