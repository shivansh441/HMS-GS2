'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { customerApiClient } from '../../lib/api';

export default function CheckYourEmailPage() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEmail(new URLSearchParams(window.location.search).get('email') || '');
  }, []);

  const resend = async () => {
    setPending(true);
    setNotice('');
    try {
      await customerApiClient.post('/auth/resend-verification', { email });
    } catch {
      // Keep this response generic so account existence is never disclosed.
    } finally {
      setNotice('If an account needs verification, a new message will be sent.');
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <section className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center text-xl" aria-hidden="true">@</div>
        <h1 className="text-2xl font-bold font-serif text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-600 leading-relaxed">If your address can be registered, we’ve sent a verification link. Open it to finish setting up your Haven account.</p>
        {email && <p className="text-sm font-medium text-slate-800 break-all">{email}</p>}
        <button type="button" onClick={resend} disabled={!email || pending} aria-busy={pending} className="w-full px-5 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">{pending ? 'Sending…' : 'Resend verification email'}</button>
        {notice && <p role="status" aria-live="polite" className="text-sm text-slate-600">{notice}</p>}
        <Link href="/signin" className="inline-block text-sm font-semibold text-slate-900 underline">Return to sign in</Link>
      </section>
    </div>
  );
}
