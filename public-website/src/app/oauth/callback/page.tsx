'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient, setCustomerToken } from '../../../lib/api';
import { useCustomerAuth, type CustomerUserResponse } from '../../../lib/auth-context';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setError('We could not complete social sign-in. Please try another sign-in method.');
      return;
    }
    window.history.replaceState({}, document.title, window.location.pathname);
    setCustomerToken(token);
    customerApiClient.get<CustomerUserResponse>('/me')
      .then(async ({ data }) => {
        await login(token, data);
        router.replace('/account');
      })
      .catch(() => {
        setCustomerToken(null);
        setError('We could not complete social sign-in. Please try another sign-in method.');
      });
  }, [login, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold font-serif text-slate-900">{error ? 'Sign-in unsuccessful' : 'Completing sign-in…'}</h1>
        <p role={error ? 'alert' : 'status'} aria-live="polite" className="text-sm text-slate-600">{error || 'Please wait while we securely connect your account.'}</p>
        {error && <Link href="/signin" className="inline-block px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold">Return to sign in</Link>}
      </section>
    </div>
  );
}
