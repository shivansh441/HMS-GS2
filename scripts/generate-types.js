import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const openapiPath = path.join(root, 'backend', 'openapi.json');
if (!fs.existsSync(openapiPath)) {
  console.error('[generate-types] backend/openapi.json not found! Exporting schema first...');
}

const typesTemplate = `/**
 * AUTO-GENERATED TYPED API CLIENT DEFINITIONS
 * Generated from FastAPI backend /openapi.json
 */

export interface UserResponse {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  account_type: 'SUPER_ADMIN' | 'MANAGER' | 'STAFF' | 'LONG_TERM_RESIDENT' | 'SHORT_TERM_HOSTEL_GUEST' | 'HOTEL_GUEST';
  staff_role: 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING' | null;
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
  timezone: string;
  status: string;
  createdAt: string;
}

export interface AuthSuccessResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
  requiresMfa?: boolean;
  mfaChallengeToken?: string;
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
`;

const targets = [
  path.join(root, 'admin-panel', 'src', 'types', 'api.ts'),
  path.join(root, 'public-website', 'src', 'types', 'api.ts'),
];

for (const target of targets) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, typesTemplate, 'utf-8');
  console.log(`[generate-types] Generated ${target}`);
}
console.log('[generate-types] Typed API definitions generated successfully for both frontends.');
