import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { BedDouble, CircleDollarSign, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { PaymentCollectionModal } from '../billing/PaymentCollectionModal';

interface StayAssignment {
  id: string;
  unitId: string;
  userId: string;
  billingStrategy: 'PER_NIGHT_STAY' | 'RECURRING_MONTHLY';
  status: 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
  agreedRate: number | string | null;
  standardRate: number | string | null;
  billToCollect: number | string;
  rateOverrideReason: string | null;
  expectedCheckIn: string;
  expectedCheckOut: string | null;
  actualCheckIn: string | null;
  actualCheckOut: string | null;
  isActive: boolean;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  unitType: string;
  unitCategory: string;
  currency: string;
  persona: string | null;
  guestCount?: number;
  additionalGuestNames?: string[];
  stayRecordId: string | null;
}

interface StaySummary {
  totalActiveStays: number;
  amountCollectedToday: Array<{ currency: string; amount: number | string }>;
  checkInsToday: number;
  checkOutsToday: number;
}

interface ActiveStayCounts {
  activeGuests: number;
  activeHostelers: number;
}

interface ActiveStaysBoardProps {
  refreshSignal?: number;
  showSummaryCards?: boolean;
  onActiveStayCountsChange?: (counts: ActiveStayCounts) => void;
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Stay operation failed.';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatCurrency(value: number | string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
}

const hostelPropertyTypes = new Set(['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING']);

export const ActiveStaysBoard: React.FC<ActiveStaysBoardProps> = ({
  refreshSignal = 0,
  showSummaryCards = true,
  onActiveStayCountsChange,
}) => {
  const { properties, selectedPropertyId } = useAuth();
  const [stays, setStays] = useState<StayAssignment[]>([]);
  const [summary, setSummary] = useState<StaySummary>({
    totalActiveStays: 0,
    amountCollectedToday: [],
    checkInsToday: 0,
    checkOutsToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [selectedStay, setSelectedStay] = useState<StayAssignment | null>(null);

  const loadStays = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const propertyParams = selectedPropertyId && selectedPropertyId !== 'ALL'
        ? { propertyId: selectedPropertyId }
        : {};
      const activeStayParams = selectedPropertyId === 'ALL'
        ? { includeHostelers: true }
        : propertyParams;
      const [staysResponse, summaryResponse] = await Promise.all([
        apiClient.get<StayAssignment[]>('/stay/assignments/active', { params: activeStayParams }),
        apiClient.get<StaySummary>('/stay/assignments/summary', { params: propertyParams }),
      ]);
      const propertyById = new Map(properties.map((property) => [property.id, property]));
      const activeGuests = staysResponse.data.reduce((total, stay) => {
        return propertyById.get(stay.propertyId)?.type === 'HOTEL'
          ? total + Math.max(stay.guestCount || 1, (stay.additionalGuestNames?.length || 0) + 1)
          : total;
      }, 0);
      const activeHostelers = staysResponse.data.filter((stay) =>
        hostelPropertyTypes.has(propertyById.get(stay.propertyId)?.type || ''),
      ).length;
      onActiveStayCountsChange?.({ activeGuests, activeHostelers });
      setStays(selectedPropertyId === 'ALL'
        ? staysResponse.data.filter((stay) =>
          propertyById.get(stay.propertyId)?.type === 'HOTEL',
        )
        : staysResponse.data);
      setSummary(summaryResponse.data);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [onActiveStayCountsChange, properties, selectedPropertyId]);

  useEffect(() => {
    void loadStays();
  }, [loadStays]);

  useEffect(() => {
    if (refreshSignal > 0) void loadStays();
  }, [loadStays, refreshSignal]);

  const checkOutStay = async (data: {
    amount: string;
    folioSettled: boolean;
    keycardReturned: boolean;
  }) => {
    if (!selectedStay) return;
    setWorkingId(selectedStay.id);
    setErrorMessage('');
    try {
      await apiClient.post(`/stay/assignments/${encodeURIComponent(selectedStay.id)}/check-out`, {
        folioSettled: data.folioSettled,
        keycardReturned: data.keycardReturned,
        finalAmountPaid: data.amount,
      });
      setSelectedStay(null);
      await loadStays();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorkingId('');
    }
  };

  return (
    <section className="space-y-5">
      {errorMessage && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>}
      {showSummaryCards && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Active room assignments</span><BedDouble className="h-4 w-4" /></div>
          <p className="mt-2 text-2xl font-bold">{summary.totalActiveStays}</p>
        </article>
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Amount collected today</span><CircleDollarSign className="h-4 w-4" /></div>
          <p className="mt-2 text-xl font-bold">
            {summary.amountCollectedToday.length > 0
              ? summary.amountCollectedToday.map(({ currency, amount }) => formatCurrency(amount, currency)).join(' · ')
              : '—'}
          </p>
        </article>
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Check-ins today</span><LogIn className="h-4 w-4" /></div>
          <p className="mt-2 text-2xl font-bold">{summary.checkInsToday}</p>
        </article>
        <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Check-outs today</span><LogOut className="h-4 w-4" /></div>
          <p className="mt-2 text-2xl font-bold">{summary.checkOutsToday}</p>
        </article>
      </div>}
      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-3">Guest</th><th className="p-3">Property / unit</th>
              <th className="p-3">Billing</th><th className="p-3">Expected checkout</th>
              <th className="p-3">Checked in</th><th className="p-3">Bill to collect</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {stays.map((stay) => (
              <tr key={stay.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3"><strong>{stay.guestName || 'Guest'}</strong><div className="mt-1 text-slate-500">{stay.guestPhone || stay.guestEmail}</div></td>
                <td className="p-3">{stay.propertyName}<div className="mt-1 text-slate-500">{stay.unitType} {stay.unitNumber} · {stay.unitCategory}</div></td>
                <td className="p-3">{stay.billingStrategy === 'RECURRING_MONTHLY' ? 'Monthly' : 'Per night'}<div className="mt-1 text-slate-500">{stay.persona || '—'}</div></td>
                <td className="p-3">{formatDate(stay.expectedCheckOut)}</td>
                <td className="p-3">{formatDate(stay.actualCheckIn)}</td>
                <td className="p-3 font-semibold">{formatCurrency(stay.billToCollect, stay.currency)}</td>
                <td className="p-3">
                  <button type="button" onClick={() => { setErrorMessage(''); setSelectedStay(stay); }} className="whitespace-nowrap bg-slate-900 px-2 py-1 font-semibold text-white">Checkout and collect</button>
                </td>
              </tr>
            ))}
            {!loading && stays.length === 0 && <tr><td className="p-8 text-center text-slate-500" colSpan={7}>No active guests in this property scope.</td></tr>}
            {loading && <tr><td className="p-8 text-center text-slate-500" colSpan={7}><LoadingIndicator label="Loading Billing Counter" /></td></tr>}
          </tbody>
        </table>
      </div>
      {selectedStay && (
        <PaymentCollectionModal
          kind="checkout"
          personName={selectedStay.guestName || 'Guest'}
          propertyName={selectedStay.propertyName}
          unitNumber={selectedStay.unitNumber}
          currency={selectedStay.currency}
          amountDue={selectedStay.billToCollect}
          checkIn={selectedStay.actualCheckIn}
          expectedCheckOut={selectedStay.expectedCheckOut}
          isSubmitting={workingId === selectedStay.id}
          errorMessage={errorMessage}
          onClose={() => setSelectedStay(null)}
          onSubmit={(data) => void checkOutStay(data)}
        />
      )}
    </section>
  );
};
