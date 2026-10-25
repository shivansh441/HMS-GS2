import React from 'react';
import Link from 'next/link';
import { BRAND } from '../lib/constants';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="space-y-4 md:col-span-2">
          <span className="font-serif text-2xl font-bold text-white block">{BRAND.NAME}</span>
          <p className="text-sm text-slate-400 max-w-sm leading-relaxed">{BRAND.DESCRIPTION}</p>
          <div className="pt-2 text-xs font-mono text-slate-500">
            Locations: Metropolis HQ-01 • Waterfront HQ-02
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Discover</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/#stays" className="hover:text-white transition-colors">
                Boutique Suites
              </Link>
            </li>
            <li>
              <Link href="/#hostel" className="hover:text-white transition-colors">
                Modern Hostel Lofts
              </Link>
            </li>
            <li>
              <Link href="/#living" className="hover:text-white transition-colors">
                Long-Term Residences
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white transition-colors">
                Our Story
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Legal & Support</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/contact" className="hover:text-white transition-colors">
                Contact Concierge
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
            </li>
            <li>
              <span className="text-xs text-slate-600 block pt-4">
                © {new Date().getFullYear()} {BRAND.NAME}. All rights reserved.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
};
