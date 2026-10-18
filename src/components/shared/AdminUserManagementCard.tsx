import React, { useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useProperty } from "@/src/contexts/PropertyContext";
import { adminProvisionUser, adminUpdateUserStatus } from "@/src/services/api-client";
import { ShieldCheck, ShieldAlert, UserPlus, Key, UserCheck, Power, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { UserRole } from "@/src/types/property";

interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  assignedProperties: string[];
}

const INITIAL_STAFF_LIST: StaffMember[] = [
  {
    id: "usr-admin-001",
    email: "director@grandstay.com",
    name: "Julian Vance",
    role: "super_admin",
    isActive: true,
    assignedProperties: ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"],
  },
  {
    id: "usr-pm-002",
    email: "clara.manager@grandstay.com",
    name: "Clara Ross",
    role: "property_manager",
    isActive: true,
    assignedProperties: ["prop-hostel-001"],
  },
  {
    id: "usr-fd-003",
    email: "liam.desk@grandstay.com",
    name: "Liam Chen",
    role: "front_desk",
    isActive: true,
    assignedProperties: ["prop-hotel-002"],
  },
  {
    id: "usr-hk-004",
    email: "elena.clean@grandstay.com",
    name: "Elena Silva",
    role: "housekeeping",
    isActive: true,
    assignedProperties: ["prop-hostel-001", "prop-hotel-002"],
  },
  {
    id: "usr-acc-005",
    email: "marcus.finance@grandstay.com",
    name: "Marcus Finch",
    role: "accountant",
    isActive: true,
    assignedProperties: ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"],
  },
];

export const AdminUserManagementCard: React.FC = () => {
  const { user } = useAuth();
  const { properties } = useProperty();

  const isPlatformAdmin = user.role === "super_admin";

  const [staffList, setStaffList] = useState<StaffMember[]>(INITIAL_STAFF_LIST);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form inputs
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("StaffPass2026!Secure");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("front_desk");
  const [selectedProps, setSelectedProps] = useState<string[]>(["prop-hostel-001"]);

  const handleToggleProperty = (propId: string) => {
    setSelectedProps((prev) =>
      prev.includes(propId) ? prev.filter((p) => p !== propId) : [...prev, propId]
    );
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsProvisioning(true);

    try {
      const res = await adminProvisionUser({
        email: newEmail,
        password: newPassword,
        first_name: newFirstName,
        last_name: newLastName,
        global_role: newRole,
        assigned_property_ids: selectedProps,
      });

      if (res.success && res.data) {
        setStaffList((prev) => [
          ...prev,
          {
            id: res.data.id,
            email: res.data.email,
            name: `${res.data.first_name} ${res.data.last_name}`,
            role: res.data.global_role,
            isActive: true,
            assignedProperties: selectedProps,
          },
        ]);
        setFeedback({
          type: "success",
          message: `Successfully provisioned ${newFirstName} ${newLastName} with role '${newRole}' and Argon2id password hash.`,
        });
        setNewEmail("");
        setNewFirstName("");
        setNewLastName("");
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: `Provisioning failed: ${err.message}`,
      });
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleToggleUserStatus = async (staff: StaffMember) => {
    setFeedback(null);
    const targetStatus = !staff.isActive;
    try {
      await adminUpdateUserStatus(staff.id, targetStatus);
      setStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, isActive: targetStatus } : s))
      );
      setFeedback({
        type: "success",
        message: `Account '${staff.email}' is now ${targetStatus ? "Active" : "Deactivated"}. All active sessions immediately revoked on deactivation.`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: `Status update failed: ${err.message}`,
      });
    }
  };

  // If user is not platform administrator, render the strict 403 Forbidden barrier
  if (!isPlatformAdmin) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-rose-200">HTTP 403 Forbidden: Platform Administrator Required</h3>
          <p className="text-xs text-rose-300/80 max-w-md mx-auto">
            Current simulated principal role is <strong>{user.role.toUpperCase()}</strong>.
            Only <strong>SUPER_ADMIN</strong> accounts may provision staff members, assign property access scopes, or toggle account activation.
          </p>
        </div>
        <p className="text-[11px] text-zinc-400 font-mono">
          To test platform administration, switch your role to <strong>Super Admin</strong> in the top header.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Platform Administration: Staff & Property Scope Management
            </h3>
            <p className="text-xs text-zinc-400">
              Endpoints: <code className="text-indigo-400 font-mono">POST /api/v1/auth/admin/provision</code> and{" "}
              <code className="text-indigo-400 font-mono">PATCH /api/v1/auth/admin/users/:id/status</code>
            </p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          Platform administrators manage staff credentials, configure multi-property assignments, and
          activate/deactivate staff accounts. Deactivating an account immediately wipes all active JWT refresh sessions from the database.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg border text-xs flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Provision New Staff */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4 lg:col-span-1">
          <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 pb-2 border-b border-zinc-800">
            <UserPlus className="w-4 h-4 text-indigo-400" />
            Provision Staff Account
          </h4>

          <form onSubmit={handleProvisionSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="Elena"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Silva"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="staff@grandstay.com"
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Temporary Password (Argon2id)</label>
              <input
                type="text"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Assigned Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="property_manager">Property Manager</option>
                <option value="front_desk">Front Desk</option>
                <option value="housekeeping">Housekeeping</option>
                <option value="accountant">Accountant</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Authorized Property Scopes</label>
              <div className="space-y-1.5 p-2 rounded bg-zinc-900 border border-zinc-800 max-h-36 overflow-y-auto">
                {properties.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProps.includes(p.id)}
                      onChange={() => handleToggleProperty(p.id)}
                      className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="truncate">{p.name} ({p.code})</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isProvisioning}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors mt-2 disabled:opacity-50"
            >
              {isProvisioning ? "Provisioning..." : "Provision Staff Account"}
            </button>
          </form>
        </div>

        {/* Right Column: Existing Staff & Activation Controls */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              Active System Principals & Property Scope Directory
            </h4>
            <span className="text-[11px] text-zinc-400 font-mono">{staffList.length} Accounts</span>
          </div>

          <div className="space-y-3">
            {staffList.map((staff) => (
              <div
                key={staff.id}
                className="p-3.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-100">{staff.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                        staff.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {staff.isActive ? "Active" : "Deactivated"}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono">
                      {staff.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">{staff.email}</p>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <span>Scoped to:</span>
                    <span className="text-zinc-300 font-medium">
                      {staff.role === "super_admin"
                        ? "Global (All properties)"
                        : staff.assignedProperties.join(", ") || "None"}
                    </span>
                  </div>
                </div>

                {staff.role !== "super_admin" && (
                  <button
                    onClick={() => handleToggleUserStatus(staff)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                      staff.isActive
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-300 hover:bg-rose-500/20"
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {staff.isActive ? "Deactivate Account" : "Activate Account"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
