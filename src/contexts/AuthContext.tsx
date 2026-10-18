import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserRole } from "@/src/types/property";
import {
  loginUser,
  logoutUser,
  registerCustomer,
  fetchCurrentUserProfile,
  getAccessToken,
  getRefreshToken,
} from "@/src/services/api-client";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  assignedPropertyIds: string[];
}

export const PRESET_CREDENTIALS: Record<UserRole, { email: string; pass: string; name: string }> = {
  super_admin: { email: "director@grandstay.com", pass: "Admin2026!Secure", name: "Julian Vance" },
  property_manager: { email: "clara.manager@grandstay.com", pass: "Manager2026!Pass", name: "Clara Ross" },
  front_desk: { email: "liam.desk@grandstay.com", pass: "Desk2026!Pass", name: "Liam Chen" },
  housekeeping: { email: "elena.clean@grandstay.com", pass: "Clean2026!Pass", name: "Elena Silva" },
  accountant: { email: "marcus.finance@grandstay.com", pass: "Finance2026!Pass", name: "Marcus Finch" },
  guest: { email: "sofia.guest@example.com", pass: "Sofia2026!Guest", name: "Sofia Berg" },
};

interface AuthContextType {
  user: CurrentUser;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, pass: string, propertyId?: string) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
    country?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  canAccessProperty: (propertyId: string) => boolean;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
  clearAuthError: () => void;
}

const DEFAULT_USER: CurrentUser = {
  id: "usr-admin-001",
  email: "director@grandstay.com",
  firstName: "Julian",
  lastName: "Vance",
  role: "super_admin",
  assignedPropertyIds: ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(DEFAULT_USER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  // Authenticate default initial user on mount
  useEffect(() => {
    async function initAuth() {
      try {
        const res = await loginUser(PRESET_CREDENTIALS.super_admin.email, PRESET_CREDENTIALS.super_admin.pass);
        if (res.data) {
          setAccessToken(res.data.access_token);
          setRefreshToken(res.data.refresh_token);
          setUser({
            id: res.data.user.id,
            email: res.data.user.email,
            firstName: res.data.user.first_name,
            lastName: res.data.user.last_name,
            role: res.data.user.global_role as UserRole,
            assignedPropertyIds: res.data.user.assigned_property_ids || [],
          });
          setIsAuthenticated(true);
        }
      } catch {
        // Fallback to initial defaults if server is just starting
        setIsAuthenticated(true);
      }
    }
    initAuth();
  }, []);

  const login = async (email: string, pass: string, propertyId?: string) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const res = await loginUser(email, pass, propertyId);
      if (res.data) {
        setAccessToken(res.data.access_token);
        setRefreshToken(res.data.refresh_token);
        setUser({
          id: res.data.user.id,
          email: res.data.user.email,
          firstName: res.data.user.first_name,
          lastName: res.data.user.last_name,
          role: res.data.user.global_role as UserRole,
          assignedPropertyIds: res.data.user.assigned_property_ids || [],
        });
        setIsAuthenticated(true);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
    country?: string;
  }) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await registerCustomer(payload);
      // Automatically log in newly registered customer
      await login(payload.email, payload.password);
    } catch (err: any) {
      setAuthError(err.message || "Registration failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutUser(refreshToken || undefined);
    } catch {
      // Clean up local state regardless
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
      setUser({
        id: "",
        email: "",
        firstName: "Visitor",
        lastName: "",
        role: "guest",
        assignedPropertyIds: [],
      });
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  const switchRole = useCallback(
    async (newRole: UserRole) => {
      const creds = PRESET_CREDENTIALS[newRole];
      if (creds) {
        try {
          await login(creds.email, creds.pass);
        } catch {
          // If direct API call fails, update client state locally
          let assignedProps = ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"];
          if (newRole === "property_manager") assignedProps = ["prop-hostel-001"];
          if (newRole === "front_desk") assignedProps = ["prop-hotel-002"];
          if (newRole === "housekeeping") assignedProps = ["prop-hostel-001", "prop-hotel-002"];
          if (newRole === "guest") assignedProps = [];

          setUser({
            id: `usr-${newRole}-999`,
            email: creds.email,
            firstName: creds.name.split(" ")[0],
            lastName: creds.name.split(" ")[1],
            role: newRole,
            assignedPropertyIds: assignedProps,
          });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const canAccessProperty = (propertyId: string): boolean => {
    if (user.role === "super_admin") return true;
    if (user.role === "guest") return false;
    return user.assignedPropertyIds.includes(propertyId);
  };

  const hasPermission = (requiredRoles: UserRole[]): boolean => {
    if (user.role === "super_admin") return true;
    return requiredRoles.includes(user.role);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        authError,
        accessToken,
        refreshToken,
        login,
        register,
        logout,
        switchRole,
        canAccessProperty,
        hasPermission,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
