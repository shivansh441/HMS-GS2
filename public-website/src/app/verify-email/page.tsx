'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../lib/api';
import { useCustomerAuth, type CustomerUserResponse } from '../../lib/auth-context';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('error');
      return;
    }
    customerApiClient.post<{ accessToken: string; user: CustomerUserResponse }>('/auth/verify-email', { token })
      .then(async ({ data }) => {
        await login(data.accessToken, data.user);
        setState('success');
        router.replace('/account');
      })
      .catch(() => setState('error'));
  }, [login, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold font-serif text-slate-900">{state === 'loading' ? 'Verifying your email…' : state === 'success' ? 'Email verified' : 'This link could not be verified'}</h1>
        <p role={state === 'error' ? 'alert' : 'status'} aria-live="polite" className="text-sm text-slate-600">{state === 'loading' ? 'Please wait while we securely confirm your address.' : state === 'success' ? 'Your account is ready. Redirecting you to your Haven account.' : 'The link may have expired or already been used. You can request another verification email.'}</p>
        {state === 'error' && <Link href="/resend-verification" className="inline-block px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold">Resend verification email</Link>}
        {state === 'error' && <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Return to sign in</Link>}
      </section>
    </div>
  );
}
