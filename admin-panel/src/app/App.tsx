import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { AdminLogin } from '../features/auth/AdminLogin';
import { Dashboard } from '../features/dashboard/Dashboard';
import { UserList } from '../features/users/UserList';
import { PropertyList } from '../features/properties/PropertyList';
import { PERMISSIONS, canAccess, PermissionKey } from '../lib/permissions';
import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarDays,
  FileText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Building,
  Shield,
  AlertOctagon,
  Clock,
  ShieldAlert,
} from 'lucide-react';

// Route Guards
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <LoadingIndicator label="Authenticating session..." />
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return <>{children}</>;
};

const RequirePermission: React.FC<{ permission: PermissionKey; children: React.ReactNode }> = ({
  permission,
  children,
}) => {
  const { user } = useAuth();
  if (!user || !canAccess(user.account_type, user.staff_role, permission)) {
    return (
      <div className="p-8 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-300">
        <div className="flex items-center space-x-2 font-bold text-sm">
          <AlertOctagon className="w-5 h-5 text-red-600" />
          <span>403 Forbidden: Insufficient Permissions</span>
        </div>
        <p className="text-xs mt-2 text-red-700 dark:text-red-400">
          Your role (<span className="font-mono">{user?.account_type}</span>) does not have authorization to view this resource.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};

// Module Placeholder Component
const ModulePlaceholder: React.FC<{ title: string; moduleNum: string }> = ({ title, moduleNum }) => (
  <div className="p-8 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
    <div className="inline-block px-2 py-0.5 bg-blue-900 text-white text-[10px] font-mono font-bold uppercase mb-2">
      {moduleNum}
    </div>
    <h2 className="text-lg font-bold text-slate-900 dark:text-white font-mono">{title}</h2>
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
      This capability is scaffolded in the domain schema and will be fully unlocked in a later milestone prompt.
    </p>
  </div>
);

// Layout Shell
const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    properties,
    selectedPropertyId,
    setSelectedPropertyId,
    logout,
    theme,
    setTheme,
    idleWarningVisible,
    idleCountdown,
    dismissIdleWarning,
  } = useAuth();
  const location = useLocation();

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Idle Logout Warning Modal */}
      {idleWarningVisible && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border-2 border-red-600 max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center space-x-2 text-red-600 font-bold text-sm">
              <Clock className="w-5 h-5" />
              <span>Session Inactivity Notice</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              You have been inactive. For compliance, your session will automatically terminate in{' '}
              <span className="font-mono font-bold text-red-600">{idleCountdown}s</span>.
            </p>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={dismissIdleWarning}
                className="flex-1 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-none cursor-pointer uppercase"
              >
                Stay Signed In
              </button>
              <button
                onClick={logout}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-xs font-mono rounded-none cursor-pointer"
              >
                Sign Out Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="font-bold text-sm tracking-wider uppercase font-mono flex items-center space-x-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <span>Haven Stays Admin</span>
          </div>

          {/* Property Switcher */}
          <div className="flex items-center space-x-2 border-l border-slate-200 dark:border-slate-700 pl-4">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor="property-switcher" className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Property Scope:
            </label>
            <select
              id="property-switcher"
              value={selectedPropertyId || 'ALL'}
              onChange={(e) => setSelectedPropertyId(e.target.value === 'ALL' ? null : e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono px-2 py-1 rounded-none text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
            >
              {properties.length > 1 && (
                <option value="ALL">All my properties ({properties.length})</option>
              )}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Header items */}
        <div className="flex items-center space-x-3 text-xs">
          {/* User badge */}
          <div className="text-right hidden sm:block">
            <div className="font-medium text-slate-900 dark:text-white">{user.full_name || user.email}</div>
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              {user.account_type} {user.staff_role ? `• ${user.staff_role}` : ''}
            </div>
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-none cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Logout button */}
          <button
            onClick={logout}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 text-slate-800 dark:text-slate-200 font-mono text-xs rounded-none cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Role-Aware Sidebar */}
        <aside className="w-56 bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700 flex flex-col shrink-0">
          <nav className="p-2 space-y-0.5 text-xs font-mono">
            {canAccess(user.account_type, user.staff_role, 'VIEW_DASHBOARD') && (
              <Link
                to="/"
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-none ${
                  location.pathname === '/'
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            )}

            {canAccess(user.account_type, user.staff_role, 'VIEW_USERS') && (
              <Link
                to="/users"
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-none ${
                  location.pathname === '/users'
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>User Directory</span>
              </Link>
            )}

            {canAccess(user.account_type, user.staff_role, 'VIEW_PROPERTIES') && (
              <Link
                to="/properties"
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-none ${
                  location.pathname === '/properties'
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Properties</span>
              </Link>
            )}

            <Link
              to="/bookings"
              className={`flex items-center space-x-2.5 px-3 py-2 rounded-none ${
                location.pathname === '/bookings'
                  ? 'bg-slate-900 text-white dark:bg-blue-600'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Bookings [M2]</span>
            </Link>

            {canAccess(user.account_type, user.staff_role, 'VIEW_AUDIT_LOGS') && (
              <Link
                to="/audit"
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-none ${
                  location.pathname === '/audit'
                    ? 'bg-slate-900 text-white dark:bg-blue-600'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Audit Logs</span>
              </Link>
            )}
          </nav>

          <div className="mt-auto p-3 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 font-mono">
            <div>NO-ANIMATION ENFORCED</div>
            <div className="text-slate-500">v0.1.0 • React + Vite</div>
          </div>
        </aside>

        {/* Content View */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RequireAuth>
          <AdminLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route
                path="/users"
                element={
                  <RequirePermission permission="VIEW_USERS">
                    <UserList />
                  </RequirePermission>
                }
              />
              <Route
                path="/properties"
                element={
                  <RequirePermission permission="VIEW_PROPERTIES">
                    <PropertyList />
                  </RequirePermission>
                }
              />
              <Route
                path="/bookings"
                element={<ModulePlaceholder title="Guest Reservations & Allocation" moduleNum="Module 2" />}
              />
              <Route
                path="/audit"
                element={
                  <RequirePermission permission="VIEW_AUDIT_LOGS">
                    <ModulePlaceholder title="System Security & Mutation Audit Trail" moduleNum="Super Admin" />
                  </RequirePermission>
                }
              />
              <Route
                path="*"
                element={
                  <div className="p-8 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-center space-y-2">
                    <h2 className="text-xl font-bold font-mono">404 - Resource Not Found</h2>
                    <p className="text-xs text-slate-500">The route requested does not exist or has been moved.</p>
                  </div>
                }
              />
            </Routes>
          </AdminLayout>
        </RequireAuth>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
