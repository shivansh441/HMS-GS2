'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customerApiClient } from '../../lib/api';
import { BRAND } from '../../lib/constants';
import { AlertCircle, Lock, Mail, Phone, User } from 'lucide-react';

const inputClass =
  'w-full pl-10 pr-4 py-3 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:bg-white';

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!consent) {
      setError('Please accept the terms and privacy notice to continue.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(password)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    setIsSubmitting(true);
    try {
      await customerApiClient.post('/auth/register', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || null,
        consent,
      });
      router.push(`/check-your-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      setError('We could not complete sign-up right now. Please check your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-lg bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-sm space-y-6" aria-labelledby="signup-title">
        <div className="text-center space-y-2">
          <span className="font-serif text-2xl font-bold text-slate-900 block">{BRAND.NAME}</span>
          <h1 id="signup-title" className="text-xl font-bold text-slate-800">Create your account</h1>
          <p className="text-sm text-slate-500">Sign up for a more personal stay with Haven.</p>
        </div>
        {error && (
          <div id="signup-error" role="alert" aria-live="polite" className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700" htmlFor="firstName">
              First name
              <div className="relative mt-1.5">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
                <input id="firstName" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} aria-invalid={Boolean(error) && !firstName.trim()} aria-describedby={error ? 'signup-error' : undefined} />
              </div>
            </label>
            <label className="block text-sm font-medium text-slate-700" htmlFor="lastName">
              Last name
              <div className="relative mt-1.5">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
                <input id="lastName" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} aria-invalid={Boolean(error) && !lastName.trim()} aria-describedby={error ? 'signup-error' : undefined} />
              </div>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email address
            <div className="relative mt-1.5">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} aria-invalid={Boolean(error) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} aria-describedby={error ? 'signup-error' : undefined} />
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
            Phone number <span className="font-normal text-slate-400">(optional)</span>
            <div className="relative mt-1.5">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
              <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 010 1234" className={inputClass} />
            </div>
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
            <div className="relative mt-1.5">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" aria-hidden="true" />
              <input id="password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} aria-describedby="password-hint" />
            </div>
            <span id="password-hint" className="block mt-1.5 text-xs font-normal text-slate-500">At least 12 characters, including uppercase, lowercase, a number, and a symbol.</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-700" />
            <span>I agree to the <Link href="/terms" className="font-semibold text-slate-900 underline">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-slate-900 underline">Privacy Policy</Link>.</span>
          </label>
          <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold uppercase tracking-wider rounded-xl disabled:opacity-60 disabled:cursor-not-allowed">
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500">
          Already have an account? <Link href="/signin" className="text-slate-900 font-bold underline">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
