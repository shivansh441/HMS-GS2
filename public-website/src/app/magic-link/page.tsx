'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../lib/api';
import { useCustomerAuth, type CustomerUserResponse } from '../../lib/auth-context';

export default function MagicLinkPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkToken = params.get('token');
    if (!linkToken) {
      setStatus('ready');
      return;
    }
    customerApiClient.post<{ accessToken: string; user: CustomerUserResponse }>('/auth/magic-link/verify', { token: linkToken })
      .then(async ({ data }) => {
        await login(data.accessToken, data.user);
        router.replace('/account');
      })
      .catch(() => {
        setError('This sign-in link is invalid or expired. Request a new link and try again.');
        setStatus('ready');
      });
  }, [login, router]);

  const requestLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await customerApiClient.post('/auth/magic-link/request', { email: email.trim().toLowerCase() });
    } catch {
      // The response remains identical whether or not an account exists.
    } finally {
      setRequested(true);
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Sign in with a magic link</h1>
        {status === 'loading' ? <p role="status" aria-live="polite" className="text-sm text-slate-600">Checking your sign-in link…</p> : requested ? (
          <p role="status" aria-live="polite" className="text-sm text-slate-600">If this email is eligible, a sign-in link will be sent shortly.</p>
        ) : (
          <form onSubmit={requestLink} className="space-y-4">
            <p className="text-sm text-slate-600">Enter your email to request a secure sign-in link.</p>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email address
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Sending…' : 'Send magic link'}</button>
          </form>
        )}
        <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Return to sign in</Link>
      </section>
    </div>
  );
}
