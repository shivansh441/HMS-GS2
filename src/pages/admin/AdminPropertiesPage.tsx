import React, { useState, useMemo } from "react";
import {
  Building2,
  Bed,
  Hotel,
  Shield,
  Plus,
  MapPin,
  Mail,
  Phone,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  Edit3,
  Archive,
  Globe,
  Lock,
  Layers,
  X,
  RefreshCw,
  Sparkles,
  Clock,
  Coins,
  Check,
} from "lucide-react";
import { PageContainer } from "@/src/components/layout/PageContainer";
import { useProperty } from "@/src/contexts/PropertyContext";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  Property,
  PropertyType,
  PublicationStatus,
  PropertyCreateInput,
  PropertyUpdateInput,
} from "@/src/types/property";

const STANDARD_AMENITIES = [
  "Free High-Speed Wi-Fi",
  "Secure Keycard Lockers",
  "Communal Kitchen",
  "Luggage Storage",
  "24/7 Concierge",
  "Valet Parking",
  "Daily Housekeeping",
  "Coworking Space",
  "Bicycle Rental",
  "Rooftop Terrace",
  "Spa & Wellness",
  "Specialty Coffee Bar",
];

export const AdminPropertiesPage: React.FC = () => {
  const {
    properties,
    activeProperty,
    setActivePropertyId,
    createProperty,
    updateProperty,
    publishProperty,
    archiveProperty,
    refreshProperties,
    isLoading: isContextLoading,
  } = useProperty();
  const { user, canAccessProperty, hasPermission } = useAuth();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [publishingProperty, setPublishingProperty] = useState<Property | null>(null);
  const [archivingProperty, setArchivingProperty] = useState<Property | null>(null);
  const [previewProperty, setPreviewProperty] = useState<Property | null>(null);

  // Form Processing States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Permissions
  const isSuperAdmin = user.role === "super_admin";
  const isManager = user.role === "property_manager" || isSuperAdmin;

  // Filtered properties
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      // Non-superadmins see only assigned properties
      if (!isSuperAdmin && !user.assignedPropertyIds.includes(p.id)) {
        return false;
      }
      if (typeFilter !== "all" && p.property_type !== typeFilter) {
        return false;
      }
      if (statusFilter !== "all" && p.publication_status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesCode = p.code.toLowerCase().includes(q);
        const matchesCity = p.city.toLowerCase().includes(q);
        const matchesCountry = p.country.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesCity && !matchesCountry) {
          return false;
        }
      }
      return true;
    });
  }, [properties, isSuperAdmin, user.assignedPropertyIds, typeFilter, statusFilter, searchTerm]);

  // Form State for Create / Edit
  const [formState, setFormState] = useState<PropertyCreateInput>({
    name: "",
    code: "",
    slug: "",
    property_type: "hostel",
    currency: "USD",
    timezone: "UTC",
    description: "",
    address: "",
    city: "",
    state_province: "",
    country: "",
    postal_code: "",
    contact_email: "",
    contact_phone: "",
    checkin_time_start: "14:00",
    checkout_time_deadline: "11:00",
    publication_status: "draft",
    is_bookable: true,
    amenities: ["Free High-Speed Wi-Fi"],
    policies: { cancellation: "Free cancellation up to 24h prior" },
    configuration: {
      allow_mixed_gender_dorms: true,
      lockers_provided: true,
      communal_kitchen_access: true,
    },
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const openCreateModal = () => {
    setFormState({
      name: "",
      code: "",
      slug: "",
      property_type: "hostel",
      currency: "USD",
      timezone: "UTC",
      description: "",
      address: "",
      city: "",
      state_province: "",
      country: "",
      postal_code: "",
      contact_email: "",
      contact_phone: "",
      checkin_time_start: "14:00",
      checkout_time_deadline: "11:00",
      publication_status: "draft",
      is_bookable: true,
      amenities: ["Free High-Speed Wi-Fi"],
      policies: { cancellation: "Free cancellation up to 24h prior" },
      configuration: {
        allow_mixed_gender_dorms: true,
        lockers_provided: true,
        communal_kitchen_access: true,
      },
    });
    setFormErrors({});
    setIsCreateOpen(true);
  };

  const openEditModal = (prop: Property) => {
    setEditingProperty(prop);
    setFormState({
      name: prop.name,
      code: prop.code,
      slug: prop.slug,
      property_type: prop.property_type,
      currency: prop.currency,
      timezone: prop.timezone,
      description: prop.description || "",
      address: prop.address,
      city: prop.city,
      state_province: prop.state_province || "",
      country: prop.country,
      postal_code: prop.postal_code || "",
      contact_email: prop.contact_email || "",
      contact_phone: prop.contact_phone || "",
      checkin_time_start: prop.checkin_time_start,
      checkout_time_deadline: prop.checkout_time_deadline,
      publication_status: prop.publication_status,
      is_bookable: prop.is_bookable,
      amenities: prop.amenities || [],
      policies: prop.policies || {},
      configuration: prop.configuration || {},
    });
    setFormErrors({});
  };

  const handleNameChange = (val: string) => {
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setFormState((prev) => ({
      ...prev,
      name: val,
      // Auto generate slug if creating and user hasn't explicitly customized slug
      slug: !editingProperty ? autoSlug : prev.slug,
    }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formState.name || formState.name.trim().length < 2) {
      errors.name = "Property name must be at least 2 characters.";
    }
    if (!formState.code || !/^[A-Z0-9_\-]+$/i.test(formState.code)) {
      errors.code = "Code must contain alphanumeric characters or hyphens only.";
    }
    if (!formState.slug || !/^[a-z0-9\-]+$/.test(formState.slug)) {
      errors.slug = "Slug must contain lowercase alphanumeric characters and hyphens only.";
    }
    if (!formState.address || formState.address.trim().length < 3) {
      errors.address = "Valid physical address is required.";
    }
    if (!formState.city || formState.city.trim().length < 2) {
      errors.city = "City is required.";
    }
    if (!formState.country || formState.country.trim().length < 2) {
      errors.country = "Country is required.";
    }
    if (formState.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.contact_email)) {
      errors.contact_email = "Invalid email format.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setFeedbackMessage(null);
    try {
      await createProperty(formState);
      setIsCreateOpen(false);
      setFeedbackMessage({ type: "success", text: `Property '${formState.name}' onboarded successfully.` });
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: err.message || "Failed to create property." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProperty || !validateForm()) return;

    setIsSubmitting(true);
    setFeedbackMessage(null);
    try {
      await updateProperty(editingProperty.id, formState as PropertyUpdateInput);
      setEditingProperty(null);
      setFeedbackMessage({ type: "success", text: `Property '${formState.name}' updated successfully.` });
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: err.message || "Failed to update property." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishToggle = async (status: PublicationStatus) => {
    if (!publishingProperty) return;
    setIsSubmitting(true);
    try {
      await publishProperty(publishingProperty.id, status);
      setPublishingProperty(null);
      setFeedbackMessage({
        type: "success",
        text: `Property publication status set to '${status}'.`,
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err.message || "Failed to update publication status.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archivingProperty) return;
    setIsSubmitting(true);
    try {
      await archiveProperty(archivingProperty.id);
      setArchivingProperty(null);
      setFeedbackMessage({
        type: "success",
        text: `Property '${archivingProperty.name}' archived safely. Historical records preserved.`,
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err.message || "Archival rejected. Active reservations may exist.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAmenity = (amenity: string) => {
    setFormState((prev) => {
      const current = prev.amenities || [];
      const updated = current.includes(amenity)
        ? current.filter((a) => a !== amenity)
        : [...current, amenity];
      return { ...prev, amenities: updated };
    });
  };

  return (
    <PageContainer
      title="Property Registry & Scope Management"
      description="Multi-property management, tenant isolation boundaries, operational policies, and publication lifecycle."
      breadcrumbs={[{ label: "Property" }, { label: "Registry" }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshProperties()}
            disabled={isContextLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Reload properties from API"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isContextLoading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Onboard Property</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Feedback Alert Banner */}
        {feedbackMessage && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
              feedbackMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="p-1 text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search properties by name, code, city, or address..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <span className="hidden sm:inline">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="hostel">Hostels (Dorm Pods)</option>
                <option value="hotel">Hotels (Private Suites)</option>
                <option value="hybrid">Hybrid Campuses</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="hidden sm:inline">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="unpublished">Unpublished</option>
              </select>
            </div>

            <span className="text-xs text-zinc-500 font-mono ml-auto">
              {filteredProperties.length} of {properties.length} Active
            </span>
          </div>
        </div>

        {/* Empty State */}
        {filteredProperties.length === 0 && (
          <div className="p-12 text-center rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-3">
            <Building2 className="w-10 h-10 text-zinc-600 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-200">No properties found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                No properties match your current search query or filter criteria.
              </p>
            </div>
            {isSuperAdmin && (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Onboard First Property</span>
              </button>
            )}
          </div>
        )}

        {/* Property Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProperties.map((prop) => {
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
                <div className="space-y-3.5">
                  {/* Top Bar: Code, Name, Type, and Publication Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          prop.property_type === "hostel"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : prop.property_type === "hotel"
                            ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                            : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        }`}
                      >
                        {prop.property_type === "hostel" ? (
                          <Bed className="w-4 h-4" />
                        ) : prop.property_type === "hotel" ? (
                          <Hotel className="w-4 h-4" />
                        ) : (
                          <Building2 className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">
                          {prop.code}
                        </span>
                        <h3 className="text-sm font-bold text-zinc-100 leading-snug truncate" title={prop.name}>
                          {prop.name}
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${
                          prop.property_type === "hostel"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : prop.property_type === "hotel"
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        }`}
                      >
                        {prop.property_type}
                      </span>
                      <span
                        className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border font-medium ${
                          prop.publication_status === "published"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : prop.publication_status === "draft"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {prop.publication_status}
                      </span>
                    </div>
                  </div>

                  {/* Description preview */}
                  {prop.description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {prop.description}
                    </p>
                  )}

                  {/* Location & Contact Info */}
                  <div className="space-y-1 text-xs text-zinc-400">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">
                        {prop.address}, {prop.city}, {prop.country}
                      </span>
                    </p>
                    {prop.contact_email && (
                      <p className="flex items-center gap-1.5 text-zinc-500 font-mono text-[11px]">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{prop.contact_email}</span>
                      </p>
                    )}
                  </div>

                  {/* Operating Times & Capacity */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Inventory</span>
                      <span className="font-mono font-bold text-zinc-200">
                        {prop.total_rooms} rms · {prop.total_beds} beds
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Hours</span>
                      <span className="font-mono text-zinc-300 text-[11px]">
                        {prop.checkin_time_start} in / {prop.checkout_time_deadline} out
                      </span>
                    </div>
                  </div>

                  {/* Amenities Tags snippet */}
                  {prop.amenities && prop.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {prop.amenities.slice(0, 3).map((a) => (
                        <span
                          key={a}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400"
                        >
                          {a}
                        </span>
                      ))}
                      {prop.amenities.length > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                          +{prop.amenities.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Controls & Actions */}
                <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>
                      {prop.currency} · {prop.timezone}
                    </span>
                    <button
                      onClick={() => setPreviewProperty(prop)}
                      className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-sans text-xs"
                      title="Preview public discovery view"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAccessible ? (
                      <button
                        onClick={() => setActivePropertyId(prop.id)}
                        className={`flex-1 text-xs py-1.5 px-2 rounded-lg font-medium transition-colors text-center ${
                          isCurrentActive
                            ? "bg-indigo-600 text-white"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                        }`}
                      >
                        {isCurrentActive ? "Active Scope" : "Switch Scope"}
                      </button>
                    ) : (
                      <span className="flex-1 text-center py-1.5 text-[11px] text-rose-400 font-mono flex items-center justify-center gap-1 bg-rose-500/10 rounded-lg border border-rose-500/20">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Restricted</span>
                      </span>
                    )}

                    {isManager && (
                      <button
                        onClick={() => openEditModal(prop)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                        title="Edit Property Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isManager && (
                      <button
                        onClick={() => setPublishingProperty(prop)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                        title="Publication Controls"
                      >
                        <Globe className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isSuperAdmin && (
                      <button
                        onClick={() => setArchivingProperty(prop)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-zinc-800 transition-colors"
                        title="Safely Archive Property"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* MODAL 1: CREATE / ONBOARD PROPERTY MODAL                      */}
        {/* ------------------------------------------------------------- */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Onboard New Property</h2>
                    <p className="text-xs text-zinc-400">Establish a new tenant inventory boundary</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                {/* Property Type Radio Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Property Workflow Architecture *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "hostel", label: "Hostel", desc: "Dorm pods & bunk allocations" },
                      { id: "hotel", label: "Hotel", desc: "Private room suites & concierge" },
                      { id: "hybrid", label: "Hybrid", desc: "Dual dorm wings & hotel rooms" },
                    ].map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() =>
                          setFormState((prev) => ({
                            ...prev,
                            property_type: t.id as PropertyType,
                          }))
                        }
                        className={`p-3 rounded-xl border text-left transition-all ${
                          formState.property_type === t.id
                            ? "bg-indigo-600/10 border-indigo-500 text-indigo-200"
                            : "bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        <p className="font-semibold text-xs capitalize">{t.label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name, Code, Slug */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Property Name *</label>
                    <input
                      type="text"
                      value={formState.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. GrandStay Edinburgh Castle"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.name && <p className="text-[11px] text-rose-400">{formErrors.name}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Code (Unique) *</label>
                    <input
                      type="text"
                      value={formState.code}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                      }
                      placeholder="e.g. HST-EDI-02"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono uppercase text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.code && <p className="text-[11px] text-rose-400">{formErrors.code}</p>}
                  </div>
                </div>

                {/* Slug and Description */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Unique URL Slug *</label>
                  <input
                    type="text"
                    value={formState.slug}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))
                    }
                    placeholder="e.g. grandstay-edinburgh-castle"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {formErrors.slug && <p className="text-[11px] text-rose-400">{formErrors.slug}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Public Description</label>
                  <textarea
                    rows={2}
                    value={formState.description || ""}
                    onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description for customer discovery..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Location fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Physical Address *</label>
                    <input
                      type="text"
                      value={formState.address}
                      onChange={(e) => setFormState((prev) => ({ ...prev, address: e.target.value }))}
                      placeholder="e.g. 50 Castle Street"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.address && <p className="text-[11px] text-rose-400">{formErrors.address}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">City *</label>
                    <input
                      type="text"
                      value={formState.city}
                      onChange={(e) => setFormState((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g. Edinburgh"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.city && <p className="text-[11px] text-rose-400">{formErrors.city}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Country *</label>
                    <input
                      type="text"
                      value={formState.country}
                      onChange={(e) => setFormState((prev) => ({ ...prev, country: e.target.value }))}
                      placeholder="e.g. United Kingdom"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.country && <p className="text-[11px] text-rose-400">{formErrors.country}</p>}
                  </div>
                </div>

                {/* Currency, Timezone, Check-in / Check-out */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Currency</label>
                    <select
                      value={formState.currency}
                      onChange={(e) => setFormState((prev) => ({ ...prev, currency: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="GBP">GBP (£)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Timezone</label>
                    <select
                      value={formState.timezone}
                      onChange={(e) => setFormState((prev) => ({ ...prev, timezone: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Europe/London">Europe/London</option>
                      <option value="Europe/Berlin">Europe/Berlin</option>
                      <option value="Europe/Paris">Europe/Paris</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Check-In</label>
                    <input
                      type="text"
                      value={formState.checkin_time_start}
                      onChange={(e) => setFormState((prev) => ({ ...prev, checkin_time_start: e.target.value }))}
                      placeholder="14:00"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Check-Out</label>
                    <input
                      type="text"
                      value={formState.checkout_time_deadline}
                      onChange={(e) => setFormState((prev) => ({ ...prev, checkout_time_deadline: e.target.value }))}
                      placeholder="11:00"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Amenities checkboxes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Available Amenities &amp; Facilities</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STANDARD_AMENITIES.map((am) => {
                      const selected = (formState.amenities || []).includes(am);
                      return (
                        <button
                          type="button"
                          key={am}
                          onClick={() => toggleAmenity(am)}
                          className={`p-2 rounded-lg border text-xs text-left flex items-center justify-between transition-colors ${
                            selected
                              ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-200"
                              : "bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <span className="truncate pr-1">{am}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Modal Buttons */}
                <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                  >
                    {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Create &amp; Provision Property</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 2: EDIT PROPERTY MODAL                                  */}
        {/* ------------------------------------------------------------- */}
        {editingProperty && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-100">Edit {editingProperty.name}</h2>
                    <p className="text-xs text-zinc-400 font-mono">ID: {editingProperty.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingProperty(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Property Name</label>
                    <input
                      type="text"
                      value={formState.name}
                      onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.name && <p className="text-[11px] text-rose-400">{formErrors.name}</p>}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Code</label>
                    <input
                      type="text"
                      value={formState.code}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono uppercase text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Description</label>
                  <textarea
                    rows={2}
                    value={formState.description || ""}
                    onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Address</label>
                    <input
                      type="text"
                      value={formState.address}
                      onChange={(e) => setFormState((prev) => ({ ...prev, address: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">City</label>
                    <input
                      type="text"
                      value={formState.city}
                      onChange={(e) => setFormState((prev) => ({ ...prev, city: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Country</label>
                    <input
                      type="text"
                      value={formState.country}
                      onChange={(e) => setFormState((prev) => ({ ...prev, country: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Contact Email</label>
                    <input
                      type="email"
                      value={formState.contact_email || ""}
                      onChange={(e) => setFormState((prev) => ({ ...prev, contact_email: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-300">Contact Phone</label>
                    <input
                      type="text"
                      value={formState.contact_phone || ""}
                      onChange={(e) => setFormState((prev) => ({ ...prev, contact_phone: e.target.value }))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Amenities */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Amenities &amp; Facilities</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {STANDARD_AMENITIES.map((am) => {
                      const selected = (formState.amenities || []).includes(am);
                      return (
                        <button
                          type="button"
                          key={am}
                          onClick={() => toggleAmenity(am)}
                          className={`p-2 rounded-lg border text-xs text-left flex items-center justify-between transition-colors ${
                            selected
                              ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-200"
                              : "bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <span className="truncate pr-1">{am}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingProperty(null)}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                  >
                    {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 3: PUBLICATION CONTROLS MODAL                           */}
        {/* ------------------------------------------------------------- */}
        {publishingProperty && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">Publication Controls</h3>
                    <p className="text-xs text-zinc-400">{publishingProperty.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPublishingProperty(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-zinc-400 leading-relaxed">
                <p>
                  Current status:{" "}
                  <span className="font-mono font-semibold uppercase text-zinc-200">
                    {publishingProperty.publication_status}
                  </span>
                </p>
                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
                  <p className="font-semibold text-zinc-200">Publication Implications:</p>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px]">
                    <li><strong>Published:</strong> Discoverable on the public booking website, searchable by guests, and eligible for customer reservations.</li>
                    <li><strong>Draft:</strong> Hidden from visitors. Only accessible to administrators for configuration and testing.</li>
                    <li><strong>Unpublished:</strong> Suspended from public discovery. Preserves existing bookings while preventing new guest folios.</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  onClick={() => handlePublishToggle("published")}
                  disabled={isSubmitting || publishingProperty.publication_status === "published"}
                  className="px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  Publish Live
                </button>
                <button
                  onClick={() => handlePublishToggle("draft")}
                  disabled={isSubmitting || publishingProperty.publication_status === "draft"}
                  className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  Set to Draft
                </button>
                <button
                  onClick={() => handlePublishToggle("unpublished")}
                  disabled={isSubmitting || publishingProperty.publication_status === "unpublished"}
                  className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  Unpublish
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 4: SAFE ARCHIVAL CONFIRMATION MODAL                     */}
        {/* ------------------------------------------------------------- */}
        {archivingProperty && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                    <Archive className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">Safe Property Archival</h3>
                    <p className="text-xs text-zinc-400">{archivingProperty.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setArchivingProperty(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-zinc-400 leading-relaxed">
                <p className="text-zinc-300 font-medium">
                  Are you sure you want to archive <strong>{archivingProperty.name}</strong>?
                </p>
                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5 text-[11px]">
                  <p className="font-semibold text-zinc-200">Data Preservation Guarantee:</p>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                    <li>This property will be deactivated and hidden from active operations.</li>
                    <li><strong>No historical data will be deleted.</strong> All past guest stays, historical bookings, and financial invoices are retained for audit and tax compliance.</li>
                    <li>If active confirmed bookings or checked-in guests exist, archival will be safely blocked until resolved.</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setArchivingProperty(null)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleArchiveConfirm}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Safe Archival</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 5: PUBLIC DISCOVERY PREVIEW MODAL                       */}
        {/* ------------------------------------------------------------- */}
        {previewProperty && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                    Public Discovery Preview
                  </span>
                </div>
                <button
                  onClick={() => setPreviewProperty(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {previewProperty.property_type}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      /{previewProperty.slug}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100">{previewProperty.name}</h2>
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span>{previewProperty.address}, {previewProperty.city}, {previewProperty.country}</span>
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
                  {previewProperty.description || "No public overview provided yet for this destination."}
                </div>

                {/* Operating hours & Currency */}
                <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
                  <div>
                    <span className="text-[10px] uppercase text-zinc-500 font-semibold block">Stay Hours</span>
                    <span className="font-mono text-zinc-300">
                      Check-in from {previewProperty.checkin_time_start} · Check-out by {previewProperty.checkout_time_deadline}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-zinc-500 font-semibold block">Billing Currency</span>
                    <span className="font-mono text-zinc-300">{previewProperty.currency} ({previewProperty.timezone})</span>
                  </div>
                </div>

                {/* Amenities */}
                {previewProperty.amenities && previewProperty.amenities.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-zinc-300">Included Amenities</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {previewProperty.amenities.map((am) => (
                        <span
                          key={am}
                          className="text-xs px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-1.5"
                        >
                          <Check className="w-3 h-3 text-indigo-400" />
                          <span>{am}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setPreviewProperty(null)}
                  className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};
