import React from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
        <h1 className="text-xl font-bold font-serif text-slate-900">Password Recovery</h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Self-service password reset with cryptographic email verification links will be enabled in Module 2.
        </p>
        <Link
          href="/signin"
          className="inline-block px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-semibold"
        >
          Return to Sign In
        </Link>
      </div>
    </div>
  );
}
