'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../lib/auth-context';
import { customerApiClient } from '../../lib/api';
import { BRAND } from '../../lib/constants';
import { Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState('guest.nobooking1@gmail.com');
  const [password, setPassword] = useState('CustomerPass123!');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await customerApiClient.post('/auth/login', {
        email,
        password,
        remember_device: rememberDevice,
      });

      await login(res.data.accessToken, res.data.user);
      router.push('/account');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Invalid email or password. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <span className="font-serif text-2xl font-bold text-slate-900 block">{BRAND.NAME}</span>
          <h1 className="text-xl font-bold text-slate-800">Sign In to Your Account</h1>
          <p className="text-xs text-slate-500">Access your stay itineraries, receipts, and keyless check-in.</p>
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
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-800 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center space-x-2 text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-0"
              />
              <span>Remember this device</span>
            </label>
            <Link href="/forgot-password" className="text-slate-500 hover:text-slate-900 font-medium">
              Forgot password?
            </Link>
          </div>

          {/* SIGN IN BUTTON */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying...' : 'SIGN IN'}
          </button>
        </form>

        {/* OR DIVIDER */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 font-semibold text-slate-400 tracking-wider">OR</span>
          </div>
        </div>

        {/* 3P & OTP BUTTONS */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => alert('Google Social Sign-in configured for Module 2 OAuth integration.')}
            className="w-full py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 8.9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.8 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <button
            type="button"
            onClick={() => alert('Apple Social Sign-in configured for Module 2 OAuth integration.')}
            className="w-full py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.65-.82 1.1-1.96.98-3.1-.95.04-2.11.64-2.79 1.44-.6.69-1.13 1.83-1 2.95 1.07.08 2.16-.47 2.81-1.29" />
            </svg>
            <span>Continue with Apple</span>
          </button>

          <Link
            href="/otp"
            className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition-colors block text-center"
          >
            <span>Send One-Time Passcode</span>
          </Link>
        </div>

        <div className="pt-2 text-center text-xs text-slate-500">
          Don't have a Haven Stays profile?{' '}
          <Link href="/signup" className="text-slate-900 font-bold hover:underline">
            Sign up now
          </Link>
        </div>
      </div>
    </div>
  );
}
