'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowRight, Building2, FileCheck2, KeyRound } from 'lucide-react';
import { customerApiClient } from '../../lib/api';
import { useCustomerAuth } from '../../lib/auth-context';

interface StayHistoryItem {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string | null;
  unitType: string | null;
  persona: string;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  isActive: boolean;
}

interface CustomerProfile {
  fullName: string | null;
  idDocumentFilePresent: boolean;
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load your portal.';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export default function CustomerPortalPage() {
  const router = useRouter();
  const { user, isLoading } = useCustomerAuth();
  const [stays, setStays] = useState<StayHistoryItem[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.push('/signin');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      customerApiClient.get<StayHistoryItem[]>('/customer/stays/history'),
      customerApiClient.get<CustomerProfile>('/customer/profile'),
    ])
      .then(([stayResponse, profileResponse]) => {
        if (!active) return;
        setStays(stayResponse.data);
        setProfile(profileResponse.data);
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (isLoading || !user) {
    return <div className="flex min-h-[65vh] items-center justify-center text-sm text-slate-500">Loading your portal…</div>;
  }

  const activeStays = stays.filter((stay) => stay.isActive);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Haven Stays</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Welcome{profile?.fullName ? `, ${profile.fullName}` : ''}</h1>
          <p className="mt-2 text-sm text-slate-600">Your reservations, stays, statements, and profile verification.</p>
        </div>
        <Link href="/properties" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-amber-700">Explore properties <ArrowRight className="h-4 w-4" /></Link>
      </header>

      {errorMessage && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage}</div>}

      <section className="grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-amber-700" /><h2 className="font-serif text-xl font-semibold">Active stays</h2></div>
          {loading ? <p className="mt-4 text-sm text-slate-500">Loading stay details…</p> : activeStays.length ? (
            <div className="mt-4 space-y-4">
              {activeStays.map((stay) => (
                <div key={stay.id} className="border-t border-slate-100 pt-4">
                  <p className="font-semibold">{stay.propertyName}</p>
                  <p className="mt-1 text-sm text-slate-600">{stay.unitType || 'Unit'} {stay.unitNumber || '—'} · {stay.persona.replaceAll('_', ' ')}</p>
                  <p className="mt-2 text-xs text-slate-500">Check-in {formatDate(stay.scheduledCheckIn)} · Check-out {formatDate(stay.scheduledCheckOut)}</p>
                  <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" /> Access instructions are provided securely by the property team at check-in.</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">No active checked-in stays. Your confirmed stay details will appear here.</p>}
          <div className="mt-5 flex flex-wrap gap-4">
            <Link href="/portal/my-stay" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-amber-700">View stay history <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/portal/invoices" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-amber-700">Invoices & payments <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-amber-700" /><h2 className="font-serif text-xl font-semibold">Profile verification</h2></div>
          <p className="mt-4 text-sm text-slate-600">
            {profile?.idDocumentFilePresent
              ? 'Your ID document is securely on file.'
              : 'Add a government-issued ID to complete your check-in profile.'}
          </p>
          <Link href="/portal/profile" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-amber-700">Manage profile and ID <ArrowRight className="h-4 w-4" /></Link>
        </article>
      </section>
    </main>
  );
}
