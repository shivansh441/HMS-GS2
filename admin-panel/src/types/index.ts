export type AccountType =
  | 'SUPER_ADMIN'
  | 'MANAGER'
  | 'STAFF'
  | 'LONG_TERM_RESIDENT'
  | 'SHORT_TERM_HOSTEL_GUEST'
  | 'HOTEL_GUEST';

export type StaffRole = 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING';

export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface User {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  account_type: AccountType;
  staff_role: StaffRole | null;
  status: UserStatus;
  must_change_password: boolean;
  mfa_enabled: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: string;
  createdAt: string;
}

export interface AdminMeResponse {
  user: User;
  permissions: string[];
  allowedPropertyIds: string[];
  isSuperAdmin: boolean;
}

export interface AuthSuccessResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
  requiresMfa?: boolean;
  mfaChallengeToken?: string;
}

export interface UserListResponse {
  items: User[];
  total: number;
  limit: number;
  offset: number;
}
