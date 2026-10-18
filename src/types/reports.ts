export interface ReportDateRange {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  days_count: number;
}

export interface ReportPropertyScope {
  property_id: string;
  property_name: string;
  property_type: string;
  currency: string;
  total_rooms: number;
  total_beds: number;
}

export interface ExecutiveSummaryKPIs {
  total_revenue: number;
  gross_revenue: number;
  total_tax: number;
  total_collected: number;
  total_refunded: number;
  net_cash_flow: number;
  outstanding_receivables: number;
  occupancy_rate: number;
  adr: number;
  revpar: number;
  total_bookings_count: number;
  completed_stays_count: number;
  cancellation_rate: number;
  active_staff_headcount: number;
  open_maintenance_count: number;
}

export interface DailyTrendPoint {
  date: string;
  revenue: number;
  collections: number;
  occupancy_pct: number;
  bookings_count: number;
}

export interface ExecutiveSummaryReport {
  reporting_period: ReportDateRange;
  property_scope: ReportPropertyScope;
  kpis: ExecutiveSummaryKPIs;
  trend_series: DailyTrendPoint[];
  category_breakdown: Record<string, number>;
}

export interface OccupancyDailyPoint {
  date: string;
  available_rooms: number;
  occupied_rooms: number;
  room_occupancy_pct: number;
  available_beds: number;
  occupied_beds: number;
  bed_occupancy_pct: number;
}

export interface OccupancyReport {
  reporting_period: ReportDateRange;
  property_scope: ReportPropertyScope;
  total_rooms: number;
  total_beds: number;
  room_nights_available: number;
  room_nights_sold: number;
  hotel_occupancy_pct: number;
  bed_nights_available: number;
  bed_nights_sold: number;
  hostel_occupancy_pct: number;
  adr: number;
  revpar: number;
  rooms_under_maintenance_count: number;
  daily_breakdown: OccupancyDailyPoint[];
}

export interface BookingStayRecordItem {
  id: string;
  type: "hostel_stay" | "hotel_booking";
  guest_name: string;
  unit_label: string;
  check_in: string;
  check_out: string;
  nights: number;
  status: string;
  total_amount: number;
  created_at: string;
}

export interface BookingStayReport {
  reporting_period: ReportDateRange;
  property_scope: ReportPropertyScope;
  total_bookings: number;
  confirmed_count: number;
  checked_in_count: number;
  checked_out_count: number;
  cancelled_count: number;
  average_length_of_stay_days: number;
  total_guests_served: number;
  lead_time_days_avg: number;
  status_distribution: Record<string, number>;
  property_type_distribution: Record<string, number>;
  records: BookingStayRecordItem[];
}

export interface CategoryRevenueItem {
  category: string;
  label: string;
  amount: number;
  percentage: number;
}

export interface CollectionMethodItem {
  method: string;
  label: string;
  amount: number;
  count: number;
}

export interface AgingReceivables {
  current_0_30: number;
  overdue_31_60: number;
  overdue_61_90: number;
  overdue_90_plus: number;
}

export interface TaxReportSummaryItem {
  tax_type: string;
  rate_percentage: number;
  taxable_amount: number;
  tax_collected: number;
}

export interface FinancialReport {
  reporting_period: ReportDateRange;
  property_scope: ReportPropertyScope;
  invoiced_revenue: number;
  cash_collected: number;
  refunds_processed: number;
  net_collections: number;
  outstanding_balance: number;
  revenue_by_category: CategoryRevenueItem[];
  collections_by_method: CollectionMethodItem[];
  aging_receivables: AgingReceivables;
  tax_summary: TaxReportSummaryItem[];
}

export interface PopularMenuItem {
  name: string;
  category: string;
  quantity_sold: number;
  revenue: number;
}

export interface FoodDiningReport {
  reporting_period: ReportDateRange;
  property_scope: ReportPropertyScope;
  mess_enabled: boolean;
  restaurant_enabled: boolean;
  total_meal_attendances: number;
  entitlement_redemptions: number;
  pay_per_meal_count: number;
  pay_per_meal_revenue: number;
  restaurant_orders_count: number;
  restaurant_sales_total: number;
  avg_order_value: number;
  popular_menu_items: PopularMenuItem[];
  stock_summary: {
    total_items: number;
    low_stock_items: number;
  };
}

export interface StaffOpsReport {
  reporting_period: ReportDateRange;
  property_scope: ReportPropertyScope;
  total_staff: number;
  shifts_scheduled: number;
  shifts_completed: number;
  attendance_punctuality_pct: number;
  total_work_hours: number;
  housekeeping_tasks_total: number;
  housekeeping_turnover_rate_pct: number;
  avg_turnaround_time_mins: number;
  maintenance_orders_total: number;
  maintenance_resolved_total: number;
  maintenance_resolution_rate_pct: number;
  total_maintenance_expenses: number;
  handover_logs_count: number;
  department_distribution: Record<string, number>;
}
