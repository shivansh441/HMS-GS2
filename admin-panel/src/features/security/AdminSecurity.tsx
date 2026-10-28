import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { AdminSession, MfaConfirmResponse, MfaEnrollmentResponse } from '../../types';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { KeyRound, Monitor, ShieldCheck } from 'lucide-react';

export const AdminSecurity: React.FC = () => {
  const { user, refreshProfile, logout } = useAuth();
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [enrollment, setEnrollment] = useState<MfaEnrollmentResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [confirmCode, setConfirmCode] = useState('');
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<AdminSession[]>('/admin/me/sessions');
      setSessions(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to load active sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const revokeSession = async (session: AdminSession) => {
    if (!window.confirm(`Revoke the session from ${session.browser} on ${session.os}?`)) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiClient.delete(`/admin/me/sessions/${encodeURIComponent(session.id)}`);
      setNotice('Session revoked.');
      await loadSessions();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to revoke this session.');
    } finally {
      setBusy(false);
    }
  };

  const revokeOtherSessions = async () => {
    if (!window.confirm('Sign out all other active sessions?')) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiClient.delete('/admin/me/sessions');
      setNotice('All other sessions were revoked.');
      await loadSessions();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to revoke other sessions.');
    } finally {
      setBusy(false);
    }
  };

  const startEnrollment = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await apiClient.post<MfaEnrollmentResponse>('/admin/me/mfa/enroll');
      setEnrollment(response.data);
      setConfirmCode('');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to start MFA enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const params = new URLSearchParams({ secret: enrollment.secret });
      const response = await apiClient.post<MfaConfirmResponse>(`/admin/me/mfa/confirm?${params.toString()}`, {
        code: confirmCode,
      });
      setRecoveryCodes(response.data.recoveryCodes);
      setEnrollment(null);
      setNotice('MFA is enabled. Save your recovery codes; they will not be shown again.');
      await refreshProfile();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'The code could not be confirmed.');
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiClient.post('/admin/me/mfa/disable', { password, code: disableCode });
      setPassword('');
      setDisableCode('');
      setNotice('MFA has been disabled and all sessions were signed out.');
      await logout();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Unable to disable MFA.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold uppercase tracking-wider font-mono">Security & Sessions</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Manage your own admin sign-in security and active sessions.
        </p>
      </header>

      {error && <div role="alert" className="border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-200">{error}</div>}
      {notice && <div role="status" className="border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">{notice}</div>}

      <section className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold uppercase tracking-wide">Active sessions</h2>
          </div>
          <button type="button" disabled={busy || sessions.filter((session) => !session.current).length === 0} onClick={revokeOtherSessions} className={actionButton}>
            Revoke other sessions
          </button>
        </div>
        {loading ? <LoadingIndicator label="Loading sessions..." /> : sessions.length === 0 ? (
          <p className="text-xs text-slate-500">No active session details are available.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {sessions.map((session) => (
              <li key={session.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold">{session.browser} on {session.os}{session.current ? ' — This session' : ''}</div>
                  <div className="text-slate-500 mt-1">
                    {session.ip || 'IP unavailable'} · Last active {new Date(session.lastActiveAt).toLocaleString()}
                  </div>
                </div>
                {!session.current && (
                  <button type="button" disabled={busy} onClick={() => revokeSession(session)} className={actionButton}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-bold uppercase tracking-wide">Multi-factor authentication</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Status: <strong>{user?.mfa_enabled ? 'Enabled' : 'Not enabled'}</strong>
        </p>
        {!user?.mfa_enabled && !enrollment && (
          <button type="button" disabled={busy} onClick={startEnrollment} className={actionButton}>Set up MFA</button>
        )}
        {enrollment && (
          <form onSubmit={confirmEnrollment} className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">Scan the code with an authenticator app, then verify a current code.</p>
            <div className="flex justify-center border border-slate-200 dark:border-slate-700 p-3 bg-white">
              <img src={enrollment.qrDataUrl} alt="MFA enrollment QR code" className="w-40 h-40" />
            </div>
            <div className="text-xs font-mono break-all">Manual setup key: {enrollment.secret}</div>
            <input
              required
              minLength={6}
              maxLength={6}
              autoComplete="one-time-code"
              value={confirmCode}
              onChange={(event) => setConfirmCode(event.target.value)}
              aria-label="Authenticator code"
              className={textInput}
            />
            <button type="submit" disabled={busy} className={actionButton}>{busy ? 'Confirming...' : 'Confirm MFA setup'}</button>
          </form>
        )}
        {recoveryCodes.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-2">Store these recovery codes now. They are shown only once.</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-xs">{recoveryCodes.map((code) => <li key={code}>{code}</li>)}</ul>
          </div>
        )}
        {user?.mfa_enabled && (
          <form onSubmit={disableMfa} className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">Disabling MFA will sign out all sessions. Confirm with your password and an authenticator code.</p>
            <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Current password" className={textInput} />
            <input type="text" required minLength={6} maxLength={6} autoComplete="one-time-code" value={disableCode} onChange={(event) => setDisableCode(event.target.value)} placeholder="Authenticator code" className={textInput} />
            <button type="submit" disabled={busy} className={actionButton}>Disable MFA</button>
          </form>
        )}
        <p className="flex items-center gap-1 text-[11px] text-slate-500"><KeyRound className="w-3 h-3" /> Recovery codes can be used once each during sign-in.</p>
      </section>
    </div>
  );
};

const actionButton =
  'px-3 py-1.5 border border-slate-400 dark:border-slate-600 text-xs font-mono uppercase hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded-none cursor-pointer';

const textInput =
  'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono focus:outline-none focus:border-blue-600 rounded-none';
