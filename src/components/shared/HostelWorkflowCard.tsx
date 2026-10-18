import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bed,
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
} from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  fetchHostelDashboard,
  fetchHostelFrontDesk,
  fetchHostelStays,
  fetchHostellers,
  createHosteller,
  updateHosteller,
  deactivateHosteller,
  checkInHostelStay,
  checkOutHostelStay,
  reassignHostelBed,
  extendHostelStay,
  registerWalkInStay,
  fetchBeds,
  fetchRooms,
} from "@/src/services/api-client";
import type {
  HostellerProfile,
  HostelStay,
  HostelFrontDeskQueue,
  HostelOperationalSummary,
  CreateHostellerInput,
  WalkInStayInput,
} from "@/src/types/hostel";
import type { Bed as BedTypeModel, Room } from "@/src/types/inventory";
import { formatCurrency } from "@/src/lib/utils";

type HostelSubTab = "queue" | "stays" | "hostellers" | "specs";

export const HostelWorkflowCard: React.FC = () => {
  const { activeProperty, properties, setActivePropertyId } = useProperty();
  const { canAccessProperty } = useAuth();
  const isHostel =
    activeProperty.property_type === "hostel" || activeProperty.property_type === "hybrid";
  const hasAccess = canAccessProperty(activeProperty.id);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<HostelSubTab>("queue");

  // Live Data states
  const [frontDesk, setFrontDesk] = useState<HostelFrontDeskQueue | null>(null);
  const [summary, setSummary] = useState<HostelOperationalSummary | null>(null);
  const [stays, setStays] = useState<HostelStay[]>([]);
  const [hostellers, setHostellers] = useState<HostellerProfile[]>([]);
  const [availableBeds, setAvailableBeds] = useState<BedTypeModel[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Filters
  const [staysSearchQuery, setStaysSearchQuery] = useState("");
  const [staysStatusFilter, setStaysStatusFilter] = useState("all");
  const [hostellerSearchQuery, setHostellerSearchQuery] = useState("");
  const [hostellerStatusFilter, setHostellerStatusFilter] = useState("all");

  // Helper for hosteller name
  const getStayHostellerName = useCallback((stay: HostelStay) => {
    if (stay.hosteller) {
      return `${stay.hosteller.first_name} ${stay.hosteller.last_name}`;
    }
    return stay.hosteller_name || "Registered Hosteller";
  }, []);

  // Modals state
  const [checkInStay, setCheckInStay] = useState<HostelStay | null>(null);
  const [checkInKeycard, setCheckInKeycard] = useState("");
  const [checkInLocker, setCheckInLocker] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");

  const [checkOutStay, setCheckOutStay] = useState<HostelStay | null>(null);
  const [checkOutKeyReturned, setCheckOutKeyReturned] = useState(true);
  const [checkOutLinenReturned, setCheckOutLinenReturned] = useState(true);
  const [checkOutNotes, setCheckOutNotes] = useState("");

  const [reassignStay, setReassignStay] = useState<HostelStay | null>(null);
  const [reassignNewBedId, setReassignNewBedId] = useState("");
  const [reassignNotes, setReassignNotes] = useState("");

  const [extendStay, setExtendStay] = useState<HostelStay | null>(null);
  const [extendNewDate, setExtendNewDate] = useState("");
  const [extendNotes, setExtendNotes] = useState("");

  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    nationality: string;
    gender: "male" | "female" | "non_binary" | "prefer_not_to_say";
    emergency_name: string;
    emergency_phone: string;
    emergency_rel: string;
    room_id: string;
    bed_id: string;
    check_in_date: string;
    check_out_date: string;
    nightly_rate: number;
    locker_number: string;
    keycard_code: string;
    notes: string;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    nationality: "United Kingdom",
    gender: "female",
    emergency_name: "",
    emergency_phone: "",
    emergency_rel: "Family",
    room_id: "",
    bed_id: "",
    check_in_date: new Date().toISOString().split("T")[0],
    check_out_date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
    nightly_rate: 32.0,
    locker_number: "",
    keycard_code: "",
    notes: "Walk-in guest registered at front desk.",
  });

  const [showNewHostellerModal, setShowNewHostellerModal] = useState(false);
  const [editingHosteller, setEditingHosteller] = useState<HostellerProfile | null>(null);
  const [hostellerForm, setHostellerForm] = useState<CreateHostellerInput>({
    property_id: activeProperty.id,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    nationality: "",
    gender: "female",
    address: "",
    city: "",
    country: "",
    emergency_contact: {
      name: "",
      relationship: "",
      phone: "",
    },
    notes: "",
  });

  const [selectedStayForAudit, setSelectedStayForAudit] = useState<HostelStay | null>(null);

  // Load live data
  const loadHostelData = useCallback(async () => {
    if (!hasAccess) return;
    setIsLoading(true);
    try {
      const [fdRes, sumRes, staysRes, hostellersRes, bedsRes, roomsRes] = await Promise.all([
        fetchHostelFrontDesk(activeProperty.id),
        fetchHostelDashboard(activeProperty.id),
        fetchHostelStays(activeProperty.id),
        fetchHostellers(activeProperty.id),
        fetchBeds(activeProperty.id),
        fetchRooms({ property_id: activeProperty.id }),
      ]);

      if (fdRes.success && fdRes.data) setFrontDesk(fdRes.data);
      if (sumRes.success && sumRes.data) setSummary(sumRes.data);
      if (staysRes.success && staysRes.data) setStays(staysRes.data);
      if (hostellersRes.success && hostellersRes.data) setHostellers(hostellersRes.data);
      if (bedsRes.success && bedsRes.data) setAvailableBeds(bedsRes.data);
      if (roomsRes.success && roomsRes.data) setAllRooms(roomsRes.data);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to load hostel data." });
    } finally {
      setIsLoading(false);
    }
  }, [activeProperty.id, hasAccess]);

  useEffect(() => {
    loadHostelData();
  }, [loadHostelData]);

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
      const hName = getStayHostellerName(stay).toLowerCase();
      const rNum = (stay.room_number || "").toLowerCase();
      const bLbl = (stay.bed_label || "").toLowerCase();
      const matchesSearch =
        !q ||
        stay.stay_reference.toLowerCase().includes(q) ||
        hName.includes(q) ||
        rNum.includes(q) ||
        bLbl.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [stays, staysSearchQuery, staysStatusFilter, getStayHostellerName]);

  // Filtered hostellers
  const filteredHostellers = useMemo(() => {
    return hostellers.filter((h) => {
      const matchesStatus =
        hostellerStatusFilter === "all" ? true : h.status === hostellerStatusFilter;
      const q = hostellerSearchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        `${h.first_name} ${h.last_name}`.toLowerCase().includes(q) ||
        (h.email && h.email.toLowerCase().includes(q)) ||
        (h.phone && h.phone.toLowerCase().includes(q)) ||
        (h.nationality && h.nationality.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [hostellers, hostellerSearchQuery, hostellerStatusFilter]);

  // Handle Check-In
  const handleExecuteCheckIn = async () => {
    if (!checkInStay) return;
    try {
      const res = await checkInHostelStay(checkInStay.id, {
        keycard_code: checkInKeycard || undefined,
        locker_number: checkInLocker || undefined,
        staff_notes: checkInNotes || undefined,
      });
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Checked in ${getStayHostellerName(checkInStay)} to Bed ${checkInStay.bed_label || "assigned"} (Room ${checkInStay.room_number || ""}).`,
        });
        setCheckInStay(null);
        await loadHostelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Check-in failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to execute check-in." });
    }
  };

  // Handle Check-Out
  const handleExecuteCheckOut = async () => {
    if (!checkOutStay) return;
    try {
      const res = await checkOutHostelStay(checkOutStay.id, {
        staff_notes: checkOutNotes || undefined,
        linen_returned: checkOutLinenReturned,
        locker_keys_returned: checkOutKeyReturned,
      });
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Checked out ${getStayHostellerName(checkOutStay)}. Bed ${checkOutStay.bed_label || ""} released and marked for housekeeping.`,
        });
        setCheckOutStay(null);
        await loadHostelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Check-out failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to execute check-out." });
    }
  };

  // Handle Bed Reassignment
  const handleExecuteReassignment = async () => {
    if (!reassignStay || !reassignNewBedId) return;
    try {
      const res = await reassignHostelBed(reassignStay.id, {
        new_bed_id: reassignNewBedId,
        notes: reassignNotes || undefined,
      });
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Bed reassigned successfully to ${res.data.bed_label || "new bed"}.`,
        });
        setReassignStay(null);
        await loadHostelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Reassignment failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to reassign bed." });
    }
  };

  // Handle Stay Extension
  const handleExecuteExtension = async () => {
    if (!extendStay || !extendNewDate) return;
    try {
      const res = await extendHostelStay(extendStay.id, {
        new_check_out_date: extendNewDate,
        notes: extendNotes || undefined,
      });
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Stay extended to ${extendNewDate} for ${getStayHostellerName(extendStay)}. Total: ${formatCurrency(res.data.total_amount, res.data.currency)}.`,
        });
        setExtendStay(null);
        await loadHostelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Extension failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to extend stay." });
    }
  };

  // Handle Walk-in Registration
  const handleExecuteWalkIn = async () => {
    if (!walkInForm.first_name || !walkInForm.last_name || !walkInForm.bed_id) {
      setFeedback({ type: "error", message: "Please enter first name, last name, and select a bed." });
      return;
    }
    try {
      const selectedBed = availableBeds.find((b) => b.id === walkInForm.bed_id);
      const payload: WalkInStayInput = {
        property_id: activeProperty.id,
        first_name: walkInForm.first_name,
        last_name: walkInForm.last_name,
        email: walkInForm.email || undefined,
        phone: walkInForm.phone || undefined,
        gender: walkInForm.gender,
        nationality: walkInForm.nationality || undefined,
        emergency_contact: walkInForm.emergency_name
          ? {
              name: walkInForm.emergency_name,
              phone: walkInForm.emergency_phone,
              relationship: walkInForm.emergency_rel,
            }
          : undefined,
        room_id: selectedBed ? selectedBed.room_id : walkInForm.room_id,
        bed_id: walkInForm.bed_id,
        check_in_date: walkInForm.check_in_date,
        check_out_date: walkInForm.check_out_date,
        locker_number: walkInForm.locker_number || undefined,
        keycard_code: walkInForm.keycard_code || undefined,
        special_requests: walkInForm.notes,
      };

      const res = await registerWalkInStay(payload);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Walk-in registered: ${getStayHostellerName(res.data)} checked in to Bed ${res.data.bed_label || ""}.`,
        });
        setShowWalkInModal(false);
        await loadHostelData();
      } else {
        setFeedback({ type: "error", message: res.error?.message || "Walk-in registration failed." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to register walk-in." });
    }
  };

  // Handle Save Hosteller (Create or Edit)
  const handleSaveHosteller = async () => {
    if (!hostellerForm.first_name || !hostellerForm.last_name) {
      setFeedback({ type: "error", message: "First name and last name are required." });
      return;
    }
    try {
      if (editingHosteller) {
        const res = await updateHosteller(editingHosteller.id, {
          first_name: hostellerForm.first_name,
          last_name: hostellerForm.last_name,
          email: hostellerForm.email,
          phone: hostellerForm.phone,
          nationality: hostellerForm.nationality,
          gender: hostellerForm.gender,
          emergency_contact: hostellerForm.emergency_contact,
          notes: hostellerForm.notes,
        });
        if (res.success) {
          setFeedback({ type: "success", message: "Hosteller profile updated successfully." });
          setShowNewHostellerModal(false);
          setEditingHosteller(null);
          await loadHostelData();
        } else {
          setFeedback({ type: "error", message: res.error?.message || "Failed to update hosteller." });
        }
      } else {
        const res = await createHosteller({
          ...hostellerForm,
          property_id: activeProperty.id,
        });
        if (res.success) {
          setFeedback({ type: "success", message: `Hosteller ${res.data.first_name} registered.` });
          setShowNewHostellerModal(false);
          await loadHostelData();
        } else {
          setFeedback({ type: "error", message: res.error?.message || "Failed to create hosteller." });
        }
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to save hosteller." });
    }
  };

  // Helper to switch to Edinburgh Hostel
  const hostelProperty = properties.find((p) => p.property_type === "hostel" || p.property_type === "hybrid");

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
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Bed className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-100">Hostel Front Desk & Operations</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Phase 7 Operational Center
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Active Property: <span className="text-zinc-200 font-semibold">{activeProperty.name}</span> ({activeProperty.property_type.toUpperCase()}) • {activeProperty.total_beds} Dorm Beds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadHostelData()}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-2 border border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          {isHostel && (
            <button
              onClick={() => {
                setShowWalkInModal(true);
              }}
              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Walk-in Check-in</span>
            </button>
          )}
        </div>
      </div>

      {/* Non-Hostel Property Warning */}
      {!isHostel && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-zinc-100">
                Currently Viewing a Hotel Property ({activeProperty.name})
              </p>
              <p className="text-zinc-400 text-[11px] mt-0.5">
                Hostel Operations require bed-level inventory (dormitories, bunks, shared lockers).
                Switch to Edinburgh Royal Mile Hostel to view active queues and live hostellers.
              </p>
            </div>
          </div>
          {hostelProperty && (
            <button
              onClick={() => setActivePropertyId(hostelProperty.id)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400 text-xs flex items-center gap-1.5 shrink-0 shadow"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Switch to {hostelProperty.name}</span>
            </button>
          )}
        </div>
      )}

      {/* Access Denied Warning */}
      {!hasAccess && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>You do not have staff permissions for this property. Hostel operations are restricted.</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-px">
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "queue"
              ? "border-amber-500 text-amber-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Front Desk Queue</span>
          {frontDesk && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
              {frontDesk.today_arrivals.length + frontDesk.today_departures.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("stays")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "stays"
              ? "border-amber-500 text-amber-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Bed className="w-4 h-4" />
          <span>Stays & Allocations</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
            {stays.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("hostellers")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "hostellers"
              ? "border-amber-500 text-amber-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Hosteller Directory</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300 font-mono">
            {hostellers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("specs")}
          className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "specs"
              ? "border-amber-500 text-amber-400 bg-zinc-900/60"
              : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Rules & Architecture</span>
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
              <div className="text-[10px] text-amber-400 mt-0.5">Expected checkout</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>In-House Guests</span>
                <Users className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-xl font-bold text-zinc-100 mt-1">
                {frontDesk?.in_house_hostellers.length ?? 0}
              </div>
              <div className="text-[10px] text-indigo-400 mt-0.5">Active hostel stays</div>
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
                <span>Available Beds</span>
                <Bed className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="text-xl font-bold text-teal-300 mt-1">
                {frontDesk?.available_beds_count ?? 0}
              </div>
              <div className="text-[10px] text-teal-400 mt-0.5">Vacant & ready</div>
            </div>

            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Maintenance Beds</span>
                <Lock className="w-3.5 h-3.5 text-zinc-500" />
              </div>
              <div className="text-xl font-bold text-zinc-300 mt-1">
                {frontDesk?.maintenance_exceptions_count ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Blocked/repairs</div>
            </div>
          </div>

          {/* Overdue Alert Banner if any */}
          {frontDesk && frontDesk.overdue_departures.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Overdue Departures Detected ({frontDesk.overdue_departures.length})</span>
              </div>
              <p className="text-zinc-400 text-[11px] mt-1">
                The following hostellers have passed their scheduled check-out date but remain active.
                Please verify their keycard or process an extension/checkout.
              </p>
              <div className="mt-2 space-y-1.5">
                {frontDesk.overdue_departures.map((stay) => (
                  <div
                    key={stay.id}
                    className="flex items-center justify-between bg-zinc-900/80 p-2 rounded-lg border border-rose-500/20"
                  >
                    <div>
                      <span className="font-semibold text-zinc-100">{getStayHostellerName(stay)}</span>{" "}
                      <span className="text-zinc-500">
                        ({stay.room_number || "Dorm"} • Bed {stay.bed_label || ""})
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
                          setCheckOutKeyReturned(true);
                          setCheckOutLinenReturned(true);
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
                Sorted by reservation reference
              </span>
            </div>

            {frontDesk && frontDesk.today_arrivals.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No pending arrivals scheduled for today.
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
                          {getStayHostellerName(stay)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                          {stay.stay_reference}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Dormitory Bed
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
                        <span>
                          Room <strong className="text-zinc-200">{stay.room_number || "—"}</strong> ({stay.room_type_name || "Dorm"})
                        </span>
                        <span>•</span>
                        <span>
                          Bed: <strong className="text-amber-400">{stay.bed_label || "—"}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Dates: {stay.check_in_date} → {stay.check_out_date} ({stay.total_nights} nights)
                        </span>
                        <span>•</span>
                        <span>
                          Locker: <span className="font-mono text-zinc-300">{stay.locker_number || "Unassigned"}</span>
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
                      <button
                        onClick={() => {
                          setReassignStay(stay);
                          setReassignNewBedId("");
                          setReassignNotes("");
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                      >
                        Change Bed
                      </button>
                      <button
                        onClick={() => {
                          setCheckInStay(stay);
                          setCheckInKeycard(stay.keycard_code || `KC-${(stay.bed_label || "").replace(/\s+/g, "")}`);
                          setCheckInLocker(stay.locker_number || `LK-${(stay.bed_label || "").replace(/\s+/g, "")}`);
                          setCheckInNotes("");
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow"
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
                No scheduled checkouts remaining for today.
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
                          {getStayHostellerName(stay)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                          {stay.stay_reference}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
                        <span>
                          Bed: <strong className="text-amber-400">{stay.bed_label || "—"}</strong> (Room {stay.room_number || "—"})
                        </span>
                        <span>•</span>
                        <span>
                          Locker: <strong className="text-zinc-200">{stay.locker_number || "None"}</strong>
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
                          setCheckOutKeyReturned(true);
                          setCheckOutLinenReturned(true);
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
                <Users className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  Currently In-House Hostellers ({frontDesk?.in_house_hostellers.length ?? 0})
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/70 text-[11px] font-semibold text-zinc-400">
                    <th className="py-2.5 px-4">Hosteller</th>
                    <th className="py-2.5 px-4">Room & Bed</th>
                    <th className="py-2.5 px-4">Locker / Key</th>
                    <th className="py-2.5 px-4">Check-In Time</th>
                    <th className="py-2.5 px-4">Check-Out Date</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {frontDesk && frontDesk.in_house_hostellers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        No hostellers currently checked in.
                      </td>
                    </tr>
                  ) : (
                    frontDesk?.in_house_hostellers.map((s) => (
                      <tr key={s.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100">{getStayHostellerName(s)}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{s.stay_reference}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-zinc-200 font-medium">Room {s.room_number || "—"}</div>
                          <div className="text-amber-400 text-[11px] font-mono">{s.bed_label || "—"}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-zinc-300 font-mono">{s.locker_number || "—"}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{s.keycard_code || "—"}</div>
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
                                setReassignStay(s);
                                setReassignNewBedId("");
                                setReassignNotes("");
                              }}
                              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                            >
                              Reassign
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
                                setCheckOutKeyReturned(true);
                                setCheckOutLinenReturned(true);
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

      {/* TAB 2: STAYS & ALLOCATIONS DIRECTORY */}
      {activeTab === "stays" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search stay reference, guest, bed..."
                  value={staysSearchQuery}
                  onChange={(e) => setStaysSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <select
                value={staysStatusFilter}
                onChange={(e) => setStaysStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Stay Statuses</option>
                <option value="reserved">Reserved</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <button
              onClick={() => setShowWalkInModal(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5"
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
                    <th className="py-2.5 px-4">Hosteller</th>
                    <th className="py-2.5 px-4">Room & Bed</th>
                    <th className="py-2.5 px-4">Stay Dates</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Financials</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredStays.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500">
                        No hostel stays found matching the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStays.map((stay) => (
                      <tr key={stay.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-amber-400">
                          {stay.stay_reference}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-100">{getStayHostellerName(stay)}</div>
                          {stay.special_requests && (
                            <div className="text-[10px] text-zinc-500 truncate max-w-xs">
                              {stay.special_requests}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-zinc-200">Room {stay.room_number || "—"}</div>
                          <div className="text-[11px] text-amber-300 font-mono">{stay.bed_label || "—"}</div>
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
                                : stay.status === "reserved"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
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

                            {stay.status === "reserved" && (
                              <button
                                onClick={() => {
                                  setCheckInStay(stay);
                                  setCheckInKeycard(stay.keycard_code || `KC-${(stay.bed_label || "").replace(/\s+/g, "")}`);
                                  setCheckInLocker(stay.locker_number || `LK-${(stay.bed_label || "").replace(/\s+/g, "")}`);
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
                                  setCheckOutKeyReturned(true);
                                  setCheckOutLinenReturned(true);
                                }}
                                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px]"
                              >
                                Check Out
                              </button>
                            )}

                            {(stay.status === "reserved" || stay.status === "checked_in") && (
                              <button
                                onClick={() => {
                                  setReassignStay(stay);
                                  setReassignNewBedId("");
                                  setReassignNotes("");
                                }}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                              >
                                Reassign
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

      {/* TAB 3: HOSTELLER DIRECTORY */}
      {activeTab === "hostellers" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search name, email, phone, country..."
                  value={hostellerSearchQuery}
                  onChange={(e) => setHostellerSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <select
                value={hostellerStatusFilter}
                onChange={(e) => setHostellerStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Profile Statuses</option>
                <option value="active">Active</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <button
              onClick={() => {
                setEditingHosteller(null);
                setHostellerForm({
                  property_id: activeProperty.id,
                  first_name: "",
                  last_name: "",
                  email: "",
                  phone: "",
                  nationality: "",
                  gender: "female",
                  address: "",
                  city: "",
                  country: "",
                  emergency_contact: {
                    name: "",
                    relationship: "",
                    phone: "",
                  },
                  notes: "",
                });
                setShowNewHostellerModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Hosteller</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredHostellers.map((h) => (
              <div
                key={h.id}
                className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-100 text-sm">
                      {h.first_name} {h.last_name}
                    </h4>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {h.nationality || "Nationality unspecified"} • {h.gender || "Gender unspecified"}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      h.status === "checked_in"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : h.status === "active"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {h.status.replace("_", " ")}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-zinc-300">
                  {h.email && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                      <span className="truncate">{h.email}</span>
                    </div>
                  )}
                  {h.phone && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                      <span>{h.phone}</span>
                    </div>
                  )}
                  {h.emergency_contact && (
                    <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                      <span className="text-zinc-500">Emergency:</span> {h.emergency_contact.name} (
                      {h.emergency_contact.relationship}) • {h.emergency_contact.phone}
                    </div>
                  )}
                  {h.notes && (
                    <p className="text-[11px] text-zinc-500 italic mt-1 line-clamp-2">"{h.notes}"</p>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">
                    ID: <code className="font-mono">{h.id}</code>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingHosteller(h);
                        setHostellerForm({
                          property_id: h.property_id,
                          first_name: h.first_name,
                          last_name: h.last_name,
                          email: h.email || "",
                          phone: h.phone || "",
                          nationality: h.nationality || "",
                          gender: h.gender || "female",
                          address: h.address || "",
                          city: h.city || "",
                          country: h.country || "",
                          emergency_contact: h.emergency_contact || {
                            name: "",
                            relationship: "",
                            phone: "",
                          },
                          notes: h.notes || "",
                        });
                        setShowNewHostellerModal(true);
                      }}
                      className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                      title="Edit Hosteller"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    {h.is_active && (
                      <button
                        onClick={async () => {
                          if (confirm(`Deactivate hosteller profile for ${h.first_name} ${h.last_name}?`)) {
                            await deactivateHosteller(h.id);
                            await loadHostelData();
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

      {/* TAB 4: RULES & ARCHITECTURE */}
      {activeTab === "specs" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <Bed className="w-4 h-4" />
                <h4>1. Unit of Inventory: Bed Space</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Unlike hotels where whole rooms are locked, hostel bookings bind to individual beds in dormitories.
                Phase 6 inventory engine prevents over-allocation per bed.
              </p>
              <div className="text-[11px] font-mono text-zinc-400 pt-1">
                Property: {activeProperty.total_beds} bed slots configured.
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
                <Users className="w-4 h-4" />
                <h4>2. Dormitory Gender Restrictions</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Rooms specify gender occupancy policies: female-only dorms, male-only dorms, and mixed dorms.
                Reassignment rejects allocations that violate the hosteller's gender.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <Key className="w-4 h-4" />
                <h4>3. Security: Keycards & Lockers</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Each bed allocation couples with a secure locker number and RFID keycard code.
                Check-out ensures returned keys and linen returns before clearing the stay.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GUIDED CHECK-IN */}
      {checkInStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <LogIn className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Guided Hosteller Check-In</h3>
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
                <span className="text-zinc-400">Hosteller:</span>
                <span className="font-semibold text-zinc-200">{getStayHostellerName(checkInStay)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Reservation:</span>
                <span className="font-mono text-amber-400">{checkInStay.stay_reference}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Allocated Bed:</span>
                <span className="font-semibold text-zinc-200">
                  Room {checkInStay.room_number || "—"} • Bed {checkInStay.bed_label || "—"}
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
                  placeholder="e.g. KC-101-2"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Personal Dorm Locker ID
                </label>
                <input
                  type="text"
                  value={checkInLocker}
                  onChange={(e) => setCheckInLocker(e.target.value)}
                  placeholder="e.g. LK-101-2"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Front Desk Check-In Notes
                </label>
                <textarea
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="ID verified, locker key handed over, hostel rules explained..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
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

      {/* MODAL: CHECK-OUT */}
      {checkOutStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <LogOut className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">Hostel Stay Check-Out</h3>
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
                <span className="text-zinc-400">Hosteller:</span>
                <span className="font-semibold text-zinc-200">{getStayHostellerName(checkOutStay)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Bed Allocation:</span>
                <span className="font-semibold text-amber-400">
                  Room {checkOutStay.room_number || "—"} • Bed {checkOutStay.bed_label || "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Locker / Keycard:</span>
                <span className="font-mono text-zinc-300">
                  {checkOutStay.locker_number || "None"} / {checkOutStay.keycard_code || "None"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={checkOutKeyReturned}
                  onChange={(e) => setCheckOutKeyReturned(e.target.checked)}
                  className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-zinc-200 font-medium">
                  RFID Keycard and Locker padlock returned
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-zinc-950 border border-zinc-800 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={checkOutLinenReturned}
                  onChange={(e) => setCheckOutLinenReturned(e.target.checked)}
                  className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-zinc-200 font-medium">
                  Dorm bed linen stripped and returned to housekeeping hamper
                </span>
              </label>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Checkout Staff Notes
                </label>
                <textarea
                  value={checkOutNotes}
                  onChange={(e) => setCheckOutNotes(e.target.value)}
                  placeholder="Locker inspected, no damages found, security deposit returned..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
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
                <span>Confirm Check-Out & Release Bed</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BED REASSIGNMENT */}
      {reassignStay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Bed className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-100">Reassign Dormitory Bed</h3>
              </div>
              <button
                onClick={() => setReassignStay(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1.5">
              <div>
                <span className="text-zinc-400">Current Stay:</span>{" "}
                <span className="font-semibold text-zinc-200">{getStayHostellerName(reassignStay)}</span> (
                {reassignStay.stay_reference})
              </div>
              <div>
                <span className="text-zinc-400">Current Bed:</span>{" "}
                <span className="font-semibold text-amber-400">
                  Room {reassignStay.room_number || "—"} • Bed {reassignStay.bed_label || "—"}
                </span>
              </div>
              <div>
                <span className="text-zinc-400">Period:</span>{" "}
                <span className="font-mono text-zinc-300">
                  {reassignStay.check_in_date} to {reassignStay.check_out_date}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Select Destination Bed
                </label>
                <select
                  value={reassignNewBedId}
                  onChange={(e) => setReassignNewBedId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Choose available bed in property --</option>
                  {availableBeds
                    .filter((b) => b.id !== reassignStay.bed_id)
                    .map((b) => {
                      const room = allRooms.find((r) => r.id === b.room_id);
                      return (
                        <option key={b.id} value={b.id}>
                          Room {room?.room_number || "Dorm"} • {b.bed_label} ({b.bed_type}, {b.operational_status})
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Reason for Reassignment
                </label>
                <textarea
                  value={reassignNotes}
                  onChange={(e) => setReassignNotes(e.target.value)}
                  placeholder="Guest requested lower bunk, or maintenance in previous dorm..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setReassignStay(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteReassignment}
                disabled={!reassignNewBedId}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Execute Bed Transfer</span>
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
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-100">Extend Hostel Stay</h3>
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
                <span className="text-zinc-400">Hosteller:</span>{" "}
                <span className="font-semibold text-zinc-200">{getStayHostellerName(extendStay)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Current Check-Out:</span>{" "}
                <span className="font-mono text-amber-400">{extendStay.check_out_date}</span>
              </div>
              <div>
                <span className="text-zinc-400">Bed:</span>{" "}
                <span className="font-mono text-zinc-300">{extendStay.bed_label || "—"}</span> (
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
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Staff Notes
                </label>
                <textarea
                  value={extendNotes}
                  onChange={(e) => setExtendNotes(e.target.value)}
                  placeholder="Extended stay paid by card at front desk..."
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
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
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Stay Extension</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: WALK-IN HOSTELLER REGISTRATION */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">Walk-In Hosteller Registration</h3>
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
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={walkInForm.first_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={walkInForm.last_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
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
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={walkInForm.phone}
                    onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
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
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Gender</label>
                  <select
                    value={walkInForm.gender}
                    onChange={(e) => setWalkInForm({ ...walkInForm, gender: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non_binary">Non-Binary</option>
                    <option value="prefer_not_to_say">Prefer Not To Say</option>
                  </select>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="text-[11px] font-semibold text-zinc-400">Emergency Contact (Required for Hostel)</div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Contact Name"
                    value={walkInForm.emergency_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, emergency_name: e.target.value })}
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200"
                  />
                  <input
                    type="tel"
                    placeholder="Contact Phone"
                    value={walkInForm.emergency_phone}
                    onChange={(e) => setWalkInForm({ ...walkInForm, emergency_phone: e.target.value })}
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200"
                  />
                  <input
                    type="text"
                    placeholder="Relationship"
                    value={walkInForm.emergency_rel}
                    onChange={(e) => setWalkInForm({ ...walkInForm, emergency_rel: e.target.value })}
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200"
                  />
                </div>
              </div>

              {/* Bed & Dates */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Select Bed Allocation *
                  </label>
                  <select
                    value={walkInForm.bed_id}
                    onChange={(e) => {
                      const bed = availableBeds.find((b) => b.id === e.target.value);
                      setWalkInForm({
                        ...walkInForm,
                        bed_id: e.target.value,
                        room_id: bed?.room_id || "",
                        locker_number: bed ? `LK-${bed.bed_label.replace(/\s+/g, "")}` : "",
                        keycard_code: bed ? `KC-${bed.bed_label.replace(/\s+/g, "")}` : "",
                      });
                    }}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Choose a Bed in Dormitory --</option>
                    {availableBeds.map((b) => {
                      const r = allRooms.find((rm) => rm.id === b.room_id);
                      return (
                        <option key={b.id} value={b.id}>
                          Room {r?.room_number || "Dorm"} • {b.bed_label} ({b.bed_type})
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

                <div className="grid grid-cols-3 gap-2">
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
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Locker #</label>
                    <input
                      type="text"
                      value={walkInForm.locker_number}
                      onChange={(e) => setWalkInForm({ ...walkInForm, locker_number: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Keycard</label>
                    <input
                      type="text"
                      value={walkInForm.keycard_code}
                      onChange={(e) => setWalkInForm({ ...walkInForm, keycard_code: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>
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
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Register & Complete Walk-in</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT HOSTELLER */}
      {showNewHostellerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  {editingHosteller ? "Edit Hosteller Profile" : "Register New Hosteller"}
                </h3>
              </div>
              <button
                onClick={() => setShowNewHostellerModal(false)}
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
                    value={hostellerForm.first_name}
                    onChange={(e) => setHostellerForm({ ...hostellerForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={hostellerForm.last_name}
                    onChange={(e) => setHostellerForm({ ...hostellerForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={hostellerForm.email || ""}
                    onChange={(e) => setHostellerForm({ ...hostellerForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={hostellerForm.phone || ""}
                    onChange={(e) => setHostellerForm({ ...hostellerForm, phone: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Nationality</label>
                  <input
                    type="text"
                    value={hostellerForm.nationality || ""}
                    onChange={(e) => setHostellerForm({ ...hostellerForm, nationality: e.target.value })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Gender</label>
                  <select
                    value={hostellerForm.gender || "female"}
                    onChange={(e) => setHostellerForm({ ...hostellerForm, gender: e.target.value as any })}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non_binary">Non-Binary</option>
                    <option value="prefer_not_to_say">Prefer Not To Say</option>
                  </select>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="text-[11px] font-semibold text-zinc-400">Emergency Contact</div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Contact Name"
                    value={hostellerForm.emergency_contact?.name || ""}
                    onChange={(e) =>
                      setHostellerForm({
                        ...hostellerForm,
                        emergency_contact: {
                          ...(hostellerForm.emergency_contact || { relationship: "", phone: "" }),
                          name: e.target.value,
                        },
                      })
                    }
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200"
                  />
                  <input
                    type="tel"
                    placeholder="Contact Phone"
                    value={hostellerForm.emergency_contact?.phone || ""}
                    onChange={(e) =>
                      setHostellerForm({
                        ...hostellerForm,
                        emergency_contact: {
                          ...(hostellerForm.emergency_contact || { name: "", relationship: "" }),
                          phone: e.target.value,
                        },
                      })
                    }
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200"
                  />
                  <input
                    type="text"
                    placeholder="Relationship"
                    value={hostellerForm.emergency_contact?.relationship || ""}
                    onChange={(e) =>
                      setHostellerForm({
                        ...hostellerForm,
                        emergency_contact: {
                          ...(hostellerForm.emergency_contact || { name: "", phone: "" }),
                          relationship: e.target.value,
                        },
                      })
                    }
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Operational Notes</label>
                <textarea
                  value={hostellerForm.notes || ""}
                  onChange={(e) => setHostellerForm({ ...hostellerForm, notes: e.target.value })}
                  placeholder="Preferences, allergy notices, dietary requirements..."
                  rows={2}
                  className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowNewHostellerModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveHosteller}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Check className="w-4 h-4" />
                <span>Save Hosteller Profile</span>
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
                <FileText className="w-5 h-5 text-amber-400" />
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
                <span className="text-zinc-400">Hosteller:</span>{" "}
                <span className="text-zinc-200 font-semibold">{getStayHostellerName(selectedStayForAudit)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Bed Allocation:</span>{" "}
                <span className="text-amber-400 font-mono">
                  Room {selectedStayForAudit.room_number || "—"} • Bed {selectedStayForAudit.bed_label || "—"}
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
                        <span className="font-semibold uppercase tracking-wider text-amber-400 text-[10px]">
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
