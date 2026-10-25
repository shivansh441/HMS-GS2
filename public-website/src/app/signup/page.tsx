'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../lib/auth-context';
import { customerApiClient } from '../../lib/api';
import { BRAND } from '../../lib/constants';
import { Lock, Mail, User, Phone, AlertCircle } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [accountType, setAccountType] = useState('HOTEL_GUEST');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await customerApiClient.post('/auth/register', {
        email,
        password,
        full_name: fullName,
        phone: phone || undefined,
        account_type: accountType,
      });

      await login(res.data.accessToken, res.data.user);
      router.push('/account');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Registration failed. Password must be >=12 chars with upper, lower, digit, special character.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <span className="font-serif text-2xl font-bold text-slate-900 block">{BRAND.NAME}</span>
          <h1 className="text-xl font-bold text-slate-800">Create Your Profile</h1>
          <p className="text-xs text-slate-500">Fast-track check-in and unlocked direct member privileges.</p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Full Legal Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Mobile Phone (Optional)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 019-2831"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 12 chars (upper, lower, digit, special)"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">Argon2id cryptographic hashing enforced.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Primary Stay Interest
            </label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-800"
            >
              <option value="HOTEL_GUEST">Boutique Hotel & Suites</option>
              <option value="SHORT_TERM_HOSTEL_GUEST">Modern Social Hostel</option>
              <option value="LONG_TERM_RESIDENT">Long-Term Co-Living Residence</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer disabled:opacity-50 mt-2"
          >
            {isSubmitting ? 'Registering Profile...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-slate-500">
          Already registered?{' '}
          <Link href="/signin" className="text-slate-900 font-bold hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
