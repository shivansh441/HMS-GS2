/**
 * Phase 9: Finance & Tax Engine Domain Types
 * Covers property-scoped fee & tax configuration, deterministic tax calculation engine,
 * invoice lifecycle, line items, frozen tax snapshots, payment records, allocations,
 * refunds, and financial telemetry.
 */

export type ChargeCategory =
  | "accommodation_hotel"
  | "accommodation_hostel"
  | "mess_meal"
  | "extra_service"
  | "facility_fee"
  | "other";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "voided";

export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "credit_card_terminal"
  | "card_on_file"
  | "corporate_check";

export type PaymentStatus =
  | "completed"
  | "refunded"
  | "partially_refunded"
  | "cancelled";

export interface TaxRule {
  id: string;
  property_id: string;
  name: string;
  rate_percentage: number;
  charge_categories: ChargeCategory[];
  is_inclusive: boolean;
  is_active: boolean;
  effective_from: string; // YYYY-MM-DD
  effective_to?: string; // YYYY-MM-DD
  priority: number;
  jurisdiction_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxBreakdownComponent {
  rule_id: string;
  rule_name: string;
  rate_percentage: number;
  is_inclusive: boolean;
  taxable_base: number;
  tax_amount: number;
}

export interface TaxCalculationSnapshot {
  calculated_at: string;
  currency: string;
  subtotal: number;
  discount_total: number;
  taxable_subtotal: number;
  components: TaxBreakdownComponent[];
  total_tax: number;
  grand_total: number;
}

export interface InvoiceLineItem {
  id: string;
  charge_category: ChargeCategory;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number; // (quantity * unit_price) - discount_amount
  tax_amount: number;
  total: number;
  notes?: string;
}

export interface InvoiceAuditRecord {
  id: string;
  action: "created" | "updated" | "issued" | "payment_allocated" | "refund_applied" | "voided";
  timestamp: string;
  performed_by_user_id: string;
  performed_by_name: string;
  details: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  property_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  customer_type: "guest" | "hosteller" | "corporate" | "walk_in";
  customer_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  billing_address?: string;
  reservation_type?: "hotel_stay" | "hostel_stay" | "booking";
  reservation_id?: string;
  reservation_reference?: string;
  line_items: InvoiceLineItem[];
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total_amount: number;
  amount_paid: number;
  outstanding_balance: number;
  tax_snapshot?: TaxCalculationSnapshot;
  notes?: string;
  void_reason?: string;
  created_by_user_id: string;
  audit_trail: InvoiceAuditRecord[];
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  id: string;
  invoice_id: string;
  invoice_number?: string;
  amount: number;
  allocated_at: string;
  allocated_by_user_id: string;
}

export interface Payment {
  id: string;
  payment_reference: string;
  property_id: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  payment_date: string;
  payer_name: string;
  payer_email?: string;
  received_by_user_id: string;
  received_by_name?: string;
  transaction_reference?: string;
  notes?: string;
  allocations: PaymentAllocation[];
  unallocated_amount: number;
  refunded_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: string;
  refund_reference: string;
  payment_id: string;
  payment_reference?: string;
  invoice_id?: string;
  invoice_number?: string;
  property_id: string;
  amount: number;
  currency: string;
  reason: string;
  status: "processed" | "rejected";
  processed_by_user_id: string;
  processed_by_name?: string;
  refund_date: string;
  notes?: string;
  created_at: string;
}

export interface CategoryFinancialBreakdown {
  category: ChargeCategory;
  category_label: string;
  total_amount: number;
  percentage: number;
}

export interface FinanceDashboardMetrics {
  property_id: string;
  currency: string;
  total_invoiced_amount: number;
  total_collected_amount: number;
  outstanding_receivables: number;
  overdue_amount: number;
  total_refunded_amount: number;
  draft_invoices_count: number;
  issued_invoices_count: number;
  partially_paid_count: number;
  paid_invoices_count: number;
  overdue_invoices_count: number;
  category_breakdown: CategoryFinancialBreakdown[];
}

// Request Payload Contracts
export interface CreateTaxRuleInput {
  property_id: string;
  name: string;
  rate_percentage: number;
  charge_categories: ChargeCategory[];
  is_inclusive?: boolean;
  effective_from: string;
  effective_to?: string;
  priority?: number;
  jurisdiction_code?: string;
  notes?: string;
}

export interface TaxPreviewRequest {
  property_id: string;
  date?: string;
  line_items: Array<{
    charge_category: ChargeCategory;
    unit_price: number;
    quantity: number;
    discount_amount?: number;
  }>;
}

export interface CreateDraftInvoiceInput {
  property_id: string;
  customer_type: "guest" | "hosteller" | "corporate" | "walk_in";
  customer_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  billing_address?: string;
  due_date: string;
  reservation_type?: "hotel_stay" | "hostel_stay" | "booking";
  reservation_id?: string;
  notes?: string;
  line_items: Array<{
    charge_category: ChargeCategory;
    description: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    notes?: string;
  }>;
}

export interface UpdateDraftInvoiceInput {
  due_date?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  billing_address?: string;
  notes?: string;
  line_items?: Array<{
    charge_category: ChargeCategory;
    description: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    notes?: string;
  }>;
}

export interface RecordPaymentInput {
  property_id: string;
  amount: number;
  currency?: string;
  payment_method: PaymentMethod;
  payer_name: string;
  payer_email?: string;
  transaction_reference?: string;
  notes?: string;
  allocate_to_invoice_id?: string;
}

export interface AllocatePaymentInput {
  allocations: Array<{
    invoice_id: string;
    amount: number;
  }>;
}

export interface RecordRefundInput {
  payment_id: string;
  amount: number;
  reason: string;
  invoice_id?: string;
  notes?: string;
}
