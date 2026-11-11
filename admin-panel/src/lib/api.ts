import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const ADMIN_SESSION_HINT_KEY = 'hs_admin_session_present';

export interface ApiOperation {
  id: number;
  label: string;
}

type TrackedRequestConfig = InternalAxiosRequestConfig & { operationOverlayId?: number };

let nextOperationId = 0;
let apiOperationsSnapshot: ApiOperation[] = [];
const apiOperationListeners = new Set<() => void>();

const publishApiOperations = () => {
  apiOperationsSnapshot = [...activeApiOperations.values()];
  apiOperationListeners.forEach((listener) => listener());
};

const activeApiOperations = new Map<number, ApiOperation>();

export const subscribeToApiOperations = (listener: () => void) => {
  apiOperationListeners.add(listener);
  return () => apiOperationListeners.delete(listener);
};

export const getApiOperationsSnapshot = () => apiOperationsSnapshot;

const operationLabel = (config: InternalAxiosRequestConfig): string | null => {
  const method = config.method?.toLowerCase();
  if (!['post', 'put', 'patch', 'delete'].includes(method || '')) return null;

  const url = config.url?.toLowerCase() || '';
  if (url.includes('/login')) return null;
  if (url.includes('/logout')) return 'Signing out';
  if (url.includes('/fee-configs')) return 'Updating fees';
  if (url.includes('/admin/properties') && method === 'put') return 'Updating property';
  if (url.includes('/admin/properties') && method === 'post') return 'Creating property';
  if (url.includes('/check-in')) return 'Checking in';
  if (url.includes('/check-out')) return 'Checking out';
  if (url.includes('/activate')) return 'Activating account';
  if (url.includes('/reset-password')) return 'Resetting password';
  if (url.includes('/mfa/')) return 'Updating security';
  if (method === 'post') return 'Creating';
  if (method === 'delete') return 'Deleting';
  return 'Updating';
};

const finishApiOperation = (config?: InternalAxiosRequestConfig) => {
  const operationId = (config as TrackedRequestConfig | undefined)?.operationOverlayId;
  if (operationId === undefined || !activeApiOperations.delete(operationId)) return;
  publishApiOperations();
};

// In-memory access token storage
let inMemoryAccessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = () => inMemoryAccessToken;

export const getAdminSessionHint = (): boolean | null => {
  const value = sessionStorage.getItem(ADMIN_SESSION_HINT_KEY);
  return value === null ? null : value === 'true';
};

export const setAdminSessionHint = (hasSession: boolean) => {
  sessionStorage.setItem(ADMIN_SESSION_HINT_KEY, String(hasSession));
};

export const getStoredPropertyId = (): string | null => {
  return sessionStorage.getItem('hs_selected_property_id');
};

export const setStoredPropertyId = (propId: string | null) => {
  if (propId) {
    sessionStorage.setItem('hs_selected_property_id', propId);
  } else {
    sessionStorage.removeItem('hs_selected_property_id');
  }
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Sends HttpOnly hs_admin_rt cookie
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'haven',
  },
});

// Request interceptor: attach bearer token and X-Property-Id header
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryAccessToken) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  const propId = getStoredPropertyId();
  if (propId && propId !== 'ALL') {
    config.headers['X-Property-Id'] = propId;
  }
  const label = operationLabel(config);
  if (label) {
    const operationId = ++nextOperationId;
    (config as TrackedRequestConfig).operationOverlayId = operationId;
    activeApiOperations.set(operationId, { id: operationId, label });
    publishApiOperations();
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

export const refreshAdminSession = (): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ accessToken: string }>(
        `${API_BASE_URL}/admin/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: { 'X-Requested-With': 'haven' },
        },
      )
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        setAdminSessionHint(true);
        return data.accessToken;
      })
      .catch((error: AxiosError) => {
        setAccessToken(null);
        if (error.response?.status === 401) setAdminSessionHint(false);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

apiClient.interceptors.response.use(
  (response) => {
    finishApiOperation(response.config);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    finishApiOperation(originalRequest);

    // If 401 Unauthorized and not already refreshing
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (!getAccessToken()) return Promise.reject(error);
      const authFlowEndpoints = [
        '/admin/auth/login',
        '/admin/auth/refresh',
        '/admin/auth/mfa/verify',
        '/admin/auth/mfa/enroll',
        '/admin/auth/mfa/confirm',
        '/admin/auth/change-password',
        '/auth/activate',
      ];
      if (authFlowEndpoints.some((endpoint) => originalRequest.url?.includes(endpoint))) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const token = await refreshAdminSession();
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);
