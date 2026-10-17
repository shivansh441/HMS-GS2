/**
 * Standard API response contract matching FastAPI backend envelope.
 */

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  correlation_id?: string;
  timestamp: string;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: unknown;
  correlation_id?: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorDetail;
  timestamp: string;
}

export interface DatabaseHealth {
  status: "connected" | "degraded" | "disconnected";
  latency_ms: number | null;
  dialect?: string;
  error?: string | null;
}

export interface SystemInfo {
  python_version: string;
  server_time_utc: string;
  uptime_seconds: number;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  database: DatabaseHealth;
  system: SystemInfo;
}

export interface SystemMetaResponse {
  service: string;
  version: string;
  api_version: string;
  supported_property_types: string[];
  rbac_roles: string[];
  architecture: string;
  modules: {
    shared: string[];
    hostel_domain: string[];
    hotel_domain: string[];
  };
  security: {
    password_hashing: string;
    token_auth: string;
    isolation: string;
  };
}
