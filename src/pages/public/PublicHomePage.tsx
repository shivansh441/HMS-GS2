import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, Building2, Bed, Calendar, Users, ArrowRight, ShieldCheck } from "lucide-react";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";

export const PublicHomePage: React.FC = () => {
  const { properties } = useProperty();
  const { isAuthenticated, user } = useAuth();
  const [filterType, setFilterType] = useState<"all" | "hostel" | "hotel" | "hybrid">("all");

  const visibleProperties = properties.filter((p) => {
    if (filterType === "all") return true;
    return p.property_type === filterType;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Bar for Public Visitors */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-zinc-100 text-base tracking-tight">GrandStay</span>
            <span className="text-xs text-zinc-500 ml-2 hidden sm:inline">Dorm Pods &amp; Boutique Suites</span>
          </div>
        </div>

        {/* Public Navigation */}
        <div className="flex items-center gap-4">
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-400">
            <a href="#properties" className="hover:text-zinc-200 transition-colors">Properties</a>
            <a href="#about" className="hover:text-zinc-200 transition-colors">Hostel vs Hotel</a>
            <a href="#policies" className="hover:text-zinc-200 transition-colors">House Rules</a>
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link
                to="/admin/dashboard"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors flex items-center gap-1.5"
              >
                <span>Admin Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Discover Authenticated Hospitality</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-zinc-100 tracking-tight">
            Hostel Communal Vibes. Hotel Executive Comfort.
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Choose from sociable dormitory pods with privacy lockers or private boutique suites across Edinburgh, London, and Berlin.
          </p>

          {/* Quick Filter Control */}
          <div className="pt-4 flex items-center justify-center gap-1.5">
            {[
              { id: "all", label: "All Destinations" },
              { id: "hostel", label: "Hostels (Dorm Pods)" },
              { id: "hotel", label: "Hotels (Private Suites)" },
              { id: "hybrid", label: "Hybrid Campuses" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterType === f.id
                    ? "bg-indigo-600 text-white font-semibold"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Properties Showcase */}
      <section id="properties" className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Featured Properties</h2>
            <p className="text-xs text-zinc-400">Published bookable inventories</p>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {visibleProperties.length} Properties Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleProperties.map((prop) => (
            <div
              key={prop.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-all p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">{prop.code}</span>
                    <h3 className="text-base font-bold text-zinc-100">{prop.name}</h3>
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

                <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span>{prop.address}, {prop.city}, {prop.country}</span>
                </p>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">Available Rooms</span>
                    <p className="font-mono font-bold text-zinc-200 text-sm">{prop.total_rooms}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">Total Beds</span>
                    <p className="font-mono font-bold text-zinc-200 text-sm">{prop.total_beds}</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-400">
                  Currency: {prop.currency}
                </span>

                <Link
                  to="/admin/dashboard"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  <span>Book in Admin</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-950 py-6 px-6 text-center text-xs text-zinc-500">
        <p>GrandStay Hybrid Hospitality Platform · Phase 4 Architecture &amp; Admin Foundation</p>
      </footer>
    </div>
  );
};
