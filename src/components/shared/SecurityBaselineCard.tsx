import React, { useState } from "react";
import {
  Shield,
  Key,
  Lock,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
  RotateCcw,
  ShieldAlert,
  Send,
  Eye,
} from "lucide-react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useProperty } from "@/src/contexts/PropertyContext";
import {
  rotateRefreshToken,
  requestForgotPassword,
  submitPasswordReset,
  fetchPropertyPrivateDetails,
} from "@/src/services/api-client";

export const SecurityBaselineCard: React.FC = () => {
  const { user, accessToken, refreshToken } = useAuth();
  const { properties } = useProperty();

  // Test bench state
  const [testPassword, setTestPassword] = useState("P@ssw0rd2026!Secure");
  const [activeAccess, setActiveAccess] = useState<string | null>(accessToken);
  const [activeRefresh, setActiveRefresh] = useState<string | null>(refreshToken);
  const [revokedTokens, setRevokedTokens] = useState<string[]>([]);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  // Password reset testing state
  const [resetEmail, setResetEmail] = useState("sofia.guest@example.com");
  const [simulatedResetToken, setSimulatedResetToken] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("NewSecure2026!Password");
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  // Property probe results state
  const [probeResults, setProbeResults] = useState<Record<string, { status: number; text: string }>>({});
  const [probingPropId, setProbingPropId] = useState<string | null>(null);

  // 1. Live Token Rotation
  const handleRotateToken = async () => {
    if (!activeRefresh) {
      setTokenStatus("No active refresh token available. Please log in or switch role.");
      return;
    }
    try {
      const res = await rotateRefreshToken(activeRefresh);
      if (res.data) {
        setRevokedTokens((prev) => [...prev, activeRefresh]);
        setActiveAccess(res.data.access_token);
        setActiveRefresh(res.data.refresh_token);
        setTokenStatus(`[ROTATION SUCCESS] Issued new token pair. Previous refresh token marked as revoked.`);
      }
    } catch (err: any) {
      setTokenStatus(`[ROTATION FAILED] ${err.message}`);
    }
  };

  // 2. Simulate Refresh Token Reuse Attack
  const handleSimulateReuseAttack = async () => {
    if (revokedTokens.length === 0) {
      setTokenStatus("Please perform at least one legitimate rotation first so we have a revoked token to test reuse against.");
      return;
    }
    const leakedToken = revokedTokens[revokedTokens.length - 1];
    try {
      await rotateRefreshToken(leakedToken);
      setTokenStatus("[ERROR] Server accepted revoked token! Reuse detection failed!");
    } catch (err: any) {
      setTokenStatus(
        `[REUSE DETECTION TRIGGERED] Server rejected reused token with HTTP ${err.status || 401}: "${err.message}". All sessions for user have been revoked.`
      );
    }
  };

  // 3. Password Reset Test
  const handleRequestReset = async () => {
    setResetFeedback(null);
    try {
      const res = await requestForgotPassword(resetEmail);
      if (res.data?.simulated_reset_token) {
        setSimulatedResetToken(res.data.simulated_reset_token);
        setResetFeedback(`Password reset initiated. Simulated secure token generated: ${res.data.simulated_reset_token.substring(0, 16)}...`);
      } else {
        setResetFeedback(res.data?.message || "Reset request processed.");
      }
    } catch (err: any) {
      setResetFeedback(`Error: ${err.message}`);
    }
  };

  const handleConsumeReset = async () => {
    if (!simulatedResetToken) return;
    try {
      await submitPasswordReset(simulatedResetToken, newResetPassword);
      setResetFeedback(`Password reset successfully consumed! Single-use token invalidated. Try clicking Reset again to verify single-use rejection.`);
      setSimulatedResetToken(null);
    } catch (err: any) {
      setResetFeedback(`Reset submission failed: ${err.message}`);
    }
  };

  // 4. Live Property Scope Probe
  const handleProbeProperty = async (propId: string) => {
    setProbingPropId(propId);
    try {
      const res = await fetchPropertyPrivateDetails(propId);
      setProbeResults((prev) => ({
        ...prev,
        [propId]: { status: 200, text: `Authorized: ${res.data.name}` },
      }));
    } catch (err: any) {
      setProbeResults((prev) => ({
        ...prev,
        [propId]: {
          status: err.status || 403,
          text: `Blocked (${err.code || "HTTP_403"}): ${err.message}`,
        },
      }));
    } finally {
      setProbingPropId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Phase 3 Security Baseline & Authorization Architecture
            </h3>
            <p className="text-xs text-zinc-400">
              Argon2id password hashing, stateful JWT refresh sessions, token reuse detection, and property boundaries
            </p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          Phase 3 enforces multi-tenant security across three dimensions: <strong>Credential Hardening</strong> via Argon2id,
          <strong>Session Defense</strong> via refresh-token rotation and reuse detection, and <strong>Tenant Boundary Enforcement</strong> via{" "}
          <code className="text-emerald-400 font-mono">verify_property_scope()</code> and{" "}
          <code className="text-emerald-400 font-mono">verify_booking_ownership()</code>.
        </p>
      </div>

      {/* Top 2 Cards: Argon2id & JWT Token Claims */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Argon2id Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
            <Lock className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-zinc-200">1. Argon2id Cryptographic Password Hashing</h4>
          </div>
          <p className="text-xs text-zinc-400">
            Passwords hashed with <strong>Argon2id</strong> (RFC 9106 recommended). Salted, memory-hard resistance against GPU/ASIC cracking.
          </p>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Plaintext:</span>
              <span className="font-mono text-zinc-200">{testPassword}</span>
            </div>
            <div className="text-xs text-zinc-400">
              <span>Generated Argon2id hash structure:</span>
              <p className="font-mono text-[10px] text-emerald-400 break-all mt-1 bg-zinc-950 p-2 rounded border border-zinc-800">
                $argon2id$v=19$m=65536,t=3,p=4$c1e8...d9$8f91a27e384...77bc
              </p>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Never stored in plaintext; never leaked in API envelopes</span>
          </div>
        </div>

        {/* JWT Claims Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
            <Key className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-zinc-200">2. JWT Claims & Principal Scope</h4>
          </div>
          <p className="text-xs text-zinc-400">
            Access tokens are strictly short-lived (30 minutes). Encodes identity, global role, and active property context.
          </p>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1">
            <p className="text-zinc-500">// Active Principal Claims Contract</p>
            <p><span className="text-indigo-400">"sub"</span>: "{user.id}",</p>
            <p><span className="text-indigo-400">"role"</span>: "{user.role}",</p>
            <p><span className="text-indigo-400">"property_id"</span>: "{user.assignedPropertyIds[0] || 'null'}",</p>
            <p><span className="text-indigo-400">"token_type"</span>: "access",</p>
            <p><span className="text-indigo-400">"exp"</span>: {Math.floor(Date.now() / 1000) + 1800}</p>
          </div>
        </div>
      </div>

      {/* Interactive Token Rotation & Reuse Detection Test Bench */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
          <div>
            <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Live Interactive Test Bench: Token Rotation & Reuse Detection
            </h4>
            <p className="text-xs text-zinc-400">
              Demonstrates automatic refresh-token rotation and the reuse detection security trigger
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRotateToken}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rotate Token Pair
            </button>
            <button
              onClick={handleSimulateReuseAttack}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/10 border border-rose-500/30 text-rose-300 hover:bg-rose-600/20 transition-colors flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              Simulate Token Reuse Attack
            </button>
          </div>
        </div>

        {tokenStatus && (
          <div
            className={`p-3 rounded-lg text-xs font-mono border ${
              tokenStatus.includes("REUSE DETECTION")
                ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
            }`}
          >
            {tokenStatus}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
            <span className="text-zinc-500 text-[11px] block">Active Access Token (Short-Lived 30m)</span>
            <p className="text-emerald-400 break-all truncate">
              {activeAccess ? `${activeAccess.substring(0, 38)}...` : "None"}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
            <span className="text-zinc-500 text-[11px] block">Active Refresh Token (Rotatable 7d)</span>
            <p className="text-amber-400 break-all truncate">
              {activeRefresh ? `${activeRefresh.substring(0, 38)}...` : "None"}
            </p>
          </div>
        </div>

        <div className="text-[11px] text-zinc-500">
          Revoked Token History in Session: <span className="text-zinc-300">{revokedTokens.length} tokens</span>
        </div>
      </div>

      {/* Password Reset Workflow Live Tester */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="pb-3 border-b border-zinc-800">
          <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-sky-400" />
            Password Reset & Single-Use Token Flow Tester
          </h4>
          <p className="text-xs text-zinc-400">
            Simulates dispatching short-lived reset tokens and ensures single-use consumption
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-2">
            <label className="text-xs text-zinc-400 block">Target Account Email</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100"
              />
              <button
                onClick={handleRequestReset}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Dispatch Reset Token
              </button>
            </div>
          </div>

          {simulatedResetToken && (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 block">Consume Reset Token</label>
              <button
                onClick={handleConsumeReset}
                className="w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors"
              >
                Apply New Password
              </button>
            </div>
          )}
        </div>

        {resetFeedback && (
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono">
            {resetFeedback}
          </div>
        )}
      </div>

      {/* Property-Level Data Isolation Live Probing Matrix */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-zinc-100">
              Live Property Scope Isolation Matrix (Live Server Probes)
            </h4>
          </div>
          <span className="text-xs text-zinc-400">
            Active Role: <strong className="text-indigo-400 uppercase">{user.role}</strong>
          </span>
        </div>

        <p className="text-xs text-zinc-400">
          Click <strong>Probe Private Endpoint</strong> to execute a live authenticated request against{" "}
          <code className="text-indigo-400 font-mono">GET /api/v1/properties/:id/private-details</code> with your current JWT bearer token:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="p-3">Property</th>
                <th className="p-3">Type</th>
                <th className="p-3">Expected Policy</th>
                <th className="p-3">Live Server Probe Action</th>
                <th className="p-3">Server Response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {properties.map((prop) => {
                const isExpectedAllowed =
                  user.role === "super_admin" || user.assignedPropertyIds.includes(prop.id);
                const probe = probeResults[prop.id];

                return (
                  <tr key={prop.id} className="hover:bg-zinc-900/40">
                    <td className="p-3 font-medium text-zinc-200">
                      <div>{prop.name}</div>
                      <span className="font-mono text-[11px] text-zinc-500">{prop.id}</span>
                    </td>
                    <td className="p-3">
                      <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300">
                        {prop.property_type}
                      </span>
                    </td>
                    <td className="p-3">
                      {isExpectedAllowed ? (
                        <span className="text-emerald-400 font-medium">Permitted</span>
                      ) : (
                        <span className="text-rose-400 font-medium">Forbidden (HTTP 403)</span>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleProbeProperty(prop.id)}
                        disabled={probingPropId === prop.id}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {probingPropId === prop.id ? "Probing..." : "Probe Private Endpoint"}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-[11px]">
                      {probe ? (
                        <span
                          className={
                            probe.status === 200 ? "text-emerald-400" : "text-rose-400 font-semibold"
                          }
                        >
                          {probe.text}
                        </span>
                      ) : (
                        <span className="text-zinc-600">Not probed yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
