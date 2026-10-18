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

  const data = await response.json();

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
export async function fetchPublicProperties(): Promise<ApiResponse<any[]>> {
  return apiFetch<any[]>("/properties/public");
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

