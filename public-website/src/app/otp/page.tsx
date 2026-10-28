'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../lib/api';
import { useCustomerAuth, type CustomerUserResponse } from '../../lib/auth-context';

export default function OtpPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [target, setTarget] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'SMS'>('EMAIL');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const requestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await customerApiClient.post('/auth/otp/request', { target: target.trim(), channel, purpose: 'LOGIN' });
      setSent(true);
      setNotice('If this address or number can receive a sign-in code, it will arrive shortly.');
    } catch {
      setError('We could not send a code right now. Check your details and try again.');
    } finally {
      setPending(false);
    }
  };

  const verifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const { data } = await customerApiClient.post<{ accessToken: string; user: CustomerUserResponse }>('/auth/otp/verify', {
        target: target.trim(),
        code,
        purpose: 'LOGIN',
      });
      await login(data.accessToken, data.user);
      router.push('/account');
    } catch {
      setError('That code could not be verified. Request a new code and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 space-y-5">
        <h1 className="text-2xl font-bold font-serif text-slate-900">Sign in with a one-time code</h1>
        {!sent ? (
          <form onSubmit={requestCode} className="space-y-4">
            <p className="text-sm text-slate-600">Choose where to receive your sign-in code.</p>
            <label htmlFor="channel" className="block text-sm font-medium text-slate-700">Delivery method
              <select id="channel" value={channel} onChange={(event) => setChannel(event.target.value as 'EMAIL' | 'SMS')} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700">
                <option value="EMAIL">Email</option><option value="SMS">Text message</option>
              </select>
            </label>
            <label htmlFor="target" className="block text-sm font-medium text-slate-700">{channel === 'EMAIL' ? 'Email address' : 'Phone number'}
              <input id="target" type={channel === 'EMAIL' ? 'email' : 'tel'} autoComplete={channel === 'EMAIL' ? 'email' : 'tel'} required value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Sending…' : 'Send sign-in code'}</button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <p role="status" aria-live="polite" className="text-sm text-slate-600">{notice}</p>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">6-digit code
              <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1.5 w-full px-4 py-3 rounded-xl border border-slate-200 bg-stone-50 text-center tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-slate-700" />
            </label>
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={pending || code.length !== 6} aria-busy={pending} className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60">{pending ? 'Verifying…' : 'Verify and sign in'}</button>
            <button type="button" onClick={() => { setSent(false); setCode(''); setNotice(''); }} className="w-full text-sm text-slate-700 underline">Use a different address or number</button>
          </form>
        )}
        <Link href="/signin" className="block text-sm font-semibold underline text-slate-800">Return to password sign in</Link>
      </section>
    </div>
  );
}
