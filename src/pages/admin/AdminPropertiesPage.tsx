import React from "react";
import { Link } from "react-router-dom";
import { Building2, Bed, Hotel, Shield, Plus, MapPin, Users, Phone, Mail } from "lucide-react";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";

export const AdminPropertiesPage: React.FC = () => {
  const { properties, activeProperty, setActivePropertyId } = useProperty();
  const { user, canAccessProperty } = useAuth();

  return (
    <PageContainer
      title="Property Registry &amp; Scope Management"
      description="Multi-property management, tenant isolation boundaries, and property configuration."
      breadcrumbs={[{ label: "Property" }, { label: "Properties" }]}
      actions={
        user.role === "super_admin" ? (
          <button
            onClick={() => alert("Property onboarding workflow configured for Phase 5.")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Property</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop) => {
            const isAccessible = canAccessProperty(prop.id);
            const isCurrentActive = prop.id === activeProperty.id;

            return (
              <div
                key={prop.id}
                className={`rounded-xl border transition-all p-5 flex flex-col justify-between space-y-4 ${
                  isCurrentActive
                    ? "border-indigo-500/60 bg-zinc-900/90 shadow-lg shadow-indigo-950/20"
                    : "border-zinc-800 bg-zinc-950/80 hover:border-zinc-700"
                } ${!isAccessible ? "opacity-60" : ""}`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500 font-semibold">{prop.code}</span>
                        <h3 className="text-sm font-bold text-zinc-100 leading-tight">{prop.name}</h3>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${
                        prop.property_type === "hostel"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : prop.property_type === "hotel"
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                          : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                      }`}
                    >
                      {prop.property_type}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-zinc-400">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span>{prop.address}, {prop.city}, {prop.country}</span>
                    </p>
                    {prop.contact_email && (
                      <p className="flex items-center gap-1.5 text-zinc-500 font-mono text-[11px]">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>{prop.contact_email}</span>
                      </p>
                    )}
                  </div>

                  {/* Capacity breakdown */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold">Rooms</span>
                      <p className="font-mono font-bold text-zinc-200 text-sm">{prop.total_rooms}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold">Beds</span>
                      <p className="font-mono font-bold text-zinc-200 text-sm">{prop.total_beds}</p>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <div className="text-[11px] font-mono text-zinc-500">
                    {prop.currency} · {prop.timezone}
                  </div>

                  {isAccessible ? (
                    <button
                      onClick={() => setActivePropertyId(prop.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        isCurrentActive
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                      }`}
                    >
                      {isCurrentActive ? "Active Scope" : "Switch Scope"}
                    </button>
                  ) : (
                    <span className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Restricted Scope</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
};
