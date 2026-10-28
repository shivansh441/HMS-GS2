'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../lib/api';
import { useCustomerAuth, type CustomerUserResponse } from '../../lib/auth-context';

export default function MfaPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => setMfaToken(new URLSearchParams(window.location.search).get('mfaToken') || ''), []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const { data } = await customerApiClient.post<{ accessToken: string; user: CustomerUserResponse }>('/auth/mfa/verify', {
        mfaToken,
        ...(useRecoveryCode ? { recoveryCode } : { code }),
      });
      await login(data.accessToken, data.user);
      router.replace('/account');
    } catch {
      setError('We could not verify that code. Check it and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Two-step verification</h1>
        {!mfaToken ? <p role="alert" className="text-sm text-slate-600">This sign-in challenge is missing or expired. Please sign in again.</p> : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">{useRecoveryCode ? 'Enter one of your unused recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-slate-700">{useRecoveryCode ? 'Recovery code' : 'Authenticator code'}
              <input id="mfa-code" type="text" inputMode={useRecoveryCode ? 'text' : 'numeric'} autoComplete="one-time-code" required value={useRecoveryCode ? recoveryCode : code} onChange={(event) => useRecoveryCode ? setRecoveryCode(event.target.value) : setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending || (!useRecoveryCode && code.length !== 6)} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Verifying…' : 'Verify and sign in'}</button>
            <button type="button" onClick={() => setUseRecoveryCode((value) => !value)} className="w-full text-sm text-slate-700 underline">{useRecoveryCode ? 'Use an authenticator code' : 'Use a recovery code'}</button>
          </form>
        )}
        <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Start over</Link>
      </section>
    </div>
  );
}
