/**
 * Phase 10: Mess & Restaurant Management Domain Types
 * Covers property-level food-service settings, menu items, hostel meal plans,
 * hosteller meal entitlements, attendance/redemption, hotel restaurant orders,
 * food stock inventory, and Phase 9 finance/tax integration.
 */

export type FoodServiceType = "mess" | "restaurant" | "both";

export type MealPeriodId = "breakfast" | "lunch" | "dinner" | "snacks" | "afternoon_tea";

export interface MealPeriodConfig {
  id: MealPeriodId;
  name: string;
  start_time: string; // HH:MM (24h)
  end_time: string; // HH:MM (24h)
  is_active: boolean;
}

export interface FoodServiceConfig {
  property_id: string;
  mess_enabled: boolean;
  restaurant_enabled: boolean;
  meal_periods: MealPeriodConfig[];
  allow_pay_per_meal: boolean;
  default_pay_per_meal_price: number;
  currency: string;
  updated_at: string;
}

export type FoodCategory =
  | "breakfast"
  | "main_course"
  | "snack"
  | "dessert"
  | "beverage"
  | "thali_combo";

export type DietaryFlag =
  | "vegetarian"
  | "vegan"
  | "halal"
  | "gluten_free"
  | "dairy_free"
  | "contains_nuts";

export interface MenuItem {
  id: string;
  property_id: string;
  service_type: FoodServiceType;
  name: string;
  description?: string;
  category: FoodCategory;
  price: number;
  currency: string;
  is_available: boolean;
  meal_periods: MealPeriodId[];
  dietary_flags: DietaryFlag[];
  allergens: string[];
  created_at: string;
  updated_at: string;
}

export type MealPlanType =
  | "breakfast_only"
  | "lunch_and_dinner"
  | "all_meals"
  | "weekly"
  | "monthly";

export interface MealPlan {
  id: string;
  property_id: string;
  name: string;
  description?: string;
  plan_type: MealPlanType;
  included_meal_periods: MealPeriodId[];
  price: number;
  currency: string;
  validity_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HostellerMealEntitlement {
  id: string;
  property_id: string;
  hosteller_id: string;
  hosteller_name: string;
  hostel_stay_id?: string;
  meal_plan_id: string;
  meal_plan_name: string;
  included_meal_periods: MealPeriodId[];
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  status: "active" | "suspended" | "expired" | "cancelled";
  invoice_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MealAttendance {
  id: string;
  property_id: string;
  hosteller_id: string;
  hosteller_name: string;
  service_date: string; // YYYY-MM-DD
  meal_period: MealPeriodId;
  entitlement_id?: string;
  is_pay_per_meal: boolean;
  price_charged?: number;
  currency: string;
  is_manual_override: boolean;
  override_reason?: string;
  recorded_by_user_id: string;
  recorded_by_name: string;
  timestamp: string;
}

export type OrderStatus =
  | "draft"
  | "placed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled";

export type OrderBillingStatus = "pending" | "billed_to_room" | "paid_direct";

export interface OrderItem {
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface RestaurantOrder {
  id: string;
  order_number: string;
  property_id: string;
  customer_type: "hotel_guest" | "hosteller" | "walk_in";
  customer_id?: string;
  customer_name: string;
  hotel_stay_id?: string;
  room_number?: string;
  table_number?: string;
  items: OrderItem[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: OrderStatus;
  billing_status: OrderBillingStatus;
  invoice_id?: string;
  special_instructions?: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export type StockCategory =
  | "grains_staples"
  | "dairy"
  | "produce"
  | "meat_poultry"
  | "beverages"
  | "spices_oils";

export type UnitOfMeasure = "kg" | "liters" | "pieces" | "boxes" | "packets";

export interface FoodStockItem {
  id: string;
  property_id: string;
  name: string;
  category: StockCategory;
  unit_of_measure: UnitOfMeasure;
  current_quantity: number;
  low_stock_threshold: number;
  cost_per_unit: number;
  currency: string;
  supplier_name?: string;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

export type StockMovementType =
  | "receipt"
  | "consumption"
  | "wastage_adjustment"
  | "audit_correction";

export interface FoodStockMovement {
  id: string;
  stock_item_id: string;
  stock_item_name: string;
  property_id: string;
  movement_type: StockMovementType;
  quantity_delta: number;
  resulting_quantity: number;
  unit_of_measure: UnitOfMeasure;
  reason?: string;
  performed_by_user_id: string;
  performed_by_name: string;
  timestamp: string;
}

export interface FoodDashboardSummary {
  property_id: string;
  currency: string;
  mess_enabled: boolean;
  restaurant_enabled: boolean;
  active_meal_plans_count: number;
  today_meal_attendance_count: number;
  today_restaurant_orders_count: number;
  active_kitchen_orders_count: number;
  available_menu_items_count: number;
  low_stock_items_count: number;
  service_periods: MealPeriodConfig[];
  today_attendance_by_period: Record<string, number>;
}

// Request Contracts
export interface CreateMenuItemInput {
  property_id: string;
  service_type: FoodServiceType;
  name: string;
  description?: string;
  category: FoodCategory;
  price: number;
  meal_periods: MealPeriodId[];
  dietary_flags?: DietaryFlag[];
  allergens?: string[];
  is_available?: boolean;
}

export interface UpdateMenuItemInput {
  name?: string;
  description?: string;
  category?: FoodCategory;
  price?: number;
  meal_periods?: MealPeriodId[];
  dietary_flags?: DietaryFlag[];
  allergens?: string[];
  is_available?: boolean;
}

export interface CreateMealPlanInput {
  property_id: string;
  name: string;
  description?: string;
  plan_type: MealPlanType;
  included_meal_periods: MealPeriodId[];
  price: number;
  validity_days: number;
  is_active?: boolean;
}

export interface AssignMealPlanInput {
  property_id: string;
  hosteller_id: string;
  meal_plan_id: string;
  start_date: string;
  hostel_stay_id?: string;
  create_invoice?: boolean;
}

export interface RecordMealAttendanceInput {
  property_id: string;
  hosteller_id: string;
  service_date: string;
  meal_period: MealPeriodId;
  is_manual_override?: boolean;
  override_reason?: string;
}

export interface CreateRestaurantOrderInput {
  property_id: string;
  customer_type: "hotel_guest" | "hosteller" | "walk_in";
  customer_name: string;
  customer_id?: string;
  hotel_stay_id?: string;
  room_number?: string;
  table_number?: string;
  items: Array<{
    item_id: string;
    quantity: number;
  }>;
  special_instructions?: string;
  bill_to_room?: boolean;
}

export interface UpdateStockItemInput {
  movement_type: StockMovementType;
  quantity_delta: number;
  reason?: string;
}

export interface CreateStockItemInput {
  property_id: string;
  name: string;
  category: StockCategory;
  unit_of_measure: UnitOfMeasure;
  current_quantity: number;
  low_stock_threshold: number;
  cost_per_unit: number;
  supplier_name?: string;
}

export interface EntitlementVerificationResult {
  is_eligible: boolean;
  already_redeemed: boolean;
  has_active_entitlement: boolean;
  active_entitlement: HostellerMealEntitlement | null;
  allow_pay_per_meal: boolean;
  pay_per_meal_price: number;
  currency: string;
}

export interface UpdateFoodServiceConfigInput {
  property_id: string;
  mess_enabled?: boolean;
  restaurant_enabled?: boolean;
  meal_periods?: MealPeriodConfig[];
  allow_pay_per_meal?: boolean;
  default_pay_per_meal_price?: number;
}

