'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  announceCustomerLogout,
  customerApiClient,
  setCustomerToken,
  subscribeToCustomerLogout,
} from './api';

export interface CustomerUser {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  role: 'CUSTOMER';
  mfa_enabled?: boolean;
  status: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
}

export type CustomerUserResponse = CustomerUser;

export interface ProfileCompletion {
  percent: number;
  missing: string[];
}

export interface NextAction {
  action: string;
  title: string;
  description: string;
}

export interface OverviewData {
  stage: 'REGISTERED_NO_BOOKING' | 'UPCOMING' | 'ACTIVE_STAY' | 'PAST_ONLY';
  bookingsCount: number;
  profileCompletion: ProfileCompletion;
  nextActions: NextAction[];
}

interface CustomerAuthContextValue {
  user: CustomerUser | null;
  overview: OverviewData | null;
  isLoading: boolean;
  login: (token: string, userData: CustomerUserResponse) => Promise<void>;
  logout: () => Promise<void>;
  fetchOverview: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export const CustomerAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await customerApiClient.get<OverviewData>('/me/overview');
      setOverview(res.data);
    } catch (err) {
      console.error('Failed to load overview data', err);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await customerApiClient.get<CustomerUserResponse>('/me');
      setUser(res.data);
      await fetchOverview();
    } catch {
      setUser(null);
      setOverview(null);
    }
  }, [fetchOverview]);

  // Initial silent refresh on app load
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        const refreshRes = await customerApiClient.post<{ accessToken: string }>('/auth/refresh');
        setCustomerToken(refreshRes.data.accessToken);
        await fetchProfile();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, [fetchProfile]);

  useEffect(
    () =>
      subscribeToCustomerLogout(() => {
        setCustomerToken(null);
        setUser(null);
        setOverview(null);
      }),
    [],
  );

  const login = useCallback(async (token: string, userData: CustomerUserResponse) => {
    setCustomerToken(token);
    setUser(userData);
    await fetchOverview();
  }, [fetchOverview]);

  const logout = useCallback(async () => {
    try {
      await customerApiClient.post('/auth/logout');
    } catch {
      // Ignore network errors
    } finally {
      announceCustomerLogout();
      setUser(null);
      setOverview(null);
    }
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{
        user,
        overview,
        isLoading,
        login,
        logout,
        fetchOverview,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
};

export const useCustomerAuth = () => {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider');
  return ctx;
};
