import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Property, AdminMeResponse } from '../types';
import {
  apiClient,
  getAdminSessionHint,
  getStoredPropertyId,
  refreshAdminSession,
  setAccessToken,
  setAdminSessionHint,
  setStoredPropertyId,
} from './api';

interface AuthContextValue {
  user: User | null;
  permissions: string[];
  allowedPropertyIds: string[];
  properties: Property[];
  selectedPropertyId: string | 'ALL' | null;
  isLoading: boolean;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  setSelectedPropertyId: (id: string | 'ALL' | null) => void;
  login: (token: string, userData: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  idleWarningVisible: boolean;
  idleCountdown: number;
  dismissIdleWarning: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [allowedPropertyIds, setAllowedPropertyIds] = useState<string[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyState] = useState<string | 'ALL' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Idle timer (30 min total, warning at 28 min)
  const [idleWarningVisible, setIdleWarningVisible] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(120); // 2 minutes countdown
  const lastActivityRef = useRef<number>(Date.now());

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (idleWarningVisible) {
      setIdleWarningVisible(false);
      setIdleCountdown(120);
    }
  }, [idleWarningVisible]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleUserActivity = () => resetActivity();
    events.forEach(e => window.addEventListener(e, handleUserActivity));
    return () => events.forEach(e => window.removeEventListener(e, handleUserActivity));
  }, [resetActivity]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/admin/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      setAccessToken(null);
      setAdminSessionHint(false);
      setUser(null);
      setPermissions([]);
      setAllowedPropertyIds([]);
      setProperties([]);
      setIdleWarningVisible(false);
    }
  }, []);

  // Idle interval check
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMinutes = (now - lastActivityRef.current) / (1000 * 60);

      if (elapsedMinutes >= 30) {
        // Idle logout reached
        logout();
      } else if (elapsedMinutes >= 28) {
        setIdleWarningVisible(true);
        const remainingSeconds = Math.max(0, Math.floor((30 * 60 * 1000 - (now - lastActivityRef.current)) / 1000));
        setIdleCountdown(remainingSeconds);
      } else {
        setIdleWarningVisible(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user, logout]);

  const loadProperties = useCallback(async (allowedIds: string[]) => {
    try {
      const res = await apiClient.get<Property[]>('/admin/properties');
      const scopedProperties = res.data.filter((property) => allowedIds.includes(property.id));
      const storedId = getStoredPropertyId();
      const restoredId =
        storedId === 'ALL' && scopedProperties.length > 1
          ? 'ALL'
          : storedId && scopedProperties.some((property) => property.id === storedId)
            ? storedId
            : scopedProperties.length > 1
              ? 'ALL'
              : scopedProperties[0]?.id || null;
      setProperties(scopedProperties);
      setStoredPropertyId(restoredId);
      setSelectedPropertyState(restoredId);
    } catch {
      setProperties([]);
      setStoredPropertyId(null);
      setSelectedPropertyState(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiClient.get<AdminMeResponse>('/admin/me');
      const allowedIds = [...new Set(res.data.allowedPropertyIds)];
      const storedPropertyId = getStoredPropertyId();
      const restoredPropertyId =
        storedPropertyId === 'ALL' && allowedIds.length > 1
          ? 'ALL'
          : storedPropertyId && allowedIds.includes(storedPropertyId)
            ? storedPropertyId
            : allowedIds.length > 1
              ? 'ALL'
              : allowedIds[0] || null;

      setStoredPropertyId(restoredPropertyId);
      setSelectedPropertyState(restoredPropertyId);
      setUser(res.data.user);
      setPermissions(res.data.permissions);
      setAllowedPropertyIds(allowedIds);
      await loadProperties(allowedIds);
    } catch {
      setUser(null);
    }
  }, [loadProperties]);

  // Initial silent refresh on app load
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        if (getAdminSessionHint() === false) {
          setUser(null);
          return;
        }
        await refreshAdminSession();
        await refreshProfile();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, [refreshProfile]);

  const login = async (token: string, userData: User) => {
    setAccessToken(token);
    setAdminSessionHint(true);
    setUser(userData);
    await refreshProfile();
  };

  const setSelectedPropertyId = (id: string | 'ALL' | null) => {
    if (id !== null && id !== 'ALL' && !allowedPropertyIds.includes(id)) return;
    if (id === 'ALL' && allowedPropertyIds.length < 2) {
      id = allowedPropertyIds[0] || null;
    }
    setSelectedPropertyState(id);
    setStoredPropertyId(id);
  };

  const toggleTheme = (t: 'light' | 'dark') => {
    setTheme(t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        allowedPropertyIds,
        properties,
        selectedPropertyId,
        isLoading,
        theme,
        setTheme: toggleTheme,
        setSelectedPropertyId,
        login,
        logout,
        refreshProfile,
        idleWarningVisible,
        idleCountdown,
        dismissIdleWarning: resetActivity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
