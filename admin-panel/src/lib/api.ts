import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// In-memory access token storage
let inMemoryAccessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const getAccessToken = () => inMemoryAccessToken;

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
  return config;
});

// Single-flight refresh promise
let refreshPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 Unauthorized and not already refreshing
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Don't loop on auth endpoints
      if (originalRequest.url?.includes('/admin/auth/login') || originalRequest.url?.includes('/admin/auth/refresh')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const res = await axios.post<{ accessToken: string }>(
              `${API_BASE_URL}/admin/auth/refresh`,
              {},
              { withCredentials: true }
            );
            const newToken = res.data.accessToken;
            setAccessToken(newToken);
            return newToken;
          } catch (refreshErr) {
            setAccessToken(null);
            throw refreshErr;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      try {
        const token = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);
