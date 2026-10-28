export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';

export type StaffRole = 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING';

export type CustomerPersona = 'HOTEL_GUEST' | 'HOSTEL_GUEST' | 'HOSTELER';

export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface User {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  customerPersona: CustomerPersona | null;
  role: Role;
  staffRole: StaffRole | null;
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
  type: string;
  currency: string;
  floors: number;
  floorCount: number;
  unitCount: number;
  createdAt: string;
}

export interface AdminMeResponse {
  user: User;
  permissions: string[];
  allowedPropertyIds: string[];
}

export interface AuthSuccessResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: User | null;
  mfaRequired?: boolean;
  requiresMfa?: boolean;
  mfaToken?: string | null;
  mfaChallengeToken?: string | null;
  mfaEnrollmentRequired?: boolean;
  enrollToken?: string | null;
  passwordChangeRequired?: boolean;
  changeToken?: string | null;
}

export interface MfaEnrollmentResponse {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

export interface MfaConfirmResponse {
  recoveryCodes: string[];
}

export interface AdminSession {
  id: string;
  ip: string | null;
  browser: string;
  os: string;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  createdAt: string;
}

export interface UserListResponse {
  items: User[];
  total: number;
  limit: number;
  offset: number;
}
