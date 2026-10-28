'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../lib/api';
import { useCustomerAuth, type CustomerUserResponse } from '../../lib/auth-context';

export default function ActivatePage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') || ''), []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(password)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    setPending(true);
    try {
      const { data } = await customerApiClient.post<{ accessToken: string; user: CustomerUserResponse }>('/auth/activate', { token, newPassword: password });
      await login(data.accessToken, data.user);
      router.replace('/account');
    } catch {
      setError('We could not activate this account. The invitation may have expired; contact the person who invited you.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Activate your account</h1>
        {!token ? <p role="alert" className="text-sm text-slate-600">This invitation link is missing or invalid.</p> : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">Create a password to finish activating your Haven account.</p>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password
              <input id="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">Confirm password
              <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Activating…' : 'Activate account'}</button>
          </form>
        )}
        <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Return to sign in</Link>
      </section>
    </div>
  );
}
