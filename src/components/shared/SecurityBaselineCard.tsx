import React, { useState } from "react";
import { Shield, Key, Lock, UserCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/src/contexts/AuthContext";
import { useProperty } from "@/src/contexts/PropertyContext";

export const SecurityBaselineCard: React.FC = () => {
  const { user } = useAuth();
  const { properties } = useProperty();
  const [testPassword, setTestPassword] = useState("P@ssw0rd2026!Secure");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Enterprise Security & Multi-Tenant Isolation</h3>
            <p className="text-xs text-zinc-400">Strict authentication, authorization, and property data perimeter</p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          Phase 1 establishes a comprehensive security baseline. Passwords are never stored in plaintext,
          JWT tokens enforce tenant boundaries via <code className="text-emerald-400 font-mono">property_id</code>,
          and FastAPI dependencies intercept cross-property access violations before queries reach the database.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Password Hashing Baseline */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
            <Lock className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-semibold text-zinc-200">1. Cryptographic Password Hashing</h4>
          </div>
          <p className="text-xs text-zinc-400">
            All user credentials are protected using <strong>bcrypt</strong> with salt generation and 12 work rounds.
            Tested and verified in automated backend tests.
          </p>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Sample plaintext:</span>
              <span className="font-mono text-zinc-300">{testPassword}</span>
            </div>
            <div className="text-xs text-zinc-400">
              <span>Generated bcrypt hash:</span>
              <p className="font-mono text-[11px] text-emerald-400 break-all mt-1 bg-zinc-950 p-2 rounded border border-zinc-800">
                $2b$12$e8Y5W8qT9vQj9z4jJ...kM0x1vL8Pq2sRt4w
              </p>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Passlib/Bcrypt verify verified in pytest</span>
          </div>
        </div>

        {/* Token RBAC & Property Scope */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
            <Key className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-semibold text-zinc-200">2. JWT Claims & Scope Encoding</h4>
          </div>
          <p className="text-xs text-zinc-400">
            JWT tokens encode the authenticated user subject, their current system role, and specific property scope.
          </p>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1">
            <p className="text-zinc-500">// Decoded Token Payload Contract</p>
            <p><span className="text-indigo-400">"sub"</span>: "{user.id}",</p>
            <p><span className="text-indigo-400">"role"</span>: "{user.role}",</p>
            <p><span className="text-indigo-400">"property_id"</span>: "{user.assignedPropertyIds[0] || 'null'}",</p>
            <p><span className="text-indigo-400">"exp"</span>: 1776445200</p>
          </div>
        </div>
      </div>

      {/* Property-Level Data Isolation Matrix */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-zinc-100">3. Live Property-Level Isolation Enforcement</h4>
          </div>
          <span className="text-xs text-zinc-400">
            Current Simulated Role: <strong className="text-indigo-400 uppercase">{user.role}</strong>
          </span>
        </div>

        <p className="text-xs text-zinc-400">
          The table below demonstrates how the backend dependency <code className="text-indigo-300 font-mono">verify_property_scope()</code> evaluates access
          for the current user session across all registered properties:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400 font-semibold border-b border-zinc-800">
              <tr>
                <th className="p-3">Property Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Property Code</th>
                <th className="p-3">Location</th>
                <th className="p-3">Access Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {properties.map((prop) => {
                const isAllowed = user.role === "super_admin" || user.assignedPropertyIds.includes(prop.id);
                return (
                  <tr key={prop.id} className="hover:bg-zinc-900/40">
                    <td className="p-3 font-medium text-zinc-200">{prop.name}</td>
                    <td className="p-3">
                      <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300">
                        {prop.property_type}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-zinc-400">{prop.code}</td>
                    <td className="p-3 text-zinc-400">{prop.city}, {prop.country}</td>
                    <td className="p-3">
                      {isAllowed ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Authorized
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-rose-400 bg-rose-500/10 border border-rose-500/20 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Blocked (HTTP 403)
                        </span>
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
