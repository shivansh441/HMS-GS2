import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

let inMemoryCustomerToken: string | null = null;

export const setCustomerToken = (token: string | null) => {
  inMemoryCustomerToken = token;
};

export const getCustomerToken = () => inMemoryCustomerToken;

export const customerApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Sends HttpOnly hs_cust_rt cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

customerApiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (inMemoryCustomerToken) {
    config.headers.Authorization = `Bearer ${inMemoryCustomerToken}`;
  }
  return config;
});

let customerRefreshPromise: Promise<string> | null = null;

customerApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/register')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!customerRefreshPromise) {
        customerRefreshPromise = (async () => {
          try {
            const res = await axios.post<{ accessToken: string }>(
              `${API_BASE_URL}/auth/refresh`,
              {},
              { withCredentials: true }
            );
            const newToken = res.data.accessToken;
            setCustomerToken(newToken);
            return newToken;
          } catch (refreshErr) {
            setCustomerToken(null);
            throw refreshErr;
          } finally {
            customerRefreshPromise = null;
          }
        })();
      }

      try {
        const token = await customerRefreshPromise;
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return customerApiClient(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);
