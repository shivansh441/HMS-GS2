'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { customerApiClient } from '../../lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') || ''), []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(password)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    setPending(true);
    try {
      await customerApiClient.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch {
      setError('We could not reset your password. The link may have expired; request a new one and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Choose a new password</h1>
        {done ? (
          <>
            <p role="status" className="text-sm text-slate-600">Your password has been updated.</p>
            <Link href="/signin" className="inline-block px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold">Sign in</Link>
          </>
        ) : !token ? (
          <>
            <p role="alert" className="text-sm text-slate-600">This password reset link is missing or invalid.</p>
            <Link href="/forgot-password" className="inline-block text-sm font-semibold underline">Request another link</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">New password
              <input id="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700">Confirm new password
              <input id="confirm" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
