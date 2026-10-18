import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Hotel,
  Users,
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Search,
  Plus,
  LogOut,
  LogIn,
  RefreshCw,
  FileText,
  X,
  Building2,
  Phone,
  Mail,
  AlertTriangle,
  Lock,
  UserCheck,
  UserX,
  Edit2,
  Check,
  Sparkles,
  Star,
  DoorOpen,
  ArrowRightLeft,
  Crown,
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  fetchHotelDashboard,
  fetchHotelFrontDesk,
  fetchHotelStays,
  fetchHotelGuests,
  createHotelGuest,
  updateHotelGuest,
  deactivateHotelGuest,
  checkInHotelStay,
  checkOutHotelStay,
  assignHotelRoom,
  changeHotelRoom,
  extendHotelStay,
  cancelHotelStay,
  registerWalkInHotelStay,
  fetchRooms,
  fetchRoomTypes,
} from "@/src/services/api-client";
import type {
  HotelGuestProfile,
  HotelStay,
  HotelFrontDeskQueue,
  HotelOperationalSummary,
  CreateHotelGuestInput,
  WalkInHotelStayInput,
  VipTier,
} from "@/src/types/hotel";
import type { Room, RoomType } from "@/src/types/inventory";
import { formatCurrency } from "@/src/lib/utils";

type HotelSubTab = "queue" | "stays" | "guests" | "rooms" | "specs";

export const HotelWorkflowCard: React.FC = () => {
  const { activeProperty, properties, setActivePropertyId } = useProperty();
  const { canAccessProperty } = useAuth();
  const isHotel =
    activeProperty.property_type === "hotel" || activeProperty.property_type === "hybrid";
  const hasAccess = canAccessProperty(activeProperty.id);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<HotelSubTab>("queue");

  // Live Data states
  const [frontDesk, setFrontDesk] = useState<HotelFrontDeskQueue | null>(null);
  const [summary, setSummary] = useState<HotelOperationalSummary | null>(null);
  const [stays, setStays] = useState<HotelStay[]>([]);
  const [guests, setGuests] = useState<HotelGuestProfile[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Filters
  const [staysSearchQuery, setStaysSearchQuery] = useState("");
  const [staysStatusFilter, setStaysStatusFilter] = useState("all");
  const [guestSearchQuery, setGuestSearchQuery] = useState("");
  const [guestStatusFilter, setGuestStatusFilter] = useState("all");

  // Helper for guest name
  const getStayGuestName = useCallback((stay: HotelStay) => {
    if (stay.guest) {
      return `${stay.guest.first_name} ${stay.guest.last_name}`;
    }
    return stay.guest_name || "Registered Hotel Guest";
  }, []);

  // Modals state
  const [checkInStay, setCheckInStay] = useState<HotelStay | null>(null);
  const [checkInKeycard, setCheckInKeycard] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInOccupantName, setCheckInOccupantName] = useState("");
  const [checkInOccupantRel, setCheckInOccupantRel] = useState("");

  const [checkOutStay, setCheckOutStay] = useState<HotelStay | null>(null);
  const [checkOutRoomInspected, setCheckOutRoomInspected] = useState(true);
  const [checkOutMinibarCleared, setCheckOutMinibarCleared] = useState(true);
  const [checkOutNotes, setCheckOutNotes] = useState("");

  const [changeRoomStay, setChangeRoomStay] = useState<HotelStay | null>(null);
  const [changeNewRoomId, setChangeNewRoomId] = useState("");
  const [changeReason, setChangeReason] = useState("");

  const [assignRoomStay, setAssignRoomStay] = useState<HotelStay | null>(null);
  const [assignTargetRoomId, setAssignTargetRoomId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");

  const [extendStay, setExtendStay] = useState<HotelStay | null>(null);
  const [extendNewDate, setExtendNewDate] = useState("");
  const [extendNotes, setExtendNotes] = useState("");

  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    nationality: string;
    vip_tier: VipTier;
    room_id: string;
    check_in_date: string;
    check_out_date: string;
    nightly_rate: number;
    special_requests: string;
    keycard_code: string;
    immediate_check_in: boolean;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    nationality: "United Kingdom",
    vip_tier: "standard",
    room_id: "",
    check_in_date: new Date().toISOString().split("T")[0],
    check_out_date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
    nightly_rate: 280.0,
    special_requests: "Executive walk-in guest registered at concierge.",
    keycard_code: "",
    immediate_check_in: true,
  });

  const [showNewGuestModal, setShowNewGuestModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<HotelGuestProfile | null>(null);
  const [guestForm, setGuestForm] = useState<CreateHotelGuestInput>({
    property_id: activeProperty.id,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    nationality: "",
    vip_tier: "standard",
    special_preferences: "",
    address: "",
    city: "",
    country: "",
    notes: "",
  });

  const [selectedStayForAudit, setSelectedStayForAudit] = useState<HotelStay | null>(null);

  // Load live data
  const loadHotelData = useCallback(async () => {
    if (!hasAccess) return;
    setIsLoading(true);
    try {
      const [fdRes, sumRes, staysRes, guestsRes, roomsRes, rtRes] = await Promise.all([
        fetchHotelFrontDesk(activeProperty.id),
        fetchHotelDashboard(activeProperty.id),
        fetchHotelStays(activeProperty.id),
        fetchHotelGuests(activeProperty.id),
        fetchRooms({ property_id: activeProperty.id }),
        fetchRoomTypes(activeProperty.id),
      ]);

      if (fdRes.success && fdRes.data) setFrontDesk(fdRes.data);
      if (sumRes.success && sumRes.data) setSummary(sumRes.data);
      if (staysRes.success && staysRes.data) setStays(staysRes.data);
      if (guestsRes.success && guestsRes.data) setGuests(guestsRes.data);
      if (roomsRes.success && roomsRes.data) setAllRooms(roomsRes.data);
      if (rtRes.success && rtRes.data) setRoomTypes(rtRes.data);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to load hotel operations data." });
    } finally {
      setIsLoading(false);
    }
  }, [activeProperty.id, hasAccess]);

  useEffect(() => {
    loadHotelData();
  }, [loadHotelData]);

  // Clear feedback after 4s
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Filtered stays
  const filteredStays = useMemo(() => {
    return stays.filter((stay) => {
      const matchesStatus =
        staysStatusFilter === "all" ? true : stay.status === staysStatusFilter;
      const q = staysSearchQuery.toLowerCase();
      const gName = getStayGuestName(stay).toLowerCase();
      const rNum = (stay.room_number || "").toLowerCase();
      const matchesSearch =
        !q ||
        stay.stay_reference.toLowerCase().includes(q) ||
        gName.includes(q) ||
        rNum.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [stays, staysSearchQuery, staysStatusFilter, getStayGuestName]);

  // Filtered guests
  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      const matchesStatus =
        guestStatusFilter === "all" ? true : g.status === guestStatusFilter;
      const q = guestSearchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
        (g.email && g.email.toLowerCase().includes(q)) ||
        (g.phone && g.phone.toLowerCase().includes(q)) ||
        (g.nationality && g.nationality.toLowerCase().includes(q)) ||
        g.vip_tier.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [guests, guestSearchQuery, guestStatusFilter]);

  // Handle Check-In
  const handleExecuteCheckIn = async () => {
    if (!checkInStay) return;
    try {
      const additional = checkInOccupantName
        ? [{ name: checkInOccupantName, relationship: checkInOccupantRel || "Guest" }]
        : undefined;

      const res = await checkInHotelStay(checkInStay.id, {
        keycard_code: checkInKeycard || undefined,
        staff_notes: checkInNotes || undefined,
        additional_occupants: additional,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Checked in ${getStayGuestName(checkInStay)} to Suite ${checkInStay.room_number || ""}.`,
        });
        setCheckInStay(null);
        await loadHotelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Check-in failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to execute hotel check-in." });
    }
  };

  // Handle Check-Out
  const handleExecuteCheckOut = async () => {
    if (!checkOutStay) return;
    try {
      const res = await checkOutHotelStay(checkOutStay.id, {
        staff_notes: checkOutNotes || undefined,
        room_inspected: checkOutRoomInspected,
        minibar_consumed: checkOutMinibarCleared,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Checked out ${getStayGuestName(checkOutStay)}. Suite ${checkOutStay.room_number || ""} marked dirty for housekeeping.`,
        });
        setCheckOutStay(null);
        await loadHotelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Check-out failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to execute hotel check-out." });
    }
  };

  // Handle Room Change (Reassignment)
  const handleExecuteRoomChange = async () => {
    if (!changeRoomStay || !changeNewRoomId) return;
    try {
      const res = await changeHotelRoom(changeRoomStay.id, {
        new_room_id: changeNewRoomId,
        reason: changeReason || "Guest suite relocation requested.",
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Room changed successfully to Suite ${res.data.room_number}.`,
        });
        setChangeRoomStay(null);
        await loadHotelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Room change failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to change room." });
    }
  };

  // Handle Physical Room Assignment
  const handleExecuteAssignRoom = async () => {
    if (!assignRoomStay || !assignTargetRoomId) return;
    try {
      const res = await assignHotelRoom(assignRoomStay.id, {
        room_id: assignTargetRoomId,
        notes: assignNotes || undefined,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Assigned physical Suite ${res.data.room_number} to reservation ${res.data.stay_reference}.`,
        });
        setAssignRoomStay(null);
        await loadHotelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Room assignment failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to assign room." });
    }
  };

  // Handle Stay Extension
  const handleExecuteExtension = async () => {
    if (!extendStay || !extendNewDate) return;
    try {
      const res = await extendHotelStay(extendStay.id, {
        new_check_out_date: extendNewDate,
        notes: extendNotes || undefined,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: `Stay extended to ${extendNewDate} for ${getStayGuestName(extendStay)}. Total: ${formatCurrency(res.data.total_amount, res.data.currency)}.`,
        });
        setExtendStay(null);
        await loadHotelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Extension failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to extend hotel stay." });
    }
  };

  // Handle Walk-In Registration
  const handleExecuteWalkIn = async () => {
    if (!walkInForm.first_name || !walkInForm.last_name || !walkInForm.room_id) {
      setFeedback({ type: "error", message: "Please enter first name, last name, and select a room suite." });
      return;
    }
    try {
      const payload: WalkInHotelStayInput = {
        property_id: activeProperty.id,
        first_name: walkInForm.first_name,
        last_name: walkInForm.last_name,
        email: walkInForm.email || undefined,
        phone: walkInForm.phone || undefined,
        nationality: walkInForm.nationality || undefined,
        vip_tier: walkInForm.vip_tier,
        room_id: walkInForm.room_id,
        check_in_date: walkInForm.check_in_date,
        check_out_date: walkInForm.check_out_date,
        nightly_rate: walkInForm.nightly_rate,
        special_requests: walkInForm.special_requests,
        keycard_code: walkInForm.keycard_code || undefined,
        immediate_check_in: walkInForm.immediate_check_in,
      };

      const res = await registerWalkInHotelStay(payload);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Walk-in guest ${getStayGuestName(res.data)} checked in to Suite ${res.data.room_number}.`,
        });
        setShowWalkInModal(false);
        await loadHotelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Walk-in registration failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to register walk-in." });
    }
  };

  // Handle Save Hotel Guest
  const handleSaveGuest = async () => {
    if (!guestForm.first_name || !guestForm.last_name) {
      setFeedback({ type: "error", message: "First name and last name are required." });
      return;
    }
    try {
      if (editingGuest) {
        const res = await updateHotelGuest(editingGuest.id, {
          first_name: guestForm.first_name,
          last_name: guestForm.last_name,
          email: guestForm.email,
          phone: guestForm.phone,
          nationality: guestForm.nationality,
          vip_tier: guestForm.vip_tier,
          special_preferences: guestForm.special_preferences,
          address: guestForm.address,
          city: guestForm.city,
          country: guestForm.country,
          notes: guestForm.notes,
        });
        if (res.success) {
          setFeedback({ type: "success", message: "Guest profile updated successfully." });
          setShowNewGuestModal(false);
          setEditingGuest(null);
          await loadHotelData();
        } else {
          setFeedback({ type: "error", message: res.error?.message || "Failed to update guest profile." });
        }
      } else {
        const res = await createHotelGuest({
          ...guestForm,
          property_id: activeProperty.id,
        });
        if (res.success) {
          setFeedback({ type: "success", message: `Guest ${res.data.first_name} registered.` });
          setShowNewGuestModal(false);
          await loadHotelData();
        } else {
          setFeedback({ type: "error", message: res.error?.message || "Failed to create guest." });
        }
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to save guest profile." });
    }
  };

  // Helper to switch to London Mayfair Hotel
  const hotelProperty = properties.find((p) => p.property_type === "hotel" || p.property_type === "hybrid");

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs transition-all ${
            feedback.type === "success"
              ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/60 border-rose-500/40 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Hotel className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-100">Hotel Front Desk & Operations</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Phase 8 Operational Center
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Active Property: <span className="text-zinc-200 font-semibold">{activeProperty.name}</span> ({activeProperty.property_type.toUpperCase()}) • {activeProperty.total_rooms} Private Suites
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadHotelData()}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-2 border border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          {isHotel && (
            <button
              onClick={() => setShowWalkInModal(true)}
              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Walk-in Check-in</span>
            </button>
          )}
        </div>
      </div>

      {/* Non-Hotel Property Warning */}
      {!isHotel && (
        <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-sky-400" />
            <div>
              <p className="font-semibold text-zinc-100">
                Currently Viewing a Hostel Property ({activeProperty.name})
              </p>
              <p className="text-zinc-400 text-[11px] mt-0.5">
                Hotel Operations manage private suites, room changes, VIP guest profiles, and turndown services.
                Switch to GrandStay Mayfair Grand Hotel to inspect live hotel folios.
              </p>
            </div>
          </div>
          {hotelProperty && (
            <button
              onClick={() => setActivePropertyId(hotelProperty.id)}
              className="px-3 py-1.5 rounded-lg bg-sky-500 text-zinc-950 font-bold hover:bg-sky-400 text-xs flex items-center gap-1.5 shrink-0 shadow"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Switch to {hotelProperty.name}</span>
            </button>
          )}
        </div>
      )}

      {/* Access Denied Warning */}
      {!hasAccess && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>You do not have staff permissions for this property. Hotel operations are restricted.</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-px">
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "queue"
              ? "border-sky-500 text-sky-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Front Desk Queue</span>
          {frontDesk && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/20 text-sky-300 font-mono">
              {frontDesk.today_arrivals.length + frontDesk.today_departures.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("stays")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "stays"
              ? "border-sky-500 text-sky-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Reservations & Stays</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
            {stays.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("guests")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "guests"
              ? "border-sky-500 text-sky-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Guest Directory</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
            {guests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("rooms")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "rooms"
              ? "border-sky-500 text-sky-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <DoorOpen className="w-4 h-4" />
          <span>Room Matrix</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
            {allRooms.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("specs")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "specs"
              ? "border-sky-500 text-sky-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Hotel SOPs & Standards</span>
        </button>
      </div>

      {/* TAB 1: FRONT DESK QUEUE */}
      {activeTab === "queue" && (
        <div className="space-y-6">
          {/* Key Metrics Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Today's Arrivals</span>
                <LogIn className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-zinc-100 mt-1">
                {frontDesk?.today_arrivals.length ?? 0}
              </div>
              <div className="text-[10px] text-emerald-400 mt-0.5">Pending check-in</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Departures</span>
                <LogOut className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-zinc-100 mt-1">
                {frontDesk?.today_departures.length ?? 0}
              </div>
              <div className="text-[10px] text-amber-400 mt-0.5">Scheduled checkout</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>In-House Guests</span>
                <Users className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="text-xl font-bold text-zinc-100 mt-1">
                {frontDesk?.in_house_guests.length ?? 0}
              </div>
              <div className="text-[10px] text-sky-400 mt-0.5">Active hotel stays</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Overdue Checkouts</span>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-bold text-rose-400 mt-1">
                {frontDesk?.overdue_departures.length ?? 0}
              </div>
              <div className="text-[10px] text-rose-400/80 mt-0.5">Action required</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Available Suites</span>
                <DoorOpen className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="text-xl font-bold text-teal-300 mt-1">
                {frontDesk?.available_rooms_count ?? 0}
              </div>
              <div className="text-[10px] text-teal-400 mt-0.5">Vacant & ready</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Maintenance</span>
                <Lock className="w-3.5 h-3.5 text-zinc-500" />
              </div>
              <div className="text-xl font-bold text-zinc-300 mt-1">
                {frontDesk?.maintenance_rooms_count ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Blocked suites</div>
            </div>
          </div>

          {/* Overdue Alert Banner */}
          {frontDesk && frontDesk.overdue_departures.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Overdue Hotel Checkouts Detected ({frontDesk.overdue_departures.length})</span>
              </div>
              <p className="text-zinc-400 text-[11px] mt-1">
                The following hotel guests have passed their scheduled check-out date but remain active in room inventory.
              </p>
              <div className="mt-2 space-y-1.5">
                {frontDesk.overdue_departures.map((stay) => (
                  <div
                    key={stay.id}
                    className="flex items-center justify-between bg-zinc-900/80 p-2 rounded-lg border border-rose-500/20"
                  >
                    <div>
                      <span className="font-semibold text-zinc-100">{getStayGuestName(stay)}</span>{" "}
                      <span className="text-zinc-500">
                        (Suite {stay.room_number || "Unassigned"} • {stay.room_type_name})
                      </span>{" "}
                      — Scheduled Out:{" "}
                      <span className="font-mono text-rose-400">{stay.check_out_date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setExtendStay(stay);
                          setExtendNewDate(new Date(Date.now() + 86400000).toISOString().split("T")[0]);
                        }}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px]"
                      >
                        Extend Stay
                      </button>
                      <button
                        onClick={() => {
                          setCheckOutStay(stay);
                          setCheckOutRoomInspected(true);
                          setCheckOutMinibarCleared(true);
                        }}
                        className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold"
                      >
                        Check Out
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unassigned Reservations Banner */}
          {frontDesk && frontDesk.unassigned_stays.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Unassigned Physical Rooms ({frontDesk.unassigned_stays.length})</span>
              </div>
              <p className="text-zinc-400 text-[11px] mt-1">
                These confirmed reservations have a room category booked but require a physical room assignment prior to guest check-in.
              </p>
              <div className="mt-2 space-y-1.5">
                {frontDesk.unassigned_stays.map((stay) => (
                  <div
                    key={stay.id}
                    className="flex items-center justify-between bg-zinc-900/80 p-2 rounded-lg border border-amber-500/20"
                  >
                    <div>
                      <span className="font-semibold text-zinc-100">{getStayGuestName(stay)}</span>{" "}
                      <span className="text-zinc-400">({stay.room_type_name})</span> — Check-in:{" "}
                      <span className="font-mono text-amber-300">{stay.check_in_date}</span>
                    </div>
                    <button
                      onClick={() => {
                        setAssignRoomStay(stay);
                        setAssignTargetRoomId("");
                        setAssignNotes("");
                      }}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold flex items-center gap-1"
                    >
                      <DoorOpen className="w-3.5 h-3.5" />
                      <span>Assign Physical Suite</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Arrivals Section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogIn className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  Today's Expected Arrivals ({frontDesk?.today_arrivals.length ?? 0})
                </h3>
              </div>
              <span className="text-[11px] text-zinc-500">
                Front desk check-in queue
              </span>
            </div>

            {frontDesk && frontDesk.today_arrivals.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No pending hotel arrivals scheduled for today.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {frontDesk?.today_arrivals.map((stay) => (
                  <div
                    key={stay.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-sm">
                          {getStayGuestName(stay)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                          {stay.stay_reference}
                        </span>
                        {stay.guest?.vip_tier && stay.guest.vip_tier !== "standard" && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Crown className="w-3 h-3 text-amber-400" />
                            {stay.guest.vip_tier}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
                        <span>
                          Suite:{" "}
                          <strong className={stay.assigned_room_id ? "text-sky-300" : "text-amber-400"}>
                            {stay.room_number || "Unassigned"}
                          </strong>{" "}
                          ({stay.room_type_name})
                        </span>
                        <span>•</span>
                        <span>
                          Dates: {stay.check_in_date} → {stay.check_out_date} ({stay.total_nights} nights)
                        </span>
                        <span>•</span>
                        <span>
                          Total: {formatCurrency(stay.total_amount, stay.currency)}
                        </span>
                      </div>
                      {stay.special_requests && (
                        <div className="text-[11px] text-zinc-400 mt-1 italic">
                          "{stay.special_requests}"
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedStayForAudit(stay)}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                      >
                        Details
                      </button>
                      {!stay.assigned_room_id && (
                        <button
                          onClick={() => {
                            setAssignRoomStay(stay);
                            setAssignTargetRoomId("");
                            setAssignNotes("");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-semibold"
                        >
                          Assign Room
                        </button>
                      )}
                      {stay.assigned_room_id && (
                        <button
                          onClick={() => {
                            setChangeRoomStay(stay);
                            setChangeNewRoomId("");
                            setChangeReason("");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                        >
                          Change Room
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setCheckInStay(stay);
                          setCheckInKeycard(stay.keycard_code || `KC-LON-${stay.room_number || "101"}`);
                          setCheckInNotes("");
                          setCheckInOccupantName("");
                          setCheckInOccupantRel("");
                        }}
                        disabled={!stay.assigned_room_id}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 shadow"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Check In</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Departures Section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogOut className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  Today's Scheduled Departures ({frontDesk?.today_departures.length ?? 0})
                </h3>
              </div>
            </div>

            {frontDesk && frontDesk.today_departures.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No scheduled hotel checkouts remaining for today.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {frontDesk?.today_departures.map((stay) => (
                  <div
                    key={stay.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100 text-sm">
                          {getStayGuestName(stay)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                          {stay.stay_reference}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
                        <span>
                          Suite: <strong className="text-sky-300">{stay.room_number || "—"}</strong> ({stay.room_type_name})
                        </span>
                        <span>•</span>
                        <span>
                          Keycard: <span className="font-mono text-zinc-300">{stay.keycard_code || "None"}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Total: {formatCurrency(stay.total_amount, stay.currency)} ({stay.total_nights} nights)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setExtendStay(stay);
                          setExtendNewDate(new Date(Date.now() + 86400000).toISOString().split("T")[0]);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                      >
                        Extend Stay
                      </button>
                      <button
                        onClick={() => {
                          setCheckOutStay(stay);
                          setCheckOutRoomInspected(true);
                          setCheckOutMinibarCleared(true);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Check Out</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* In-House Guests Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  Currently In-House Hotel Guests ({frontDesk?.in_house_guests.length ?? 0})
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/70 text-[11px] font-semibold text-zinc-400">
                    <th className="py-2.5 px-4">Guest</th>
                    <th className="py-2.5 px-4">Room Suite</th>
                    <th className="py-2.5 px-4">Keycard</th>
                    <th className="py-2.5 px-4">Check-In Time</th>
                    <th className="py-2.5 px-4">Check-Out Date</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {frontDesk && frontDesk.in_house_guests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        No hotel guests currently checked in.
                      </td>
                    </tr>
                  ) : (
                    frontDesk?.in_house_guests.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                            <span>{getStayGuestName(s)}</span>
                            {s.guest?.vip_tier && s.guest.vip_tier !== "standard" && (
                              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                                {s.guest.vip_tier}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">{s.stay_reference}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-zinc-200 font-medium">Suite {s.room_number || "—"}</div>
                          <div className="text-sky-400 text-[11px]">{s.room_type_name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          {s.keycard_code || "—"}
                        </td>
                        <td className="py-3 px-4 text-zinc-400">
                          {s.actual_check_in_time ? new Date(s.actual_check_in_time).toLocaleString() : s.check_in_date}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-200">
                          {s.check_out_date}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedStayForAudit(s)}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                            >
                              Audit
                            </button>
                            <button
                              onClick={() => {
                                setChangeRoomStay(s);
                                setChangeNewRoomId("");
                                setChangeReason("");
                              }}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                            >
                              Relocate
                            </button>
                            <button
                              onClick={() => {
                                setExtendStay(s);
                                setExtendNewDate(new Date(new Date(s.check_out_date).getTime() + 86400000).toISOString().split("T")[0]);
                              }}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                            >
                              Extend
                            </button>
                            <button
                              onClick={() => {
                                setCheckOutStay(s);
                                setCheckOutRoomInspected(true);
                                setCheckOutMinibarCleared(true);
                              }}
                              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px]"
                            >
                              Check Out
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RESERVATIONS & STAYS DIRECTORY */}
      {activeTab === "stays" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search reference, guest name, suite..."
                  value={staysSearchQuery}
                  onChange={(e) => setStaysSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={staysStatusFilter}
                onChange={(e) => setStaysStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Stay Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="reserved">Reserved</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              onClick={() => setShowWalkInModal(true)}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Stay / Walk-in</span>
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/70 text-[11px] font-semibold text-zinc-400">
                    <th className="py-2.5 px-4">Stay Reference</th>
                    <th className="py-2.5 px-4">Guest</th>
                    <th className="py-2.5 px-4">Room Category</th>
                    <th className="py-2.5 px-4">Assigned Suite</th>
                    <th className="py-2.5 px-4">Stay Dates</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Total</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredStays.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-500">
                        No hotel reservations found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStays.map((stay) => (
                      <tr key={stay.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-sky-400">
                          {stay.stay_reference}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                            <span>{getStayGuestName(stay)}</span>
                            {stay.guest?.vip_tier && stay.guest.vip_tier !== "standard" && (
                              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                                {stay.guest.vip_tier}
                              </span>
                            )}
                          </div>
                          {stay.special_requests && (
                            <div className="text-[10px] text-zinc-500 truncate max-w-xs">
                              {stay.special_requests}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-300 font-medium">
                          {stay.room_type_name}
                        </td>
                        <td className="py-3 px-4">
                          {stay.assigned_room_id ? (
                            <span className="font-semibold text-sky-300">
                              Suite {stay.room_number}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <div>{stay.check_in_date} → {stay.check_out_date}</div>
                          <div className="text-zinc-500">{stay.total_nights} nights</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              stay.status === "checked_in"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : stay.status === "confirmed" || stay.status === "reserved"
                                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                                : stay.status === "checked_out"
                                ? "bg-zinc-800 text-zinc-400"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            {stay.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {formatCurrency(stay.total_amount, stay.currency)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedStayForAudit(stay)}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                            >
                              Audit
                            </button>

                            {!stay.assigned_room_id && (
                              <button
                                onClick={() => {
                                  setAssignRoomStay(stay);
                                  setAssignTargetRoomId("");
                                  setAssignNotes("");
                                }}
                                className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px]"
                              >
                                Assign
                              </button>
                            )}

                            {(stay.status === "confirmed" || stay.status === "reserved") && stay.assigned_room_id && (
                              <button
                                onClick={() => {
                                  setCheckInStay(stay);
                                  setCheckInKeycard(stay.keycard_code || `KC-LON-${stay.room_number}`);
                                  setCheckInNotes("");
                                }}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px]"
                              >
                                Check In
                              </button>
                            )}

                            {stay.status === "checked_in" && (
                              <button
                                onClick={() => {
                                  setCheckOutStay(stay);
                                  setCheckOutRoomInspected(true);
                                  setCheckOutMinibarCleared(true);
                                }}
                                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px]"
                              >
                                Check Out
                              </button>
                            )}

                            {stay.assigned_room_id && (stay.status === "confirmed" || stay.status === "checked_in") && (
                              <button
                                onClick={() => {
                                  setChangeRoomStay(stay);
                                  setChangeNewRoomId("");
                                  setChangeReason("");
                                }}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                              >
                                Relocate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HOTEL GUEST DIRECTORY */}
      {activeTab === "guests" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search guest name, email, VIP, phone..."
                  value={guestSearchQuery}
                  onChange={(e) => setGuestSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={guestStatusFilter}
                onChange={(e) => setGuestStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500"
              >
                <option value="all">All Guest Statuses</option>
                <option value="active">Active</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <button
              onClick={() => {
                setEditingGuest(null);
                setGuestForm({
                  property_id: activeProperty.id,
                  first_name: "",
                  last_name: "",
                  email: "",
                  phone: "",
                  nationality: "",
                  vip_tier: "standard",
                  special_preferences: "",
                  address: "",
                  city: "",
                  country: "",
                  notes: "",
                });
                setShowNewGuestModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Hotel Guest</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredGuests.map((g) => (
              <div
                key={g.id}
                className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-100 text-sm flex items-center gap-1.5">
                      <span>{g.first_name} {g.last_name}</span>
                      {g.vip_tier !== "standard" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5 text-amber-400" />
                          {g.vip_tier}
                        </span>
                      )}
                    </h4>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {g.nationality || "Nationality unspecified"} • {g.city ? `${g.city}, ` : ""}{g.country || ""}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      g.status === "checked_in"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : g.status === "active"
                        ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {g.status.replace("_", " ")}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-zinc-300">
                  {g.email && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                      <span className="truncate">{g.email}</span>
                    </div>
                  )}
                  {g.phone && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                      <span>{g.phone}</span>
                    </div>
                  )}
                  {g.special_preferences && (
                    <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                      <span className="text-zinc-500">Preferences:</span> {g.special_preferences}
                    </div>
                  )}
                  {g.notes && (
                    <p className="text-[11px] text-zinc-500 italic mt-1 line-clamp-2">"{g.notes}"</p>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">
                    ID: <code className="font-mono">{g.id}</code>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingGuest(g);
                        setGuestForm({
                          property_id: g.property_id,
                          first_name: g.first_name,
                          last_name: g.last_name,
                          email: g.email || "",
                          phone: g.phone || "",
                          nationality: g.nationality || "",
                          vip_tier: g.vip_tier,
                          special_preferences: g.special_preferences || "",
                          address: g.address || "",
                          city: g.city || "",
                          country: g.country || "",
                          notes: g.notes || "",
                        });
                        setShowNewGuestModal(true);
                      }}
                      className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                      title="Edit Guest Profile"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    {g.is_active && (
                      <button
                        onClick={async () => {
                          if (confirm(`Deactivate profile for ${g.first_name} ${g.last_name}?`)) {
                            await deactivateHotelGuest(g.id);
                            await loadHotelData();
                          }
                        }}
                        className="p-1.5 rounded bg-zinc-800 hover:bg-rose-900/50 text-zinc-400 hover:text-rose-300 text-xs"
                        title="Deactivate Profile"
                      >
                        <UserX className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ROOM MATRIX */}
      {activeTab === "rooms" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-zinc-200">Physical Suite Inventory ({allRooms.length} Suites)</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Whole-room allocation status, housekeeping cleanliness, and current occupancies.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allRooms.map((r) => {
              const activeStay = stays.find((s) => s.assigned_room_id === r.id && s.status === "checked_in");
              const rt = roomTypes.find((t) => t.id === r.room_type_id);

              return (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-colors space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-base text-zinc-100">Suite {r.room_number}</span>
                      <div className="text-[11px] text-sky-400 font-medium">{rt?.name || "Suite"}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        r.operational_status === "maintenance" || r.operational_status === "out_of_order"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : activeStay
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {activeStay ? "Occupied" : r.operational_status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-zinc-300">
                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span>Cleanliness:</span>
                      <span
                        className={`capitalize font-semibold ${
                          r.cleanliness_status === "clean" || r.cleanliness_status === "inspected"
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }`}
                      >
                        {r.cleanliness_status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                      <span>Floor:</span>
                      <span className="text-zinc-200">{r.floor_name || "Level 1"}</span>
                    </div>
                    {activeStay ? (
                      <div className="pt-2 border-t border-zinc-800/80 text-[11px]">
                        <span className="text-zinc-500">Occupant:</span>{" "}
                        <span className="font-semibold text-zinc-200">{getStayGuestName(activeStay)}</span>
                        <div className="text-zinc-500 text-[10px] font-mono mt-0.5">
                          Out: {activeStay.check_out_date}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Ready for guest assignment</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: HOTEL SOPS & STANDARDS */}
      {activeTab === "specs" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
                <Hotel className="w-4 h-4" />
                <h4>1. Whole-Room Inventory Model</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Unlike hostels where individual bunk beds are leased, hotels allocate full physical suites with exclusive guest occupancy.
                Phase 6 inventory protects each suite against double-booking.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <Crown className="w-4 h-4" />
                <h4>2. VIP Guest Tiers</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Supports Standard, Silver, Gold, and Platinum tiers with stored guest room preferences, wake-up call requests, and newspaper preferences.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <Sparkles className="w-4 h-4" />
                <h4>3. Housekeeping Turnover</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Check-out automatically transitions room cleanliness status to 'dirty' for housekeeping dispatch, while preserving stay history.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GUIDED HOTEL CHECK-IN */}
      {checkInStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <LogIn className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Hotel Guest Check-In</h3>
              </div>
              <button
                onClick={() => setCheckInStay(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Primary Guest:</span>
                <span className="font-semibold text-zinc-200">{getStayGuestName(checkInStay)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Reservation:</span>
                <span className="font-mono text-sky-400">{checkInStay.stay_reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Assigned Suite:</span>
                <span className="font-semibold text-emerald-400">
                  Suite {checkInStay.room_number} ({checkInStay.room_type_name})
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Stay Period:</span>
                <span className="font-mono text-zinc-300">
                  {checkInStay.check_in_date} to {checkInStay.check_out_date} ({checkInStay.total_nights} nights)
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  RFID Keycard Access Code
                </label>
                <input
                  type="text"
                  value={checkInKeycard}
                  onChange={(e) => setCheckInKeycard(e.target.value)}
                  placeholder="e.g. KC-LON-201"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Additional Occupant</label>
                  <input
                    type="text"
                    value={checkInOccupantName}
                    onChange={(e) => setCheckInOccupantName(e.target.value)}
                    placeholder="Guest name (optional)"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Relationship</label>
                  <input
                    type="text"
                    value={checkInOccupantRel}
                    onChange={(e) => setCheckInOccupantRel(e.target.value)}
                    placeholder="e.g. Spouse / Colleague"
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Front Desk Staff Notes
                </label>
                <textarea
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="ID verified, incidental card pre-auth confirmed, luggage delivered..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setCheckInStay(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteCheckIn}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Check-In</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: HOTEL CHECK-OUT */}
      {checkOutStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <LogOut className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">Hotel Stay Check-Out</h3>
              </div>
              <button
                onClick={() => setCheckOutStay(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Guest:</span>
                <span className="font-semibold text-zinc-200">{getStayGuestName(checkOutStay)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Assigned Suite:</span>
                <span className="font-semibold text-sky-400">
                  Suite {checkOutStay.room_number || "—"} ({checkOutStay.room_type_name})
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Keycard Code:</span>
                <span className="font-mono text-zinc-300">{checkOutStay.keycard_code || "None"}</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={checkOutRoomInspected}
                  onChange={(e) => setCheckOutRoomInspected(e.target.checked)}
                  className="rounded border-zinc-700 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-zinc-200 font-medium">
                  Room inspected, no reported damages, keycard returned
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={checkOutMinibarCleared}
                  onChange={(e) => setCheckOutMinibarCleared(e.target.checked)}
                  className="rounded border-zinc-700 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-zinc-200 font-medium">
                  Minibar consumption verified & incidental balance settled
                </span>
              </label>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Checkout Staff Notes
                </label>
                <textarea
                  value={checkOutNotes}
                  onChange={(e) => setCheckOutNotes(e.target.value)}
                  placeholder="Luggage stored at concierge, receipt emailed..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setCheckOutStay(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteCheckOut}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Check-Out & Release Suite</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ROOM CHANGE (REASSIGNMENT) */}
      {changeRoomStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-100">Hotel Room Change (Relocation)</h3>
              </div>
              <button
                onClick={() => setChangeRoomStay(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
              <div>
                <span className="text-zinc-400">Current Stay:</span>{" "}
                <span className="font-semibold text-zinc-200">{getStayGuestName(changeRoomStay)}</span> (
                {changeRoomStay.stay_reference})
              </div>
              <div>
                <span className="text-zinc-400">Current Room:</span>{" "}
                <span className="font-semibold text-sky-400">
                  Suite {changeRoomStay.room_number || "Unassigned"} ({changeRoomStay.room_type_name})
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Period:</span>{" "}
                <span className="font-mono text-zinc-300">
                  {changeRoomStay.check_in_date} to {changeRoomStay.check_out_date}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Select Destination Room Suite
                </label>
                <select
                  value={changeNewRoomId}
                  onChange={(e) => setChangeNewRoomId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- Choose destination room in property --</option>
                  {allRooms
                    .filter((r) => r.id !== changeRoomStay.assigned_room_id)
                    .map((r) => {
                      const rt = roomTypes.find((t) => t.id === r.room_type_id);
                      return (
                        <option key={r.id} value={r.id}>
                          Suite {r.room_number} • {rt?.name || "Suite"} ({r.floor_name || "Floor 1"}, {r.operational_status})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Reason for Room Change
                </label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="VIP room upgrade, plumbing maintenance in previous suite, guest requested courtyard view..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setChangeRoomStay(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRoomChange}
                disabled={!changeNewRoomId}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Execute Room Relocation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN PHYSICAL ROOM (FOR UNASSIGNED RESERVATION) */}
      {assignRoomStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">Assign Physical Room Suite</h3>
              </div>
              <button
                onClick={() => setAssignRoomStay(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
              <div>
                <span className="text-zinc-400">Reservation:</span>{" "}
                <span className="font-mono text-sky-400">{assignRoomStay.stay_reference}</span>
              </div>
              <div>
                <span className="text-zinc-400">Guest:</span>{" "}
                <span className="font-semibold text-zinc-200">{getStayGuestName(assignRoomStay)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Booked Room Category:</span>{" "}
                <span className="font-semibold text-amber-400">{assignRoomStay.room_type_name}</span>
              </div>
              <div>
                <span className="text-zinc-400">Stay Period:</span>{" "}
                <span className="font-mono text-zinc-300">
                  {assignRoomStay.check_in_date} to {assignRoomStay.check_out_date}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Select Available Suite
                </label>
                <select
                  value={assignTargetRoomId}
                  onChange={(e) => setAssignTargetRoomId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="">-- Choose physical room in property --</option>
                  {allRooms
                    .filter((r) => r.operational_status !== "maintenance" && r.operational_status !== "out_of_order")
                    .map((r) => {
                      const rt = roomTypes.find((t) => t.id === r.room_type_id);
                      return (
                        <option key={r.id} value={r.id}>
                          Suite {r.room_number} • {rt?.name || "Suite"} ({r.floor_name || "Floor 1"})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Staff Assignment Notes
                </label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Corner suite assigned per VIP preferences..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setAssignRoomStay(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAssignRoom}
                disabled={!assignTargetRoomId}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Room Assignment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STAY EXTENSION */}
      {extendStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-100">Extend Hotel Stay</h3>
              </div>
              <button
                onClick={() => setExtendStay(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
              <div>
                <span className="text-zinc-400">Guest:</span>{" "}
                <span className="font-semibold text-zinc-200">{getStayGuestName(extendStay)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Current Check-Out:</span>{" "}
                <span className="font-mono text-amber-400">{extendStay.check_out_date}</span>
              </div>
              <div>
                <span className="text-zinc-400">Suite:</span>{" "}
                <span className="font-mono text-zinc-300">Room {extendStay.room_number || "—"}</span> (
                {formatCurrency(extendStay.nightly_rate, extendStay.currency)} / night)
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  New Check-Out Date (must be after {extendStay.check_out_date})
                </label>
                <input
                  type="date"
                  value={extendNewDate}
                  min={extendStay.check_out_date}
                  onChange={(e) => setExtendNewDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Staff Notes
                </label>
                <textarea
                  value={extendNotes}
                  onChange={(e) => setExtendNotes(e.target.value)}
                  placeholder="Extended stay confirmed with guest..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setExtendStay(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteExtension}
                disabled={!extendNewDate || extendNewDate <= extendStay.check_out_date}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Stay Extension</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: WALK-IN HOTEL REGISTRATION */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-100">Walk-In Hotel Guest Registration</h3>
              </div>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={walkInForm.first_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={walkInForm.last_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={walkInForm.email}
                    onChange={(e) => setWalkInForm({ ...walkInForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={walkInForm.phone}
                    onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Nationality</label>
                  <input
                    type="text"
                    value={walkInForm.nationality}
                    onChange={(e) => setWalkInForm({ ...walkInForm, nationality: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">VIP Tier</label>
                  <select
                    value={walkInForm.vip_tier}
                    onChange={(e) => setWalkInForm({ ...walkInForm, vip_tier: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="standard">Standard</option>
                    <option value="silver">Silver VIP</option>
                    <option value="gold">Gold VIP</option>
                    <option value="platinum">Platinum VIP</option>
                  </select>
                </div>
              </div>

              {/* Suite & Dates */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Select Available Physical Suite *
                  </label>
                  <select
                    value={walkInForm.room_id}
                    onChange={(e) => {
                      const r = allRooms.find((rm) => rm.id === e.target.value);
                      setWalkInForm({
                        ...walkInForm,
                        room_id: e.target.value,
                        keycard_code: r ? `KC-LON-${r.room_number}` : "",
                      });
                    }}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">-- Choose an available suite --</option>
                    {allRooms
                      .filter((r) => r.operational_status !== "maintenance" && r.operational_status !== "out_of_order")
                      .map((r) => {
                        const rt = roomTypes.find((t) => t.id === r.room_type_id);
                        return (
                          <option key={r.id} value={r.id}>
                            Suite {r.room_number} • {rt?.name || "Suite"} ({r.floor_name || "Floor 1"})
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Check-in Date</label>
                    <input
                      type="date"
                      value={walkInForm.check_in_date}
                      onChange={(e) => setWalkInForm({ ...walkInForm, check_in_date: e.target.value })}
                      className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Check-out Date</label>
                    <input
                      type="date"
                      value={walkInForm.check_out_date}
                      min={walkInForm.check_in_date}
                      onChange={(e) => setWalkInForm({ ...walkInForm, check_out_date: e.target.value })}
                      className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Nightly Rate</label>
                    <input
                      type="number"
                      value={walkInForm.nightly_rate}
                      onChange={(e) => setWalkInForm({ ...walkInForm, nightly_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Keycard Access Code</label>
                    <input
                      type="text"
                      value={walkInForm.keycard_code}
                      onChange={(e) => setWalkInForm({ ...walkInForm, keycard_code: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={walkInForm.immediate_check_in}
                    onChange={(e) => setWalkInForm({ ...walkInForm, immediate_check_in: e.target.checked })}
                    className="rounded border-zinc-700 text-sky-500 focus:ring-sky-500"
                  />
                  <span>Check in guest immediately upon registration</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowWalkInModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteWalkIn}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Register & Complete Walk-in</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTER / EDIT HOTEL GUEST */}
      {showNewGuestModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  {editingGuest ? "Edit Hotel Guest Profile" : "Register Hotel Guest"}
                </h3>
              </div>
              <button
                onClick={() => setShowNewGuestModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={guestForm.first_name}
                    onChange={(e) => setGuestForm({ ...guestForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={guestForm.last_name}
                    onChange={(e) => setGuestForm({ ...guestForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={guestForm.email || ""}
                    onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={guestForm.phone || ""}
                    onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Nationality</label>
                  <input
                    type="text"
                    value={guestForm.nationality || ""}
                    onChange={(e) => setGuestForm({ ...guestForm, nationality: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">VIP Tier</label>
                  <select
                    value={guestForm.vip_tier || "standard"}
                    onChange={(e) => setGuestForm({ ...guestForm, vip_tier: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  >
                    <option value="standard">Standard</option>
                    <option value="silver">Silver VIP</option>
                    <option value="gold">Gold VIP</option>
                    <option value="platinum">Platinum VIP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Room Preferences</label>
                <textarea
                  value={guestForm.special_preferences || ""}
                  onChange={(e) => setGuestForm({ ...guestForm, special_preferences: e.target.value })}
                  placeholder="High floor, feather-free pillows, morning newspaper..."
                  rows={2}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Internal Notes</label>
                <textarea
                  value={guestForm.notes || ""}
                  onChange={(e) => setGuestForm({ ...guestForm, notes: e.target.value })}
                  placeholder="Executive corporate guest, billing instructions..."
                  rows={2}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowNewGuestModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGuest}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Save Guest Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AUDIT TRAIL VIEWER */}
      {selectedStayForAudit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Immutable Audit Trail</h3>
                  <div className="text-[11px] font-mono text-zinc-400">
                    Stay Ref: {selectedStayForAudit.stay_reference}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedStayForAudit(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1">
              <div>
                <span className="text-zinc-400">Guest:</span>{" "}
                <span className="text-zinc-200 font-semibold">{getStayGuestName(selectedStayForAudit)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Assigned Suite:</span>{" "}
                <span className="text-sky-400 font-mono">
                  Suite {selectedStayForAudit.room_number || "Unassigned"} ({selectedStayForAudit.room_type_name})
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Current Status:</span>{" "}
                <span className="text-zinc-300 font-bold uppercase">{selectedStayForAudit.status}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-zinc-300">Operational Log Events:</div>
              <div className="space-y-2">
                {selectedStayForAudit.audit_trail && selectedStayForAudit.audit_trail.length > 0 ? (
                  selectedStayForAudit.audit_trail.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold uppercase tracking-wider text-sky-400 text-[10px]">
                          {evt.action.replace("_", " ")}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(evt.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-zinc-300 text-[11px]">{evt.details}</p>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1 pt-1 border-t border-zinc-900">
                        <UserCheck className="w-3 h-3 text-zinc-400" />
                        <span>Staff: {evt.performed_by_name} ({evt.performed_by_user_id})</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500 text-center py-4">No audit events recorded.</div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedStayForAudit(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Close Audit Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
