import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Layers,
  Bed,
  Hotel,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Ban,
  Calendar,
  Sparkles,
  RefreshCw,
  X,
  ChevronRight,
  Shield,
  Tag,
  Key,
  DoorOpen,
  Info,
  CalendarDays,
  FileSpreadsheet,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  fetchRooms,
  fetchRoomTypes,
  createRoom,
  updateRoom,
  updateRoomStatus,
  blockRoomForMaintenance,
  deleteRoom,
  fetchBeds,
  createBed,
  updateBed,
  updateBedStatus,
  blockBedForMaintenance,
  deleteBed,
  fetchInventorySummary,
  fetchInventoryCalendar,
} from "@/src/services/api-client";
import {
  Room,
  RoomType,
  Bed as BedTypeModel,
  InventorySummaryResponse,
  CalendarMatrixResponse,
  RoomOperationalStatus,
  CleanlinessStatus,
} from "@/src/types/inventory";

type InventoryTab = "overview" | "rooms" | "calendar";

export const AdminInventoryPage: React.FC = () => {
  const { activeProperty, properties, setActivePropertyId } = useProperty();
  const { user, canAccessProperty } = useAuth();
  const isAllowed = canAccessProperty(activeProperty.id);

  // Active view tab
  const [activeTab, setActiveTab] = useState<InventoryTab>("overview");

  // Data states
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [summary, setSummary] = useState<InventorySummaryResponse | null>(null);
  const [calendarData, setCalendarData] = useState<CalendarMatrixResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Calendar dates
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const defaultEndStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }, []);
  const [calStartDate, setCalStartDate] = useState(todayStr);
  const [calEndDate, setCalEndDate] = useState(defaultEndStr);

  // Modals
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [inspectRoom, setInspectRoom] = useState<Room | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [bedManagerRoom, setBedManagerRoom] = useState<Room | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<{
    type: "room" | "bed";
    id: string;
    label: string;
  } | null>(null);

  // Form states for Create Room
  const [createFormData, setCreateFormData] = useState({
    room_number: "",
    room_type_id: "",
    floor_name: "Floor 1",
    keycard_code: "",
    notes: "",
    initial_bed_count: 6,
    initial_bed_prefix: "Pod",
  });

  // Form state for Maintenance Block
  const [maintFormData, setMaintFormData] = useState({
    check_in_date: todayStr,
    check_out_date: defaultEndStr,
    notes: "Scheduled operational maintenance",
  });

  // Form state for Add Bed
  const [newBedData, setNewBedData] = useState({
    bed_label: "",
    bed_type: "bunk_bottom",
    locker_number: "",
  });

  const isManager =
    user.role === "super_admin" ||
    user.role === "property_manager" ||
    user.role === "front_desk";

  // Data fetching
  const loadInventory = useCallback(async () => {
    if (!isAllowed) return;
    setIsLoading(true);
    setError(null);
    try {
      const [roomsRes, rtRes, sumRes] = await Promise.all([
        fetchRooms({ property_id: activeProperty.id }),
        fetchRoomTypes(activeProperty.id),
        fetchInventorySummary(activeProperty.id),
      ]);

      if (roomsRes.success && roomsRes.data) {
        setRooms(roomsRes.data);
      }
      if (rtRes.success && rtRes.data) {
        setRoomTypes(rtRes.data);
        if (rtRes.data.length > 0 && !createFormData.room_type_id) {
          setCreateFormData((prev) => ({ ...prev, room_type_id: rtRes.data[0].id }));
        }
      }
      if (sumRes.success && sumRes.data) {
        setSummary(sumRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory data");
    } finally {
      setIsLoading(false);
    }
  }, [activeProperty.id, isAllowed]);

  const loadCalendar = useCallback(async () => {
    if (!isAllowed) return;
    try {
      const res = await fetchInventoryCalendar(activeProperty.id, calStartDate, calEndDate);
      if (res.success && res.data) {
        setCalendarData(res.data);
      }
    } catch (err) {
      console.error("Failed to load calendar matrix:", err);
    }
  }, [activeProperty.id, calStartDate, calEndDate, isAllowed]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (activeTab === "calendar") {
      loadCalendar();
    }
  }, [activeTab, loadCalendar]);

  // Handle Create Room
  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.room_number.trim() || !createFormData.room_type_id) {
      setError("Please fill in room number and select a room type.");
      return;
    }

    const selectedRt = roomTypes.find((r) => r.id === createFormData.room_type_id);
    const isDorm = selectedRt?.is_dormitory;

    setIsLoading(true);
    setError(null);
    try {
      const res = await createRoom({
        property_id: activeProperty.id,
        room_type_id: createFormData.room_type_id,
        room_number: createFormData.room_number.trim(),
        floor_name: createFormData.floor_name,
        keycard_code: createFormData.keycard_code || undefined,
        notes: createFormData.notes || undefined,
        initial_bed_count: isDorm ? Number(createFormData.initial_bed_count) : undefined,
        initial_bed_prefix: isDorm ? createFormData.initial_bed_prefix : undefined,
      });

      if (res.success) {
        setActionSuccess(`Room ${createFormData.room_number} created successfully.`);
        setIsCreateRoomOpen(false);
        setCreateFormData({
          room_number: "",
          room_type_id: roomTypes[0]?.id || "",
          floor_name: "Floor 1",
          keycard_code: "",
          notes: "",
          initial_bed_count: 6,
          initial_bed_prefix: "Pod",
        });
        await loadInventory();
      } else {
        setError(res.error?.message || "Failed to create room.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating room");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Quick Status Change
  const handleUpdateStatus = async (
    roomId: string,
    status: RoomOperationalStatus,
    cleanliness?: CleanlinessStatus
  ) => {
    try {
      const res = await updateRoomStatus(roomId, status, cleanliness);
      if (res.success) {
        setActionSuccess("Room operational status updated.");
        await loadInventory();
      } else {
        setError(res.error?.message || "Failed to update room status.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating room status");
    }
  };

  // Handle Maintenance Block Submit
  const handleMaintenanceBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceTarget) return;

    if (maintFormData.check_out_date <= maintFormData.check_in_date) {
      setError("End date must be strictly after start date.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let res;
      if (maintenanceTarget.type === "room") {
        res = await blockRoomForMaintenance(maintenanceTarget.id, {
          check_in_date: maintFormData.check_in_date,
          check_out_date: maintFormData.check_out_date,
          notes: maintFormData.notes,
        });
      } else {
        res = await blockBedForMaintenance(maintenanceTarget.id, {
          check_in_date: maintFormData.check_in_date,
          check_out_date: maintFormData.check_out_date,
          notes: maintFormData.notes,
        });
      }

      if (res.success) {
        setActionSuccess(
          `Maintenance block placed on ${maintenanceTarget.label} from ${maintFormData.check_in_date} to ${maintFormData.check_out_date}.`
        );
        setMaintenanceTarget(null);
        await loadInventory();
        if (activeTab === "calendar") {
          await loadCalendar();
        }
      } else {
        setError(res.error?.message || "Failed to place maintenance block.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error placing maintenance block");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Add Bed in Hostel Dorm
  const handleAddBedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedManagerRoom || !newBedData.bed_label.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await createBed({
        property_id: activeProperty.id,
        room_id: bedManagerRoom.id,
        bed_label: newBedData.bed_label.trim(),
        bed_type: newBedData.bed_type,
        locker_number: newBedData.locker_number || undefined,
        operational_status: "available",
      });

      if (res.success && res.data) {
        setActionSuccess(`Bed '${newBedData.bed_label}' added to room ${bedManagerRoom.room_number}.`);
        setNewBedData({ bed_label: "", bed_type: "bunk_bottom", locker_number: "" });
        // Refresh local room's beds
        const updatedBedsRes = await fetchBeds(activeProperty.id, bedManagerRoom.id);
        if (updatedBedsRes.success && updatedBedsRes.data) {
          setBedManagerRoom({ ...bedManagerRoom, beds: updatedBedsRes.data });
        }
        await loadInventory();
      } else {
        setError(res.error?.message || "Failed to add bed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding bed");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Bed Status Change
  const handleBedStatusUpdate = async (bedId: string, status: RoomOperationalStatus) => {
    if (!bedManagerRoom) return;
    try {
      const res = await updateBedStatus(bedId, status);
      if (res.success) {
        setActionSuccess(`Bed status updated to ${status}.`);
        const updatedBedsRes = await fetchBeds(activeProperty.id, bedManagerRoom.id);
        if (updatedBedsRes.success && updatedBedsRes.data) {
          setBedManagerRoom({ ...bedManagerRoom, beds: updatedBedsRes.data });
        }
        await loadInventory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating bed status");
    }
  };

  // Handle Safe Deactivation
  const handleDeleteRoom = async (roomId: string, roomNumber: string) => {
    if (!window.confirm(`Are you sure you want to safely deactivate Room ${roomNumber}? This verifies no active future allocations exist.`)) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await deleteRoom(roomId);
      if (res.success) {
        setActionSuccess(`Room ${roomNumber} deactivated safely.`);
        await loadInventory();
      } else {
        setError(res.error?.message || "Failed to deactivate room.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error deactivating room");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (roomTypeFilter !== "all" && r.room_type_id !== roomTypeFilter) {
        return false;
      }
      if (statusFilter !== "all" && r.operational_status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.room_number.toLowerCase().includes(q) ||
          (r.room_type_name && r.room_type_name.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [rooms, roomTypeFilter, statusFilter, searchQuery]);

  // Selected room type for create modal
  const selectedCreateRt = roomTypes.find((r) => r.id === createFormData.room_type_id);

  if (!isAllowed) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300 space-y-3">
          <div className="flex items-center gap-3 text-lg font-bold">
            <AlertCircle className="w-6 h-6 text-rose-400" />
            <span>Property Scope Isolated</span>
          </div>
          <p className="text-sm">
            Your authenticated account ({user.email}, role: {user.role}) is not assigned to{" "}
            <span className="font-semibold">{activeProperty.name}</span> ({activeProperty.code}).
            Cross-tenant inventory data is strictly isolated by property boundaries.
          </p>
          <p className="text-xs text-rose-400">
            Please switch to an assigned property in the top bar or sign in as platform administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Context Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Rooms, Beds & Physical Inventory</span>
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
            {activeProperty.name}
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            {activeProperty.property_type === "hostel"
              ? "Hostel Bed-Level Inventory & Dormitory Allocation"
              : activeProperty.property_type === "hotel"
              ? "Hotel Room Suite Inventory & Physical Unit Management"
              : "Hybrid Hostel & Hotel Dual-Tier Inventory"} • {activeProperty.city}, {activeProperty.country}
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "overview"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Summary & KPIs</span>
          </button>
          <button
            onClick={() => setActiveTab("rooms")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "rooms"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>Rooms & Beds ({rooms.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "calendar"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Calendar View</span>
          </button>
        </div>
      </div>

      {/* Global Notifications */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: INVENTORY TELEMETRY & OCCUPANCY BREAKDOWN                          */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key Metric Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Total Active Rooms</span>
                <Hotel className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-bold text-zinc-100">{summary?.total_active_rooms ?? rooms.length}</p>
              <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                <span className="text-emerald-400 font-semibold">{summary?.rooms_available ?? 0} ready</span>
                <span>•</span>
                <span className="text-amber-400 font-semibold">{summary?.rooms_maintenance ?? 0} maint</span>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Total Physical Beds</span>
                <Bed className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-zinc-100">
                {activeProperty.property_type === "hotel" ? "N/A (Suites)" : (summary?.total_active_beds ?? 0)}
              </p>
              <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                <span className="text-emerald-400 font-semibold">{summary?.beds_available ?? 0} ready</span>
                <span>•</span>
                <span className="text-indigo-400 font-semibold">{summary?.beds_occupied ?? 0} reserved</span>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Occupancy Rate</span>
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-zinc-100">{summary?.occupancy_rate_percentage ?? 0}%</p>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, summary?.occupancy_rate_percentage ?? 0)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center justify-between text-zinc-400 text-xs">
                <span>Turnover Semantic</span>
                <Clock className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-100">[In, Out) Half-Open</p>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Check-in inclusive, check-out exclusive. Safe same-day turnover verified.
              </p>
            </div>
          </div>

          {/* Room Types Catalog Section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">Configured Accommodation Tiers</h3>
                <p className="text-xs text-zinc-400">
                  {roomTypes.length} active room types defined for {activeProperty.name}
                </p>
              </div>
              {isManager && (
                <button
                  onClick={() => setIsCreateRoomOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Room Unit</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roomTypes.map((rt) => {
                const matchedRooms = rooms.filter((r) => r.room_type_id === rt.id);
                const bedCount = matchedRooms.reduce((acc, r) => acc + (r.beds?.length || 0), 0);

                return (
                  <div
                    key={rt.id}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              rt.is_dormitory
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            }`}
                          >
                            {rt.accommodation_tier.replace("_", " ")}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-500">{rt.code}</span>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 mt-1">{rt.name}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-indigo-400">
                          {activeProperty.currency} {rt.base_price_amount}
                        </span>
                        <span className="text-[10px] text-zinc-500 block">/ night</span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-2">{rt.description}</p>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                      <span>
                        Capacity: <strong className="text-zinc-200">{rt.max_capacity_adults} adults</strong>
                      </span>
                      <span>
                        {rt.is_dormitory ? (
                          <strong className="text-amber-300 font-semibold">{bedCount} beds in dorms</strong>
                        ) : (
                          <strong className="text-sky-300 font-semibold">{matchedRooms.length} private rooms</strong>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {rt.amenities.slice(0, 3).map((amenity) => (
                        <span key={amenity} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {amenity}
                        </span>
                      ))}
                      {rt.amenities.length > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                          +{rt.amenities.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: PHYSICAL ROOMS & BEDS TABLE                                       */}
      {/* ========================================================================= */}
      {activeTab === "rooms" && (
        <div className="space-y-4">
          {/* Action & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search room number or notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Room Type Filter */}
              <select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Room Types</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Statuses</option>
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">Maintenance</option>
                <option value="out_of_order">Out of Order</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadInventory}
                disabled={isLoading}
                className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Refresh Inventory"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>

              {isManager && (
                <button
                  onClick={() => setIsCreateRoomOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Room</span>
                </button>
              )}
            </div>
          </div>

          {/* Rooms Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400">
                    <th className="py-3 px-4 font-semibold">Room #</th>
                    <th className="py-3 px-4 font-semibold">Accommodation Type</th>
                    <th className="py-3 px-4 font-semibold">Floor / Wing</th>
                    <th className="py-3 px-4 font-semibold">Beds (Hostel) / Capacity</th>
                    <th className="py-3 px-4 font-semibold">Operational Status</th>
                    <th className="py-3 px-4 font-semibold">Cleanliness</th>
                    <th className="py-3 px-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500">
                        No rooms match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRooms.map((room) => {
                      const isDorm = room.is_dormitory;
                      const beds = room.beds || [];
                      const availBeds = beds.filter((b) => b.operational_status === "available").length;

                      return (
                        <tr key={room.id} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-zinc-100 font-mono text-sm">
                              {room.room_number}
                            </span>
                            {room.keycard_code && (
                              <span className="block text-[10px] text-zinc-500 font-mono">
                                {room.keycard_code}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span className="text-zinc-200 font-medium">{room.room_type_name}</span>
                            <span className="block text-[10px] text-zinc-500 uppercase">
                              {room.accommodation_tier?.replace("_", " ")}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-zinc-400">
                            {room.floor_name || "Standard Floor"}
                          </td>

                          <td className="py-3 px-4">
                            {isDorm ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  <Bed className="w-3 h-3" />
                                  <span>{beds.length} Beds ({availBeds} ready)</span>
                                </span>
                                <button
                                  onClick={() => setBedManagerRoom(room)}
                                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline block"
                                >
                                  Manage Bed Roster →
                                </button>
                              </div>
                            ) : (
                              <span className="text-zinc-300">
                                Max {room.capacity_adults ?? 2} Adults (Private Unit)
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                room.operational_status === "available"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : room.operational_status === "occupied"
                                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {room.operational_status.replace("_", " ")}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold ${
                                room.cleanliness_status === "clean" || room.cleanliness_status === "inspected"
                                  ? "bg-emerald-500/10 text-emerald-300"
                                  : "bg-amber-500/10 text-amber-300"
                              }`}
                            >
                              {room.cleanliness_status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => setInspectRoom(room)}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium"
                                title="Inspect Specs"
                              >
                                Specs
                              </button>

                              {isManager && (
                                <>
                                  <button
                                    onClick={() =>
                                      setMaintenanceTarget({
                                        type: "room",
                                        id: room.id,
                                        label: `Room ${room.room_number}`,
                                      })
                                    }
                                    className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-medium border border-amber-500/20"
                                    title="Block for Maintenance"
                                  >
                                    <Wrench className="w-3 h-3 inline mr-1" />
                                    Block
                                  </button>

                                  <button
                                    onClick={() => handleDeleteRoom(room.id, room.room_number)}
                                    className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium border border-rose-500/20"
                                    title="Deactivate Room"
                                  >
                                    Deactivate
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: INTERACTIVE AVAILABILITY CALENDAR MATRIX                          */}
      {/* ========================================================================= */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          {/* Calendar Window Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Live Availability Calendar Matrix</h3>
                <p className="text-xs text-zinc-400">
                  Daily operational status per physical room & hostel bed with inclusive check-in, exclusive check-out rules
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">From:</span>
                <input
                  type="date"
                  value={calStartDate}
                  onChange={(e) => setCalStartDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500"
                />
                <span className="text-zinc-500">To:</span>
                <input
                  type="date"
                  value={calEndDate}
                  onChange={(e) => setCalEndDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={loadCalendar}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Update Grid
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 px-2">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/40" />
              Available for Sale
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-indigo-500/30 border border-indigo-500/50" />
              Reserved / In-Stay
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" />
              Maintenance Block
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-500/30 border border-rose-500/50" />
              Out of Order
            </span>
          </div>

          {/* Grid Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/70 text-zinc-400">
                    <th className="py-3 px-4 font-semibold sticky left-0 bg-zinc-900 z-10 min-w-[180px]">
                      Unit / Accom Tier
                    </th>
                    {calendarData?.rows[0]?.days.map((d) => {
                      const dateObj = new Date(d.date);
                      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                      const dayNum = dateObj.getDate();
                      return (
                        <th key={d.date} className="py-2.5 px-3 font-semibold text-center min-w-[70px]">
                          <span className="text-[10px] text-zinc-500 block uppercase">{dayName}</span>
                          <span className="text-xs font-bold text-zinc-200">{dayNum}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {calendarData?.rows.map((row) => (
                    <tr key={row.unit_id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="py-2.5 px-4 sticky left-0 bg-zinc-950 z-10 border-r border-zinc-800">
                        <span className="font-bold text-zinc-200 font-mono block">
                          {row.identifier}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate block max-w-[150px]">
                          {row.room_type_name}
                        </span>
                      </td>

                      {row.days.map((day) => {
                        const isAvail = day.status === "available";
                        const isReserved = day.status === "reserved";
                        const isMaint = day.status === "maintenance";
                        const isBlocked = day.status === "blocked";

                        let cellBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                        let label = "Avail";

                        if (isReserved) {
                          cellBg = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
                          label = "Booked";
                        } else if (isMaint || isBlocked) {
                          cellBg = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                          label = "Maint";
                        }

                        return (
                          <td key={day.date} className="p-1.5 text-center">
                            <div
                              className={`py-1.5 px-1 rounded border text-[10px] font-semibold transition-all ${cellBg}`}
                              title={day.notes || `${row.identifier}: ${label} on ${day.date}`}
                            >
                              {label}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE PHYSICAL ROOM                                            */}
      {/* ========================================================================= */}
      {isCreateRoomOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-indigo-400">
                <DoorOpen className="w-5 h-5" />
                <h3 className="text-base font-bold text-zinc-100">Create Physical Room</h3>
              </div>
              <button
                onClick={() => setIsCreateRoomOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoomSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Accommodation Tier / Room Type *
                </label>
                <select
                  value={createFormData.room_type_id}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, room_type_id: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name} ({rt.code}) — {rt.accommodation_tier.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Room Number / ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 104, 201A, Suite 5"
                    value={createFormData.room_number}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, room_number: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Floor / Wing</label>
                  <input
                    type="text"
                    placeholder="e.g. Floor 1, North Wing"
                    value={createFormData.floor_name}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, floor_name: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* If Dormitory selected, show bed auto-provision options */}
              {selectedCreateRt?.is_dormitory && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <Bed className="w-4 h-4" />
                    <span>Hostel Dormitory Bed Auto-Configuration</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-snug">
                    This room type sells individual beds. The system will automatically provision bunk beds
                    with stable labels and locker identifiers.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">Number of Beds</label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={createFormData.initial_bed_count}
                        onChange={(e) =>
                          setCreateFormData({
                            ...createFormData,
                            initial_bed_count: Number(e.target.value),
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">Bed Label Prefix</label>
                      <input
                        type="text"
                        placeholder="e.g. Pod, Bed"
                        value={createFormData.initial_bed_prefix}
                        onChange={(e) =>
                          setCreateFormData({
                            ...createFormData,
                            initial_bed_prefix: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Keycard / Digital Access Code</label>
                <input
                  type="text"
                  placeholder="e.g. KC-104-V2"
                  value={createFormData.keycard_code}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, keycard_code: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Operational Notes</label>
                <textarea
                  rows={2}
                  placeholder="Internal notes regarding views, plumbing, or special features..."
                  value={createFormData.notes}
                  onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRoomOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2"
                >
                  {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: HOSTEL BED ROSTER MANAGER                                        */}
      {/* ========================================================================= */}
      {bedManagerRoom && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-amber-400">
                <Bed className="w-5 h-5" />
                <div>
                  <h3 className="text-base font-bold text-zinc-100">
                    Hostel Dormitory Bed Roster: Room {bedManagerRoom.room_number}
                  </h3>
                  <p className="text-xs text-zinc-400">{bedManagerRoom.room_type_name}</p>
                </div>
              </div>
              <button onClick={() => setBedManagerRoom(null)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Beds List */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Individual Beds ({bedManagerRoom.beds?.length || 0})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {(!bedManagerRoom.beds || bedManagerRoom.beds.length === 0) ? (
                  <p className="text-xs text-zinc-500 py-3 text-center">
                    No individual beds configured yet. Add one below.
                  </p>
                ) : (
                  bedManagerRoom.beds.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200 font-mono">{b.bed_label}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 capitalize">
                            {b.bed_type.replace("_", " ")}
                          </span>
                        </div>
                        {b.locker_number && (
                          <span className="text-[10px] text-zinc-500 block">Locker: {b.locker_number}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={b.operational_status}
                          onChange={(e) =>
                            handleBedStatusUpdate(b.id, e.target.value as RoomOperationalStatus)
                          }
                          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300"
                        >
                          <option value="available">Available</option>
                          <option value="occupied">Occupied</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="out_of_order">Out of Order</option>
                        </select>

                        <button
                          onClick={() =>
                            setMaintenanceTarget({
                              type: "bed",
                              id: b.id,
                              label: `${bedManagerRoom.room_number} • ${b.bed_label}`,
                            })
                          }
                          className="p-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                          title="Block Bed for Maintenance"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Bed Form */}
            {isManager && (
              <form
                onSubmit={handleAddBedSubmit}
                className="pt-4 border-t border-zinc-800 space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/60 text-xs"
              >
                <h4 className="text-xs font-semibold text-zinc-200">Add New Bed to Room</h4>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Bed Label (e.g. Pod 4 Lower)"
                    value={newBedData.bed_label}
                    onChange={(e) => setNewBedData({ ...newBedData, bed_label: e.target.value })}
                    className="bg-zinc-900 border border-zinc-800 rounded p-2 text-zinc-200 text-xs"
                  />
                  <select
                    value={newBedData.bed_type}
                    onChange={(e) => setNewBedData({ ...newBedData, bed_type: e.target.value })}
                    className="bg-zinc-900 border border-zinc-800 rounded p-2 text-zinc-200 text-xs"
                  >
                    <option value="bunk_bottom">Bunk Bottom</option>
                    <option value="bunk_top">Bunk Top</option>
                    <option value="standard_single">Standard Single</option>
                    <option value="double">Double</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Locker (optional)"
                    value={newBedData.locker_number}
                    onChange={(e) => setNewBedData({ ...newBedData, locker_number: e.target.value })}
                    className="bg-zinc-900 border border-zinc-800 rounded p-2 text-zinc-200 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors"
                >
                  Add Bed
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MAINTENANCE BLOCK DATE RANGE FORM                                */}
      {/* ========================================================================= */}
      {maintenanceTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-amber-400">
                <Wrench className="w-5 h-5" />
                <h3 className="text-base font-bold text-zinc-100">Maintenance Block</h3>
              </div>
              <button
                onClick={() => setMaintenanceTarget(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Lock <strong className="text-zinc-100">{maintenanceTarget.label}</strong> from guest allocation
              during maintenance or refurbishment. The system will prevent conflicting reservations.
            </p>

            <form onSubmit={handleMaintenanceBlockSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Start Date (Check-in)</label>
                  <input
                    type="date"
                    required
                    value={maintFormData.check_in_date}
                    onChange={(e) =>
                      setMaintFormData({ ...maintFormData, check_in_date: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">End Date (Check-out)</label>
                  <input
                    type="date"
                    required
                    value={maintFormData.check_out_date}
                    onChange={(e) =>
                      setMaintFormData({ ...maintFormData, check_out_date: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Maintenance Reason / Notes *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AC filter service, plumbing repair, repaint"
                  value={maintFormData.notes}
                  onChange={(e) => setMaintFormData({ ...maintFormData, notes: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMaintenanceTarget(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  Confirm Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: INSPECT ROOM SPECS DRAWER                                       */}
      {/* ========================================================================= */}
      {inspectRoom && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-indigo-400">
                <Info className="w-5 h-5" />
                <h3 className="text-base font-bold text-zinc-100">
                  Room {inspectRoom.room_number} Specifications
                </h3>
              </div>
              <button onClick={() => setInspectRoom(null)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Accommodation Type:</span>
                  <span className="font-semibold text-zinc-200">{inspectRoom.room_type_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tier:</span>
                  <span className="uppercase text-indigo-400 font-mono">
                    {inspectRoom.accommodation_tier?.replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Location:</span>
                  <span className="text-zinc-200">{inspectRoom.floor_name || "Floor 1"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Keycard Access:</span>
                  <span className="font-mono text-zinc-200">{inspectRoom.keycard_code || "Standard Key"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Operational Status:</span>
                  <span className="font-semibold text-emerald-400 capitalize">
                    {inspectRoom.operational_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Housekeeping:</span>
                  <span className="uppercase text-zinc-300 font-semibold">{inspectRoom.cleanliness_status}</span>
                </div>
              </div>

              {inspectRoom.notes && (
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <span className="text-[11px] text-zinc-500 block mb-1">Notes:</span>
                  <p className="text-zinc-300">{inspectRoom.notes}</p>
                </div>
              )}

              {inspectRoom.is_dormitory && inspectRoom.beds && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 mb-1.5">Beds in Dormitory:</h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {inspectRoom.beds.map((b) => (
                      <div
                        key={b.id}
                        className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] flex items-center justify-between"
                      >
                        <span className="font-mono text-zinc-200">{b.bed_label}</span>
                        <span className="text-[10px] text-emerald-400">{b.operational_status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setInspectRoom(null)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
