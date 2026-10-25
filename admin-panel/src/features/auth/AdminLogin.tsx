import React, { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { AuthSuccessResponse } from '../../types';
import { ShieldAlert, KeyRound, Lock, User as UserIcon } from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('admin@havenstays.com');
  const [password, setPassword] = useState('AdminSecurePass123!');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await apiClient.post<AuthSuccessResponse>('/admin/auth/login', {
        identifier,
        password,
        mfa_code: requiresMfa ? mfaCode : undefined,
      });

      if (res.data.requiresMfa) {
        setRequiresMfa(true);
        setIsSubmitting(false);
        return;
      }

      await login(res.data.accessToken, res.data.user);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Authentication failed. Please verify credentials.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-8 shadow-none">
        <div className="border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <div className="flex items-center space-x-2 text-blue-900 dark:text-blue-400 font-mono text-xs tracking-wider uppercase font-semibold">
            <Lock className="w-4 h-4" />
            <span>Haven Stays Management</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">Admin Panel Access</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Restricted to authorized personnel. Audience-scoped JWT token authentication.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!requiresMfa ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Identifier (Email or Username)
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 rounded-none font-mono"
                    placeholder="user@havenstays.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 rounded-none font-mono"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-4">
              <label className="block text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-1">
                Enter MFA / TOTP Passcode
              </label>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Two-factor authentication is enforced for this role. Enter your 6-digit authenticator code or "000000".
              </p>
              <input
                type="text"
                maxLength={8}
                required
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-600 text-slate-900 dark:text-white text-lg font-mono tracking-widest text-center focus:outline-none rounded-none"
                placeholder="123456"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium text-xs tracking-wider uppercase disabled:opacity-50 rounded-none cursor-pointer"
          >
            {isSubmitting ? 'Verifying...' : requiresMfa ? 'Confirm Passcode' : 'Sign In to Admin'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-300">Default Dev Test Credentials:</p>
          <p>• Super Admin: <span className="font-mono text-slate-900 dark:text-white">admin@havenstays.com / AdminSecurePass123!</span> (MFA step)</p>
          <p>• HQ-01 Manager: <span className="font-mono text-slate-900 dark:text-white">manager.hq01@havenstays.com / ManagerSecurePass123!</span></p>
          <p>• Dual Manager: <span className="font-mono text-slate-900 dark:text-white">manager.all@havenstays.com / ManagerSecurePass123!</span></p>
          <p>• Front Desk HQ-01: <span className="font-mono text-slate-900 dark:text-white">frontdesk@havenstays.com / StaffSecurePass123!</span></p>
        </div>
      </div>
    </div>
  );
};
