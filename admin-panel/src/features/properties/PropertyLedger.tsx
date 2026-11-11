import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { RefreshCw, Save } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  unitNumber: string;
  billingMonth: string;
  unitFee: number | string;
  messFee: number | string;
  electricityArrears: number | string;
  waterArrears: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  balance: number | string;
  status: string;
}

interface Deposit {
  id: string;
  unitAssignmentId: string;
  amount: number | string;
  collectedAmount: number | string;
  balance: number | string;
  status: string;
}

interface Assignment {
  id: string;
  userId: string;
  userName: string | null;
  unitNumber: string;
  billingStrategy: string;
}

interface Receipt {
  id: string;
  receiptNumber: string;
  amount: number | string;
  paymentMethod: string;
  reference: string | null;
  receivedAt: string;
}

const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const paymentMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'] as const;

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Financial ledger request failed.';
}

function monthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const PropertyLedger: React.FC<{
  propertyId: string;
  currency: string;
  canGenerate: boolean;
}> = ({ propertyId, currency, canGenerate }) => {
  const [month, setMonth] = useState(monthString(new Date()));
  const [readingMonth, setReadingMonth] = useState(() => {
    const previous = new Date();
    previous.setDate(1);
    previous.setMonth(previous.getMonth() - 1);
    return monthString(previous);
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [utilityType, setUtilityType] = useState<'ELECTRICITY_FEE' | 'WATER_CHARGE'>('ELECTRICITY_FEE');
  const [previousReading, setPreviousReading] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentMethodsByTarget, setPaymentMethodsByTarget] = useState<Record<string, string>>({});
  const [referenceByTarget, setReferenceByTarget] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [invoiceResponse, depositResponse, assignmentResponse, receiptResponse] = await Promise.all([
        apiClient.get<Invoice[]>(`/billing/properties/${encodeURIComponent(propertyId)}/invoices`),
        apiClient.get<Deposit[]>(`/billing/properties/${encodeURIComponent(propertyId)}/deposits`),
        apiClient.get<Assignment[]>(`/billing/properties/${encodeURIComponent(propertyId)}/assignments`),
        apiClient.get<Receipt[]>(`/billing/properties/${encodeURIComponent(propertyId)}/receipts`),
      ]);
      setInvoices(invoiceResponse.data);
      setDeposits(depositResponse.data);
      setAssignments(assignmentResponse.data);
      setReceipts(receiptResponse.data);
      if (!selectedAssignmentId && assignmentResponse.data.length) {
        setSelectedAssignmentId(assignmentResponse.data[0].id);
      }
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [propertyId, selectedAssignmentId]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const generateInvoices = async () => {
    setWorking(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data } = await apiClient.post<{ createdCount: number; skippedCount: number }>(
        '/billing/invoices/generate-monthly',
        null,
        { params: { billingMonth: month, propertyId } },
      );
      setSuccessMessage(`${data.createdCount} invoice(s) created; ${data.skippedCount} already existed.`);
      await loadLedger();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const recordPayment = async (targetId: string, targetType: 'invoice' | 'deposit') => {
    const target = targetType === 'invoice'
      ? invoices.find((invoice) => invoice.id === targetId)
      : deposits.find((deposit) => deposit.id === targetId);
    const endpoint = targetType === 'invoice'
      ? `/billing/invoices/${encodeURIComponent(targetId)}/payments`
      : `/billing/deposits/${encodeURIComponent(targetId)}/payments`;
    setWorking(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.post(endpoint, {
        amount: paymentAmounts[targetId] || String(target?.balance ?? 0),
        paymentMethod: paymentMethodsByTarget[targetId] || 'CASH',
        ...(referenceByTarget[targetId]?.trim() ? { reference: referenceByTarget[targetId].trim() } : {}),
      });
      setSuccessMessage('Payment receipt recorded.');
      await loadLedger();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const recordMeterReading = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const start = new Date(`${readingMonth}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const periodStart = `${readingMonth}-01`;
    const periodEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    setWorking(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.post(
        '/billing/utility-readings',
        {
          propertyId,
          unitAssignmentId: selectedAssignmentId,
          feeType: utilityType,
          periodStart,
          periodEnd,
          previousReading,
          currentReading,
        },
      );
      setSuccessMessage(`Utility amount queued as ${readingMonth} arrears for the next monthly invoice.`);
      setPreviousReading('');
      setCurrentReading('');
      await loadLedger();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const depositsDue = deposits.filter((deposit) => Number(deposit.balance) > 0);

  return (
    <section className="space-y-5 border-t border-slate-200 pt-5 dark:border-slate-800">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase">Financial ledger</h2>
          <p className="mt-1 text-xs text-slate-500">
            Monthly rent and mess are invoiced in advance; metered utilities are carried as prior-month arrears.
          </p>
        </div>
        <button type="button" onClick={() => void loadLedger()} disabled={loading} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>
      {errorMessage && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>}
      {successMessage && <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{successMessage}</div>}

      {canGenerate && (
        <div className="flex flex-wrap items-end gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <label className="space-y-1 text-xs font-semibold">
            Invoice month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass} />
          </label>
          <button type="button" onClick={() => void generateInvoices()} disabled={working || !month} className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">
            {working ? 'Working…' : 'Generate monthly invoices'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase">Invoices</h3>
        {loading ? <p className="text-xs text-slate-500">Loading ledger…</p> : invoices.length === 0 ? (
          <p className="border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">No invoices have been generated.</p>
        ) : invoices.map((invoice) => (
          <article key={invoice.id} className="space-y-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <div><strong>{invoice.invoiceNumber}</strong> · {invoice.unitNumber} · {invoice.billingMonth.slice(0, 7)}</div>
              <div>{invoice.status} · Balance {currency} {Number(invoice.balance).toLocaleString()}</div>
            </div>
            <p className="text-[11px] text-slate-500">
              Rent {invoice.unitFee} + Mess {invoice.messFee} + Electricity arrears {invoice.electricityArrears} + Water arrears {invoice.waterArrears}
            </p>
            {Number(invoice.balance) > 0 ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <input aria-label="Payment amount" type="number" min="0.01" max={Number(invoice.balance)} step="0.01" value={paymentAmounts[invoice.id] ?? String(invoice.balance)} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [invoice.id]: event.target.value }))} className={inputClass} />
                <select aria-label="Payment method" value={paymentMethodsByTarget[invoice.id] || 'CASH'} onChange={(event) => setPaymentMethodsByTarget((current) => ({ ...current, [invoice.id]: event.target.value }))} className={inputClass}>
                  {paymentMethods.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
                </select>
                <input aria-label="Payment reference" maxLength={100} placeholder="Reference (optional)" value={referenceByTarget[invoice.id] || ''} onChange={(event) => setReferenceByTarget((current) => ({ ...current, [invoice.id]: event.target.value }))} className={inputClass} />
                <button type="button" disabled={working} onClick={() => void recordPayment(invoice.id, 'invoice')} className="inline-flex items-center justify-center gap-2 bg-emerald-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60"><Save className="h-4 w-4" /> Record receipt</button>
              </div>
            ) : <p className="text-xs font-semibold text-emerald-700">Paid in full</p>}
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase">Security deposit escrow</h3>
        {depositsDue.map((deposit) => (
          <article key={deposit.id} className="grid gap-2 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-4">
            <p className="self-center text-xs">Assignment {deposit.unitAssignmentId.slice(0, 8)} · Remaining {currency} {Number(deposit.balance).toLocaleString()}</p>
            <input aria-label="Deposit amount" type="number" min="0.01" max={Number(deposit.balance)} step="0.01" value={paymentAmounts[deposit.id] ?? String(deposit.balance)} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [deposit.id]: event.target.value }))} className={inputClass} />
            <select aria-label="Deposit payment method" value={paymentMethodsByTarget[deposit.id] || 'CASH'} onChange={(event) => setPaymentMethodsByTarget((current) => ({ ...current, [deposit.id]: event.target.value }))} className={inputClass}>
              {paymentMethods.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
            </select>
            <button type="button" disabled={working} onClick={() => void recordPayment(deposit.id, 'deposit')} className="bg-emerald-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">Collect deposit</button>
          </article>
        ))}
        {!loading && depositsDue.length === 0 && <p className="border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">No outstanding security deposits.</p>}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase">Meter reading entry · active stays</h3>
        <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              <tr><th className="p-3">Unit</th><th className="p-3">Resident</th><th className="p-3">Billing</th><th className="p-3">Reading entry</th></tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={assignment.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="p-3 font-semibold">{assignment.unitNumber}</td>
                  <td className="p-3">{assignment.userName || assignment.userId}</td>
                  <td className="p-3">{assignment.billingStrategy.replaceAll('_', ' ')}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      aria-pressed={selectedAssignmentId === assignment.id}
                      className={`px-3 py-1.5 font-semibold ${selectedAssignmentId === assignment.id ? 'bg-blue-700 text-white' : 'border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}
                    >
                      {selectedAssignmentId === assignment.id ? 'Selected' : 'Enter reading'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && assignments.length === 0 && <tr><td className="p-4 text-slate-500" colSpan={4}>No active stays are available for meter readings.</td></tr>}
            </tbody>
          </table>
        </div>
        <h3 className="text-xs font-bold uppercase">Month-end utility readings</h3>
        {selectedAssignmentId && (
          <p className="text-xs text-slate-500">
            Selected: {assignments.find((assignment) => assignment.id === selectedAssignmentId)?.unitNumber || 'Active stay'}
          </p>
        )}
        <form onSubmit={recordMeterReading} className="grid gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs font-semibold">Utility
            <select value={utilityType} onChange={(event) => setUtilityType(event.target.value as typeof utilityType)} className={inputClass}>
              <option value="ELECTRICITY_FEE">Electricity</option><option value="WATER_CHARGE">Water</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">Completed month
            <input required type="month" value={readingMonth} onChange={(event) => setReadingMonth(event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs font-semibold">Previous reading
            <input required type="number" min="0" step="0.001" value={previousReading} onChange={(event) => setPreviousReading(event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs font-semibold">Current reading
            <input required type="number" min="0" step="0.001" value={currentReading} onChange={(event) => setCurrentReading(event.target.value)} className={inputClass} />
          </label>
          <button type="submit" disabled={working || assignments.length === 0} className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">Queue arrears</button>
        </form>
      </div>

      {receipts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase">Recent receipts</h3>
          {receipts.map((receipt) => <p key={receipt.id} className="border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-800">{receipt.receiptNumber} · {new Date(receipt.receivedAt).toLocaleString()} · {currency} {receipt.amount} · {receipt.paymentMethod} {receipt.reference && `· ${receipt.reference}`}</p>)}
        </div>
      )}
    </section>
  );
};
