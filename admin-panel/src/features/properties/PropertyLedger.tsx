import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { BedDouble, CircleDollarSign, FileText, Save, Wallet } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { PaymentCollectionModal } from '../billing/PaymentCollectionModal';
import { TablePagination } from '../../components/ui/TablePagination';

interface Invoice {
  id: string;
  invoiceNumber: string;
  unitAssignmentId: string;
  hostelerId: string;
  hostelerName: string;
  propertyName: string;
  unitNumber: string;
  billingMonth: string;
  unitFee: number | string;
  messFee: number | string;
  electricityArrears: number | string;
  waterArrears: number | string;
  additionalFees: Array<{ feeType: string; name: string; amount: number | string }>;
  totalAmount: number | string;
  paidAmount: number | string;
  balance: number | string;
  status: string;
}

interface Assignment {
  id: string;
  userId: string;
  userName: string | null;
  unitNumber: string;
}

interface LedgerRow {
  assignment: Assignment;
  invoice?: Invoice;
}

type UtilityFeeType = 'ELECTRICITY_FEE' | 'WATER_CHARGE';
type UtilityReadings = { previousReading: string; currentReading: string };

interface PropertyFee {
  feeType: string;
  name: string;
  pricingBasis: string;
  billingTiming: string;
}

type ConfiguredUtilityFee = PropertyFee & { feeType: UtilityFeeType };

const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const tableCellClass = 'whitespace-nowrap border-t border-slate-100 p-3 align-middle dark:border-slate-800';
const ledgerPageSize = 10;

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Financial ledger request failed.';
}

function previousMonthString(date: Date) {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function monthPeriod(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    periodStart: `${month}-01`,
    periodEnd: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}

export const PropertyLedger: React.FC<{
  propertyId: string;
  propertyName: string;
  currency: string;
  canRecordUtilities: boolean;
  showSummaryCards?: boolean;
  onRegisterRefresh: (propertyId: string, refresh: () => Promise<void>) => () => void;
}> = ({
  propertyId,
  propertyName,
  currency,
  canRecordUtilities,
  showSummaryCards = true,
  onRegisterRefresh,
}) => {
  const [utilityMonth, setUtilityMonth] = useState(previousMonthString(new Date()));
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [utilityFees, setUtilityFees] = useState<ConfiguredUtilityFee[]>([]);
  const [utilityReadings, setUtilityReadings] = useState<Record<string, UtilityReadings>>({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [propertyId]);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [invoiceResponse, assignmentResponse, feeResponse] = await Promise.all([
        apiClient.get<Invoice[]>(`/billing/properties/${encodeURIComponent(propertyId)}/invoices`),
        apiClient.get<Assignment[]>(`/billing/properties/${encodeURIComponent(propertyId)}/assignments`),
        apiClient.get<PropertyFee[]>(`/properties/${encodeURIComponent(propertyId)}/fees`),
      ]);
      const configuredUtilityFees = feeResponse.data.filter(
        (fee): fee is ConfiguredUtilityFee =>
          (fee.feeType === 'ELECTRICITY_FEE' || fee.feeType === 'WATER_CHARGE') &&
          fee.pricingBasis === 'METERED' &&
          fee.billingTiming === 'ARREARS',
      );
      setInvoices(invoiceResponse.data);
      setAssignments(assignmentResponse.data);
      setUtilityFees(configuredUtilityFees);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(
    () => onRegisterRefresh(propertyId, loadLedger),
    [loadLedger, onRegisterRefresh, propertyId],
  );

  const recordUtilityReading = async (assignmentId: string, utilityFeeType: UtilityFeeType) => {
    const readingKey = `${assignmentId}:${utilityFeeType}`;
    const reading = utilityReadings[readingKey];
    if (!reading?.previousReading || !reading.currentReading) {
      setErrorMessage('Enter both meter readings.');
      return;
    }
    setWorking(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { periodStart, periodEnd } = monthPeriod(utilityMonth);
      await apiClient.post('/billing/utility-readings', {
        propertyId,
        unitAssignmentId: assignmentId,
        feeType: utilityFeeType,
        periodStart,
        periodEnd,
        previousReading: reading.previousReading,
        currentReading: reading.currentReading,
      });
      setSuccessMessage('Meter reading saved.');
      setUtilityReadings((current) => ({
        ...current,
        [readingKey]: { previousReading: '', currentReading: '' },
      }));
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const recordPayment = async (data: {
    amount: string;
    paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER';
    reference: string;
  }) => {
    if (!selectedInvoice) return;
    setWorking(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.post(`/billing/invoices/${encodeURIComponent(selectedInvoice.id)}/payments`, {
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        ...(data.reference
          ? { reference: data.reference }
          : {}),
      });
      setSuccessMessage('Invoice payment recorded.');
      setSelectedInvoice(null);
      await loadLedger();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const invoiceByAssignment = new Map(invoices.map((invoice) => [invoice.unitAssignmentId, invoice]));
  const rows: LedgerRow[] = invoices.map((invoice) => ({
    assignment: assignments.find((item) => item.id === invoice.unitAssignmentId) || {
      id: invoice.unitAssignmentId,
      userId: invoice.hostelerId,
      userName: invoice.hostelerName,
      unitNumber: invoice.unitNumber,
    },
    invoice,
  }));
  rows.push(
    ...assignments
      .filter((assignment) => !invoiceByAssignment.has(assignment.id))
      .map((assignment) => ({ assignment, invoice: undefined })),
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / ledgerPageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * ledgerPageSize, currentPage * ledgerPageSize);
  const latestInvoiceByAssignment = new Map<string, Invoice>();
  for (const invoice of invoices) {
    const latest = latestInvoiceByAssignment.get(invoice.unitAssignmentId);
    if (!latest || invoice.billingMonth > latest.billingMonth) {
      latestInvoiceByAssignment.set(invoice.unitAssignmentId, invoice);
    }
  }
  const activeAssignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const columnCount = 8 + utilityFees.length;
  const totalPaid = invoices.reduce((total, invoice) => total + Number(invoice.paidAmount), 0);
  const totalBalance = invoices.reduce((total, invoice) => total + Number(invoice.balance), 0);

  return (
    <section className="space-y-5">
      {canRecordUtilities && utilityFees.length > 0 && (
        <div className="flex justify-end">
          <label className="flex items-center gap-2 text-xs font-semibold">
            Meter month
            <input type="month" value={utilityMonth} onChange={(event) => setUtilityMonth(event.target.value)} className={`${inputClass} w-auto`} />
          </label>
        </div>
      )}
      {errorMessage && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>}
      {successMessage && <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{successMessage}</div>}

      {showSummaryCards && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Active hostelers</span><BedDouble className="h-4 w-4" /></div>
          <p className="mt-2 text-2xl font-bold">{assignments.length}</p>
        </article>
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Total invoices</span><FileText className="h-4 w-4" /></div>
          <p className="mt-2 text-2xl font-bold">{invoices.length}</p>
        </article>
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Amount collected</span><CircleDollarSign className="h-4 w-4" /></div>
          <p className="mt-2 text-xl font-bold">{formatCurrency(totalPaid, currency)}</p>
        </article>
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Outstanding balance</span><Wallet className="h-4 w-4" /></div>
          <p className="mt-2 text-xl font-bold">{formatCurrency(totalBalance, currency)}</p>
        </article>
      </div>}

      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[1250px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-3">Hosteler</th>
              <th className="p-3">Hostel / room no.</th>
              <th className="p-3">Month</th>
              <th className="p-3">Rent</th>
              <th className="p-3">Mess</th>
              {utilityFees.map((fee) => <th key={fee.feeType} className="p-3">{fee.name}</th>)}
              <th className="p-3">Other fees</th>
              <th className="p-3">Total / balance</th>
              <th className="p-3">Payment</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="p-8 text-center text-slate-500"><LoadingIndicator label="Loading ledger" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columnCount} className="p-8 text-center text-slate-500">No hostelers.</td></tr>
            ) : pageRows.map(({ assignment, invoice }) => {
              const isLatestInvoice = invoice
                ? latestInvoiceByAssignment.get(assignment.id)?.id === invoice.id
                : true;
              const canEnterReadings =
                canRecordUtilities &&
                utilityFees.length > 0 &&
                activeAssignmentIds.has(assignment.id) &&
                isLatestInvoice;
              const otherFees = [
                ...(invoice && !utilityFees.some((fee) => fee.feeType === 'ELECTRICITY_FEE') && Number(invoice.electricityArrears) > 0
                  ? [{ name: 'Electricity', amount: invoice.electricityArrears }]
                  : []),
                ...(invoice && !utilityFees.some((fee) => fee.feeType === 'WATER_CHARGE') && Number(invoice.waterArrears) > 0
                  ? [{ name: 'Water', amount: invoice.waterArrears }]
                  : []),
                ...(invoice?.additionalFees || []),
              ];
              return (
                <tr key={invoice?.id || assignment.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className={tableCellClass}>
                    <div className="font-bold">{assignment.userName || 'Hosteler'}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">{assignment.userId}</div>
                  </td>
                  <td className={tableCellClass}>
                    <div>{propertyName}</div>
                    <div className="mt-1 text-slate-500">{assignment.unitNumber}</div>
                  </td>
                  <td className={tableCellClass}>
                    {invoice ? (
                      <>
                        <div>{invoice.billingMonth.slice(0, 7)}</div>
                        <div className="mt-1 text-slate-500">{invoice.invoiceNumber}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className={tableCellClass}>{invoice ? `${currency} ${Number(invoice.unitFee).toLocaleString()}` : '—'}</td>
                  <td className={tableCellClass}>{invoice ? `${currency} ${Number(invoice.messFee).toLocaleString()}` : '—'}</td>
                  {utilityFees.map((fee) => {
                    const amount = fee.feeType === 'ELECTRICITY_FEE'
                      ? Number(invoice?.electricityArrears ?? 0)
                      : Number(invoice?.waterArrears ?? 0);
                    const readingKey = `${assignment.id}:${fee.feeType}`;
                    const reading = utilityReadings[readingKey] || { previousReading: '', currentReading: '' };
                    return (
                      <td key={fee.feeType} className={`${tableCellClass} min-w-56`}>
                        {invoice && <div className="mb-2 font-semibold">{currency} {amount.toLocaleString()}</div>}
                        {canEnterReadings ? (
                          <div className="flex min-w-52 flex-col gap-1">
                            <input
                              aria-label={`${fee.name} previous reading for ${assignment.userName || assignment.userId}`}
                              type="number"
                              min="0"
                              step="0.001"
                              placeholder="Previous"
                              value={reading.previousReading}
                              onChange={(event) => setUtilityReadings((current) => ({
                                ...current,
                                [readingKey]: { ...reading, previousReading: event.target.value },
                              }))}
                              className={inputClass}
                            />
                            <input
                              aria-label={`${fee.name} current reading for ${assignment.userName || assignment.userId}`}
                              type="number"
                              min="0"
                              step="0.001"
                              placeholder="Current"
                              value={reading.currentReading}
                              onChange={(event) => setUtilityReadings((current) => ({
                                ...current,
                                [readingKey]: { ...reading, currentReading: event.target.value },
                              }))}
                              className={inputClass}
                            />
                            <button
                              type="button"
                              disabled={working || !utilityMonth || !reading.previousReading || !reading.currentReading}
                              onClick={() => void recordUtilityReading(assignment.id, fee.feeType)}
                              className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60"
                            >
                              Save
                            </button>
                          </div>
                        ) : !invoice || amount === 0 ? '—' : null}
                      </td>
                    );
                  })}
                  <td className={tableCellClass}>
                    {otherFees.length === 0 ? '—' : otherFees.map((fee, index) => (
                      <div key={`${fee.name}-${index}`}>{fee.name}: {currency} {Number(fee.amount).toLocaleString()}</div>
                    ))}
                  </td>
                  <td className={tableCellClass}>
                    {invoice ? (
                      <>
                        <div className="font-bold">{currency} {Number(invoice.totalAmount).toLocaleString()}</div>
                        <div className="mt-1 text-slate-500">{invoice.status} · Balance {currency} {Number(invoice.balance).toLocaleString()}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className={tableCellClass}>
                    {invoice && Number(invoice.balance) > 0 ? (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => { setErrorMessage(''); setSelectedInvoice(invoice); }}
                        className="inline-flex items-center justify-center gap-2 bg-emerald-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" /> Record payment
                      </button>
                    ) : invoice ? <span className="font-semibold text-emerald-700">Paid</span> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        label="Property ledger"
        page={currentPage}
        pageCount={pageCount}
        pageSize={ledgerPageSize}
        totalItems={rows.length}
        onPageChange={setPage}
      />
      {selectedInvoice && (
        <PaymentCollectionModal
          kind="invoice"
          personName={selectedInvoice.hostelerName}
          propertyName={selectedInvoice.propertyName}
          unitNumber={selectedInvoice.unitNumber}
          currency={currency}
          amountDue={selectedInvoice.balance}
          invoiceNumber={selectedInvoice.invoiceNumber}
          billingMonth={selectedInvoice.billingMonth}
          isSubmitting={working}
          errorMessage={errorMessage}
          onClose={() => setSelectedInvoice(null)}
          onSubmit={(data) => void recordPayment(data)}
        />
      )}
    </section>
  );
};
