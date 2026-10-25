import React from 'react';
import { BRAND } from '../../lib/constants';
import { Mail, Phone, MapPin } from 'lucide-react';

export const metadata = {
  title: 'Contact Concierge',
  description: 'Reach Haven Stays central concierge for bookings, group inquiries, and resident support.',
};

export default function ContactPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-8">
      <div className="space-y-3">
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-700">Concierge Desk</span>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900">Get in Touch</h1>
        <p className="text-sm text-slate-600">Our concierge desk is available 24/7 to assist with reservations and resident services.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl space-y-2">
          <Mail className="w-5 h-5 text-amber-700" />
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Email Support</div>
          <div className="text-sm font-semibold text-slate-900">{BRAND.SUPPORT_EMAIL}</div>
        </div>

        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl space-y-2">
          <Phone className="w-5 h-5 text-amber-700" />
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone Support</div>
          <div className="text-sm font-semibold text-slate-900">{BRAND.PHONE}</div>
        </div>

        <div className="bg-white border border-slate-200/80 p-6 rounded-2xl space-y-2">
          <MapPin className="w-5 h-5 text-amber-700" />
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Locations</div>
          <div className="text-xs text-slate-700">HQ-01 Downtown • HQ-02 Waterfront</div>
        </div>
      </div>
    </div>
  );
}
