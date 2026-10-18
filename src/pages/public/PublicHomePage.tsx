import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  MapPin,
  Building2,
  Bed,
  Hotel,
  Calendar,
  Users,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Clock,
  Sparkles,
} from "lucide-react";
import { fetchPublicProperties } from "@/src/services/api-client";
import { useAuth } from "@/src/contexts/AuthContext";

export const PublicHomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "hostel" | "hotel" | "hybrid">("all");
  const [cityFilter, setCityFilter] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<any | null>(null);

  useEffect(() => {
    async function loadPublicCatalog() {
      setIsLoading(true);
      try {
        const res = await fetchPublicProperties({
          property_type: filterType !== "all" ? filterType : undefined,
          city: cityFilter.trim() || undefined,
        });
        if (res.data) {
          setProperties(res.data);
        }
      } catch {
        // Keep empty if failed
      } finally {
        setIsLoading(false);
      }
    }
    loadPublicCatalog();
  }, [filterType, cityFilter]);

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
            <a href="#destinations" className="hover:text-zinc-200 transition-colors">Destinations</a>
            <a href="#standards" className="hover:text-zinc-200 transition-colors">Hostel vs Hotel</a>
          </nav>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link
                to="/admin/dashboard"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors flex items-center gap-1.5 shadow-sm"
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
            <span>Discover Verified Hospitality</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-zinc-100 tracking-tight">
            Hostel Communal Vibes. Hotel Executive Comfort.
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Choose from sociable dormitory pods with privacy lockers or private boutique suites across Edinburgh, London, and Berlin.
          </p>

          {/* Quick Filter Control */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
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

          {/* City Search Bar */}
          <div className="pt-2 max-w-sm mx-auto relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="Search by city (e.g. London, Edinburgh, Berlin)..."
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* Properties Showcase */}
      <section id="properties" className="flex-1 max-w-7xl mx-auto w-full p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Featured Published Properties</h2>
            <p className="text-xs text-zinc-400">Discoverable customer inventory (Real API data)</p>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {properties.length} Properties Discoverable
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse" />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-zinc-800 bg-zinc-900/20 space-y-2">
            <Building2 className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400 font-medium">No published properties found in this location.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((prop) => (
              <div
                key={prop.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 transition-all p-5 flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">{prop.city}, {prop.country}</span>
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

                  {prop.description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {prop.description}
                    </p>
                  )}

                  <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">{prop.address}, {prop.city}</span>
                  </p>

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Inventory</span>
                      <p className="font-mono font-bold text-zinc-200 text-sm">
                        {prop.total_rooms} rms · {prop.total_beds} beds
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Hours</span>
                      <p className="font-mono text-zinc-300 text-xs">
                        {prop.checkin_time_start} - {prop.checkout_time_deadline}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-400">
                    Currency: {prop.currency}
                  </span>

                  <button
                    onClick={() => setSelectedProperty(prop)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <span>View Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Property Details Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-indigo-300">
                  {selectedProperty.property_type}
                </span>
                <h3 className="text-base font-bold text-zinc-100 mt-1">{selectedProperty.name}</h3>
              </div>
              <button
                onClick={() => setSelectedProperty(null)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {selectedProperty.description || "Discover premium accommodation combining social communal areas with private guest suites."}
            </p>

            <div className="space-y-1.5 text-xs text-zinc-400">
              <p className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>{selectedProperty.address}, {selectedProperty.city}, {selectedProperty.country}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>Check-in: {selectedProperty.checkin_time_start} · Check-out: {selectedProperty.checkout_time_deadline}</span>
              </p>
            </div>

            {selectedProperty.amenities && selectedProperty.amenities.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-semibold text-zinc-300">Included Amenities:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProperty.amenities.map((am: string) => (
                    <span
                      key={am}
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 text-indigo-400" />
                      <span>{am}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedProperty(null)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-950 py-6 px-6 text-center text-xs text-zinc-500">
        <p>GrandStay Hybrid Hospitality Platform · Phase 5 Property Management &amp; Public Discovery</p>
      </footer>
    </div>
  );
};
