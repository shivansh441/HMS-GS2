import React from 'react';
import { BRAND } from '../../lib/constants';

export const metadata = {
  title: 'About Our Philosophy',
  description: 'Learn about the philosophy and design behind Haven Stays boutique spaces.',
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16 space-y-8">
      <div className="space-y-3">
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-700">The Haven Story</span>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-slate-900">Hospitality Built for How We Live Now</h1>
      </div>

      <div className="prose prose-slate max-w-none text-sm sm:text-base leading-relaxed text-slate-600 space-y-4">
        <p>
          Founded on the principle that modern travel is no longer divided strictly into brief holidays and fixed permanent leases, {BRAND.NAME} brings boutique aesthetics, social community spaces, and residential flexibility into a unified hospitality ecosystem.
        </p>
        <p>
          Every room in our properties features intentional acoustics, natural light, premium organic linens, and integrated digital access. Whether you stay one night in our downtown boutique suites or six months in our waterfront residences, you belong to the same thoughtful community.
        </p>
      </div>
    </div>
  );
}
