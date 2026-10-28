'use client';

import { useState } from 'react';
import Link from 'next/link';
import { customerApiClient } from '../../lib/api';

export default function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await customerApiClient.post('/auth/resend-verification', { email: email.trim().toLowerCase() });
    } catch {
      // Do not reveal whether the address has an account.
    } finally {
      setSubmitted(true);
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Resend verification email</h1>
        {submitted ? (
          <p role="status" aria-live="polite" className="text-sm text-slate-600">If an account needs verification, a new message will be sent.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">Enter your email and we’ll send a new verification link if one is needed.</p>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email address
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Sending…' : 'Send verification link'}</button>
          </form>
        )}
        <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Return to sign in</Link>
      </section>
    </div>
  );
}
