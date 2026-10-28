'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../lib/auth-context';
import { BRAND } from '../../lib/constants';
import {
  Compass,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  Building,
  KeyRound,
  FileCheck,
  ChevronRight,
  ArrowRight,
  User,
  Mail,
  Phone,
} from 'lucide-react';

export default function AccountDashboardPage() {
  const router = useRouter();
  const { user, overview, isLoading, fetchOverview } = useCustomerAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/signin');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="inline-block w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full" aria-hidden="true"></div>
          <div className="text-xs font-mono text-slate-500">Retrieving Haven guest profile...</div>
        </div>
      </div>
    );
  }

  const stage = overview?.stage || 'REGISTERED_NO_BOOKING';
  const profileCompletion = overview?.profileCompletion || { percent: 40, missing: ['EMAIL_VERIFIED', 'PHONE_VERIFIED', 'ID_DOCUMENT'] };
  const nextActions = overview?.nextActions || [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <div className="flex justify-end">
        <Link href="/account/security" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 underline">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          Security & sessions
        </Link>
      </div>
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-stone-100 text-[11px] font-mono font-medium text-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Haven Member Profile</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">
            Welcome back, {user.full_name || user.email?.split('@')[0]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-xl">
            {stage === 'REGISTERED_NO_BOOKING' &&
              'Your Haven account is active. Explore our boutique spaces or complete your profile to unlock one-touch express check-in.'}
            {stage === 'UPCOMING' && 'You have upcoming reservations ready for arrival.'}
            {stage === 'ACTIVE_STAY' && 'Enjoy your stay at Haven Stays.'}
            {stage === 'PAST_ONLY' && 'Review your stay history and book your next escape.'}
          </p>
        </div>

        {/* Profile Completion Dial */}
        <div className="bg-stone-50 border border-slate-200/70 p-5 rounded-2xl min-w-[240px] space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Profile Readiness</span>
            <span className="font-mono text-slate-900">{profileCompletion.percent}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-slate-900 h-2 rounded-full transition-all duration-500"
              style={{ width: `${profileCompletion.percent}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            {profileCompletion.percent === 100
              ? 'Complete profile! Contactless mobile key active.'
              : 'Verifying contact & ID documents speeds up on-site check-in.'}
          </p>
        </div>
      </div>

      {/* Stage-Based Booking State Card */}
      {stage === 'REGISTERED_NO_BOOKING' && (
        <div className="bg-gradient-to-br from-amber-50/70 via-stone-50 to-white border border-amber-200/70 rounded-3xl p-8 sm:p-12 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-100/80 border border-amber-300/60 mx-auto flex items-center justify-center text-amber-900">
            <Compass className="w-8 h-8" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-2xl font-serif font-bold text-slate-900">
              No Active Stays Booked Yet
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              You are officially registered in the Haven network! When you reserve a boutique suite, hostel pod, or long-term residence, your stay itinerary, room access PIN, and digital receipts will appear right here.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/#stays"
              className="px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold tracking-wide transition-all shadow-md inline-flex items-center space-x-2"
            >
              <span>Browse Stays & Rooms</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/#living"
              className="px-6 py-3 rounded-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold tracking-wide transition-colors"
            >
              Explore Long-Term Living
            </Link>
          </div>
        </div>
      )}

      {/* Profile Checklist & Next Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Checklist */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="space-y-0.5">
              <h3 className="font-serif text-lg font-bold text-slate-900">Check-in Checklist</h3>
              <p className="text-xs text-slate-500">Speed up your arrival across all Haven properties.</p>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-slate-800">Account Registered</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                DONE
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl">
              <div className="flex items-center space-x-3">
                {user.email_verified_at ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-medium text-slate-800">Email Address Verified</div>
                  <div className="text-[11px] text-slate-400">{user.email}</div>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  user.email_verified_at
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-amber-800 bg-amber-50'
                }`}
              >
                {user.email_verified_at ? 'VERIFIED' : 'PENDING'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl">
              <div className="flex items-center space-x-3">
                {user.phone_verified_at ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-medium text-slate-800">Phone for Door Passcode</div>
                  <div className="text-[11px] text-slate-400">{user.phone || 'Not added yet'}</div>
                </div>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  user.phone_verified_at
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-slate-500 bg-slate-200'
                }`}
              >
                {user.phone_verified_at ? 'VERIFIED' : 'UNVERIFIED'}
              </span>
            </div>
          </div>
        </div>

        {/* Member Benefits */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-8 shadow-sm space-y-6">
          <div className="space-y-0.5 border-b border-slate-100 pb-4">
            <h3 className="font-serif text-lg font-bold text-slate-900">Member Privileges</h3>
            <p className="text-xs text-slate-500">Included automatically with your Haven Stays profile.</p>
          </div>

          <div className="space-y-4 text-xs text-slate-600">
            <div className="flex items-start space-x-3">
              <KeyRound className="w-4 h-4 text-slate-900 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">Contactless Keycard Access</div>
                <div className="text-slate-500 mt-0.5">Use your mobile web pass to enter lobby doors and elevator portals.</div>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Building className="w-4 h-4 text-slate-900 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">Rooftop Lounge Access</div>
                <div className="text-slate-500 mt-0.5">Complementary high-speed coworking lounge access during your stay.</div>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <FileCheck className="w-4 h-4 text-slate-900 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">Transparent Pricing Guarantee</div>
                <div className="text-slate-500 mt-0.5">Zero surprise destination fees or hidden checkout cleaning charges.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
