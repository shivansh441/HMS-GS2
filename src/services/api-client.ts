import { ApiResponse, HealthResponse, SystemMetaResponse } from "@/src/types/api";

function getApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  return "http://127.0.0.1:3000/api/v1";
}

let currentAccessToken: string | null = null;
let currentRefreshToken: string | null = null;

export function setTokens(access: string | null, refresh: string | null = null) {
  currentAccessToken = access;
  currentRefreshToken = refresh;
  if (typeof sessionStorage !== "undefined") {
    if (access) {
      sessionStorage.setItem("grandstay_session_active", "true");
    } else {
      sessionStorage.removeItem("grandstay_session_active");
    }
  }
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function getRefreshToken(): string | null {
  return currentRefreshToken;
}

/**
 * Universal fetch wrapper enforcing correlation ID tracing, auth token injection,
 * and standardized error handling without mock fallback.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const correlationId = crypto.randomUUID();
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-ID", correlationId);

  if (currentAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${currentAccessToken}`);
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${getApiBase()}${cleanEndpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
  }

  if (!response.ok || (data && data.success === false)) {
    const errorMsg =
      data?.error?.message ||
      data?.message ||
      `Request failed with status ${response.status}`;
    const err: any = new Error(errorMsg);
    err.status = response.status;
    err.code = data?.error?.code || `HTTP_${response.status}`;
    err.details = data?.error?.details;
    err.correlationId = correlationId;
    throw err;
  }

  return data as ApiResponse<T>;
}

// Health Probes
export async function fetchHealthProbe(): Promise<ApiResponse<HealthResponse>> {
  return apiFetch<HealthResponse>("/health");
}

export async function fetchSystemMeta(): Promise<ApiResponse<SystemMetaResponse>> {
  return apiFetch<SystemMetaResponse>("/system-meta");
}

// Authentication API methods
export interface LoginResponseData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  role: string;
  property_id?: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    global_role: string;
    assigned_property_ids: string[];
  };
}

export async function loginUser(
  email: string,
  password: string,
  propertyId?: string
): Promise<ApiResponse<LoginResponseData>> {
  const res = await apiFetch<LoginResponseData>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, property_id: propertyId }),
  });
  if (res.data) {
    setTokens(res.data.access_token, res.data.refresh_token);
  }
  return res;
}

export async function registerCustomer(payload: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  country?: string;
}): Promise<ApiResponse<{ id: string; email: string; first_name: string; last_name: string; global_role: string }>> {
  return apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rotateRefreshToken(
  refreshToken: string
): Promise<ApiResponse<{ access_token: string; refresh_token: string; expires_in: number; role: string }>> {
  const res = await apiFetch<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    role: string;
  }>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.data) {
    setTokens(res.data.access_token, res.data.refresh_token);
  }
  return res;
}

export async function logoutUser(refreshToken?: string): Promise<ApiResponse<{ logged_out: boolean }>> {
  const tokenToRevoke = refreshToken || currentRefreshToken;
  try {
    return await apiFetch<{ logged_out: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: tokenToRevoke || "" }),
    });
  } finally {
    setTokens(null, null);
  }
}

export async function fetchCurrentUserProfile(): Promise<
  ApiResponse<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    global_role: string;
    is_active: boolean;
    is_superuser: boolean;
    assigned_property_ids: string[];
  }>
> {
  return apiFetch("/auth/me");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse<{ password_changed: boolean }>> {
  return apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function requestForgotPassword(
  email: string
): Promise<ApiResponse<{ message: string; simulated_reset_token?: string }>> {
  return apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function submitPasswordReset(
  token: string,
  newPassword: string
): Promise<ApiResponse<{ password_reset: boolean }>> {
  return apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function adminProvisionUser(payload: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  global_role: string;
  is_superuser?: boolean;
  assigned_property_ids: string[];
}): Promise<ApiResponse<any>> {
  return apiFetch("/auth/admin/provision", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateUserStatus(
  userId: string,
  isActive: boolean
): Promise<ApiResponse<any>> {
  return apiFetch(`/auth/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}

// Property & Booking APIs
export async function fetchPublicProperties(filters?: {
  property_type?: string;
  city?: string;
}): Promise<ApiResponse<any[]>> {
  const params = new URLSearchParams();
  if (filters?.property_type && filters.property_type !== "all") {
    params.set("property_type", filters.property_type);
  }
  if (filters?.city) {
    params.set("city", filters.city);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<any[]>(`/properties/public${query}`);
}

export async function fetchPublicPropertyBySlug(slug: string): Promise<ApiResponse<any>> {
  return apiFetch<any>(`/properties/public/${encodeURIComponent(slug)}`);
}

export async function fetchAdminProperties(filters?: {
  property_type?: string;
  publication_status?: string;
  q?: string;
  include_inactive?: boolean;
}): Promise<ApiResponse<import("@/src/types/property").Property[]>> {
  const params = new URLSearchParams();
  if (filters?.property_type && filters.property_type !== "all") {
    params.set("property_type", filters.property_type);
  }
  if (filters?.publication_status && filters.publication_status !== "all") {
    params.set("publication_status", filters.publication_status);
  }
  if (filters?.q) {
    params.set("q", filters.q);
  }
  if (filters?.include_inactive) {
    params.set("include_inactive", "true");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<import("@/src/types/property").Property[]>(`/properties${query}`);
}

export async function fetchPropertyById(
  propertyId: string
): Promise<ApiResponse<import("@/src/types/property").Property>> {
  return apiFetch<import("@/src/types/property").Property>(`/properties/${propertyId}`);
}

export async function createProperty(
  payload: import("@/src/types/property").PropertyCreateInput
): Promise<ApiResponse<import("@/src/types/property").Property>> {
  return apiFetch<import("@/src/types/property").Property>("/properties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProperty(
  propertyId: string,
  payload: import("@/src/types/property").PropertyUpdateInput
): Promise<ApiResponse<import("@/src/types/property").Property>> {
  return apiFetch<import("@/src/types/property").Property>(`/properties/${propertyId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function publishProperty(
  propertyId: string,
  publicationStatus: import("@/src/types/property").PublicationStatus
): Promise<ApiResponse<import("@/src/types/property").Property>> {
  return apiFetch<import("@/src/types/property").Property>(`/properties/${propertyId}/publish`, {
    method: "POST",
    body: JSON.stringify({ publication_status: publicationStatus }),
  });
}

export async function archiveProperty(
  propertyId: string
): Promise<
  ApiResponse<{
    id: string;
    is_active: boolean;
    publication_status: string;
    archived_at: string;
    message: string;
  }>
> {
  return apiFetch(`/properties/${propertyId}/archive`, {
    method: "POST",
  });
}

export async function fetchPropertyPrivateDetails(propertyId: string): Promise<ApiResponse<any>> {
  return apiFetch(`/properties/${propertyId}/private-details`);
}

export async function fetchMyBookings(): Promise<ApiResponse<any[]>> {
  return apiFetch<any[]>("/bookings/my");
}

export async function fetchBookingById(bookingId: string): Promise<ApiResponse<any>> {
  return apiFetch(`/bookings/${bookingId}`);
}

// Operational Dashboard & Admin Ledger APIs (Phase 4)
export async function fetchDashboardSummary(
  propertyId?: string
): Promise<ApiResponse<import("@/src/types/dashboard").DashboardDataContract>> {
  const query = propertyId ? `?property_id=${encodeURIComponent(propertyId)}` : "";
  return apiFetch<import("@/src/types/dashboard").DashboardDataContract>(`/dashboard/summary${query}`);
}

export async function fetchAdminReservations(
  propertyId?: string
): Promise<ApiResponse<any[]>> {
  const query = propertyId ? `?property_id=${encodeURIComponent(propertyId)}` : "";
  return apiFetch<any[]>(`/admin/reservations${query}`);
}

// -------------------------------------------------------------------------
// Phase 6 Inventory & Availability Engine API Client
// -------------------------------------------------------------------------

export async function fetchRoomTypes(
  propertyId: string
): Promise<ApiResponse<import("@/src/types/inventory").RoomType[]>> {
  return apiFetch<import("@/src/types/inventory").RoomType[]>(
    `/inventory/room-types?property_id=${encodeURIComponent(propertyId)}`
  );
}

export async function createRoomType(
  payload: Partial<import("@/src/types/inventory").RoomType>
): Promise<ApiResponse<import("@/src/types/inventory").RoomType>> {
  return apiFetch<import("@/src/types/inventory").RoomType>("/inventory/room-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateRoomType(
  id: string,
  payload: Partial<import("@/src/types/inventory").RoomType>
): Promise<ApiResponse<import("@/src/types/inventory").RoomType>> {
  return apiFetch<import("@/src/types/inventory").RoomType>(`/inventory/room-types/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteRoomType(id: string): Promise<ApiResponse<any>> {
  return apiFetch(`/inventory/room-types/${id}`, {
    method: "DELETE",
  });
}

export async function fetchRooms(filters: {
  property_id: string;
  room_type_id?: string;
  operational_status?: string;
  q?: string;
}): Promise<ApiResponse<import("@/src/types/inventory").Room[]>> {
  const params = new URLSearchParams();
  params.set("property_id", filters.property_id);
  if (filters.room_type_id && filters.room_type_id !== "all") {
    params.set("room_type_id", filters.room_type_id);
  }
  if (filters.operational_status && filters.operational_status !== "all") {
    params.set("operational_status", filters.operational_status);
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  return apiFetch<import("@/src/types/inventory").Room[]>(`/inventory/rooms?${params.toString()}`);
}

export async function createRoom(payload: {
  property_id: string;
  room_type_id: string;
  floor_id?: string;
  floor_name?: string;
  room_number: string;
  operational_status?: string;
  cleanliness_status?: string;
  keycard_code?: string;
  notes?: string;
  initial_bed_count?: number;
  initial_bed_prefix?: string;
}): Promise<ApiResponse<import("@/src/types/inventory").Room>> {
  return apiFetch<import("@/src/types/inventory").Room>("/inventory/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchRoomById(
  id: string
): Promise<ApiResponse<import("@/src/types/inventory").Room>> {
  return apiFetch<import("@/src/types/inventory").Room>(`/inventory/rooms/${id}`);
}

export async function updateRoom(
  id: string,
  payload: Partial<import("@/src/types/inventory").Room>
): Promise<ApiResponse<import("@/src/types/inventory").Room>> {
  return apiFetch<import("@/src/types/inventory").Room>(`/inventory/rooms/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateRoomStatus(
  id: string,
  operationalStatus?: string,
  cleanlinessStatus?: string
): Promise<ApiResponse<import("@/src/types/inventory").Room>> {
  return apiFetch<import("@/src/types/inventory").Room>(`/inventory/rooms/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      operational_status: operationalStatus,
      cleanliness_status: cleanlinessStatus,
    }),
  });
}

export async function blockRoomForMaintenance(
  id: string,
  payload: { check_in_date: string; check_out_date: string; notes: string }
): Promise<ApiResponse<any>> {
  return apiFetch(`/inventory/rooms/${id}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteRoom(id: string): Promise<ApiResponse<any>> {
  return apiFetch(`/inventory/rooms/${id}`, {
    method: "DELETE",
  });
}

export async function fetchBeds(
  propertyId: string,
  roomId?: string
): Promise<ApiResponse<import("@/src/types/inventory").Bed[]>> {
  const query = roomId
    ? `?property_id=${encodeURIComponent(propertyId)}&room_id=${encodeURIComponent(roomId)}`
    : `?property_id=${encodeURIComponent(propertyId)}`;
  return apiFetch<import("@/src/types/inventory").Bed[]>(`/inventory/beds${query}`);
}

export async function createBed(payload: {
  property_id: string;
  room_id: string;
  bed_label: string;
  bed_type?: string;
  locker_number?: string;
  operational_status?: string;
}): Promise<ApiResponse<import("@/src/types/inventory").Bed>> {
  return apiFetch<import("@/src/types/inventory").Bed>("/inventory/beds", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBed(
  id: string,
  payload: Partial<import("@/src/types/inventory").Bed>
): Promise<ApiResponse<import("@/src/types/inventory").Bed>> {
  return apiFetch<import("@/src/types/inventory").Bed>(`/inventory/beds/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateBedStatus(
  id: string,
  operationalStatus: string
): Promise<ApiResponse<import("@/src/types/inventory").Bed>> {
  return apiFetch<import("@/src/types/inventory").Bed>(`/inventory/beds/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ operational_status: operationalStatus }),
  });
}

export async function blockBedForMaintenance(
  id: string,
  payload: { check_in_date: string; check_out_date: string; notes: string }
): Promise<ApiResponse<any>> {
  return apiFetch(`/inventory/beds/${id}/block`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteBed(id: string): Promise<ApiResponse<any>> {
  return apiFetch(`/inventory/beds/${id}`, {
    method: "DELETE",
  });
}

export async function fetchInventoryAvailability(
  propertyId: string,
  checkInDate: string,
  checkOutDate: string,
  roomTypeId?: string
): Promise<ApiResponse<import("@/src/types/inventory").PropertyAvailabilityResponse>> {
  const params = new URLSearchParams({
    property_id: propertyId,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
  });
  if (roomTypeId && roomTypeId !== "all") {
    params.set("room_type_id", roomTypeId);
  }
  return apiFetch<import("@/src/types/inventory").PropertyAvailabilityResponse>(
    `/inventory/availability?${params.toString()}`
  );
}

export async function fetchInventorySummary(
  propertyId: string
): Promise<ApiResponse<import("@/src/types/inventory").InventorySummaryResponse>> {
  return apiFetch<import("@/src/types/inventory").InventorySummaryResponse>(
    `/inventory/summary?property_id=${encodeURIComponent(propertyId)}`
  );
}

export async function fetchInventoryCalendar(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<ApiResponse<import("@/src/types/inventory").CalendarMatrixResponse>> {
  const params = new URLSearchParams({
    property_id: propertyId,
    start_date: startDate,
    end_date: endDate,
  });
  return apiFetch<import("@/src/types/inventory").CalendarMatrixResponse>(
    `/inventory/calendar?${params.toString()}`
  );
}

export async function fetchPublicAvailability(
  slug: string,
  checkInDate: string,
  checkOutDate: string
): Promise<ApiResponse<any>> {
  const params = new URLSearchParams({
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
  });
  return apiFetch<any>(
    `/properties/public/${encodeURIComponent(slug)}/availability?${params.toString()}`
  );
}

// ---------------------------------------------------------------------------
// Phase 7: Hostel Operations Client Methods
// ---------------------------------------------------------------------------
import type {
  HostellerProfile,
  HostelStay,
  HostelOperationalSummary,
  HostelFrontDeskQueue,
  CreateHostellerInput,
  CreateHostelStayInput,
  WalkInStayInput,
} from "@/src/types/hostel";

export async function fetchHostellers(
  propertyId: string,
  filters?: { q?: string; status?: string }
): Promise<ApiResponse<HostellerProfile[]>> {
  const params = new URLSearchParams({ property_id: propertyId });
  if (filters?.q) params.set("q", filters.q);
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  return apiFetch<HostellerProfile[]>(`/hostel/hostellers?${params.toString()}`);
}

export async function createHosteller(
  payload: CreateHostellerInput
): Promise<ApiResponse<HostellerProfile>> {
  return apiFetch<HostellerProfile>("/hostel/hostellers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchHostellerById(
  id: string
): Promise<ApiResponse<HostellerProfile & { stays: HostelStay[] }>> {
  return apiFetch<HostellerProfile & { stays: HostelStay[] }>(`/hostel/hostellers/${id}`);
}

export async function updateHosteller(
  id: string,
  payload: Partial<HostellerProfile>
): Promise<ApiResponse<HostellerProfile>> {
  return apiFetch<HostellerProfile>(`/hostel/hostellers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deactivateHosteller(id: string): Promise<ApiResponse<{ id: string; is_active: boolean }>> {
  return apiFetch<{ id: string; is_active: boolean }>(`/hostel/hostellers/${id}`, {
    method: "DELETE",
  });
}

export async function fetchHostelStays(
  propertyId: string,
  filters?: { status?: string; q?: string; date?: string }
): Promise<ApiResponse<HostelStay[]>> {
  const params = new URLSearchParams({ property_id: propertyId });
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);
  if (filters?.date) params.set("date", filters.date);
  return apiFetch<HostelStay[]>(`/hostel/stays?${params.toString()}`);
}

export async function createHostelStay(
  payload: CreateHostelStayInput
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>("/hostel/stays", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function registerWalkInStay(
  payload: WalkInStayInput
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>("/hostel/stays/walk-in", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchHostelStayById(id: string): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>(`/hostel/stays/${id}`);
}

export async function checkInHostelStay(
  id: string,
  payload?: { keycard_code?: string; locker_number?: string; staff_notes?: string }
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>(`/hostel/stays/${id}/check-in`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function checkOutHostelStay(
  id: string,
  payload?: { staff_notes?: string; linen_returned?: boolean; locker_keys_returned?: boolean }
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>(`/hostel/stays/${id}/check-out`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function reassignHostelBed(
  id: string,
  payload: { new_bed_id: string; notes?: string }
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>(`/hostel/stays/${id}/reassign-bed`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function extendHostelStay(
  id: string,
  payload: { new_check_out_date: string; notes?: string }
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>(`/hostel/stays/${id}/extend`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelHostelStay(
  id: string,
  payload?: { reason?: string }
): Promise<ApiResponse<HostelStay>> {
  return apiFetch<HostelStay>(`/hostel/stays/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function fetchHostelDashboard(
  propertyId: string
): Promise<ApiResponse<HostelOperationalSummary>> {
  return apiFetch<HostelOperationalSummary>(`/hostel/dashboard?property_id=${encodeURIComponent(propertyId)}`);
}

export async function fetchHostelFrontDesk(
  propertyId: string
): Promise<ApiResponse<HostelFrontDeskQueue>> {
  return apiFetch<HostelFrontDeskQueue>(`/hostel/front-desk?property_id=${encodeURIComponent(propertyId)}`);
}

// ---------------------------------------------------------------------------
// Phase 8: Hotel Operations Client Methods
// ---------------------------------------------------------------------------
import type {
  HotelGuestProfile,
  HotelStay,
  HotelOperationalSummary,
  HotelFrontDeskQueue,
  CreateHotelGuestInput,
  CreateHotelStayInput,
  WalkInHotelStayInput,
  AdditionalOccupant,
} from "@/src/types/hotel";
import type { Room } from "@/src/types/inventory";

export async function fetchHotelGuests(
  propertyId: string,
  filters?: { q?: string; status?: string }
): Promise<ApiResponse<HotelGuestProfile[]>> {
  const params = new URLSearchParams({ property_id: propertyId });
  if (filters?.q) params.set("q", filters.q);
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  return apiFetch<HotelGuestProfile[]>(`/hotel/guests?${params.toString()}`);
}

export async function createHotelGuest(
  payload: CreateHotelGuestInput
): Promise<ApiResponse<HotelGuestProfile>> {
  return apiFetch<HotelGuestProfile>("/hotel/guests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchHotelGuestById(
  id: string
): Promise<ApiResponse<HotelGuestProfile & { stays: HotelStay[] }>> {
  return apiFetch<HotelGuestProfile & { stays: HotelStay[] }>(`/hotel/guests/${id}`);
}

export async function updateHotelGuest(
  id: string,
  payload: Partial<HotelGuestProfile>
): Promise<ApiResponse<HotelGuestProfile>> {
  return apiFetch<HotelGuestProfile>(`/hotel/guests/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deactivateHotelGuest(
  id: string
): Promise<ApiResponse<{ id: string; is_active: boolean }>> {
  return apiFetch<{ id: string; is_active: boolean }>(`/hotel/guests/${id}`, {
    method: "DELETE",
  });
}

export async function fetchHotelStays(
  propertyId: string,
  filters?: { status?: string; q?: string; date?: string }
): Promise<ApiResponse<HotelStay[]>> {
  const params = new URLSearchParams({ property_id: propertyId });
  if (filters?.status && filters.status !== "all") params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);
  if (filters?.date) params.set("date", filters.date);
  return apiFetch<HotelStay[]>(`/hotel/stays?${params.toString()}`);
}

export async function createHotelStay(
  payload: CreateHotelStayInput
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>("/hotel/stays", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function registerWalkInHotelStay(
  payload: WalkInHotelStayInput
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>("/hotel/stays/walk-in", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchHotelStayById(id: string): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}`);
}

export async function assignHotelRoom(
  id: string,
  payload: { room_id: string; notes?: string }
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}/assign-room`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function changeHotelRoom(
  id: string,
  payload: { new_room_id: string; reason?: string }
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}/change-room`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function checkInHotelStay(
  id: string,
  payload?: {
    keycard_code?: string;
    staff_notes?: string;
    additional_occupants?: AdditionalOccupant[];
  }
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}/check-in`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function checkOutHotelStay(
  id: string,
  payload?: {
    staff_notes?: string;
    room_inspected?: boolean;
    minibar_consumed?: boolean;
  }
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}/check-out`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function extendHotelStay(
  id: string,
  payload: { new_check_out_date: string; notes?: string }
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}/extend`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelHotelStay(
  id: string,
  payload?: { reason?: string }
): Promise<ApiResponse<HotelStay>> {
  return apiFetch<HotelStay>(`/hotel/stays/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export async function fetchHotelAvailableRooms(
  propertyId: string,
  startDate: string,
  endDate: string,
  roomTypeId?: string
): Promise<ApiResponse<Room[]>> {
  const params = new URLSearchParams({
    property_id: propertyId,
    start_date: startDate,
    end_date: endDate,
  });
  if (roomTypeId && roomTypeId !== "all") params.set("room_type_id", roomTypeId);
  return apiFetch<Room[]>(`/hotel/available-rooms?${params.toString()}`);
}

export async function fetchHotelDashboard(
  propertyId: string
): Promise<ApiResponse<HotelOperationalSummary>> {
  return apiFetch<HotelOperationalSummary>(
    `/hotel/dashboard?property_id=${encodeURIComponent(propertyId)}`
  );
}

export async function fetchHotelFrontDesk(
  propertyId: string
): Promise<ApiResponse<HotelFrontDeskQueue>> {
  return apiFetch<HotelFrontDeskQueue>(
    `/hotel/front-desk?property_id=${encodeURIComponent(propertyId)}`
  );
}


