'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Lock, Mail } from 'lucide-react';
import { useCustomerAuth, type CustomerUserResponse } from '../../lib/auth-context';
import { customerApiClient } from '../../lib/api';
import { BRAND } from '../../lib/constants';

const inputClass =
  'w-full pl-10 pr-4 py-3 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:bg-white';

export default function SignInPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await customerApiClient.post<{
        accessToken: string;
        user: CustomerUserResponse | null;
        mfaRequired?: boolean;
        requiresMfa?: boolean;
        mfaToken?: string;
        mfaChallengeToken?: string;
      }>('/auth/login', { identifier: identifier.trim(), password, remember });
      if (res.data.mfaRequired || res.data.requiresMfa) {
        const challenge = res.data.mfaToken || res.data.mfaChallengeToken;
        if (challenge) router.push(`/mfa?mfaToken=${encodeURIComponent(challenge)}`);
        else setError('We could not complete sign-in. Please try again.');
        return;
      }
      if (!res.data.user || !res.data.accessToken) {
        setError('We could not complete sign-in. Please try again.');
        return;
      }
      await login(res.data.accessToken, res.data.user);
      router.push('/account');
    } catch {
      setError('We couldn’t sign you in with those details. Check them and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginOAuth = async (provider: 'google' | 'apple') => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await customerApiClient.post<{ authUrl: string }>(`/auth/oauth/${provider}/start`);
      window.location.assign(res.data.authUrl);
    } catch {
      setError('Social sign-in is temporarily unavailable. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-sm space-y-6" aria-labelledby="signin-title">
        <div className="text-center space-y-2">
          <span className="font-serif text-2xl font-bold text-slate-900 block">{BRAND.NAME}</span>
          <h1 id="signin-title" className="text-xl font-bold text-slate-800">Sign in to your account</h1>
          <p className="text-sm text-slate-500">Access your stay details and account.</p>
        </div>
        {error && (
          <div role="alert" aria-live="polite" className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700" htmlFor="identifier">
            Email or phone
            <div className="relative mt-1.5">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
              <input id="identifier" type="text" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or phone" className={inputClass} />
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
            <div className="relative mt-1.5">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </div>
          </label>
          <div className="flex items-center justify-between gap-4 text-sm">
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300 text-slate-900 focus:ring-slate-700" />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-slate-600 hover:text-slate-900 underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold uppercase tracking-wider rounded-xl disabled:opacity-60 disabled:cursor-not-allowed">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="relative flex items-center justify-center" aria-hidden="true">
          <span className="w-full border-t border-slate-200" />
          <span className="absolute bg-white px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">OR</span>
        </div>
        <div className="space-y-2.5">
          <button type="button" onClick={() => beginOAuth('google')} disabled={isSubmitting} className="w-full py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl disabled:opacity-60">Continue with Google</button>
          <button type="button" onClick={() => beginOAuth('apple')} disabled={isSubmitting} className="w-full py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl disabled:opacity-60">Continue with Apple</button>
          <Link href="/otp" className="w-full py-3 px-4 bg-stone-100 hover:bg-stone-200 text-slate-800 text-sm font-semibold rounded-xl block text-center">Sign in with a one-time code</Link>
        </div>
        <p className="text-center text-sm text-slate-500">New to Haven? <Link href="/signup" className="text-slate-900 font-bold underline">Create an account</Link></p>
      </section>
    </div>
  );
}
