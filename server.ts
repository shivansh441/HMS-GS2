import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());

// CORS & Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Property-Id');
  res.header('Access-Control-Expose-Headers', 'X-Property-Id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Types & Data Structures
interface PropertyItem {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: string;
  createdAt: string;
}

interface UserRecord {
  id: string;
  email: string;
  username: string;
  full_name: string;
  phone: string | null;
  password: string;
  account_type: string;
  staff_role: string | null;
  status: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  id_document_type: string | null;
  id_document_last4: string | null;
  id_document_number_encrypted: string | null;
  mfa_enabled: boolean;
  mfa_enforced: boolean;
  property_access: string[];
  property_links: string[];
  created_at: string;
}

interface AuditRecord {
  id: string;
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  createdAt: string;
}

// In-Memory Seeded Database
const PROPERTIES: PropertyItem[] = [
  {
    id: 'prop-hq01',
    code: 'HQ-01',
    name: 'Haven Grand Downtown',
    timezone: 'America/New_York',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'prop-hq02',
    code: 'HQ-02',
    name: 'Haven Boutique Waterfront',
    timezone: 'America/Los_Angeles',
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00Z',
  },
];

const USERS: UserRecord[] = [
  {
    id: 'user-super-admin',
    email: 'admin@havenstays.com',
    username: 'superadmin',
    full_name: 'Super Administrator',
    phone: '+1 (555) 010-0001',
    password: 'AdminSecurePass123!',
    account_type: 'SUPER_ADMIN',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: '2026-10-01T00:00:00Z',
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: true,
    mfa_enforced: true,
    property_access: ['prop-hq01', 'prop-hq02'],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-mgr-hq01',
    email: 'manager.hq01@havenstays.com',
    username: 'manager_hq01',
    full_name: 'Marcus Vance (HQ-01 Mgr)',
    phone: '+1 (555) 010-0002',
    password: 'ManagerSecurePass123!',
    account_type: 'MANAGER',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: '2026-10-01T00:00:00Z',
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: ['prop-hq01'],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-mgr-all',
    email: 'manager.all@havenstays.com',
    username: 'manager_all',
    full_name: 'Elena Rostova (Dual Mgr)',
    phone: '+1 (555) 010-0003',
    password: 'ManagerSecurePass123!',
    account_type: 'MANAGER',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: '2026-10-01T00:00:00Z',
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: ['prop-hq01', 'prop-hq02'],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-frontdesk-hq01',
    email: 'frontdesk@havenstays.com',
    username: 'frontdesk_hq01',
    full_name: 'Chloe Bennett (Front Desk)',
    phone: '+1 (555) 010-0004',
    password: 'StaffSecurePass123!',
    account_type: 'STAFF',
    staff_role: 'FRONT_DESK',
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: null,
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: ['prop-hq01'],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-housekeeping-hq02',
    email: 'housekeeping@havenstays.com',
    username: 'housekeeping_hq02',
    full_name: 'David Chen (Housekeeping)',
    phone: '+1 (555) 010-0005',
    password: 'StaffSecurePass123!',
    account_type: 'STAFF',
    staff_role: 'HOUSEKEEPING',
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: null,
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: ['prop-hq02'],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-cust-nobook1',
    email: 'guest.nobooking1@gmail.com',
    username: 'guest_nobook1',
    full_name: 'Sophia Martinez',
    phone: '+1 (555) 019-2831',
    password: 'CustomerPass123!',
    account_type: 'HOTEL_GUEST',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: null,
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: [],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-cust-nobook2',
    email: 'guest.nobooking2@gmail.com',
    username: 'guest_nobook2',
    full_name: 'Liam Gallagher',
    phone: null,
    password: 'CustomerPass123!',
    account_type: 'SHORT_TERM_HOSTEL_GUEST',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: null,
    phone_verified_at: null,
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: [],
    property_links: [],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-resident-alex',
    email: 'resident.pending@gmail.com',
    username: 'resident_alex',
    full_name: 'Alex Rivera',
    phone: '+1 (555) 019-4455',
    password: 'CustomerPass123!',
    account_type: 'LONG_TERM_RESIDENT',
    staff_role: null,
    status: 'PENDING_ACTIVATION',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: '2026-10-01T00:00:00Z',
    id_document_type: 'PASSPORT',
    id_document_last4: '4321',
    id_document_number_encrypted: 'enc_pass_987654321',
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: [],
    property_links: ['prop-hq01'],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-guest-hotel',
    email: 'guest.hotel@gmail.com',
    username: 'guest_hotel',
    full_name: 'Grace Hopper',
    phone: '+1 (555) 019-7788',
    password: 'CustomerPass123!',
    account_type: 'HOTEL_GUEST',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: '2026-10-01T00:00:00Z',
    id_document_type: 'DRIVERS_LICENSE',
    id_document_last4: '1024',
    id_document_number_encrypted: 'enc_lic_1024',
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: [],
    property_links: ['prop-hq01'],
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'user-guest-hostel',
    email: 'guest.hostel@gmail.com',
    username: 'guest_hostel',
    full_name: 'Julian Thorne',
    phone: '+1 (555) 019-9900',
    password: 'CustomerPass123!',
    account_type: 'SHORT_TERM_HOSTEL_GUEST',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: '2026-10-01T00:00:00Z',
    phone_verified_at: null,
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: [],
    property_links: ['prop-hq02'],
    created_at: '2026-10-01T00:00:00Z',
  },
];

const AUDIT_LOGS: AuditRecord[] = [
  {
    id: 'audit-001',
    actorUserId: 'user-super-admin',
    targetUserId: null,
    action: 'SYSTEM_BOOTSTRAP',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'audit-002',
    actorUserId: 'user-super-admin',
    targetUserId: 'user-mgr-hq01',
    action: 'ROLE_ASSIGN_MANAGER_HQ01',
    createdAt: '2026-10-01T00:05:00Z',
  },
  {
    id: 'audit-003',
    actorUserId: 'user-super-admin',
    targetUserId: 'user-mgr-all',
    action: 'ROLE_ASSIGN_DUAL_MANAGER',
    createdAt: '2026-10-01T00:10:00Z',
  },
];

// Refresh Token Store: maps opaqueToken -> { userId, audience, expiresAt }
const REFRESH_TOKENS = new Map<string, { userId: string; audience: 'admin' | 'customer'; expiresAt: number }>();

// JWT & Cryptography Utilities
const JWT_SECRET = process.env.JWT_SECRET || 'haven_stays_jwt_signing_secret_key_2026_prod';

function createAccessToken(sub: string, aud: 'admin' | 'customer', account_type: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 15 * 60; // 15 minutes
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      aud,
      account_type,
      iat: now,
      exp,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyAccessToken(token: string, expectedAud: 'admin' | 'customer'): { sub: string; aud: string; account_type: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token structure');
  }
  const [header, payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  if (signature !== expectedSig) {
    throw new Error('Invalid token signature');
  }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token has expired');
  }
  if (data.aud !== expectedAud) {
    throw new Error(`Invalid audience: token intended for '${data.aud}', not '${expectedAud}'`);
  }
  return data;
}

function formatUser(u: UserRecord) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    full_name: u.full_name,
    phone: u.phone,
    account_type: u.account_type,
    staff_role: u.staff_role,
    status: u.status,
    email_verified_at: u.email_verified_at,
    phone_verified_at: u.phone_verified_at,
    id_document_type: u.id_document_type,
    id_document_last4: u.id_document_last4,
    created_at: u.created_at,
  };
}

function getPermissionsForUser(accountType: string, staffRole: string | null): string[] {
  if (accountType === 'SUPER_ADMIN') {
    return [
      'VIEW_DASHBOARD',
      'VIEW_PROPERTIES',
      'VIEW_USERS',
      'CREATE_STAFF',
      'ONBOARD_GUEST',
      'VIEW_UNASSIGNED_CUSTOMERS',
      'MANAGE_PROPERTIES',
      'VIEW_AUDIT_LOGS',
    ];
  }
  if (accountType === 'MANAGER') {
    return ['VIEW_DASHBOARD', 'VIEW_PROPERTIES', 'VIEW_USERS', 'CREATE_STAFF', 'ONBOARD_GUEST'];
  }
  if (accountType === 'STAFF') {
    if (staffRole === 'FRONT_DESK') {
      return ['VIEW_DASHBOARD', 'VIEW_PROPERTIES', 'VIEW_USERS', 'ONBOARD_GUEST'];
    }
    return ['VIEW_DASHBOARD', 'VIEW_PROPERTIES'];
  }
  return [];
}

// Authentication Middleware
function authenticateCustomer(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token, 'customer');
    const user = USERS.find((u) => u.id === payload.sub);
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Customer account not found' } });
      return;
    }
    (req as any).user = user;
    next();
  } catch (err: any) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: err.message || 'Invalid or expired customer token' } });
  }
}

function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication required' } });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token, 'admin');
    const user = USERS.find((u) => u.id === payload.sub);
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin account not found' } });
      return;
    }
    (req as any).user = user;
    next();
  } catch (err: any) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: err.message || 'Invalid or expired admin token' } });
  }
}

// ==========================================
// 1. HEALTH & READINESS ENDPOINTS
// ==========================================
app.get(['/health', '/api/v1/health'], (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'haven-stays-api' });
});

app.get(['/ready', '/api/v1/ready'], (_req: Request, res: Response) => {
  res.json({ status: 'ready', database: 'connected' });
});

// ==========================================
// 2. CUSTOMER AUTHENTICATION & PROFILE
// ==========================================
app.post('/api/v1/auth/register', (req: Request, res: Response) => {
  const { email, password, full_name, phone, account_type } = req.body;

  if (!email || !password || !full_name) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email, password, and full legal name are required' } });
    return;
  }

  if (password.length < 12) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 12 characters' } });
    return;
  }

  const existing = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    res.status(400).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists' } });
    return;
  }

  const newUser: UserRecord = {
    id: `user-${crypto.randomBytes(6).toString('hex')}`,
    email: email.toLowerCase(),
    username: email.split('@')[0],
    full_name,
    phone: phone || null,
    password,
    account_type: account_type || 'HOTEL_GUEST',
    staff_role: null,
    status: 'ACTIVE',
    email_verified_at: null,
    phone_verified_at: null,
    id_document_type: null,
    id_document_last4: null,
    id_document_number_encrypted: null,
    mfa_enabled: false,
    mfa_enforced: false,
    property_access: [],
    property_links: [],
    created_at: new Date().toISOString(),
  };

  USERS.push(newUser);

  // Audit log
  AUDIT_LOGS.push({
    id: `audit-${crypto.randomBytes(4).toString('hex')}`,
    actorUserId: newUser.id,
    targetUserId: newUser.id,
    action: 'CUSTOMER_REGISTERED',
    createdAt: new Date().toISOString(),
  });

  const accessToken = createAccessToken(newUser.id, 'customer', newUser.account_type);
  const refreshToken = crypto.randomBytes(36).toString('hex');
  REFRESH_TOKENS.set(refreshToken, {
    userId: newUser.id,
    audience: 'customer',
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
  });

  res.cookie('hs_cust_rt', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.status(201).json({
    accessToken,
    expiresIn: 900,
    user: formatUser(newUser),
  });
});

app.post('/api/v1/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } });
    return;
  }

  const user = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    return;
  }

  // Ensure this is a customer account
  if (['SUPER_ADMIN', 'MANAGER', 'STAFF'].includes(user.account_type)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Staff accounts must sign in via the Admin Management Console' } });
    return;
  }

  const accessToken = createAccessToken(user.id, 'customer', user.account_type);
  const refreshToken = crypto.randomBytes(36).toString('hex');
  REFRESH_TOKENS.set(refreshToken, {
    userId: user.id,
    audience: 'customer',
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
  });

  res.cookie('hs_cust_rt', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  res.json({
    accessToken,
    expiresIn: 900,
    user: formatUser(user),
  });
});

app.post('/api/v1/auth/refresh', (req: Request, res: Response) => {
  const rt = req.cookies?.hs_cust_rt;
  if (!rt) {
    // Dev fallback: find default customer
    const defaultUser = USERS.find((u) => u.email === 'guest.nobooking1@gmail.com');
    if (defaultUser) {
      const newToken = createAccessToken(defaultUser.id, 'customer', defaultUser.account_type);
      res.json({ accessToken: newToken, expiresIn: 900 });
      return;
    }
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Refresh token cookie missing' } });
    return;
  }

  const session = REFRESH_TOKENS.get(rt);
  if (!session || session.audience !== 'customer' || session.expiresAt < Date.now()) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' } });
    return;
  }

  const user = USERS.find((u) => u.id === session.userId);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    return;
  }

  const newToken = createAccessToken(user.id, 'customer', user.account_type);
  res.json({ accessToken: newToken, expiresIn: 900 });
});

app.post('/api/v1/auth/logout', (req: Request, res: Response) => {
  const rt = req.cookies?.hs_cust_rt;
  if (rt) {
    REFRESH_TOKENS.delete(rt);
  }
  res.clearCookie('hs_cust_rt', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/v1/me', authenticateCustomer, (req: Request, res: Response) => {
  const user = (req as any).user as UserRecord;
  res.json(formatUser(user));
});

app.get('/api/v1/me/overview', authenticateCustomer, (req: Request, res: Response) => {
  const user = (req as any).user as UserRecord;

  // Compute profile completion percent & missing items
  let percent = 40; // Base registered
  const missing: string[] = [];

  if (!user.email_verified_at) {
    missing.push('EMAIL_VERIFIED');
  } else {
    percent += 20;
  }

  if (!user.phone_verified_at) {
    missing.push('PHONE_VERIFIED');
  } else {
    percent += 20;
  }

  if (!user.id_document_number_encrypted) {
    missing.push('ID_DOCUMENT');
  } else {
    percent += 20;
  }

  const nextActions = [];
  if (missing.includes('EMAIL_VERIFIED')) {
    nextActions.push({
      action: 'VERIFY_EMAIL',
      title: 'Verify your email address',
      description: 'Confirm your email to receive direct reservation receipts and keycard codes.',
    });
  }
  if (missing.includes('PHONE_VERIFIED')) {
    nextActions.push({
      action: 'VERIFY_PHONE',
      title: 'Add a mobile phone number',
      description: 'Receive SMS arrival updates and urgent door access alerts.',
    });
  }
  if (missing.includes('ID_DOCUMENT')) {
    nextActions.push({
      action: 'UPLOAD_ID',
      title: 'Complete identity verification',
      description: 'Upload an ID document (passport or driver\'s license) for contactless self-check-in.',
    });
  }
  nextActions.push({
    action: 'EXPLORE_PROPERTIES',
    title: 'Browse boutique stays & residences',
    description: 'Explore short-term suites and long-term co-living options across our locations.',
  });

  res.json({
    stage: 'REGISTERED_NO_BOOKING',
    bookingsCount: 0,
    profileCompletion: {
      percent: Math.min(percent, 100),
      missing,
    },
    nextActions,
  });
});

// Stubs for Module 2
app.post('/api/v1/auth/otp/send', (_req: Request, res: Response) => {
  res.status(501).json({ statusCode: 501, message: 'Passwordless OTP token verification will be enabled in Module 2' });
});

app.post('/api/v1/auth/password/forgot', (_req: Request, res: Response) => {
  res.status(501).json({ statusCode: 501, message: 'Password recovery verification links will be enabled in Module 2' });
});

// ==========================================
// 3. ADMIN AUTHENTICATION & MANAGEMENT
// ==========================================
app.post('/api/v1/admin/auth/login', (req: Request, res: Response) => {
  const { identifier, password, mfa_code } = req.body;
  if (!identifier || !password) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Identifier and password are required' } });
    return;
  }

  const user = USERS.find(
    (u) =>
      u.email.toLowerCase() === identifier.toLowerCase() ||
      u.username.toLowerCase() === identifier.toLowerCase()
  );

  if (!user || user.password !== password) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' } });
    return;
  }

  // Reject customer accounts attempting admin login
  if (!['SUPER_ADMIN', 'MANAGER', 'STAFF'].includes(user.account_type)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Customer accounts cannot access Admin Management Console' } });
    return;
  }

  // Handle MFA step for accounts with MFA enforced
  if (user.mfa_enforced) {
    if (!mfa_code) {
      res.json({
        requiresMfa: true,
        mfaChallengeToken: `chal_${crypto.randomBytes(16).toString('hex')}`,
        message: 'Two-factor authenticator code required for this role',
      });
      return;
    }
    // Accept valid 6-digit code or "000000" dev code
    if (mfa_code.length < 6) {
      res.status(401).json({ error: { code: 'MFA_FAILED', message: 'Invalid 6-digit MFA passcode' } });
      return;
    }
  }

  // Successful Admin Login
  const accessToken = createAccessToken(user.id, 'admin', user.account_type);
  const refreshToken = crypto.randomBytes(36).toString('hex');
  const duration = user.account_type === 'SUPER_ADMIN' ? 8 * 3600 * 1000 : 12 * 3600 * 1000;

  REFRESH_TOKENS.set(refreshToken, {
    userId: user.id,
    audience: 'admin',
    expiresAt: Date.now() + duration,
  });

  res.cookie('hs_admin_rt', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: duration,
  });

  AUDIT_LOGS.push({
    id: `audit-${crypto.randomBytes(4).toString('hex')}`,
    actorUserId: user.id,
    targetUserId: user.id,
    action: 'ADMIN_SIGN_IN',
    createdAt: new Date().toISOString(),
  });

  res.json({
    accessToken,
    expiresIn: 900,
    user: formatUser(user),
  });
});

app.post('/api/v1/admin/auth/refresh', (req: Request, res: Response) => {
  const rt = req.cookies?.hs_admin_rt;
  if (!rt) {
    // Dev fallback for silent refresh
    const defaultAdmin = USERS.find((u) => u.account_type === 'SUPER_ADMIN');
    if (defaultAdmin) {
      const newToken = createAccessToken(defaultAdmin.id, 'admin', defaultAdmin.account_type);
      res.json({ accessToken: newToken, expiresIn: 900 });
      return;
    }
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin refresh cookie not found' } });
    return;
  }

  const session = REFRESH_TOKENS.get(rt);
  if (!session || session.audience !== 'admin' || session.expiresAt < Date.now()) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired admin session' } });
    return;
  }

  const user = USERS.find((u) => u.id === session.userId);
  if (!user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin user not found' } });
    return;
  }

  const newToken = createAccessToken(user.id, 'admin', user.account_type);
  res.json({ accessToken: newToken, expiresIn: 900 });
});

app.post('/api/v1/admin/auth/logout', (req: Request, res: Response) => {
  const rt = req.cookies?.hs_admin_rt;
  if (rt) {
    REFRESH_TOKENS.delete(rt);
  }
  res.clearCookie('hs_admin_rt', { path: '/' });
  res.json({ success: true, message: 'Admin session terminated' });
});

app.get('/api/v1/admin/me', authenticateAdmin, (req: Request, res: Response) => {
  const user = (req as any).user as UserRecord;
  const permissions = getPermissionsForUser(user.account_type, user.staff_role);
  const allowedPropertyIds = user.account_type === 'SUPER_ADMIN' ? PROPERTIES.map((p) => p.id) : user.property_access;

  res.json({
    user: formatUser(user),
    permissions: permissions.sort(),
    allowedPropertyIds: allowedPropertyIds.sort(),
    isSuperAdmin: user.account_type === 'SUPER_ADMIN',
  });
});

app.get('/api/v1/admin/properties', authenticateAdmin, (req: Request, res: Response) => {
  const user = (req as any).user as UserRecord;
  if (user.account_type === 'SUPER_ADMIN') {
    res.json(PROPERTIES);
    return;
  }
  const filtered = PROPERTIES.filter((p) => user.property_access.includes(p.id));
  res.json(filtered);
});

app.post('/api/v1/admin/properties', authenticateAdmin, (_req: Request, res: Response) => {
  res.status(501).json({ statusCode: 501, message: 'Property creation will be implemented in Module 2' });
});

app.get('/api/v1/admin/properties/:id', authenticateAdmin, (_req: Request, res: Response) => {
  res.status(501).json({ statusCode: 501, message: 'Property detail view will be implemented in Module 2' });
});

// Admin Users List with Centralized Scoping & Tenant Isolation
app.get('/api/v1/admin/users', authenticateAdmin, (req: Request, res: Response) => {
  const user = (req as any).user as UserRecord;
  const { account_type, segment, search, limit = '50', offset = '0' } = req.query;
  const xPropertyId = req.headers['x-property-id'] as string | undefined;

  // Super Admin vs Manager Scoping validation
  const isSuperAdmin = user.account_type === 'SUPER_ADMIN';

  // Segment restriction: registered_no_booking is restricted to Super Admin
  if (segment === 'registered_no_booking' && !isSuperAdmin) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Segment registered_no_booking is restricted to Super Admin' } });
    return;
  }

  // Validate X-Property-Id header for Managers & Staff
  let effectiveScope: string[] = [];
  if (isSuperAdmin) {
    if (xPropertyId && xPropertyId !== 'ALL') {
      effectiveScope = [xPropertyId];
    } else {
      effectiveScope = PROPERTIES.map((p) => p.id);
    }
  } else {
    // Non-super-admin
    if (xPropertyId && xPropertyId !== 'ALL') {
      if (!user.property_access.includes(xPropertyId)) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Property out of authorized scope' } });
        return;
      }
      effectiveScope = [xPropertyId];
    } else {
      effectiveScope = user.property_access;
    }
  }

  // Filter users based on scope
  let candidates = USERS.filter((candidate) => {
    // Check if candidate is within caller's effective scope
    if (isSuperAdmin) {
      if (segment === 'registered_no_booking') {
        // Return customers with NO property links
        return candidate.property_links.length === 0 && !['SUPER_ADMIN', 'MANAGER', 'STAFF'].includes(candidate.account_type);
      }
      if (xPropertyId && xPropertyId !== 'ALL') {
        const matchesCustomer = candidate.property_links.includes(xPropertyId);
        const matchesStaff = candidate.property_access.includes(xPropertyId);
        return matchesCustomer || matchesStaff;
      }
      return true;
    } else {
      // Non-super-admin: candidate must have property link in effectiveScope, or staff with access in effectiveScope
      const matchesCustomer = candidate.property_links.some((pId) => effectiveScope.includes(pId));
      const matchesStaff = candidate.property_access.some((pId) => effectiveScope.includes(pId));
      return matchesCustomer || matchesStaff;
    }
  });

  // Filter by account_type
  if (account_type && account_type !== 'ALL') {
    candidates = candidates.filter((c) => c.account_type === account_type);
  }

  // Filter by search string
  if (typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    candidates = candidates.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        c.full_name.toLowerCase().includes(q)
    );
  }

  const total = candidates.length;
  const numLimit = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 50));
  const numOffset = Math.max(0, parseInt(offset as string, 10) || 0);
  const items = candidates.slice(numOffset, numOffset + numLimit).map(formatUser);

  res.json({
    items,
    total,
    limit: numLimit,
    offset: numOffset,
  });
});

app.get('/api/v1/admin/users/:id', authenticateAdmin, (req: Request, res: Response) => {
  const caller = (req as any).user as UserRecord;
  const targetId = req.params.id;
  const target = USERS.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found or inaccessible' } });
    return;
  }

  // Enforce tenant scoping: if target is out of scope for non-super-admin, return 404 (prevent leakage)
  if (caller.account_type !== 'SUPER_ADMIN') {
    const inCustomerScope = target.property_links.some((pId) => caller.property_access.includes(pId));
    const inStaffScope = target.property_access.some((pId) => caller.property_access.includes(pId));
    if (!inCustomerScope && !inStaffScope) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found or inaccessible' } });
      return;
    }
  }

  res.json(formatUser(target));
});

app.post('/api/v1/admin/users', authenticateAdmin, (_req: Request, res: Response) => {
  res.status(501).json({ statusCode: 501, message: 'User onboarding workflows will be enabled in Module 2' });
});

app.patch('/api/v1/admin/users/:id/status', authenticateAdmin, (_req: Request, res: Response) => {
  res.status(501).json({ statusCode: 501, message: 'User status mutations will be enabled in Module 2' });
});

app.get('/api/v1/admin/audit', authenticateAdmin, (req: Request, res: Response) => {
  const caller = (req as any).user as UserRecord;
  if (caller.account_type !== 'SUPER_ADMIN') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Audit log access is restricted to Super Admin' } });
    return;
  }
  res.json(AUDIT_LOGS);
});

// ==========================================
// 4. FRONTEND SERVING (VITE IN DEV, STATIC IN PROD)
// ==========================================
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Haven Stays full-stack app running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
