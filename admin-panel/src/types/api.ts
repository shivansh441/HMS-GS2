/**
 * AUTO-GENERATED TYPED API CLIENT DEFINITIONS
 * Generated from FastAPI backend /openapi.json
 */

export interface UserResponse {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
  staffRole: 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING' | null;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  must_change_password: boolean;
  mfa_enabled: boolean;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  created_at: string;
}

export interface PropertyItemResponse {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  timezone: string;
  currency: string;
  floors: number;
  floorCount: number;
  unitCount: number;
  createdAt: string;
}

export interface AuthSuccessResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse | null;
  mfaRequired?: boolean;
  requiresMfa?: boolean;
  mfaToken?: string | null;
  mfaChallengeToken?: string;
  mfaEnrollmentRequired?: boolean;
  enrollToken?: string | null;
  passwordChangeRequired?: boolean;
  changeToken?: string | null;
}

export interface ProfileCompletion {
  percent: number;
  missing: string[];
}

export interface NextAction {
  action: string;
  title: string;
  description: string;
}

export interface OverviewResponse {
  stage: 'REGISTERED_NO_BOOKING' | 'UPCOMING' | 'ACTIVE_STAY' | 'PAST_ONLY';
  bookingsCount: number;
  profileCompletion: ProfileCompletion;
  nextActions: NextAction[];
}

export interface UserListResponse {
  items: UserResponse[];
  total: number;
  limit: number;
  offset: number;
}
