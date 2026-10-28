'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../../lib/api';
import { useCustomerAuth } from '../../../lib/auth-context';

interface CustomerSession {
  id: string;
  browser: string;
  os: string;
  ip: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export default function AccountSecurityPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useCustomerAuth();
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const res = await customerApiClient.get<CustomerSession[]>('/me/sessions');
      setSessions(res.data);
    } catch {
      setError('We could not load your active sessions.');
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/signin');
  }, [isLoading, router, user]);
  useEffect(() => {
    if (user) void loadSessions();
  }, [loadSessions, user]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setError('');
    setNotice('');
    setPending(true);
    try {
      await action();
      setNotice(success);
    } catch {
      setError('We could not complete that security change. Check your details and try again.');
    } finally {
      setPending(false);
    }
  };

  const startMfa = () => runAction(async () => {
    const { data } = await customerApiClient.post<{ secret: string; qrDataUrl: string }>('/me/mfa/enroll');
    setEnrollment(data);
  }, 'Scan the QR code with your authenticator, then confirm the code.');

  const confirmMfa = () => {
    if (!enrollment) return;
    void runAction(async () => {
      const { data } = await customerApiClient.post<{ recoveryCodes: string[] }>(
        `/me/mfa/confirm?secret=${encodeURIComponent(enrollment.secret)}`,
        { code },
      );
      setRecoveryCodes(data.recoveryCodes);
      setEnrollment(null);
      setCode('');
    }, 'Two-step verification is enabled. Save these recovery codes now.');
  };

  const regenerateRecoveryCodes = () => void runAction(async () => {
    const { data } = await customerApiClient.post<{ recoveryCodes: string[] }>('/me/mfa/recovery-codes/regenerate', {
      password: mfaPassword,
      code: mfaCode,
    });
    setRecoveryCodes(data.recoveryCodes);
    setMfaPassword('');
    setMfaCode('');
  }, 'New recovery codes created. Save them now; previous codes are no longer valid.');

  const disableMfa = () => void runAction(async () => {
    await customerApiClient.post('/me/mfa/disable', { password: mfaPassword, code: mfaCode });
    setMfaPassword('');
    setMfaCode('');
    await logout();
  }, 'Two-step verification was disabled.');

  const changePassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAction(async () => {
      await customerApiClient.post('/auth/change-password', { currentPassword: password, newPassword });
      setPassword('');
      setNewPassword('');
    }, 'Your password has been changed.');
  };

  const revokeSession = (sessionId: string) => runAction(async () => {
    await customerApiClient.delete(`/me/sessions/${encodeURIComponent(sessionId)}`);
    await loadSessions();
  }, 'Session revoked.');

  const revokeOthers = () => runAction(async () => {
    await customerApiClient.delete('/me/sessions');
    await loadSessions();
  }, 'All other sessions have been signed out.');

  if (isLoading || !user) {
    return <div className="min-h-[70vh] flex items-center justify-center text-sm text-slate-500" role="status">Loading security settings…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-slate-900">Security & sessions</h1>
          <p className="mt-2 text-sm text-slate-600">Manage your password, two-step verification, and signed-in devices.</p>
        </div>
        <Link href="/account" className="text-sm font-semibold underline text-slate-800">Back to account</Link>
      </div>
      {(error || notice) && <p role={error ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}

      <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5">
        <h2 className="text-lg font-bold text-slate-900">Password</h2>
        <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm font-medium text-slate-700">Current password
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
          </label>
          <label className="text-sm font-medium text-slate-700">New password
            <input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
          </label>
          <button type="submit" disabled={pending} aria-busy={pending} className="sm:col-span-2 justify-self-start px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">Update password</button>
        </form>
      </section>

      <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-900">Two-step verification</h2><p className="mt-1 text-sm text-slate-600">Add an authenticator code as an extra sign-in step.</p></div>
          {!user.mfa_enabled && !enrollment && <button type="button" onClick={startMfa} disabled={pending} className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">Set up authenticator</button>}
          {user.mfa_enabled && <span className="text-sm font-semibold text-emerald-700">Enabled</span>}
        </div>
        {enrollment && (
          <div className="space-y-4">
            <img src={enrollment.qrDataUrl} alt="Authenticator setup QR code" className="w-44 h-44 border border-slate-200 rounded-xl" />
            <p className="text-sm text-slate-600">Or enter this setup key manually: <code className="break-all font-mono">{enrollment.secret}</code></p>
            <label className="block text-sm font-medium text-slate-700">Authenticator code
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1.5 w-full max-w-xs px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            <button type="button" onClick={confirmMfa} disabled={pending || code.length !== 6} className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">Confirm authenticator</button>
          </div>
        )}
        {user.mfa_enabled && (
          <div className="border-t border-slate-100 pt-5 space-y-4">
            <p className="text-sm text-slate-600">To disable two-step verification or replace your recovery codes, confirm your password and current authenticator code.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-slate-700">Password
                <input type="password" autoComplete="current-password" value={mfaPassword} onChange={(event) => setMfaPassword(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </label>
              <label className="text-sm font-medium text-slate-700">Authenticator code
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={regenerateRecoveryCodes} disabled={pending || mfaCode.length !== 6 || !mfaPassword} className="px-5 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 disabled:opacity-50">Regenerate recovery codes</button>
              <button type="button" onClick={disableMfa} disabled={pending || mfaCode.length !== 6 || !mfaPassword} className="px-5 py-3 rounded-xl border border-red-200 text-sm font-semibold text-red-700 disabled:opacity-50">Disable two-step verification</button>
            </div>
          </div>
        )}
        {recoveryCodes.length > 0 && <div className="rounded-xl bg-amber-50 p-4"><h3 className="font-semibold text-slate-900">Save your recovery codes</h3><p className="text-sm text-slate-600 my-2">Each code can only be used once. Store them somewhere safe.</p><ul className="grid sm:grid-cols-2 gap-1 font-mono text-sm">{recoveryCodes.map((item) => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => setRecoveryCodes([])} className="mt-3 text-sm underline">I have saved these codes</button></div>}
      </section>

      <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-900">Active sessions</h2><p className="mt-1 text-sm text-slate-600">Devices currently signed in to your account.</p></div>
          {sessions.some((session) => !session.current) && <button type="button" onClick={revokeOthers} disabled={pending} className="text-sm font-semibold underline text-slate-800">Sign out other devices</button>}
        </div>
        {sessions.length ? <ul className="divide-y divide-slate-100">
          {sessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div><p className="text-sm font-semibold text-slate-900">{session.browser} on {session.os} {session.current && <span className="text-emerald-700">(this device)</span>}</p><p className="text-xs text-slate-500">Last active {new Date(session.lastActiveAt).toLocaleString()}{session.ip ? ` · ${session.ip}` : ''}</p></div>
            {!session.current && <button type="button" onClick={() => revokeSession(session.id)} disabled={pending} className="text-sm font-semibold text-red-700 underline">Revoke</button>}
          </li>)}
        </ul> : <p className="text-sm text-slate-600">No active sessions were found.</p>}
      </section>
      <button type="button" onClick={async () => { try { await customerApiClient.post('/auth/logout-all'); } catch { /* Local sign-out still clears this device. */ } await logout(); }} className="text-sm font-semibold text-red-700 underline">Sign out everywhere</button>
    </div>
  );
}
