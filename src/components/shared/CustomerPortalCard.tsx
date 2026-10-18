import React, { useState, useEffect } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { fetchMyBookings, fetchBookingById, registerCustomer, loginUser } from "@/src/services/api-client";
import { ShieldCheck, ShieldAlert, Calendar, User, DollarSign, Building2, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";

export const CustomerPortalCard: React.FC = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [violationAlert, setViolationAlert] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auth modal toggle for customer portal
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [emailInput, setEmailInput] = useState("sofia.guest@example.com");
  const [passwordInput, setPasswordInput] = useState("Sofia2026!Guest");
  const [firstName, setFirstName] = useState("Sofia");
  const [lastName, setLastName] = useState("Berg");

  const loadBookings = async () => {
    setIsLoading(true);
    setViolationAlert(null);
    try {
      const res = await fetchMyBookings();
      if (res.data) {
        setBookings(res.data);
      }
    } catch (err: any) {
      setViolationAlert(`Failed to load customer bookings: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadBookings();
    }
  }, [isAuthenticated, user.id]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setViolationAlert(null);
    setSuccessMsg(null);
    try {
      if (authMode === "login") {
        await login(emailInput, passwordInput);
        setSuccessMsg("Signed in successfully as customer.");
      } else {
        await registerCustomer({
          email: emailInput,
          password: passwordInput,
          first_name: firstName,
          last_name: lastName,
        });
        await login(emailInput, passwordInput);
        setSuccessMsg("Customer account registered and authenticated successfully.");
      }
    } catch (err: any) {
      setViolationAlert(err.message || "Authentication failed");
    }
  };

  const handleAttemptCrossCustomerAccess = async () => {
    setViolationAlert(null);
    setSuccessMsg(null);
    // Sofia attempts to access John Doe's booking (bk-john-002)
    const targetBookingId = "bk-john-002";
    try {
      const res = await fetchBookingById(targetBookingId);
      setSuccessMsg(`Unexpectedly accessed: ${res.data?.booking_reference}`);
    } catch (err: any) {
      setViolationAlert(
        `[SECURITY CHECK ENFORCED] Server returned HTTP ${err.status || 403} (${err.code || "PERMISSION_DENIED"}): ${err.message}`
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Customer Account & Reservation Portal</h3>
            <p className="text-xs text-zinc-400">
              Customer self-service access with strict record-ownership isolation
            </p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          Under Phase 3, registered customers can review their own stay confirmations and folios.
          The backend dependency <code className="text-emerald-400 font-mono">verify_booking_ownership()</code> rigorously
          prevents customers from accessing reservations belonging to other guests.
        </p>
      </div>

      {/* Auth state / Login & Registration Box */}
      {!isAuthenticated ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 max-w-lg mx-auto space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-semibold text-zinc-200">
              {authMode === "login" ? "Customer Sign In" : "Register New Customer Account"}
            </h4>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`text-xs px-2.5 py-1 rounded ${authMode === "login" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className={`text-xs px-2.5 py-1 rounded ${authMode === "register" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                Register
              </button>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {authMode === "register" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Email Address</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors mt-2"
            >
              {authMode === "login" ? "Authenticate against Server" : "Create Customer Account"}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Session Badge */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-100">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-zinc-400 font-mono">{user.email} • Role: <span className="text-emerald-400 uppercase font-semibold">{user.role}</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAttemptCrossCustomerAccess}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/10 border border-rose-500/30 text-rose-300 hover:bg-rose-600/20 transition-colors flex items-center gap-1.5"
                title="Attempts to fetch another customer's booking ID"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Test Cross-Customer Breach Attempt
              </button>
              <button
                onClick={loadBookings}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition-colors"
              >
                {isLoading ? "Refreshing..." : "Refresh Bookings"}
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {violationAlert && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="font-semibold text-rose-200">Ownership Barrier Verification</p>
                <p className="mt-0.5 leading-relaxed">{violationAlert}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Customer's Authorized Bookings List */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                Authorized Customer Reservations ({bookings.length})
              </h4>
              <span className="text-[11px] text-zinc-500 font-mono">Scoped to current user ID: {user.id}</span>
            </div>

            {bookings.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">
                No active bookings found for account '{user.email}'.
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-lg border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 transition-colors space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-400">{b.booking_reference}</span>
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {b.booking_status}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-zinc-400">
                        {b.check_in_date} &rarr; {b.check_out_date} ({b.total_nights} nights)
                      </span>
                    </div>

                    <div className="text-xs text-zinc-300">
                      Guest: <strong className="text-zinc-100">{b.guest_name}</strong> ({b.guest_email})
                    </div>

                    {b.items?.map((item: any) => (
                      <div key={item.id} className="text-xs text-zinc-400 pl-3 border-l-2 border-indigo-500/40">
                        {item.room_type_name} — {b.currency} {Number(item.total_price).toFixed(2)}
                      </div>
                    ))}

                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Deposit Paid: {b.currency} {Number(b.deposit_paid).toFixed(2)}</span>
                      <span className="font-bold text-zinc-100">Total: {b.currency} {Number(b.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
