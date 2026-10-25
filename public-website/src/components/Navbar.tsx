'use client';

import React from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '../lib/auth-context';
import { BRAND } from '../lib/constants';
import { MagneticButton } from './motion/MagneticButton';
import { Compass, User, LogOut } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useCustomerAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-serif text-lg font-bold group-hover:scale-105 transition-transform duration-300">
            H
          </div>
          <div>
            <span className="font-serif text-xl tracking-tight font-semibold text-slate-900 block leading-tight">
              {BRAND.NAME}
            </span>
            <span className="text-[10px] tracking-widest uppercase text-slate-400 font-sans block">
              Hospitality Collection
            </span>
          </div>
        </Link>

        {/* Center Nav */}
        <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-600">
          <Link href="/#stays" className="hover:text-slate-900 transition-colors">
            Our Stays
          </Link>
          <Link href="/#living" className="hover:text-slate-900 transition-colors">
            Co-Living
          </Link>
          <Link href="/about" className="hover:text-slate-900 transition-colors">
            About
          </Link>
          <Link href="/contact" className="hover:text-slate-900 transition-colors">
            Contact
          </Link>
        </nav>

        {/* Auth / Account Buttons */}
        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-3">
              <Link
                href="/account"
                className="flex items-center space-x-2 px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>My Haven ({user.full_name?.split(' ')[0] || 'Account'})</span>
              </Link>
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-slate-700 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Link
                href="/signin"
                className="text-xs font-semibold text-slate-700 hover:text-slate-950 px-3 py-2 transition-colors"
              >
                Sign In
              </Link>
              <MagneticButton>
                <Link
                  href="/signup"
                  className="px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-semibold tracking-wide hover:bg-slate-800 transition-all inline-block shadow-sm"
                >
                  Join Haven
                </Link>
              </MagneticButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
