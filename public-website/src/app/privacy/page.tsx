import React from 'react';
import { BRAND } from '../../lib/constants';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How Haven Stays handles guest and resident privacy with encrypted credentials.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-6">
      <h1 className="text-3xl font-serif font-bold text-slate-900">Privacy Policy</h1>
      <p className="text-xs text-slate-400 font-mono">Last updated: October 2026</p>
      <div className="text-sm text-slate-600 space-y-4 leading-relaxed">
        <p>
          At {BRAND.NAME}, we believe guest privacy is a foundational pillar of hospitality. We never sell or broker guest travel records or personal data.
        </p>
        <p>
          Sensitive verification credentials, such as government identification document numbers, are encrypted at rest using AES-256-GCM authenticated encryption and never logged in plain text.
        </p>
      </div>
    </div>
  );
}
