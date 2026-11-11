'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { Building2, FileText, KeyRound } from 'lucide-react';
import { customerApiClient } from '../../../lib/api';
import { useCustomerAuth } from '../../../lib/auth-context';

interface StayHistoryItem {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string | null;
  unitType: string | null;
  unitCategory: string | null;
  persona: string;
  assignmentStatus: string | null;
  billingStrategy: string | null;
  scheduledCheckIn: string | null;
  scheduledCheckOut: string | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  finalAmountPaid: number | string;
  isActive: boolean;
}

interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  propertyName: string;
  currency: string;
  unitNumber: string;
  billingMonth: string;
  totalAmount: number | string;
  paidAmount: number | string;
  balance: number | string;
  status: string;
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load stay details.';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function MyStayPage() {
  const router = useRouter();
  const { user, isLoading } = useCustomerAuth();
  const [stays, setStays] = useState<StayHistoryItem[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [printInvoiceId, setPrintInvoiceId] = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.push('/signin');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      customerApiClient.get<StayHistoryItem[]>('/stay/me/history'),
      customerApiClient.get<CustomerInvoice[]>('/billing/me/invoices'),
    ]).then(([stayResponse, invoiceResponse]) => {
      if (!active) return;
      setStays(stayResponse.data);
      setInvoices(invoiceResponse.data);
    }).catch((error: unknown) => {
      if (active) setErrorMessage(getErrorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!printInvoiceId) return;
    const printFrame = window.requestAnimationFrame(() => window.print());
    const clearPrint = () => setPrintInvoiceId('');
    window.addEventListener('afterprint', clearPrint, { once: true });
    return () => {
      window.cancelAnimationFrame(printFrame);
      window.removeEventListener('afterprint', clearPrint);
    };
  }, [printInvoiceId]);

  if (isLoading || !user) {
    return <div className="flex min-h-[65vh] items-center justify-center text-sm text-slate-500">Loading your stay…</div>;
  }

  const activeStays = stays.filter((stay) => stay.isActive);
  const printInvoice = invoices.find((invoice) => invoice.id === printInvoiceId);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-6">
      <header className="print:hidden">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Haven Stays</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">My stay</h1>
        <p className="mt-2 text-sm text-slate-600">Active stay details, your visit history, and billing statements.</p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/portal/profile" className="text-sm font-semibold text-slate-700 hover:text-amber-700">Manage profile and ID verification →</Link>
          <Link href="/portal/invoices" className="text-sm font-semibold text-slate-700 hover:text-amber-700">Invoices & online payments →</Link>
        </div>
      </header>

      {errorMessage && <div role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800 print:hidden">{errorMessage}</div>}

      <section className="space-y-4 print:hidden">
        <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><h2 className="font-serif text-xl font-bold">Current stays</h2></div>
        {loading ? <p className="text-sm text-slate-500">Loading active stays…</p> : activeStays.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">There are no active checked-in stays on your account.</div>
        ) : activeStays.map((stay) => (
          <article key={stay.id} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Checked in · {stay.persona.replaceAll('_', ' ')}</p>
              <h3 className="mt-2 font-serif text-xl font-semibold">{stay.propertyName}</h3>
              <p className="mt-1 text-sm text-slate-600">{stay.unitType} {stay.unitNumber || '—'}{stay.unitCategory ? ` · ${stay.unitCategory}` : ''}</p>
              <p className="mt-2 text-xs text-slate-500">{stay.billingStrategy === 'RECURRING_MONTHLY' ? 'Monthly billing' : 'Per-night billing'}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-slate-500">Scheduled check-in</dt><dd className="mt-1 font-semibold">{formatDate(stay.scheduledCheckIn)}</dd></div>
              <div><dt className="text-slate-500">Scheduled check-out</dt><dd className="mt-1 font-semibold">{formatDate(stay.scheduledCheckOut)}</dd></div>
              <div><dt className="text-slate-500">Actual check-in</dt><dd className="mt-1 font-semibold">{formatDate(stay.actualCheckIn)}</dd></div>
              <div className="flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" /><span className="text-slate-600">Key/access details are provided by the property team at check-in.</span></div>
            </dl>
          </article>
        ))}
      </section>

      <section className="space-y-4 print:hidden">
        <div className="flex items-center gap-2"><FileText className="h-5 w-5" /><h2 className="font-serif text-xl font-bold">Stay history</h2></div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="p-3">Property / unit</th><th className="p-3">Persona</th><th className="p-3">Check-in</th><th className="p-3">Check-out</th><th className="p-3">Final amount paid</th></tr>
            </thead>
            <tbody>
              {stays.map((stay) => (
                <tr key={stay.id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{stay.propertyName}<div className="mt-1 font-normal text-slate-500">{stay.unitType} {stay.unitNumber || '—'}</div></td>
                  <td className="p-3">{stay.persona.replaceAll('_', ' ')}</td>
                  <td className="p-3">{formatDate(stay.actualCheckIn || stay.scheduledCheckIn)}</td>
                  <td className="p-3">{formatDate(stay.actualCheckOut || stay.scheduledCheckOut)}</td>
                  <td className="p-3">{Number(stay.finalAmountPaid).toLocaleString()}</td>
                </tr>
              ))}
              {!loading && stays.length === 0 && <tr><td className="p-5 text-slate-500" colSpan={5}>No stays recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 print:hidden">
        <div className="flex items-center gap-2"><FileText className="h-5 w-5" /><h2 className="font-serif text-xl font-bold">Billing ledger & folios</h2></div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="p-3">Statement</th><th className="p-3">Property / unit</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">Folio</th></tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-100">
                  <td className="p-3">{invoice.invoiceNumber}<div className="mt-1 text-slate-500">{invoice.billingMonth.slice(0, 7)} · {invoice.status}</div></td>
                  <td className="p-3">{invoice.propertyName} · {invoice.unitNumber}</td>
                  <td className="p-3">{invoice.currency} {Number(invoice.totalAmount).toLocaleString()}</td>
                  <td className="p-3">{invoice.currency} {Number(invoice.paidAmount).toLocaleString()}</td>
                  <td className="p-3">{invoice.currency} {Number(invoice.balance).toLocaleString()}</td>
                  <td className="p-3"><button type="button" onClick={() => setPrintInvoiceId(invoice.id)} className="font-semibold text-blue-700 underline">Print / Save PDF</button></td>
                </tr>
              ))}
              {!loading && invoices.length === 0 && <tr><td className="p-5 text-slate-500" colSpan={6}>No invoices or folios are available.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Use “Print / Save PDF” and choose “Save as PDF” in your browser’s print dialog.</p>
      </section>

      {printInvoice && (
        <section className="hidden print:block">
          <h1 className="text-2xl font-bold">Haven Stays folio</h1>
          <p className="mt-4">Invoice {printInvoice.invoiceNumber}</p>
          <p>{printInvoice.propertyName} · {printInvoice.unitNumber} · {printInvoice.billingMonth.slice(0, 7)}</p>
          <hr className="my-4" />
          <p>Total: {printInvoice.currency} {Number(printInvoice.totalAmount).toFixed(2)}</p>
          <p>Paid: {printInvoice.currency} {Number(printInvoice.paidAmount).toFixed(2)}</p>
          <p>Balance: {printInvoice.currency} {Number(printInvoice.balance).toFixed(2)}</p>
          <p>Status: {printInvoice.status}</p>
        </section>
      )}
    </main>
  );
}
