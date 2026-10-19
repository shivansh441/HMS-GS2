import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UtensilsCrossed,
  ChefHat,
  Coffee,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  Filter,
  DollarSign,
  Package,
  Layers,
  Building2,
  ArrowRight,
  UserCheck,
  Receipt,
  FileText,
  Calendar,
  Sparkles,
  RefreshCw,
  Sliders,
  Check,
  X,
  AlertCircle,
  Truck,
  ShieldCheck,
  Flame,
  ShoppingBag,
  Bell,
  Activity,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { formatCurrency } from "@/src/lib/utils";
import {
  fetchFoodConfig,
  updateFoodConfig,
  fetchMenuItems,
  createMenuItem,
  updateMenuItem,
  fetchMealPlans,
  createMealPlan,
  fetchMealEntitlements,
  assignMealPlan,
  fetchRestaurantOrders,
  createRestaurantOrder,
  updateRestaurantOrderStatus,
  fetchFoodStock,
  createFoodStockItem,
  recordStockMovement,
  fetchFoodStockMovements,
  fetchFoodDashboard,
  fetchHostellers,
  fetchHotelStays,
} from "@/src/services/api-client";
import {
  FoodServiceType,
  MealPeriodId,
  FoodCategory,
  DietaryFlag,
  MenuItem,
  MealPlan,
  HostellerMealEntitlement,
  RestaurantOrder,
  OrderStatus,
  FoodStockItem,
  StockMovementType,
  UnitOfMeasure,
  StockCategory,
} from "@/src/types/food";

type TabMode = "mess" | "restaurant" | "menu" | "stock" | "config";

export const MessRestaurantCard: React.FC = () => {
  const { activeProperty } = useProperty();
  const { user, canAccessProperty } = useAuth();
  const queryClient = useQueryClient();
  const isAllowed = canAccessProperty(activeProperty.id);

  const [activeTab, setActiveTab] = useState<TabMode>("mess");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearNotifications = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  // Queries
  const { data: foodDashboardData, isLoading: isDashboardLoading, refetch: refetchDashboard } = useQuery({
    queryKey: ["food-dashboard", activeProperty.id],
    queryFn: () => fetchFoodDashboard(activeProperty.id),
    enabled: isAllowed,
  });

  const { data: foodConfigData, refetch: refetchConfig } = useQuery({
    queryKey: ["food-config", activeProperty.id],
    queryFn: () => fetchFoodConfig(activeProperty.id),
    enabled: isAllowed,
  });

  const { data: menuData, isLoading: isMenuLoading, refetch: refetchMenu } = useQuery({
    queryKey: ["food-menu", activeProperty.id],
    queryFn: () => fetchMenuItems(activeProperty.id, "all", "all"),
    enabled: isAllowed,
  });

  const { data: mealPlansData, isLoading: isPlansLoading, refetch: refetchMealPlans } = useQuery({
    queryKey: ["food-meal-plans", activeProperty.id],
    queryFn: () => fetchMealPlans(activeProperty.id),
    enabled: isAllowed,
  });

  const { data: entitlementsData, isLoading: isEntitlementsLoading, refetch: refetchEntitlements } = useQuery({
    queryKey: ["food-entitlements", activeProperty.id],
    queryFn: () => fetchMealEntitlements(activeProperty.id),
    enabled: isAllowed,
  });

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const { data: ordersData, isLoading: isOrdersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["food-restaurant-orders", activeProperty.id],
    queryFn: () => fetchRestaurantOrders(activeProperty.id, "all"),
    enabled: isAllowed,
  });

  const { data: stockData, isLoading: isStockLoading, refetch: refetchStock } = useQuery({
    queryKey: ["food-stock", activeProperty.id],
    queryFn: () => fetchFoodStock(activeProperty.id),
    enabled: isAllowed,
  });

  const { data: stockMovementsData, refetch: refetchMovements } = useQuery({
    queryKey: ["food-stock-movements", activeProperty.id],
    queryFn: () => fetchFoodStockMovements(activeProperty.id),
    enabled: isAllowed,
  });

  // Reference queries for selectors
  const { data: hostellersData } = useQuery({
    queryKey: ["hostellers-ref", activeProperty.id],
    queryFn: () => fetchHostellers(activeProperty.id, { status: "active" }),
    enabled: isAllowed,
  });

  const { data: hotelStaysData } = useQuery({
    queryKey: ["hotel-stays-ref", activeProperty.id],
    queryFn: () => fetchHotelStays(activeProperty.id, { status: "checked_in" }),
    enabled: isAllowed,
  });

  const dashboard = foodDashboardData?.data;
  const foodConfig = foodConfigData?.data;
  const menuItems = menuData?.data || [];
  const mealPlans = mealPlansData?.data || [];
  const entitlements = entitlementsData?.data || [];
  const orders = ordersData?.data || [];
  const stockItems = stockData?.data || [];
  const stockMovements = stockMovementsData?.data || [];
  const hostellersList = hostellersData?.data || [];
  const hotelStaysList = hotelStaysData?.data || [];

  // ==========================================
  // STATE: Modals & Interactive Actions
  // ==========================================

  // 1. Assign Meal Plan Modal
  const [showAssignPlanModal, setShowAssignPlanModal] = useState<boolean>(false);
  const [assignHostellerId, setAssignHostellerId] = useState<string>("");
  const [assignPlanId, setAssignPlanId] = useState<string>("");
  const [assignStartDate, setAssignStartDate] = useState<string>(todayStr);
  const [assignCreateInvoice, setAssignCreateInvoice] = useState<boolean>(true);

  // 3. Create Meal Plan Modal
  const [showCreatePlanModal, setShowCreatePlanModal] = useState<boolean>(false);
  const [newPlanName, setNewPlanName] = useState<string>("");
  const [newPlanType, setNewPlanType] = useState<any>("lunch_and_dinner");
  const [newPlanPrice, setNewPlanPrice] = useState<number>(65);
  const [newPlanDays, setNewPlanDays] = useState<number>(7);
  const [newPlanPeriods, setNewPlanPeriods] = useState<MealPeriodId[]>(["lunch", "dinner"]);

  // 4. Create Restaurant Order Modal (POS)
  const [showNewOrderModal, setShowNewOrderModal] = useState<boolean>(false);
  const [orderCustomerType, setOrderCustomerType] = useState<"hotel_guest" | "hosteller" | "walk_in">("hotel_guest");
  const [orderCustomerName, setOrderCustomerName] = useState<string>("");
  const [orderHotelStayId, setOrderHotelStayId] = useState<string>("");
  const [orderRoomNumber, setOrderRoomNumber] = useState<string>("");
  const [orderTableNumber, setOrderTableNumber] = useState<string>("");
  const [orderBillToRoom, setOrderBillToRoom] = useState<boolean>(true);
  const [orderSpecialInstructions, setOrderSpecialInstructions] = useState<string>("");
  const [orderCart, setOrderCart] = useState<Record<string, number>>({});

  // 5. Create Menu Item Modal
  const [showNewMenuItemModal, setShowNewMenuItemModal] = useState<boolean>(false);
  const [menuItemName, setMenuItemName] = useState<string>("");
  const [menuItemDesc, setMenuItemDesc] = useState<string>("");
  const [menuItemServiceType, setMenuItemServiceType] = useState<FoodServiceType>("restaurant");
  const [menuItemCategory, setMenuItemCategory] = useState<FoodCategory>("main_course");
  const [menuItemPrice, setMenuItemPrice] = useState<number>(12);
  const [menuItemPeriods, setMenuItemPeriods] = useState<MealPeriodId[]>(["lunch", "dinner"]);
  const [menuItemDietary, setMenuItemDietary] = useState<DietaryFlag[]>(["vegetarian"]);

  // 6. Stock Movement Modal
  const [showStockMovementModal, setShowStockMovementModal] = useState<boolean>(false);
  const [movementStockId, setMovementStockId] = useState<string>("");
  const [movementType, setMovementType] = useState<StockMovementType>("receipt");
  const [movementDelta, setMovementDelta] = useState<number>(10);
  const [movementReason, setMovementReason] = useState<string>("");

  // 7. Create Stock Item Modal
  const [showNewStockModal, setShowNewNewStockModal] = useState<boolean>(false);
  const [stockName, setStockName] = useState<string>("");
  const [stockCategory, setStockCategory] = useState<StockCategory>("grains_staples");
  const [stockUnit, setStockUnit] = useState<UnitOfMeasure>("kg");
  const [stockQty, setStockQty] = useState<number>(25);
  const [stockThreshold, setStockThreshold] = useState<number>(5);
  const [stockCost, setStockCost] = useState<number>(2.5);
  const [stockSupplier, setStockSupplier] = useState<string>("");

  // 8. Food Config Edit Form State
  const [cfgMessEnabled, setCfgMessEnabled] = useState<boolean>(foodConfig?.mess_enabled ?? true);
  const [cfgRestaurantEnabled, setCfgRestaurantEnabled] = useState<boolean>(foodConfig?.restaurant_enabled ?? true);
  const [cfgAllowPayPerMeal, setCfgAllowPayPerMeal] = useState<boolean>(foodConfig?.allow_pay_per_meal ?? true);
  const [cfgDefaultMealPrice, setCfgDefaultMealPrice] = useState<number>(foodConfig?.default_pay_per_meal_price ?? 10);

  // Sync config form with loaded config
  React.useEffect(() => {
    if (foodConfig) {
      setCfgMessEnabled(foodConfig.mess_enabled);
      setCfgRestaurantEnabled(foodConfig.restaurant_enabled);
      setCfgAllowPayPerMeal(foodConfig.allow_pay_per_meal);
      setCfgDefaultMealPrice(foodConfig.default_pay_per_meal_price);
    }
  }, [foodConfig]);

  // Mutations

  const assignPlanMutation = useMutation({
    mutationFn: () =>
      assignMealPlan({
        property_id: activeProperty.id,
        hosteller_id: assignHostellerId,
        meal_plan_id: assignPlanId,
        start_date: assignStartDate,
        create_invoice: assignCreateInvoice,
      }),
    onSuccess: (res) => {
      setSuccessMessage(`Meal plan assigned to ${res.data?.hosteller_name}. Folio invoice #${res.data?.invoice_id || "generated"} created in Phase 9 Finance.`);
      setShowAssignPlanModal(false);
      queryClient.invalidateQueries({ queryKey: ["food-entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to assign meal plan");
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: () =>
      createMealPlan({
        property_id: activeProperty.id,
        name: newPlanName,
        plan_type: newPlanType,
        included_meal_periods: newPlanPeriods,
        price: newPlanPrice,
        validity_days: newPlanDays,
      }),
    onSuccess: (res) => {
      setSuccessMessage(`Meal plan '${res.data?.name}' created successfully.`);
      setShowCreatePlanModal(false);
      setNewPlanName("");
      queryClient.invalidateQueries({ queryKey: ["food-meal-plans"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to create meal plan");
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(orderCart)
        .filter(([_, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ item_id: itemId, quantity: qty }));

      return createRestaurantOrder({
        property_id: activeProperty.id,
        customer_type: orderCustomerType,
        customer_name: orderCustomerName,
        hotel_stay_id: orderHotelStayId || undefined,
        room_number: orderRoomNumber || undefined,
        table_number: orderTableNumber || undefined,
        items,
        special_instructions: orderSpecialInstructions || undefined,
        bill_to_room: orderBillToRoom,
      });
    },
    onSuccess: (res) => {
      setSuccessMessage(`Order #${res.data?.order_number} submitted to Kitchen KDS! Total: ${formatCurrency(res.data?.total_amount || 0, res.data?.currency)}. ${res.data?.billing_status === "billed_to_room" ? "Billed to room stay folio in Finance." : "Direct pay mode."}`);
      setShowNewOrderModal(false);
      setOrderCart({});
      setOrderCustomerName("");
      setOrderRoomNumber("");
      setOrderTableNumber("");
      queryClient.invalidateQueries({ queryKey: ["food-restaurant-orders"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to create restaurant order");
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      updateRestaurantOrderStatus(orderId, status),
    onSuccess: (res) => {
      setSuccessMessage(`Order status updated to '${res.data?.status}'.`);
      queryClient.invalidateQueries({ queryKey: ["food-restaurant-orders"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to update order status");
    },
  });

  const createMenuItemMutation = useMutation({
    mutationFn: () =>
      createMenuItem({
        property_id: activeProperty.id,
        name: menuItemName,
        description: menuItemDesc,
        service_type: menuItemServiceType,
        category: menuItemCategory,
        price: menuItemPrice,
        meal_periods: menuItemPeriods,
        dietary_flags: menuItemDietary,
      }),
    onSuccess: (res) => {
      setSuccessMessage(`Menu item '${res.data?.name}' added.`);
      setShowNewMenuItemModal(false);
      setMenuItemName("");
      setMenuItemDesc("");
      queryClient.invalidateQueries({ queryKey: ["food-menu"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to create menu item");
    },
  });

  const toggleItemAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      updateMenuItem(id, { is_available: isAvailable }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["food-menu"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to update item availability");
    },
  });

  const recordMovementMutation = useMutation({
    mutationFn: () =>
      recordStockMovement(movementStockId, {
        movement_type: movementType,
        quantity_delta: movementType === "consumption" || movementType === "wastage_adjustment" ? -Math.abs(movementDelta) : Math.abs(movementDelta),
        reason: movementReason || undefined,
      }),
    onSuccess: (res) => {
      setSuccessMessage(res.message || "Stock movement recorded.");
      setShowStockMovementModal(false);
      setMovementDelta(10);
      setMovementReason("");
      queryClient.invalidateQueries({ queryKey: ["food-stock"] });
      queryClient.invalidateQueries({ queryKey: ["food-stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to record stock movement");
    },
  });

  const createStockMutation = useMutation({
    mutationFn: () =>
      createFoodStockItem({
        property_id: activeProperty.id,
        name: stockName,
        category: stockCategory,
        unit_of_measure: stockUnit,
        current_quantity: stockQty,
        low_stock_threshold: stockThreshold,
        cost_per_unit: stockCost,
        supplier_name: stockSupplier || undefined,
      }),
    onSuccess: (res) => {
      setSuccessMessage(`Stock item '${res.data?.name}' added to inventory.`);
      setShowNewNewStockModal(false);
      setStockName("");
      queryClient.invalidateQueries({ queryKey: ["food-stock"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to create stock item");
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: () =>
      updateFoodConfig({
        property_id: activeProperty.id,
        mess_enabled: cfgMessEnabled,
        restaurant_enabled: cfgRestaurantEnabled,
        allow_pay_per_meal: cfgAllowPayPerMeal,
        default_pay_per_meal_price: cfgDefaultMealPrice,
        meal_periods: foodConfig?.meal_periods,
      }),
    onSuccess: () => {
      setSuccessMessage("Property food service configuration updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["food-config"] });
      queryClient.invalidateQueries({ queryKey: ["food-dashboard"] });
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to update food service config");
    },
  });

  // Calculate Cart Totals
  const cartSummary = useMemo(() => {
    let subtotal = 0;
    const items: Array<{ item: MenuItem; qty: number; lineTotal: number }> = [];
    for (const [id, qty] of Object.entries(orderCart)) {
      if (qty > 0) {
        const item = menuItems.find((m) => m.id === id);
        if (item) {
          const lineTotal = item.price * qty;
          subtotal += lineTotal;
          items.push({ item, qty, lineTotal });
        }
      }
    }
    const estimatedTax = subtotal * 0.2; // 20% standard tax estimate
    const total = subtotal + estimatedTax;
    return { subtotal, estimatedTax, total, items };
  }, [orderCart, menuItems]);

  return (
    <div className="space-y-6">
      {/* Property Food Service Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <UtensilsCrossed className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">Mess & Restaurant Management</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-medium border border-amber-500/30">
                  Phase 10
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 font-mono border border-purple-500/20">
                  Finance-Integrated
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Property-scoped dining operations for {activeProperty.name} ({activeProperty.code}) · Currency: {dashboard?.currency || activeProperty.currency}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-2.5">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium ${dashboard?.mess_enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dashboard?.mess_enabled ? "bg-emerald-400" : "bg-zinc-500"}`} />
                  Hostel Mess: {dashboard?.mess_enabled ? "Active" : "Disabled"}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium ${dashboard?.restaurant_enabled ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dashboard?.restaurant_enabled ? "bg-sky-400" : "bg-zinc-500"}`} />
                  Hotel Restaurant: {dashboard?.restaurant_enabled ? "Active" : "Disabled"}
                </span>
                <span className="text-xs text-zinc-400 bg-zinc-800/80 px-2 py-1 rounded border border-zinc-700/60">
                  Meal Periods: {dashboard?.service_periods?.map((p) => p.name).join(", ") || "Breakfast, Lunch, Dinner"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetchDashboard();
                refetchOrders();
                refetchStock();
                refetchMenu();
                refetchMealPlans();
                refetchEntitlements();
              }}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5 border border-zinc-700 transition"
              title="Refresh operational feeds"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {successMessage && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={clearNotifications} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={clearNotifications} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Operational Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-6">
          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              Active Meal Plans
            </span>
            <div className="text-lg font-bold text-white mt-1">
              {dashboard?.active_meal_plans_count ?? "—"}
            </div>
            <span className="text-[10px] text-zinc-400">Residents enrolled</span>
          </div>

          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-400" />
              Active Entitlements
            </span>
            <div className="text-lg font-bold text-white mt-1">
              {entitlements.length}
            </div>
            <span className="text-[10px] text-emerald-400">Assigned meal plans</span>
          </div>

          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              Kitchen KDS Queue
            </span>
            <div className="text-lg font-bold text-orange-400 mt-1">
              {dashboard?.active_kitchen_orders_count ?? "—"}
            </div>
            <span className="text-[10px] text-zinc-400">In preparation</span>
          </div>

          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
              Restaurant Orders
            </span>
            <div className="text-lg font-bold text-white mt-1">
              {dashboard?.today_restaurant_orders_count ?? "—"}
            </div>
            <span className="text-[10px] text-zinc-400">Placed today</span>
          </div>

          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <Coffee className="w-3.5 h-3.5 text-indigo-400" />
              Available Dishes
            </span>
            <div className="text-lg font-bold text-white mt-1">
              {dashboard?.available_menu_items_count ?? "—"}
            </div>
            <span className="text-[10px] text-zinc-400">Active menu items</span>
          </div>

          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              Low Stock Alerts
            </span>
            <div className={`text-lg font-bold mt-1 ${(dashboard?.low_stock_items_count ?? 0) > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {dashboard?.low_stock_items_count ?? "0"}
            </div>
            <span className="text-[10px] text-zinc-400">Pantry items low</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-zinc-800 gap-1 bg-zinc-900/50 p-1 rounded-xl">
        <button
          onClick={() => { setActiveTab("mess"); clearNotifications(); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "mess"
              ? "bg-amber-500 text-zinc-950 shadow-md font-bold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <UtensilsCrossed className="w-4 h-4" />
          <span>Hostel Meal Plans</span>
        </button>

        <button
          onClick={() => { setActiveTab("restaurant"); clearNotifications(); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "restaurant"
              ? "bg-sky-500 text-zinc-950 shadow-md font-bold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <ChefHat className="w-4 h-4" />
          <span>Hotel Restaurant & KDS</span>
        </button>

        <button
          onClick={() => { setActiveTab("menu"); clearNotifications(); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "menu"
              ? "bg-indigo-600 text-white shadow-md font-bold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <Coffee className="w-4 h-4" />
          <span>Menu Catalog</span>
        </button>

        <button
          onClick={() => { setActiveTab("stock"); clearNotifications(); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "stock"
              ? "bg-emerald-600 text-white shadow-md font-bold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Pantry & Stock Inventory</span>
        </button>

        <button
          onClick={() => { setActiveTab("config"); clearNotifications(); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "config"
              ? "bg-purple-600 text-white shadow-md font-bold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Food Policy Config</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: HOSTEL MEAL PLANS & RESIDENT ENTITLEMENTS */}
      {/* ==================================================================== */}
      {activeTab === "mess" && (
        <div className="space-y-6">
          {/* Meal Plans Available */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Hostel Meal Plans</h3>
                <p className="text-xs text-zinc-400">Available meal subscription packages for hostellers and residents</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAssignPlanModal(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Assign to Resident</span>
                </button>
                <button
                  onClick={() => setShowCreatePlanModal(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-zinc-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Plan</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {mealPlans.map((plan) => (
                <div key={plan.id} className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{plan.name}</span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {formatCurrency(plan.price, plan.currency)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">{plan.description || "All meals covered"}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {plan.included_meal_periods.map((period) => (
                        <span key={period} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                          {period}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Validity: {plan.validity_days} days</span>
                    <span className="text-emerald-400 font-medium">Active</span>
                  </div>
                </div>
              ))}
              {mealPlans.length === 0 && (
                <div className="col-span-full text-center py-6 text-xs text-zinc-500">
                  No meal plans configured yet. Click "New Plan" to create one.
                </div>
              )}
            </div>
          </div>

          {/* Active Resident Entitlements Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Active Resident Entitlements</h3>
                <p className="text-xs text-zinc-400">Hostellers with assigned dining plans</p>
              </div>
              <span className="text-xs text-zinc-400">{entitlements.length} total active</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="pb-2">Hosteller</th>
                    <th className="pb-2">Meal Plan</th>
                    <th className="pb-2">Validity</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Finance Folio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {entitlements.map((ent) => (
                    <tr key={ent.id} className="hover:bg-zinc-800/30">
                      <td className="py-2.5 font-medium text-zinc-200">{ent.hosteller_name}</td>
                      <td className="py-2.5 text-zinc-300">{ent.meal_plan_name}</td>
                      <td className="py-2.5 text-zinc-400 font-mono text-[11px]">
                        {ent.start_date} → {ent.end_date}
                      </td>
                      <td className="py-2.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          {ent.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {ent.invoice_id ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            <Receipt className="w-3 h-3" />
                            {ent.invoice_id}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {entitlements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-zinc-500">
                        No active entitlements yet. Click "Assign to Resident" above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: HOTEL RESTAURANT & KITCHEN DISPLAY SYSTEM */}
      {/* ==================================================================== */}
      {activeTab === "restaurant" && (
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Restaurant & Room Service Orders</h3>
              <p className="text-xs text-zinc-400">Live order queue, kitchen tickets, and guest folio billing</p>
            </div>
            <button
              onClick={() => {
                setShowNewOrderModal(true);
                setOrderCart({});
              }}
              className="bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Place New Order (POS)</span>
            </button>
          </div>

          {/* Kitchen Display System (KDS) Board */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((order) => {
              const isKitchenActive = order.status === "placed" || order.status === "preparing" || order.status === "ready";
              return (
                <div
                  key={order.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between transition ${
                    order.status === "placed"
                      ? "bg-zinc-900 border-amber-500/40"
                      : order.status === "preparing"
                      ? "bg-zinc-900 border-sky-500/40"
                      : order.status === "ready"
                      ? "bg-zinc-900 border-emerald-500/40"
                      : "bg-zinc-950/80 border-zinc-800"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-white">{order.order_number}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          order.status === "placed"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : order.status === "preparing"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                            : order.status === "ready"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : order.status === "served" || order.status === "completed"
                            ? "bg-zinc-800 text-zinc-400"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div className="text-xs">
                      <div className="font-medium text-zinc-200">{order.customer_name}</div>
                      <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                        {order.room_number && <span>Room: <strong>{order.room_number}</strong></span>}
                        {order.table_number && <span>Table: <strong>{order.table_number}</strong></span>}
                        <span className="capitalize text-zinc-500">({order.customer_type.replace("_", " ")})</span>
                      </div>
                    </div>

                    {/* Order Item List */}
                    <div className="bg-zinc-950/60 rounded-lg p-2.5 border border-zinc-800/80 space-y-1">
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-zinc-300">
                            <span className="font-bold text-sky-400 mr-1.5">{it.quantity}x</span>
                            {it.name}
                          </span>
                          <span className="font-mono text-zinc-400">
                            {formatCurrency(it.total, order.currency)}
                          </span>
                        </div>
                      ))}
                      {order.special_instructions && (
                        <p className="text-[11px] text-amber-300/80 italic pt-1 border-t border-zinc-800">
                          Note: {order.special_instructions}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">
                        {order.billing_status === "billed_to_room" ? (
                          <span className="text-purple-400 font-medium flex items-center gap-1">
                            <Receipt className="w-3.5 h-3.5" />
                            Billed to Room Folio
                          </span>
                        ) : (
                          <span className="text-zinc-400">Direct Payment</span>
                        )}
                      </span>
                      <span className="font-mono font-bold text-white">
                        {formatCurrency(order.total_amount, order.currency)}
                      </span>
                    </div>

                    {/* KDS Status Transition Buttons */}
                    {isKitchenActive && (
                      <div className="flex gap-1.5 pt-1">
                        {order.status === "placed" && (
                          <button
                            onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: "preparing" })}
                            className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold py-1.5 rounded transition"
                          >
                            Start Preparing
                          </button>
                        )}
                        {order.status === "preparing" && (
                          <button
                            onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: "ready" })}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold py-1.5 rounded transition"
                          >
                            Mark Ready
                          </button>
                        )}
                        {order.status === "ready" && (
                          <button
                            onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: "served" })}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold py-1.5 rounded transition"
                          >
                            Mark Served
                          </button>
                        )}
                        <button
                          onClick={() => updateOrderStatusMutation.mutate({ orderId: order.id, status: "completed" })}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] px-2.5 py-1.5 rounded transition"
                          title="Complete order"
                        >
                          Complete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {orders.length === 0 && (
              <div className="col-span-3 text-center py-12 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                No active restaurant or room service orders. Click "Place New Order (POS)" to start a ticket.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: MENU ITEMS CATALOG */}
      {/* ==================================================================== */}
      {activeTab === "menu" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Food & Dining Menu Catalog</h3>
              <p className="text-xs text-zinc-400">Dishes, pricing, service scopes, and allergen warnings</p>
            </div>
            <button
              onClick={() => setShowNewMenuItemModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Menu Item</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menuItems.map((item) => (
              <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white">{item.name}</h4>
                      <span className="text-[10px] text-zinc-400 uppercase font-mono tracking-wider">
                        {item.category.replace("_", " ")} · {item.service_type}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-amber-400">
                      {formatCurrency(item.price, item.currency)}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 mt-2 line-clamp-2">
                    {item.description || "Freshly prepared daily"}
                  </p>

                  {/* Dietary & Allergens */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {item.dietary_flags.map((df) => (
                      <span key={df} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {df}
                      </span>
                    ))}
                    {item.allergens.map((all) => (
                      <span key={all} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                        Contains {all}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.is_available ? "bg-emerald-400" : "bg-rose-400"}`} />
                    <span className={item.is_available ? "text-emerald-400" : "text-rose-400"}>
                      {item.is_available ? "Available" : "86'd / Out"}
                    </span>
                  </div>

                  <button
                    onClick={() => toggleItemAvailabilityMutation.mutate({ id: item.id, isAvailable: !item.is_available })}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Toggle {item.is_available ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: PANTRY & FOOD STOCK INVENTORY */}
      {/* ==================================================================== */}
      {activeTab === "stock" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Kitchen Pantry & Stock Inventory</h3>
              <p className="text-xs text-zinc-400">Track raw ingredients, bulk staples, and consumption audit trails</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (stockItems.length > 0) {
                    setMovementStockId(stockItems[0].id);
                  }
                  setShowStockMovementModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
              >
                <Truck className="w-4 h-4" />
                <span>Record Stock Movement</span>
              </button>
              <button
                onClick={() => setShowNewNewStockModal(true)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 border border-zinc-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Stock Item</span>
              </button>
            </div>
          </div>

          {/* Stock Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stockItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 flex flex-col justify-between ${
                  item.is_low_stock
                    ? "bg-rose-950/20 border-rose-500/40"
                    : "bg-zinc-900 border-zinc-800"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">{item.name}</h4>
                      <span className="text-[10px] text-zinc-400 uppercase font-mono">
                        {item.category.replace("_", " ")}
                      </span>
                    </div>
                    {item.is_low_stock && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        LOW STOCK
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-bold font-mono text-white">
                        {item.current_quantity}
                      </span>
                      <span className="text-xs text-zinc-400 ml-1">{item.unit_of_measure}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Min threshold: {item.low_stock_threshold} {item.unit_of_measure}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-2">
                    Unit cost: {formatCurrency(item.cost_per_unit, item.currency)} / {item.unit_of_measure}
                    {item.supplier_name && <span> · Supplier: {item.supplier_name}</span>}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-zinc-500">
                    Updated {new Date(item.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button
                    onClick={() => {
                      setMovementStockId(item.id);
                      setShowStockMovementModal(true);
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium"
                  >
                    Adjust / Restock
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Stock Movement Audit Log */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Recent Stock Movements & Audit Trail</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Stock Item</th>
                    <th className="pb-2">Movement Type</th>
                    <th className="pb-2">Delta</th>
                    <th className="pb-2">Resulting Balance</th>
                    <th className="pb-2">Logged By</th>
                    <th className="pb-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {stockMovements.slice(0, 15).map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/30">
                      <td className="py-2.5 font-mono text-[11px] text-zinc-400">
                        {m.timestamp.replace("T", " ").substring(0, 16)}
                      </td>
                      <td className="py-2.5 font-medium text-zinc-200">{m.stock_item_name}</td>
                      <td className="py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono ${
                          m.movement_type === "receipt"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            : m.movement_type === "consumption"
                            ? "bg-sky-500/10 text-sky-300 border border-sky-500/20"
                            : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                        }`}>
                          {m.movement_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono font-bold">
                        <span className={m.quantity_delta > 0 ? "text-emerald-400" : "text-rose-400"}>
                          {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta} {m.unit_of_measure}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-zinc-300">
                        {m.resulting_quantity} {m.unit_of_measure}
                      </td>
                      <td className="py-2.5 text-zinc-400 text-[11px]">{m.performed_by_name}</td>
                      <td className="py-2.5 text-zinc-500 text-[11px] italic">{m.reason || "—"}</td>
                    </tr>
                  ))}
                  {stockMovements.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-zinc-500">
                        No stock movement logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: PROPERTY FOOD SERVICE CONFIGURATION */}
      {/* ==================================================================== */}
      {activeTab === "config" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-2xl space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Property Food Service Configuration</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Configure food service policies, meal schedules, and pricing for {activeProperty.name}.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-white block">Hostel Mess Service</span>
                <span className="text-[11px] text-zinc-400">Enable resident meal plans and communal dining hall services</span>
              </div>
              <input
                type="checkbox"
                checked={cfgMessEnabled}
                onChange={(e) => setCfgMessEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-white block">Hotel Restaurant & Room Service</span>
                <span className="text-[11px] text-zinc-400">Enable dining POS, table orders, and room folio billing</span>
              </div>
              <input
                type="checkbox"
                checked={cfgRestaurantEnabled}
                onChange={(e) => setCfgRestaurantEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-sky-500 bg-zinc-900 border-zinc-700"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-white block">Allow Pay-Per-Meal</span>
                <span className="text-[11px] text-zinc-400">Allow residents without a subscription to dine with a one-time charge</span>
              </div>
              <input
                type="checkbox"
                checked={cfgAllowPayPerMeal}
                onChange={(e) => setCfgAllowPayPerMeal(e.target.checked)}
                className="w-4 h-4 rounded text-purple-500 bg-zinc-900 border-zinc-700"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Default Pay-Per-Meal Price ({dashboard?.currency || activeProperty.currency})</label>
              <input
                type="number"
                step="0.5"
                value={cfgDefaultMealPrice}
                onChange={(e) => setCfgDefaultMealPrice(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => updateConfigMutation.mutate()}
                disabled={updateConfigMutation.isPending}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition"
              >
                {updateConfigMutation.isPending ? "Saving..." : "Save Policy Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: Assign Meal Plan with Phase 9 Finance Integration */}
      {/* ==================================================================== */}
      {showAssignPlanModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Assign Meal Plan to Resident</h3>
              <button onClick={() => setShowAssignPlanModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Select Hosteller</label>
                <select
                  value={assignHostellerId}
                  onChange={(e) => setAssignHostellerId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                >
                  <option value="">-- Choose Hosteller --</option>
                  {hostellersList.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.first_name} {h.last_name} ({h.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Select Meal Plan</label>
                <select
                  value={assignPlanId}
                  onChange={(e) => setAssignPlanId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                >
                  <option value="">-- Choose Meal Plan --</option>
                  {mealPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(p.price, p.currency)} ({p.validity_days} days)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Subscription Start Date</label>
                <input
                  type="date"
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <input
                  type="checkbox"
                  id="autoInvoice"
                  checked={assignCreateInvoice}
                  onChange={(e) => setAssignCreateInvoice(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-500 bg-zinc-900 border-zinc-700"
                />
                <label htmlFor="autoInvoice" className="text-xs text-purple-300">
                  <strong>Phase 9 Integration:</strong> Automatically issue mess fee folio invoice with tax snapshot in Finance Engine
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssignPlanModal(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => assignPlanMutation.mutate()}
                disabled={!assignHostellerId || !assignPlanId || assignPlanMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs disabled:opacity-50"
              >
                {assignPlanMutation.isPending ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: Place New Restaurant Order (POS) */}
      {/* ==================================================================== */}
      {showNewOrderModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-2xl w-full space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Place Restaurant / Room Service Order</h3>
                <p className="text-xs text-zinc-400">Order items, compute taxes, and dispatch to Kitchen Display System</p>
              </div>
              <button onClick={() => setShowNewOrderModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Customer Type</label>
                <select
                  value={orderCustomerType}
                  onChange={(e) => setOrderCustomerType(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                >
                  <option value="hotel_guest">Hotel Guest</option>
                  <option value="hosteller">Hostel Resident</option>
                  <option value="walk_in">Walk-in Patron</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Customer Name</label>
                <input
                  type="text"
                  placeholder="Guest / Patron Name"
                  value={orderCustomerName}
                  onChange={(e) => setOrderCustomerName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              {orderCustomerType === "hotel_guest" && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Active Hotel Room Stay</label>
                  <select
                    value={orderHotelStayId}
                    onChange={(e) => {
                      const stayId = e.target.value;
                      setOrderHotelStayId(stayId);
                      const stay = hotelStaysList.find((s) => s.id === stayId);
                      if (stay) {
                        setOrderCustomerName(`${stay.guest?.first_name || ""} ${stay.guest?.last_name || ""}`.trim());
                        setOrderRoomNumber(stay.assigned_room_id || "");
                      }

                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="">-- Choose Hotel Stay --</option>
                    {hotelStaysList.map((s) => (
                      <option key={s.id} value={s.id}>
                        Room {s.assigned_room_id} — {s.guest?.first_name} {s.guest?.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {orderCustomerType !== "hotel_guest" && (
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Table Number</label>
                  <input
                    type="text"
                    placeholder="Table 4"
                    value={orderTableNumber}
                    onChange={(e) => setOrderTableNumber(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  />
                </div>
              )}
            </div>

            {/* Menu Item Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 block">Select Dishes & Beverages</label>
              <div className="max-h-56 overflow-y-auto space-y-2 border border-zinc-800 rounded-lg p-2 bg-zinc-950">
                {menuItems.filter((m) => m.is_available).map((m) => {
                  const currentQty = orderCart[m.id] || 0;
                  return (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-850">
                      <div>
                        <div className="text-xs font-semibold text-white">{m.name}</div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {formatCurrency(m.price, m.currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setOrderCart((prev) => ({ ...prev, [m.id]: Math.max(0, (prev[m.id] || 0) - 1) }))}
                          className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold hover:bg-zinc-700"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs w-6 text-center text-white">{currentQty}</span>
                        <button
                          onClick={() => setOrderCart((prev) => ({ ...prev, [m.id]: (prev[m.id] || 0) + 1 }))}
                          className="w-6 h-6 rounded bg-sky-600 text-white flex items-center justify-center text-xs font-bold hover:bg-sky-500"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Special Instructions & Room Folio Billing */}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Special preparation instructions (e.g. extra spicy, gluten-free)..."
                value={orderSpecialInstructions}
                onChange={(e) => setOrderSpecialInstructions(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
              />

              {orderCustomerType === "hotel_guest" && (
                <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <input
                    type="checkbox"
                    id="billRoom"
                    checked={orderBillToRoom}
                    onChange={(e) => setOrderBillToRoom(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-500 bg-zinc-900 border-zinc-700"
                  />
                  <label htmlFor="billRoom" className="text-xs text-purple-300">
                    <strong>Bill to Hotel Room Folio:</strong> Automatically create guest invoice folio charge in Phase 9 Finance
                  </label>
                </div>
              )}
            </div>

            {/* Cart Summary Strip */}
            <div className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-zinc-400">Subtotal: {formatCurrency(cartSummary.subtotal, dashboard?.currency || "GBP")}</span>
                <span className="text-zinc-500 ml-2">Estimated Tax (20%): {formatCurrency(cartSummary.estimatedTax, dashboard?.currency || "GBP")}</span>
              </div>
              <div className="text-base font-bold font-mono text-white">
                Total: {formatCurrency(cartSummary.total, dashboard?.currency || "GBP")}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewOrderModal(false)} className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs">
                Cancel
              </button>
              <button
                onClick={() => createOrderMutation.mutate()}
                disabled={!orderCustomerName || cartSummary.items.length === 0 || createOrderMutation.isPending}
                className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs disabled:opacity-50"
              >
                {createOrderMutation.isPending ? "Submitting..." : "Send to Kitchen (KDS)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: Record Stock Movement */}
      {/* ==================================================================== */}
      {showStockMovementModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Record Stock Inventory Movement</h3>
              <button onClick={() => setShowStockMovementModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Select Ingredient / Item</label>
                <select
                  value={movementStockId}
                  onChange={(e) => setMovementStockId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                >
                  {stockItems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Current: {s.current_quantity} {s.unit_of_measure})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Movement Type</label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as StockMovementType)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                >
                  <option value="receipt">Stock Receipt (+ Delivery)</option>
                  <option value="consumption">Daily Kitchen Consumption (-)</option>
                  <option value="wastage_adjustment">Wastage / Spoiled (-)</option>
                  <option value="audit_correction">Audit Physical Correction (+/-)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Quantity Delta</label>
                <input
                  type="number"
                  step="0.5"
                  value={movementDelta}
                  onChange={(e) => setMovementDelta(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Reason / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Weekly pantry replenishment from wholesale supplier"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowStockMovementModal(false)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs">
                Cancel
              </button>
              <button
                onClick={() => recordMovementMutation.mutate()}
                disabled={!movementStockId || movementDelta === 0 || recordMovementMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                {recordMovementMutation.isPending ? "Updating..." : "Record Balance Change"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: New Menu Item */}
      {/* ==================================================================== */}
      {showNewMenuItemModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create New Menu Item</h3>
              <button onClick={() => setShowNewMenuItemModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Dish Name</label>
                <input
                  type="text"
                  placeholder="e.g. Artisan Sourdough Toast & Eggs"
                  value={menuItemName}
                  onChange={(e) => setMenuItemName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Service Type</label>
                  <select
                    value={menuItemServiceType}
                    onChange={(e) => setMenuItemServiceType(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="mess">Mess Only</option>
                    <option value="restaurant">Restaurant Only</option>
                    <option value="both">Both (Mess & Restaurant)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Category</label>
                  <select
                    value={menuItemCategory}
                    onChange={(e) => setMenuItemCategory(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="main_course">Main Course</option>
                    <option value="snack">Snack</option>
                    <option value="dessert">Dessert</option>
                    <option value="beverage">Beverage</option>
                    <option value="thali_combo">Thali / Combo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Price ({dashboard?.currency || activeProperty.currency})</label>
                <input
                  type="number"
                  step="0.5"
                  value={menuItemPrice}
                  onChange={(e) => setMenuItemPrice(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Ingredients, preparation details..."
                  value={menuItemDesc}
                  onChange={(e) => setMenuItemDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewMenuItemModal(false)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs">
                Cancel
              </button>
              <button
                onClick={() => createMenuItemMutation.mutate()}
                disabled={!menuItemName || createMenuItemMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
              >
                {createMenuItemMutation.isPending ? "Creating..." : "Save Menu Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: New Stock Item */}
      {/* ==================================================================== */}
      {showNewStockModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create Stock Inventory Item</h3>
              <button onClick={() => setShowNewNewStockModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Item Name</label>
                <input
                  type="text"
                  placeholder="e.g. Basmati Rice (Bulk)"
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Category</label>
                  <select
                    value={stockCategory}
                    onChange={(e) => setStockCategory(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="grains_staples">Grains & Staples</option>
                    <option value="dairy">Dairy</option>
                    <option value="produce">Fresh Produce</option>
                    <option value="meat_poultry">Meat & Poultry</option>
                    <option value="beverages">Beverages</option>
                    <option value="spices_oils">Spices & Oils</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Unit of Measure</label>
                  <select
                    value={stockUnit}
                    onChange={(e) => setStockUnit(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="kg">kg (Kilograms)</option>
                    <option value="liters">liters (Liters)</option>
                    <option value="pieces">pieces (Pieces)</option>
                    <option value="boxes">boxes (Boxes)</option>
                    <option value="packets">packets (Packets)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Initial Quantity</label>
                  <input
                    type="number"
                    value={stockQty}
                    onChange={(e) => setStockQty(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Low Stock Warning Threshold</label>
                  <input
                    type="number"
                    value={stockThreshold}
                    onChange={(e) => setStockThreshold(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Cost Per Unit</label>
                  <input
                    type="number"
                    step="0.1"
                    value={stockCost}
                    onChange={(e) => setStockCost(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Supplier Name</label>
                  <input
                    type="text"
                    placeholder="Wholesale Supply Co"
                    value={stockSupplier}
                    onChange={(e) => setStockSupplier(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewNewStockModal(false)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs">
                Cancel
              </button>
              <button
                onClick={() => createStockMutation.mutate()}
                disabled={!stockName || createStockMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                {createStockMutation.isPending ? "Creating..." : "Save Stock Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: Create Meal Plan */}
      {/* ==================================================================== */}
      {showCreatePlanModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Create New Hostel Meal Plan</h3>
              <button onClick={() => setShowCreatePlanModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Plan Name</label>
                <input
                  type="text"
                  placeholder="e.g. Semester All-Meals Pass"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Plan Type</label>
                  <select
                    value={newPlanType}
                    onChange={(e) => setNewPlanType(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  >
                    <option value="breakfast_only">Breakfast Only</option>
                    <option value="lunch_and_dinner">Lunch & Dinner</option>
                    <option value="all_meals">All Meals</option>
                    <option value="weekly">Weekly Pass</option>
                    <option value="monthly">Monthly Pass</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={newPlanDays}
                    onChange={(e) => setNewPlanDays(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Price ({dashboard?.currency || activeProperty.currency})</label>
                <input
                  type="number"
                  step="1"
                  value={newPlanPrice}
                  onChange={(e) => setNewPlanPrice(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Included Meal Periods</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(["breakfast", "lunch", "dinner", "snacks"] as MealPeriodId[]).map((period) => {
                    const isChecked = newPlanPeriods.includes(period);
                    return (
                      <button
                        key={period}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setNewPlanPeriods(newPlanPeriods.filter((p) => p !== period));
                          } else {
                            setNewPlanPeriods([...newPlanPeriods, period]);
                          }
                        }}
                        className={`text-xs px-2.5 py-1 rounded font-medium transition ${
                          isChecked
                            ? "bg-amber-500 text-zinc-950 font-bold"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {period}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreatePlanModal(false)} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs">
                Cancel
              </button>
              <button
                onClick={() => createPlanMutation.mutate()}
                disabled={!newPlanName || newPlanPeriods.length === 0 || createPlanMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs"
              >
                {createPlanMutation.isPending ? "Creating..." : "Save Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
