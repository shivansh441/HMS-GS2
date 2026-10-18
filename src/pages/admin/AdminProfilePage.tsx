import React from "react";
import { User, Shield, KeyRound, Building2, Calendar, Mail, CheckCircle2 } from "lucide-react";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { useAuth } from "@/src/contexts/AuthContext";
import { useProperty } from "@/src/contexts/PropertyContext";

export const AdminProfilePage: React.FC = () => {
  const { user, accessToken } = useAuth();
  const { properties } = useProperty();

  const assignedProps = properties.filter((p) => user.assignedPropertyIds.includes(p.id));

  return (
    <PageContainer
      title="User Account &amp; Security Profile"
      description="Cryptographic session credentials, role assignments, and property access scopes."
      breadcrumbs={[{ label: "Configuration" }, { label: "My Profile" }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold text-lg">
              {user.firstName ? user.firstName[0] : "U"}
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                {user.firstName} {user.lastName}
              </h3>
              <p className="text-xs text-zinc-500 font-mono">{user.email}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Security Principal:</span>
              <span className="font-mono text-zinc-300">{user.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Global Role:</span>
              <span className="font-mono text-indigo-400 capitalize">{user.role}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Account Status:</span>
              <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Assigned Properties Scope */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Assigned Properties Scope</h3>
              <p className="text-xs text-zinc-400">Strict tenant isolation boundaries</p>
            </div>
            <span className="text-xs text-zinc-500 font-mono">
              {user.role === "super_admin" ? "All Platform Scope" : `${assignedProps.length} Scoped`}
            </span>
          </div>

          {user.role === "super_admin" ? (
            <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-3">
              <Shield className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="font-semibold text-indigo-200">Global Administrative Superuser</p>
                <p className="text-zinc-400 mt-0.5">
                  Full administrative permissions across all properties, tenants, and configuration registers.
                </p>
              </div>
            </div>
          ) : assignedProps.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignedProps.map((p) => (
                <div key={p.id} className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200">{p.name}</span>
                    <span className="font-mono text-[10px] text-zinc-400">{p.code}</span>
                  </div>
                  <p className="text-zinc-500 text-[11px]">{p.city}, {p.country}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-zinc-500">
              No specific property assignments found for this account.
            </div>
          )}

          {/* Cryptographic Session info */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <h4 className="text-xs font-semibold text-zinc-300">Active Bearer Token Invariants</h4>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-400 truncate">
              {accessToken ? `Bearer ${accessToken.substring(0, 48)}...` : "Authenticated via session context"}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
