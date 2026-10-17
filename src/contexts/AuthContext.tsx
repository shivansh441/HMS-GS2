import React, { createContext, useContext, useState } from "react";
import { UserRole } from "@/src/types/property";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  assignedPropertyIds: string[]; // Properties this user is authorized to access
}

interface AuthContextType {
  user: CurrentUser;
  switchRole: (role: UserRole) => void;
  canAccessProperty: (propertyId: string) => boolean;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
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

  const switchRole = (newRole: UserRole) => {
    let assignedProps = ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"];
    let name = "Julian Vance";
    let email = "director@grandstay.com";

    if (newRole === "property_manager") {
      assignedProps = ["prop-hostel-001"]; // Scoped only to Edinburgh Hostel
      name = "Clara Ross";
      email = "clara.manager@grandstay.com";
    } else if (newRole === "front_desk") {
      assignedProps = ["prop-hotel-002"]; // Scoped only to London Hotel
      name = "Liam Chen";
      email = "liam.desk@grandstay.com";
    } else if (newRole === "housekeeping") {
      assignedProps = ["prop-hostel-001", "prop-hotel-002"];
      name = "Elena Silva";
      email = "elena.clean@grandstay.com";
    } else if (newRole === "accountant") {
      assignedProps = ["prop-hostel-001", "prop-hotel-002", "prop-hybrid-003"];
      name = "Marcus Finch";
      email = "marcus.finance@grandstay.com";
    } else if (newRole === "guest") {
      assignedProps = ["prop-hotel-002"];
      name = "Sofia Berg";
      email = "sofia.guest@example.com";
    }

    setUser({
      id: `usr-${newRole}-999`,
      email,
      firstName: name.split(" ")[0],
      lastName: name.split(" ")[1],
      role: newRole,
      assignedPropertyIds: assignedProps,
    });
  };

  const canAccessProperty = (propertyId: string): boolean => {
    if (user.role === "super_admin") return true;
    return user.assignedPropertyIds.includes(propertyId);
  };

  const hasPermission = (requiredRoles: UserRole[]): boolean => {
    if (user.role === "super_admin") return true;
    return requiredRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        switchRole,
        canAccessProperty,
        hasPermission,
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
