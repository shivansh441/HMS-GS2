import React from 'react';
import { BRAND } from '../../lib/constants';

export const metadata = {
  title: 'Terms of Service',
  description: 'Terms governing reservations, resident agreements, and community rules.',
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <h1 className="text-3xl font-serif font-bold text-slate-900">Terms of Service</h1>
      <p className="text-xs text-slate-400 font-mono">Last updated: October 2026</p>
      <div className="text-sm text-slate-600 space-y-4 leading-relaxed">
        <p>
          By booking or creating an account on {BRAND.NAME}, you agree to respect our community quiet hours (10:00 PM to 7:00 AM) and uphold a courteous environment for fellow guests and neighbors.
        </p>
        <p>
          Reservations are subject to standard cancellation windows as outlined during booking checkout.
        </p>
      </div>
    </div>
  );
}
