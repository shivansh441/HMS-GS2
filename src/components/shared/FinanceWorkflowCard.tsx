import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
  CreditCard,
  PercentSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Plus,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Building2,
  Calendar,
  DollarSign,
  FileText,
  Printer,
  Ban,
  ShieldCheck,
  Check,
  X,
  ChevronRight,
  User,
  Hash,
  AlertCircle,
  HelpCircle,
  Eye,
  Send,
  Layers,
  UtensilsCrossed,
  Sparkles,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { formatCurrency } from "@/src/lib/utils";
import {
  fetchFinanceDashboard,
  fetchTaxRules,
  createTaxRule,
  updateTaxRule,
  calculateTaxPreview,
  fetchInvoices,
  createDraftInvoice,
  issueInvoice,
  voidInvoice,
  fetchPayments,
  recordPayment,
  allocatePayment,
  recordRefund,
  fetchOutstandingDues,
} from "@/src/services/api-client";
import {
  ChargeCategory,
  InvoiceStatus,
  PaymentMethod,
  TaxRule,
  Invoice,
  Payment,
  FinanceDashboardMetrics,
  CreateTaxRuleInput,
  CreateDraftInvoiceInput,
  RecordPaymentInput,
  RecordRefundInput,
} from "@/src/types/finance";

type FinanceSubTab =
  | "dashboard"
  | "invoices"
  | "payments"
  | "refunds"
  | "tax-rules"
  | "outstanding-dues";

const CHARGE_CATEGORY_OPTIONS: Array<{ value: ChargeCategory; label: string; icon: string }> = [
  { value: "accommodation_hotel", label: "Hotel Room Lodging", icon: "Hotel" },
  { value: "accommodation_hostel", label: "Hostel Dormitory Bed", icon: "Bed" },
  { value: "mess_meal", label: "Mess / Meal Package (Phase 10 Ready)", icon: "UtensilsCrossed" },
  { value: "extra_service", label: "Extra Service & Amenities", icon: "Sparkles" },
  { value: "facility_fee", label: "Facility / Campus Fee", icon: "Building2" },
  { value: "other", label: "Other Authorized Charge", icon: "FileText" },
];

export const FinanceWorkflowCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeProperty } = useProperty();
  const { user, canAccessProperty, hasPermission } = useAuth();
  const currency = activeProperty.currency || "GBP";
  const hasAccess = canAccessProperty(activeProperty.id);
  const canManageFinance = hasPermission(["super_admin", "property_manager", "accountant"]);

  const [activeSubTab, setActiveSubTab] = useState<FinanceSubTab>("dashboard");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Modals
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isAllocatePaymentOpen, setIsAllocatePaymentOpen] = useState(false);
  const [allocatingPayment, setAllocatingPayment] = useState<Payment | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundingPayment, setRefundingPayment] = useState<Payment | null>(null);
  const [isCreateTaxRuleOpen, setIsCreateTaxRuleOpen] = useState(false);
  const [isVoidInvoiceOpen, setIsVoidInvoiceOpen] = useState(false);
  const [voidingInvoice, setVoidingInvoice] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState("");

  // Filters
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("all");
  const [paymentSearch, setPaymentSearch] = useState("");

  // Queries
  const {
    data: dashboardEnvelope,
    isLoading: isLoadingDashboard,
    isError: isErrorDashboard,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ["finance-dashboard", activeProperty.id],
    queryFn: () => fetchFinanceDashboard(activeProperty.id),
    enabled: hasAccess,
  });

  const {
    data: invoicesEnvelope,
    isLoading: isLoadingInvoices,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["finance-invoices", activeProperty.id, invoiceStatusFilter],
    queryFn: () =>
      fetchInvoices({
        property_id: activeProperty.id,
        status: invoiceStatusFilter !== "all" ? invoiceStatusFilter : undefined,
      }),
    enabled: hasAccess,
  });

  const {
    data: paymentsEnvelope,
    isLoading: isLoadingPayments,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ["finance-payments", activeProperty.id],
    queryFn: () => fetchPayments(activeProperty.id),
    enabled: hasAccess,
  });

  const {
    data: taxRulesEnvelope,
    isLoading: isLoadingTaxRules,
    refetch: refetchTaxRules,
  } = useQuery({
    queryKey: ["finance-tax-rules", activeProperty.id],
    queryFn: () => fetchTaxRules(activeProperty.id),
    enabled: hasAccess,
  });

  const {
    data: duesEnvelope,
    isLoading: isLoadingDues,
    refetch: refetchDues,
  } = useQuery({
    queryKey: ["finance-dues", activeProperty.id],
    queryFn: () => fetchOutstandingDues(activeProperty.id),
    enabled: hasAccess,
  });

  const metrics: FinanceDashboardMetrics | null = dashboardEnvelope?.data || null;
  const invoices: Invoice[] = invoicesEnvelope?.data || [];
  const payments: Payment[] = paymentsEnvelope?.data || [];
  const taxRules: TaxRule[] = taxRulesEnvelope?.data || [];
  const outstandingDues = duesEnvelope?.data || [];

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
        inv.customer_name.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
        (inv.customer_email && inv.customer_email.toLowerCase().includes(invoiceSearch.toLowerCase())) ||
        (inv.reservation_reference &&
          inv.reservation_reference.toLowerCase().includes(invoiceSearch.toLowerCase()));
      const matchesStatus =
        invoiceStatusFilter === "all" || inv.status === invoiceStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, invoiceSearch, invoiceStatusFilter]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((pay) => {
      return (
        pay.payment_reference.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        pay.payer_name.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        (pay.payer_email && pay.payer_email.toLowerCase().includes(paymentSearch.toLowerCase()))
      );
    });
  }, [payments, paymentSearch]);

  const refreshAll = () => {
    refetchDashboard();
    refetchInvoices();
    refetchPayments();
    refetchTaxRules();
    refetchDues();
  };

  // Draft Invoice Creation State
  const [draftCustomerType, setDraftCustomerType] = useState<"guest" | "hosteller" | "corporate" | "walk_in">("guest");
  const [draftCustomerName, setDraftCustomerName] = useState("");
  const [draftCustomerEmail, setDraftCustomerEmail] = useState("");
  const [draftCustomerPhone, setDraftCustomerPhone] = useState("");
  const [draftBillingAddress, setDraftBillingAddress] = useState("");
  const [draftDueDate, setDraftDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [draftNotes, setDraftNotes] = useState("");
  const [draftLineItems, setDraftLineItems] = useState<
    Array<{
      charge_category: ChargeCategory;
      description: string;
      quantity: number;
      unit_price: number;
      discount_amount: number;
    }>
  >([
    {
      charge_category: activeProperty.property_type === "hostel" ? "accommodation_hostel" : "accommodation_hotel",
      description: activeProperty.property_type === "hostel" ? "Dormitory Pod Bed Stay (3 nights)" : "Deluxe King Room Stay (2 nights)",
      quantity: 1,
      unit_price: activeProperty.property_type === "hostel" ? 96.0 : 390.0,
      discount_amount: 0,
    },
  ]);

  // Tax calculation preview for draft
  const { data: draftTaxPreview } = useQuery({
    queryKey: ["tax-preview", activeProperty.id, draftLineItems],
    queryFn: () =>
      calculateTaxPreview({
        property_id: activeProperty.id,
        line_items: draftLineItems,
      }),
    enabled: isCreateInvoiceOpen && draftLineItems.length > 0,
  });

  // Record Payment State
  const [newPayAmount, setNewPayAmount] = useState<number>(0);
  const [newPayMethod, setNewPayMethod] = useState<PaymentMethod>("bank_transfer");
  const [newPayerName, setNewPayerName] = useState("");
  const [newPayerEmail, setNewPayerEmail] = useState("");
  const [newPayRef, setNewPayRef] = useState("");
  const [newPayNotes, setNewPayNotes] = useState("");
  const [newPayInvoiceId, setNewPayInvoiceId] = useState("");

  // Allocate Payment State
  const [allocAmounts, setAllocAmounts] = useState<Record<string, number>>({});

  // Refund State
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");

  // Tax Rule Create State
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleRate, setNewRuleRate] = useState<number>(20.0);
  const [newRuleCategories, setNewRuleCategories] = useState<ChargeCategory[]>([
    "accommodation_hotel",
    "accommodation_hostel",
  ]);
  const [newRuleIsInclusive, setNewRuleIsInclusive] = useState(false);
  const [newRuleEffectiveFrom, setNewRuleEffectiveFrom] = useState(() => new Date().toISOString().split("T")[0]);
  const [newRulePriority, setNewRulePriority] = useState<number>(1);
  const [newRuleJurisdiction, setNewRuleJurisdiction] = useState("UK-VAT");
  const [newRuleNotes, setNewRuleNotes] = useState("");

  // Mutations
  const createInvoiceMutation = useMutation({
    mutationFn: (input: CreateDraftInvoiceInput) => createDraftInvoice(input),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setIsCreateInvoiceOpen(false);
        refreshAll();
        setSelectedInvoice(res.data);
      }
    },
  });

  const issueInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => issueInvoice(invoiceId),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setSelectedInvoice(res.data);
        refreshAll();
      }
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: string; reason?: string }) =>
      voidInvoice(invoiceId, reason),
    onSuccess: (res) => {
      if (res.success && res.data) {
        setIsVoidInvoiceOpen(false);
        setVoidingInvoice(null);
        setSelectedInvoice(res.data);
        refreshAll();
      }
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: (input: RecordPaymentInput) => recordPayment(input),
    onSuccess: () => {
      setIsRecordPaymentOpen(false);
      refreshAll();
    },
  });

  const allocatePaymentMutation = useMutation({
    mutationFn: ({
      paymentId,
      allocations,
    }: {
      paymentId: string;
      allocations: Array<{ invoice_id: string; amount: number }>;
    }) => allocatePayment(paymentId, { allocations }),
    onSuccess: () => {
      setIsAllocatePaymentOpen(false);
      setAllocatingPayment(null);
      refreshAll();
    },
  });

  const recordRefundMutation = useMutation({
    mutationFn: (input: RecordRefundInput) => recordRefund(input),
    onSuccess: () => {
      setIsRefundModalOpen(false);
      setRefundingPayment(null);
      refreshAll();
    },
  });

  const createTaxRuleMutation = useMutation({
    mutationFn: (input: CreateTaxRuleInput) => createTaxRule(input),
    onSuccess: () => {
      setIsCreateTaxRuleOpen(false);
      refreshAll();
    },
  });

  const toggleTaxRuleMutation = useMutation({
    mutationFn: ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) =>
      updateTaxRule(ruleId, { is_active: isActive }),
    onSuccess: () => {
      refreshAll();
    },
  });

  // Access isolation check
  if (!hasAccess) {
    return (
      <div className="rounded-2xl border border-rose-800/40 bg-zinc-900/60 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-zinc-100">Financial Tenant Access Denied</h3>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Your current account role does not have authorization to view or manage financial ledgers for property{" "}
          <span className="font-mono text-zinc-200">{activeProperty.code}</span> ({activeProperty.name}).
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        );
      case "partially_paid":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Clock className="w-3 h-3" /> Partially Paid
          </span>
        );
      case "issued":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle className="w-3 h-3" /> Issued (Unpaid)
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-700/30 text-zinc-300 border border-zinc-700/50">
            <FileText className="w-3 h-3" /> Draft
          </span>
        );
      case "overdue":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3" /> Overdue
          </span>
        );
      case "voided":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-500 border border-zinc-700">
            <Ban className="w-3 h-3" /> Voided
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Property Finance Scope Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-purple-950/30">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
              Phase 9 Verified
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              Scoped Property: {activeProperty.code} • Currency: {currency}
            </span>
          </div>
          <h2 className="text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-purple-400" />
            Finance & Tax Engine
          </h2>
          <p className="text-xs text-zinc-400">
            Property-scoped deterministic tax engine, auditable invoice lifecycle, payment allocations, and receivables ledger for {activeProperty.name}.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-850 transition-colors"
            title="Sync Ledger"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>

          {canManageFinance && (
            <>
              <button
                onClick={() => {
                  setNewPayerName("");
                  setNewPayAmount(0);
                  setNewPayRef("");
                  setNewPayNotes("");
                  setNewPayInvoiceId("");
                  setIsRecordPaymentOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/60 transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>

              <button
                onClick={() => setIsCreateInvoiceOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Invoice</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-800 pb-2 scrollbar-none">
        {[
          { id: "dashboard", label: "Dashboard & Metrics", icon: TrendingUp },
          { id: "invoices", label: `Invoices (${invoices.length})`, icon: Receipt },
          { id: "payments", label: `Payments (${payments.length})`, icon: CreditCard },
          { id: "outstanding-dues", label: `Outstanding Dues (${outstandingDues.length})`, icon: Clock },
          { id: "tax-rules", label: `Tax & Fee Rules (${taxRules.length})`, icon: PercentSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as FinanceSubTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-purple-600 text-white font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* SUB-TAB 1: DASHBOARD METRICS */}
      {/* ============================================================ */}
      {activeSubTab === "dashboard" && (
        <div className="space-y-6">
          {isLoadingDashboard ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
              Loading property financial metrics...
            </div>
          ) : isErrorDashboard || !metrics ? (
            <div className="p-8 rounded-xl border border-rose-800/30 bg-rose-950/20 text-rose-300 text-sm text-center">
              Unable to load financial metrics for {activeProperty.name}.
            </div>
          ) : (
            <>
              {/* Primary Financial Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Invoiced */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Total Invoiced</span>
                    <Receipt className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl font-black text-zinc-100 tracking-tight">
                    {formatCurrency(metrics.total_invoiced_amount, metrics.currency)}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {metrics.issued_invoices_count + metrics.paid_invoices_count + metrics.partially_paid_count} issued folios ({metrics.currency})
                  </p>
                </div>

                {/* Recorded Collections */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Collected Cash & Bank</span>
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-emerald-400 tracking-tight">
                    {formatCurrency(metrics.total_collected_amount, metrics.currency)}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {metrics.paid_invoices_count} fully settled, {metrics.partially_paid_count} partial
                  </p>
                </div>

                {/* Outstanding Receivables */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Outstanding Receivables</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-amber-400 tracking-tight">
                    {formatCurrency(metrics.outstanding_receivables, metrics.currency)}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Awaiting guest/resident settlement
                  </p>
                </div>

                {/* Overdue Amount */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-950/80 space-y-2 relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Overdue Balance</span>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-2xl font-black text-rose-400 tracking-tight">
                    {formatCurrency(metrics.overdue_amount, metrics.currency)}
                  </div>
                  <p className="text-[11px] text-rose-300/80">
                    {metrics.overdue_invoices_count} past-due invoices
                  </p>
                </div>
              </div>

              {/* Status Breakdown & Category Composition Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Category Revenue Breakdown */}
                <div className="lg:col-span-2 p-5 rounded-2xl border border-zinc-800 bg-zinc-950 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">Charge Category Breakdown</h4>
                      <p className="text-xs text-zinc-500">
                        Revenue distribution by authorized property charge categories.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-zinc-400">
                      {metrics.category_breakdown.length} Active Categories
                    </span>
                  </div>

                  <div className="space-y-3 pt-2">
                    {metrics.category_breakdown.map((cat) => (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-300">{cat.category_label}</span>
                          <span className="font-mono text-zinc-200">
                            {formatCurrency(cat.total_amount, metrics.currency)} ({cat.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {metrics.category_breakdown.length === 0 && (
                      <p className="text-xs text-zinc-500 italic py-4 text-center">
                        No issued invoices recorded for this property yet.
                      </p>
                    )}
                  </div>
                </div>

                {/* Folio Status Summary */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-950 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-100">Invoice Folio Status</h4>
                    <p className="text-xs text-zinc-500">Lifecycle counts for this property</p>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50">
                      <span className="text-zinc-400">Paid in Full</span>
                      <span className="font-bold text-emerald-400 font-mono">{metrics.paid_invoices_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50">
                      <span className="text-zinc-400">Partially Paid</span>
                      <span className="font-bold text-sky-400 font-mono">{metrics.partially_paid_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50">
                      <span className="text-zinc-400">Issued & Unpaid</span>
                      <span className="font-bold text-amber-400 font-mono">{metrics.issued_invoices_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50">
                      <span className="text-zinc-400">Overdue Invoices</span>
                      <span className="font-bold text-rose-400 font-mono">{metrics.overdue_invoices_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50">
                      <span className="text-zinc-400">Draft Invoices</span>
                      <span className="font-bold text-zinc-300 font-mono">{metrics.draft_invoices_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/50 border-t border-zinc-800 mt-2">
                      <span className="text-zinc-400">Total Refunded</span>
                      <span className="font-bold text-rose-400 font-mono">
                        {formatCurrency(metrics.total_refunded_amount, metrics.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 2: INVOICES LEDGER */}
      {/* ============================================================ */}
      {activeSubTab === "invoices" && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search invoice #, guest, email, stay..."
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <select
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="issued">Issued</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid</option>
                <option value="voided">Voided</option>
              </select>
            </div>

            <div className="text-xs text-zinc-500">
              Showing <span className="font-mono text-zinc-300">{filteredInvoices.length}</span> invoices
            </div>
          </div>

          {/* Invoices Table */}
          {isLoadingInvoices ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-400" />
              Loading invoices...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-950 text-center space-y-2">
              <Receipt className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm font-semibold text-zinc-300">No invoices found</p>
              <p className="text-xs text-zinc-500">
                Create a draft invoice or adjust your search filter.
              </p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-2xl bg-zinc-950 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/60 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Customer / Guest</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Paid</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-purple-300">
                          {inv.invoice_number}
                          {inv.reservation_reference && (
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Ref: {inv.reservation_reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-200">{inv.customer_name}</div>
                          <div className="text-[11px] text-zinc-500">{inv.customer_email || "Walk-in Customer"}</div>
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(inv.status)}</td>
                        <td className="py-3.5 px-4 text-zinc-400 font-mono">{inv.due_date}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-100">
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                          {formatCurrency(inv.amount_paid, inv.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold">
                          <span className={inv.outstanding_balance > 0 ? "text-amber-400" : "text-zinc-500"}>
                            {formatCurrency(inv.outstanding_balance, inv.currency)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setIsPrintModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-[11px] transition-colors"
                              title="View & Print Folio"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {inv.status === "draft" && canManageFinance && (
                              <button
                                onClick={() => issueInvoiceMutation.mutate(inv.id)}
                                disabled={issueInvoiceMutation.isPending}
                                className="px-2.5 py-1 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/40 text-[11px] font-semibold transition-colors"
                                title="Issue Invoice"
                              >
                                Issue
                              </button>
                            )}

                            {inv.status !== "voided" && inv.status !== "draft" && canManageFinance && (
                              <button
                                onClick={() => {
                                  setVoidingInvoice(inv);
                                  setVoidReason("");
                                  setIsVoidInvoiceOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-[11px] transition-colors"
                                title="Void Invoice"
                              >
                                Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 3: PAYMENTS & ALLOCATIONS */}
      {/* ============================================================ */}
      {activeSubTab === "payments" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search payment ref, payer name..."
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="text-xs text-zinc-500">
              Showing <span className="font-mono text-zinc-300">{filteredPayments.length}</span> payment records
            </div>
          </div>

          {isLoadingPayments ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-400" />
              Loading payments...
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-950 text-center space-y-2">
              <CreditCard className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm font-semibold text-zinc-300">No payment records found</p>
              <p className="text-xs text-zinc-500">
                Click "Record Payment" to register a payment receipt.
              </p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-2xl bg-zinc-950 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/60 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Payment Ref</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Payer</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Unallocated</th>
                      <th className="py-3 px-4 text-right">Refunded</th>
                      <th className="py-3 px-4 text-center">Allocations</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">
                          {p.payment_reference}
                        </td>
                        <td className="py-3.5 px-4 text-zinc-400 font-mono">{p.payment_date}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-200">{p.payer_name}</div>
                          {p.payer_email && <div className="text-[11px] text-zinc-500">{p.payer_email}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="capitalize px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px]">
                            {p.payment_method.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-100">
                          {formatCurrency(p.amount, p.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono">
                          <span className={p.unallocated_amount > 0 ? "text-amber-400 font-semibold" : "text-zinc-500"}>
                            {formatCurrency(p.unallocated_amount, p.currency)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-rose-400">
                          {p.refunded_amount > 0 ? formatCurrency(p.refunded_amount, p.currency) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300">
                            {p.allocations.length} invoice(s)
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {p.unallocated_amount > 0 && canManageFinance && (
                              <button
                                onClick={() => {
                                  setAllocatingPayment(p);
                                  setAllocAmounts({});
                                  setIsAllocatePaymentOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/40 text-[11px] font-semibold transition-colors"
                              >
                                Allocate
                              </button>
                            )}
                            {p.amount - p.refunded_amount > 0 && canManageFinance && (
                              <button
                                onClick={() => {
                                  setRefundingPayment(p);
                                  setRefundAmount(p.amount - p.refunded_amount);
                                  setRefundReason("");
                                  setIsRefundModalOpen(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-[11px] transition-colors"
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 4: OUTSTANDING DUES & RECEIVABLES */}
      {/* ============================================================ */}
      {activeSubTab === "outstanding-dues" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-zinc-100">Outstanding Receivables Ledger</h4>
              <p className="text-xs text-zinc-500">
                Active unpaid and partially paid invoices awaiting payment for {activeProperty.name}.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-400">Total Outstanding</span>
              <div className="text-lg font-black text-amber-400 font-mono">
                {formatCurrency(
                  outstandingDues.reduce((sum, d) => sum + d.outstanding_balance, 0),
                  currency
                )}
              </div>
            </div>
          </div>

          {isLoadingDues ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-400" />
              Loading outstanding dues...
            </div>
          ) : outstandingDues.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-950 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-zinc-200">Zero Outstanding Dues!</p>
              <p className="text-xs text-zinc-500">
                All issued invoices for this property have been completely settled.
              </p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-2xl bg-zinc-950 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/60 border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Total Invoiced</th>
                      <th className="py-3 px-4 text-right">Settled</th>
                      <th className="py-3 px-4 text-right">Balance Due</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {outstandingDues.map((due) => (
                      <tr key={due.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-purple-300">
                          {due.invoice_number}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-200">{due.customer_name}</div>
                          <div className="text-[11px] text-zinc-500">{due.customer_phone || due.customer_email || "Walk-in"}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {due.is_overdue ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {due.due_date} (Overdue)
                            </span>
                          ) : (
                            <span className="text-zinc-400">{due.due_date}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(due.status)}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-zinc-300">
                          {formatCurrency(due.total_amount, due.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                          {formatCurrency(due.amount_paid, due.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400">
                          {formatCurrency(due.outstanding_balance, due.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => {
                              setSelectedInvoice(due);
                              setIsPrintModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-850 text-[11px] transition-colors"
                          >
                            View Folio
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 5: FEE & TAX CONFIGURATION */}
      {/* ============================================================ */}
      {activeSubTab === "tax-rules" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950">
            <div>
              <h4 className="text-sm font-bold text-zinc-100">Property Fee & Tax Rules</h4>
              <p className="text-xs text-zinc-500">
                Deterministic calculation rules applied to invoice charge lines for {activeProperty.name}.
              </p>
            </div>
            {canManageFinance && (
              <button
                onClick={() => {
                  setNewRuleName("");
                  setNewRuleRate(20.0);
                  setNewRuleCategories(["accommodation_hotel", "accommodation_hostel"]);
                  setNewRuleIsInclusive(false);
                  setNewRulePriority(1);
                  setNewRuleJurisdiction("UK-VAT");
                  setNewRuleNotes("");
                  setIsCreateTaxRuleOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tax Rule</span>
              </button>
            )}
          </div>

          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Deterministic Tax Snapshot Protection</p>
              <p className="text-[11px] text-amber-200/80">
                Modifying tax rules only applies to newly calculated draft invoices. Invoices already issued retain permanently frozen calculation snapshots for statutory compliance.
              </p>
            </div>
          </div>

          {isLoadingTaxRules ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-400" />
              Loading tax rules...
            </div>
          ) : taxRules.length === 0 ? (
            <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-950 text-center space-y-2">
              <PercentSquare className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm font-semibold text-zinc-300">No Tax Rules Configured</p>
              <p className="text-xs text-zinc-500">
                Click "Add Tax Rule" to configure property tax percentages.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {taxRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all ${
                    rule.is_active
                      ? "border-zinc-800 bg-zinc-950/80"
                      : "border-zinc-800/40 bg-zinc-950/40 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-bold text-zinc-100 text-sm">{rule.name}</h5>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        ID: {rule.id} • Priority: {rule.priority}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-purple-400 font-mono">
                        {rule.rate_percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="my-3 flex flex-wrap gap-1.5">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        rule.is_inclusive
                          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      }`}
                    >
                      {rule.is_inclusive ? "Tax Inclusive" : "Tax Exclusive"}
                    </span>
                    {rule.jurisdiction_code && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                        {rule.jurisdiction_code}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs border-t border-zinc-800/60 pt-2.5">
                    <div className="text-[11px] text-zinc-400">Applicable Categories:</div>
                    <div className="flex flex-wrap gap-1">
                      {rule.charge_categories.map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {c.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-zinc-500 font-mono">From: {rule.effective_from}</span>
                    {canManageFinance && (
                      <button
                        onClick={() =>
                          toggleTaxRuleMutation.mutate({
                            ruleId: rule.id,
                            isActive: !rule.is_active,
                          })
                        }
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded transition-colors ${
                          rule.is_active
                            ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        }`}
                      >
                        {rule.is_active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: CREATE DRAFT INVOICE */}
      {/* ============================================================ */}
      {isCreateInvoiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-100">Create Draft Invoice</h3>
                <p className="text-xs text-zinc-400">
                  Property: <span className="font-mono text-zinc-200">{activeProperty.name}</span> ({currency})
                </p>
              </div>
              <button
                onClick={() => setIsCreateInvoiceOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Customer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Customer Type</label>
                  <select
                    value={draftCustomerType}
                    onChange={(e: any) => setDraftCustomerType(e.target.value)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="guest">Hotel Guest</option>
                    <option value="hosteller">Hostel Resident</option>
                    <option value="corporate">Corporate Account</option>
                    <option value="walk_in">Walk-in Direct</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Customer Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Eleanor Vance"
                    value={draftCustomerName}
                    onChange={(e) => setDraftCustomerName(e.target.value)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Customer Email</label>
                  <input
                    type="email"
                    placeholder="guest@example.com"
                    value={draftCustomerEmail}
                    onChange={(e) => setDraftCustomerEmail(e.target.value)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Due Date</label>
                  <input
                    type="date"
                    value={draftDueDate}
                    onChange={(e) => setDraftDueDate(e.target.value)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">Charge Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftLineItems([
                        ...draftLineItems,
                        {
                          charge_category: "extra_service",
                          description: "Extra Service Charge",
                          quantity: 1,
                          unit_price: 25.0,
                          discount_amount: 0,
                        },
                      ])
                    }
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Line
                  </button>
                </div>

                <div className="space-y-2">
                  {draftLineItems.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={item.charge_category}
                          onChange={(e) => {
                            const updated = [...draftLineItems];
                            updated[idx].charge_category = e.target.value as ChargeCategory;
                            setDraftLineItems(updated);
                          }}
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                        >
                          {CHARGE_CATEGORY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        {draftLineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = draftLineItems.filter((_, i) => i !== idx);
                              setDraftLineItems(updated);
                            }}
                            className="text-zinc-500 hover:text-rose-400 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        placeholder="Description of service/accommodation"
                        value={item.description}
                        onChange={(e) => {
                          const updated = [...draftLineItems];
                          updated[idx].description = e.target.value;
                          setDraftLineItems(updated);
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                      />

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-zinc-500">Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...draftLineItems];
                              updated[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                              setDraftLineItems(updated);
                            }}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500">Unit Price ({currency})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => {
                              const updated = [...draftLineItems];
                              updated[idx].unit_price = parseFloat(e.target.value) || 0;
                              setDraftLineItems(updated);
                            }}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500">Discount ({currency})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.discount_amount}
                            onChange={(e) => {
                              const updated = [...draftLineItems];
                              updated[idx].discount_amount = parseFloat(e.target.value) || 0;
                              setDraftLineItems(updated);
                            }}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax Engine Live Preview Breakdown */}
              {draftTaxPreview?.data && (
                <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-950/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-300 font-semibold">
                    <span>Tax Engine Authoritative Preview</span>
                    <span className="font-mono text-purple-400">Deterministic VAT/GST</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-zinc-400">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-mono text-zinc-200">
                        {formatCurrency(draftTaxPreview.data.subtotal, currency)}
                      </span>
                    </div>
                    {draftTaxPreview.data.discount_total > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discounts:</span>
                        <span className="font-mono">
                          -{formatCurrency(draftTaxPreview.data.discount_total, currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Applied Taxes:</span>
                      <span className="font-mono text-purple-300">
                        +{formatCurrency(draftTaxPreview.data.tax_total, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-sm text-zinc-100 border-t border-purple-500/30 pt-1.5 mt-1">
                      <span>Grand Total:</span>
                      <span className="font-mono text-purple-400">
                        {formatCurrency(draftTaxPreview.data.total_amount, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateInvoiceOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  createInvoiceMutation.mutate({
                    property_id: activeProperty.id,
                    customer_type: draftCustomerType,
                    customer_name: draftCustomerName,
                    customer_email: draftCustomerEmail || undefined,
                    customer_phone: draftCustomerPhone || undefined,
                    billing_address: draftBillingAddress || undefined,
                    due_date: draftDueDate,
                    notes: draftNotes || undefined,
                    line_items: draftLineItems,
                  })
                }
                disabled={!draftCustomerName || createInvoiceMutation.isPending}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-purple-600/20"
              >
                {createInvoiceMutation.isPending ? "Creating Draft..." : "Create Draft Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: INVOICE PRESENTATION / PRINT VIEW */}
      {/* ============================================================ */}
      {isPrintModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            {/* Modal Actions Bar */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-mono font-bold text-zinc-200">
                  {selectedInvoice.invoice_number}
                </span>
                {getStatusBadge(selectedInvoice.status)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Folio Document Container */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-zinc-100 font-sans print:p-0">
              {/* Property Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-800 pb-6">
                <div className="space-y-1">
                  <h3 className="text-xl font-black tracking-tight text-zinc-100">
                    {activeProperty.name}
                  </h3>
                  <p className="text-xs text-zinc-400">{activeProperty.address}</p>
                  <p className="text-xs text-zinc-400">
                    {activeProperty.city}, {activeProperty.country} {activeProperty.postal_code}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono">
                    Tel: {activeProperty.contact_phone || "+44 20 7946 0883"} | Email: {activeProperty.contact_email}
                  </p>
                </div>

                <div className="sm:text-right space-y-1">
                  <div className="text-lg font-black font-mono text-purple-400">
                    INVOICE
                  </div>
                  <div className="text-xs font-mono text-zinc-300">
                    #{selectedInvoice.invoice_number}
                  </div>
                  <div className="text-xs text-zinc-400">
                    Issued: <span className="font-mono text-zinc-200">{selectedInvoice.issue_date}</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    Due: <span className="font-mono text-zinc-200">{selectedInvoice.due_date}</span>
                  </div>
                </div>
              </div>

              {/* Bill To & Stay References */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                    Billed To:
                  </div>
                  <p className="font-bold text-sm text-zinc-100">{selectedInvoice.customer_name}</p>
                  {selectedInvoice.customer_email && (
                    <p className="text-zinc-400">{selectedInvoice.customer_email}</p>
                  )}
                  {selectedInvoice.customer_phone && (
                    <p className="text-zinc-400">{selectedInvoice.customer_phone}</p>
                  )}
                  {selectedInvoice.billing_address && (
                    <p className="text-zinc-500 mt-1">{selectedInvoice.billing_address}</p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                    Reservation Reference:
                  </div>
                  <p className="font-mono font-bold text-zinc-200">
                    {selectedInvoice.reservation_reference || "Direct Folio"}
                  </p>
                  <p className="text-zinc-400 capitalize">
                    Folio Type: {selectedInvoice.customer_type.replace(/_/g, " ")}
                  </p>
                  {selectedInvoice.notes && (
                    <p className="text-zinc-500 italic mt-1 text-[11px]">
                      Notes: {selectedInvoice.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Itemized Line Items Table */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400 font-semibold text-[11px] uppercase border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4 text-center">Category</th>
                      <th className="py-2.5 px-4 text-center">Qty</th>
                      <th className="py-2.5 px-4 text-right">Unit Price</th>
                      <th className="py-2.5 px-4 text-right">Subtotal</th>
                      <th className="py-2.5 px-4 text-right">Tax</th>
                      <th className="py-2.5 px-4 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-sans">
                    {selectedInvoice.line_items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-4 font-medium text-zinc-200">{item.description}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 capitalize">
                            {item.charge_category.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">{item.quantity}</td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-300">
                          {formatCurrency(item.unit_price, selectedInvoice.currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-300">
                          {formatCurrency(item.subtotal, selectedInvoice.currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-300">
                          {formatCurrency(item.tax_amount, selectedInvoice.currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                          {formatCurrency(item.total, selectedInvoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Frozen Tax Snapshot Breakdown & Totals Box */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                {/* Applied Tax Components Snapshot */}
                <div className="w-full sm:w-1/2 p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-800 text-xs space-y-2">
                  <div className="text-[11px] font-bold uppercase text-zinc-400">
                    Statutory Tax Breakdown (Frozen Snapshot)
                  </div>
                  {selectedInvoice.tax_snapshot?.components && selectedInvoice.tax_snapshot.components.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {selectedInvoice.tax_snapshot.components.map((c, i) => (
                        <div key={i} className="flex justify-between text-[11px] text-zinc-400">
                          <span>
                            {c.rule_name} ({c.rate_percentage}%)
                          </span>
                          <span className="font-mono text-zinc-200">
                            {formatCurrency(c.tax_amount, selectedInvoice.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500 italic">Zero-rated / No tax rules applied</p>
                  )}
                </div>

                {/* Totals Summary */}
                <div className="w-full sm:w-72 space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-400">
                    <span>Subtotal:</span>
                    <span className="font-mono text-zinc-200">
                      {formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)}
                    </span>
                  </div>
                  {selectedInvoice.discount_total > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Total Discounts:</span>
                      <span className="font-mono">
                        -{formatCurrency(selectedInvoice.discount_total, selectedInvoice.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-zinc-400">
                    <span>Total Tax:</span>
                    <span className="font-mono text-purple-300">
                      +{formatCurrency(selectedInvoice.tax_total, selectedInvoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-zinc-100 border-t border-zinc-800 pt-2">
                    <span>Invoice Total:</span>
                    <span className="font-mono text-purple-400">
                      {formatCurrency(selectedInvoice.total_amount, selectedInvoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-400 text-xs">
                    <span>Amount Paid:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(selectedInvoice.amount_paid, selectedInvoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-amber-400 border-t border-zinc-800 pt-2">
                    <span>Balance Due:</span>
                    <span className="font-mono">
                      {formatCurrency(selectedInvoice.outstanding_balance, selectedInvoice.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Audit Trail Note */}
              <div className="pt-4 border-t border-zinc-800 text-[10px] text-zinc-500 font-mono space-y-1">
                <div>Audit Verification: Permanent immutable snapshot recorded in system.</div>
                <div>Created by User: {selectedInvoice.created_by_user_id}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: RECORD PAYMENT */}
      {/* ============================================================ */}
      {isRecordPaymentOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Record Payment Received
              </h3>
              <button
                onClick={() => setIsRecordPaymentOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Payer Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe / Eleanor Vance"
                  value={newPayerName}
                  onChange={(e) => setNewPayerName(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Payment Amount ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newPayAmount}
                  onChange={(e) => setNewPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Payment Method</label>
                <select
                  value={newPayMethod}
                  onChange={(e: any) => setNewPayMethod(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                >
                  <option value="bank_transfer">Bank Wire / Electronic Transfer</option>
                  <option value="cash">Physical Cash at Front Desk</option>
                  <option value="credit_card_terminal">POS Credit Card Terminal</option>
                  <option value="card_on_file">Pre-Authorized Card on File</option>
                  <option value="corporate_check">Corporate Bank Check</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Transaction Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. TXN-HSBC-88192"
                  value={newPayRef}
                  onChange={(e) => setNewPayRef(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Directly Allocate to Invoice (Optional)</label>
                <select
                  value={newPayInvoiceId}
                  onChange={(e) => setNewPayInvoiceId(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                >
                  <option value="">Leave Unallocated (Allocate Later)</option>
                  {outstandingDues.map((due) => (
                    <option key={due.id} value={due.id}>
                      {due.invoice_number} - {due.customer_name} ({formatCurrency(due.outstanding_balance, due.currency)} due)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRecordPaymentOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  recordPaymentMutation.mutate({
                    property_id: activeProperty.id,
                    amount: newPayAmount,
                    currency,
                    payment_method: newPayMethod,
                    payer_name: newPayerName,
                    transaction_reference: newPayRef || undefined,
                    notes: newPayNotes || undefined,
                    allocate_to_invoice_id: newPayInvoiceId || undefined,
                  })
                }
                disabled={!newPayerName || newPayAmount <= 0 || recordPaymentMutation.isPending}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-emerald-600/20"
              >
                {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: ALLOCATE PAYMENT */}
      {/* ============================================================ */}
      {isAllocatePaymentOpen && allocatingPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100">Allocate Payment to Invoices</h3>
                <p className="text-xs text-zinc-400">
                  Ref: <span className="font-mono text-emerald-400">{allocatingPayment.payment_reference}</span> • Available:{" "}
                  <span className="font-mono font-bold text-zinc-100">
                    {formatCurrency(allocatingPayment.unallocated_amount, allocatingPayment.currency)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setIsAllocatePaymentOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {outstandingDues.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">No outstanding invoices to allocate against.</p>
              ) : (
                outstandingDues.map((inv) => (
                  <div key={inv.id} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-mono font-semibold text-purple-300">{inv.invoice_number}</div>
                      <div className="text-zinc-400">{inv.customer_name}</div>
                      <div className="text-[11px] text-amber-400 font-mono">
                        Due: {formatCurrency(inv.outstanding_balance, inv.currency)}
                      </div>
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        max={Math.min(allocatingPayment.unallocated_amount, inv.outstanding_balance)}
                        value={allocAmounts[inv.id] || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setAllocAmounts({ ...allocAmounts, [inv.id]: val });
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAllocatePaymentOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const allocations = Object.entries(allocAmounts)
                    .filter(([_, amt]) => amt > 0)
                    .map(([invoice_id, amount]) => ({ invoice_id, amount }));
                  allocatePaymentMutation.mutate({
                    paymentId: allocatingPayment.id,
                    allocations,
                  });
                }}
                disabled={allocatePaymentMutation.isPending}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                Confirm Allocation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: RECORD REFUND */}
      {/* ============================================================ */}
      {isRefundModalOpen && refundingPayment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                Authorize Refund
              </h3>
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="text-[11px] text-zinc-400">Payment Reference:</div>
                <div className="font-mono text-emerald-400 font-semibold">{refundingPayment.payment_reference}</div>
                <div className="text-[11px] text-zinc-500">
                  Total Paid: {formatCurrency(refundingPayment.amount, refundingPayment.currency)} • Remaining Refundable:{" "}
                  {formatCurrency(refundingPayment.amount - refundingPayment.refunded_amount, refundingPayment.currency)}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Refund Amount ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  max={refundingPayment.amount - refundingPayment.refunded_amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Mandatory Refund Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Guest early departure approved by manager"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRefundModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  recordRefundMutation.mutate({
                    payment_id: refundingPayment.id,
                    amount: refundAmount,
                    reason: refundReason,
                    notes: refundNotes || undefined,
                  })
                }
                disabled={!refundReason || refundAmount <= 0 || recordRefundMutation.isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-rose-600/20"
              >
                {recordRefundMutation.isPending ? "Processing..." : "Authorize Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 6: CREATE TAX RULE */}
      {/* ============================================================ */}
      {isCreateTaxRuleOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <PercentSquare className="w-5 h-5 text-purple-400" />
                Add Property Tax Rule
              </h3>
              <button
                onClick={() => setIsCreateTaxRuleOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Standard Hospitality VAT 20%"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newRuleRate}
                    onChange={(e) => setNewRuleRate(parseFloat(e.target.value) || 0)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Tax Pricing</label>
                  <select
                    value={newRuleIsInclusive ? "inclusive" : "exclusive"}
                    onChange={(e) => setNewRuleIsInclusive(e.target.value === "inclusive")}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="exclusive">Exclusive (+ Tax on Top)</option>
                    <option value="inclusive">Inclusive (Embedded in Price)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Charge Categories</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {CHARGE_CATEGORY_OPTIONS.map((cat) => (
                    <label key={cat.value} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRuleCategories.includes(cat.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewRuleCategories([...newRuleCategories, cat.value]);
                          } else {
                            setNewRuleCategories(newRuleCategories.filter((c) => c !== cat.value));
                          }
                        }}
                        className="rounded border-zinc-700 text-purple-600 focus:ring-0"
                      />
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Effective From</label>
                  <input
                    type="date"
                    value={newRuleEffectiveFrom}
                    onChange={(e) => setNewRuleEffectiveFrom(e.target.value)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase">Jurisdiction Code</label>
                  <input
                    type="text"
                    placeholder="e.g. UK-VAT / DE-UST"
                    value={newRuleJurisdiction}
                    onChange={(e) => setNewRuleJurisdiction(e.target.value)}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateTaxRuleOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  createTaxRuleMutation.mutate({
                    property_id: activeProperty.id,
                    name: newRuleName,
                    rate_percentage: newRuleRate,
                    charge_categories: newRuleCategories,
                    is_inclusive: newRuleIsInclusive,
                    effective_from: newRuleEffectiveFrom,
                    priority: newRulePriority,
                    jurisdiction_code: newRuleJurisdiction || undefined,
                  })
                }
                disabled={!newRuleName || newRuleCategories.length === 0 || createTaxRuleMutation.isPending}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-lg shadow-purple-600/20"
              >
                {createTaxRuleMutation.isPending ? "Creating..." : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 7: VOID INVOICE */}
      {/* ============================================================ */}
      {isVoidInvoiceOpen && voidingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-400" />
                Void Invoice
              </h3>
              <button
                onClick={() => setIsVoidInvoiceOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-zinc-300">
                Are you sure you want to void invoice{" "}
                <span className="font-mono text-purple-400 font-bold">{voidingInvoice.invoice_number}</span>?
              </p>
              {voidingInvoice.amount_paid > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
                  Warning: This invoice has {formatCurrency(voidingInvoice.amount_paid, voidingInvoice.currency)} in settled payments. Voiding will unallocate those payments so they can be reallocated to other folios.
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase">Reason for Voiding</label>
                <input
                  type="text"
                  placeholder="e.g. Booking cancellation or billing dispute adjustment"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsVoidInvoiceOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  voidInvoiceMutation.mutate({
                    invoiceId: voidingInvoice.id,
                    reason: voidReason || undefined,
                  })
                }
                disabled={voidInvoiceMutation.isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {voidInvoiceMutation.isPending ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
