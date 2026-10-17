import { ApiResponse, HealthResponse, SystemMetaResponse } from "@/src/types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Universal fetch wrapper enforcing correlation ID tracing and standardized envelope parsing.
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const correlationId = crypto.randomUUID();
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-ID", correlationId);

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${cleanEndpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    // If backend direct URL is on port 8001 during local dev or testing
    if (API_BASE.startsWith("/")) {
      try {
        const fallbackUrl = `http://127.0.0.1:8001/api/v1${cleanEndpoint}`;
        const fallbackRes = await fetch(fallbackUrl, {
          ...options,
          headers,
        });
        const fallbackData = await fallbackRes.json();
        return fallbackData as ApiResponse<T>;
      } catch {
        // Fall through to error
      }
    }

    throw new Error(
      error instanceof Error
        ? `Network request failed: ${error.message}`
        : "Unknown network error communicating with backend"
    );
  }
}

export async function fetchHealthProbe(): Promise<ApiResponse<HealthResponse>> {
  return apiFetch<HealthResponse>("/health");
}

export async function fetchSystemMeta(): Promise<ApiResponse<SystemMetaResponse>> {
  return apiFetch<SystemMetaResponse>("/system-meta");
}
