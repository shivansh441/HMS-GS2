import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const LOGOUT_EVENT_KEY = 'haven.customer.logout';
const LOGOUT_CHANNEL = 'haven-customer-auth';

let inMemoryCustomerToken: string | null = null;
let customerRefreshPromise: Promise<string> | null = null;
let logoutChannel: BroadcastChannel | null = null;

export const setCustomerToken = (token: string | null) => {
  inMemoryCustomerToken = token;
};

export const getCustomerToken = () => inMemoryCustomerToken;

export const announceCustomerLogout = () => {
  setCustomerToken(null);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));
  } catch {
    // BroadcastChannel still covers browsers that restrict local storage.
  }
  if (typeof BroadcastChannel !== 'undefined') {
    logoutChannel ??= new BroadcastChannel(LOGOUT_CHANNEL);
    logoutChannel.postMessage({ type: 'logout' });
  }
};

export const subscribeToCustomerLogout = (onLogout: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOGOUT_EVENT_KEY) onLogout();
  };
  window.addEventListener('storage', handleStorage);
  if (typeof BroadcastChannel !== 'undefined') {
    logoutChannel ??= new BroadcastChannel(LOGOUT_CHANNEL);
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'logout') onLogout();
    };
    logoutChannel.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      logoutChannel?.removeEventListener('message', handleMessage);
    };
  }
  return () => window.removeEventListener('storage', handleStorage);
};

export const customerApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'haven',
  },
});

customerApiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryCustomerToken) {
    config.headers.Authorization = `Bearer ${inMemoryCustomerToken}`;
  }
  return config;
});

const refreshCustomerToken = () => {
  if (!customerRefreshPromise) {
    customerRefreshPromise = axios
      .post<{ accessToken: string }>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'haven',
          },
        },
      )
      .then((res) => {
        const token = res.data.accessToken;
        setCustomerToken(token);
        return token;
      })
      .catch((error) => {
        setCustomerToken(null);
        throw error;
      })
      .finally(() => {
        customerRefreshPromise = null;
      });
  }
  return customerRefreshPromise;
};

customerApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const url = originalRequest?.url ?? '';

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      /\/auth\/(login|register|refresh|verify-email|otp\/verify|mfa\/verify|magic-link\/verify)/.test(url)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const token = await refreshCustomerToken();
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return customerApiClient(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
