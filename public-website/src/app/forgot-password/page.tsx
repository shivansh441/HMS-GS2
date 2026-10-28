'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { customerApiClient } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      await customerApiClient.post('/auth/forgot-password', { identifier: identifier.trim() });
    } catch {
      // Keep the completion state generic to prevent account enumeration.
    } finally {
      setSubmitted(true);
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Reset your password</h1>
        {submitted ? (
          <p role="status" aria-live="polite" className="text-sm text-slate-600 leading-relaxed">If an account matches that email or phone, password reset instructions are on the way.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">Enter the email or phone number linked to your account.</p>
            <label htmlFor="identifier" className="block text-sm font-medium text-slate-700">Email or phone
              <input id="identifier" type="text" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            <button type="submit" disabled={pending} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Sending…' : 'Send reset instructions'}</button>
          </form>
        )}
        <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Return to sign in</Link>
      </section>
    </div>
  );
}
