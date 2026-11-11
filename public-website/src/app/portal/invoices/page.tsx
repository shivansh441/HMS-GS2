'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowLeft, Download, FileText, WalletCards } from 'lucide-react';
import { customerApiClient } from '../../../lib/api';
import { useCustomerAuth } from '../../../lib/auth-context';

interface Invoice {
  id: string;
  invoiceNumber: string;
  propertyName: string;
  currency: string;
  unitNumber: string;
  billingMonth: string;
  dueDate: string;
  unitFee: number | string;
  messFee: number | string;
  electricityArrears: number | string;
  waterArrears: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  balance: number | string;
  status: string;
}

interface Receipt {
  id: string;
  receiptNumber: string;
  invoiceId: string | null;
  amount: number | string;
  paymentMethod: string;
  reference: string | null;
  receivedAt: string;
}

interface RazorpayCheckoutResponse {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
  propertyName: string;
}

interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error?: { description?: string };
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal: { ondismiss: () => void };
  theme: { color: string };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load invoices.';
}

function formatMonth(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function loadRazorpay(): Promise<void> {
  if (typeof window.Razorpay === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
    const script = existingScript || document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Payment checkout could not be loaded.'));
    if (!existingScript) document.body.appendChild(script);
  });
}

export default function CustomerInvoicesPage() {
  const router = useRouter();
  const { user, isLoading } = useCustomerAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingInvoiceId, setWorkingInvoiceId] = useState('');
  const [printInvoiceId, setPrintInvoiceId] = useState('');
  const [printReceiptId, setPrintReceiptId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadBilling = useCallback(async () => {
    const [invoiceResponse, receiptResponse] = await Promise.all([
      customerApiClient.get<Invoice[]>('/billing/me/invoices'),
      customerApiClient.get<Receipt[]>('/billing/me/receipts'),
    ]);
    setInvoices(invoiceResponse.data);
    setReceipts(receiptResponse.data);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) router.push('/signin');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    loadBilling()
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadBilling, user]);

  useEffect(() => {
    if (!printInvoiceId && !printReceiptId) return;
    const printFrame = window.requestAnimationFrame(() => window.print());
    const clearPrint = () => {
      setPrintInvoiceId('');
      setPrintReceiptId('');
    };
    window.addEventListener('afterprint', clearPrint, { once: true });
    return () => {
      window.cancelAnimationFrame(printFrame);
      window.removeEventListener('afterprint', clearPrint);
    };
  }, [printInvoiceId, printReceiptId]);

  const checkout = async (invoice: Invoice) => {
    setWorkingInvoiceId(invoice.id);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data: order } = await customerApiClient.post<RazorpayCheckoutResponse>(
        `/billing/invoices/${encodeURIComponent(invoice.id)}/checkout`,
      );
      await loadRazorpay();
      if (!window.Razorpay) throw new Error('Payment checkout is not available in this browser.');

      const checkoutWindow = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Haven Stays',
        description: `${order.invoiceNumber} · ${order.propertyName}`,
        theme: { color: '#0f172a' },
        modal: {
          ondismiss: () => setWorkingInvoiceId(''),
        },
        handler: async (payment) => {
          try {
            const { data: receipt } = await customerApiClient.post<Receipt>(
              `/billing/invoices/${encodeURIComponent(invoice.id)}/payments/verify`,
              payment,
            );
            setSuccessMessage(`Payment received. Receipt ${receipt.receiptNumber} is ready.`);
            await loadBilling();
          } catch (error: unknown) {
            setErrorMessage(getErrorMessage(error));
          } finally {
            setWorkingInvoiceId('');
          }
        },
      });
      checkoutWindow.on('payment.failed', (response) => {
        setErrorMessage(response.error?.description || 'Payment was not completed.');
        setWorkingInvoiceId('');
      });
      checkoutWindow.open();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
      setWorkingInvoiceId('');
    }
  };

  if (isLoading || !user) {
    return <div className="flex min-h-[65vh] items-center justify-center text-sm text-slate-500">Loading invoices…</div>;
  }

  const printableInvoice = invoices.find((invoice) => invoice.id === printInvoiceId);
  const printableReceipt = receipts.find((receipt) => receipt.id === printReceiptId);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-6">
      <header className="print:hidden">
        <Link href="/portal" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" /> Customer portal</Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Billing</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Invoices & payments</h1>
        <p className="mt-2 text-sm text-slate-600">Monthly rent and fixed mess fees, plus utility charges carried as previous-month arrears.</p>
      </header>

      {errorMessage && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800 print:hidden">{errorMessage}</div>}
      {successMessage && <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 print:hidden">{successMessage}</div>}

      <section className="space-y-4 print:hidden">
        <div className="flex items-center gap-2"><FileText className="h-5 w-5" /><h2 className="font-serif text-xl font-bold">Monthly invoices</h2></div>
        {loading ? <p className="text-sm text-slate-500">Loading invoices…</p> : invoices.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No invoices have been issued to your account.</div>
        ) : invoices.map((invoice) => (
          <article key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{invoice.invoiceNumber} · {formatMonth(invoice.billingMonth)}</p><h3 className="mt-1 font-serif text-xl font-semibold">{invoice.propertyName} · Unit {invoice.unitNumber}</h3></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{invoice.status.replaceAll('_', ' ')}</span>
            </header>
            <dl className="grid gap-3 py-4 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Monthly room / bed rent</dt><dd className="font-medium">{invoice.currency} {Number(invoice.unitFee).toFixed(2)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Fixed mess fee</dt><dd className="font-medium">{invoice.currency} {Number(invoice.messFee).toFixed(2)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Previous month electricity arrears</dt><dd className="font-medium">{invoice.currency} {Number(invoice.electricityArrears).toFixed(2)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Previous month water arrears</dt><dd className="font-medium">{invoice.currency} {Number(invoice.waterArrears).toFixed(2)}</dd></div>
            </dl>
            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <span className="text-slate-500">Invoice total</span><strong>{invoice.currency} {Number(invoice.totalAmount).toFixed(2)}</strong>
                <span className="text-slate-500">Paid</span><span>{invoice.currency} {Number(invoice.paidAmount).toFixed(2)}</span>
                <span className="font-semibold">Balance · due {new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString()}</span><strong>{invoice.currency} {Number(invoice.balance).toFixed(2)}</strong>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPrintInvoiceId(invoice.id)} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-semibold"><Download className="h-4 w-4" /> Print / Save PDF</button>
                {Number(invoice.balance) > 0 && invoice.status !== 'CANCELLED' && (
                  <button type="button" onClick={() => void checkout(invoice)} disabled={workingInvoiceId === invoice.id} className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    <WalletCards className="h-4 w-4" /> {workingInvoiceId === invoice.id ? 'Opening checkout…' : 'Pay securely'}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-4 print:hidden">
        <h2 className="font-serif text-xl font-bold">Payment receipts</h2>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div><p className="font-semibold">{receipt.receiptNumber}</p><p className="mt-1 text-xs text-slate-500">{new Date(receipt.receivedAt).toLocaleString()} · {receipt.paymentMethod} {receipt.reference && `· ${receipt.reference}`}</p></div>
              <div className="flex items-center gap-4"><span>{Number(receipt.amount).toFixed(2)}</span><button type="button" onClick={() => setPrintReceiptId(receipt.id)} className="font-semibold text-blue-700 underline">Print / Save PDF</button></div>
            </div>
          ))}
          {!loading && receipts.length === 0 && <p className="p-5 text-sm text-slate-500">No payments have been recorded.</p>}
        </div>
      </section>

      {printableInvoice && (
        <section className="hidden print:block">
          <h1 className="text-2xl font-bold">Haven Stays invoice</h1>
          <p className="mt-3">Invoice {printableInvoice.invoiceNumber} · {formatMonth(printableInvoice.billingMonth)}</p>
          <p>{printableInvoice.propertyName} · Unit {printableInvoice.unitNumber}</p>
          <hr className="my-4" />
          <p>Monthly room / bed rent: {printableInvoice.currency} {Number(printableInvoice.unitFee).toFixed(2)}</p>
          <p>Fixed mess fee: {printableInvoice.currency} {Number(printableInvoice.messFee).toFixed(2)}</p>
          <p>Previous month electricity arrears: {printableInvoice.currency} {Number(printableInvoice.electricityArrears).toFixed(2)}</p>
          <p>Previous month water arrears: {printableInvoice.currency} {Number(printableInvoice.waterArrears).toFixed(2)}</p>
          <hr className="my-4" />
          <p>Total: {printableInvoice.currency} {Number(printableInvoice.totalAmount).toFixed(2)} · Paid: {printableInvoice.currency} {Number(printableInvoice.paidAmount).toFixed(2)}</p>
          <p>Balance: {printableInvoice.currency} {Number(printableInvoice.balance).toFixed(2)} · Due {printableInvoice.dueDate}</p>
        </section>
      )}
      {printableReceipt && (
        <section className="hidden print:block">
          <h1 className="text-2xl font-bold">Haven Stays payment receipt</h1>
          <p className="mt-4">Receipt {printableReceipt.receiptNumber}</p>
          <p>Invoice {invoices.find((invoice) => invoice.id === printableReceipt.invoiceId)?.invoiceNumber || '—'}</p>
          <p>Paid {new Date(printableReceipt.receivedAt).toLocaleString()}</p>
          <p>Method: {printableReceipt.paymentMethod} · Reference: {printableReceipt.reference || '—'}</p>
          <hr className="my-4" />
          <p>Amount received: {Number(printableReceipt.amount).toFixed(2)}</p>
        </section>
      )}
    </main>
  );
}
