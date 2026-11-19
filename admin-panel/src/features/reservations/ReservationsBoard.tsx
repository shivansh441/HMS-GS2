import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Check, CircleDollarSign, History, Plus, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { GuestStayEntryForm } from '../stays/GuestStayEntryForm';

type ReservationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITLISTED'
  | 'REJECTED'
  | 'CONVERTED'
  | 'CANCELLED'
  | 'NO_SHOW';

interface Reservation {
  id: string;
  requestCode: string;
  propertyId: string;
  guestName: string;
  mobile: string;
  email: string | null;
  requestedCategory: string;
  requestedType: string;
  requestedSharingType: string | null;
  requestedQuantity: number;
  numberOfAdults: number;
  numberOfChildren: number;
  expectedCheckIn: string;
  expectedCheckOut: string | null;
  channelOrigin: string;
  status: ReservationStatus;
  rejectionReason: string | null;
}

interface AvailableUnit {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  floor: number;
  capacity: number;
  defaultPricePerNight: number | string | null;
  defaultRecurringMonthlyRate: number | string | null;
  depositAmount: number | string;
}

interface PropertyFeeConfig {
  feeType: string;
  amount: number | string | null;
  isActive: boolean;
}

const columns: ReservationStatus[] = [
  'PENDING',
  'APPROVED',
  'WAITLISTED',
  'CONVERTED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
];

type ReservationStatusFilter = 'ALL' | ReservationStatus;
type ReservationPropertyFilter = 'ALL' | 'HOSTEL' | 'HOTEL';

const hostelPropertyTypes = new Set(['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING']);
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Reservation request failed.';
}

function formatDate(value: string | null) {
  return value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString()
    : 'Open-ended';
}

export const ReservationsBoard: React.FC = () => {
  const { properties, selectedPropertyId } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<ReservationStatusFilter>('ALL');
  const [selectedPropertyType, setSelectedPropertyType] = useState<ReservationPropertyFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<Reservation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [converting, setConverting] = useState<Reservation | null>(null);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [agreedRate, setAgreedRate] = useState('');
  const [rateOverrideReason, setRateOverrideReason] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('0');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const conversionHasRateOverride = Boolean(
    converting &&
    agreedRate !== '' &&
    selectedUnitIds.some((unitId) => {
      const unit = availableUnits.find((item) => item.id === unitId);
      if (!unit) return false;
      const standardRate = converting.requestedType === 'BED'
        ? unit.defaultRecurringMonthlyRate
        : unit.defaultPricePerNight;
      return standardRate != null && Number(agreedRate) !== Number(standardRate);
    }),
  );
  const loadReservations = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const items: Reservation[] = [];
      let offset = 0;
      let total = 0;
      do {
        const { data } = await apiClient.get<{ items: Reservation[]; total: number }>('/reservations', {
          params: {
            status: columns.join(','),
            ...(selectedPropertyId && selectedPropertyId !== 'ALL'
              ? { propertyId: selectedPropertyId }
              : {}),
            limit: 100,
            offset,
          },
        });
        items.push(...data.items);
        total = data.total;
        if (data.items.length === 0 && offset < total) {
          throw new Error('The reservation list returned an incomplete page.');
        }
        offset += data.items.length;
      } while (offset < total);
      setReservations(items);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  const convertingProperty = properties.find((property) => property.id === converting?.propertyId);
  const convertingIsHostel = Boolean(
    convertingProperty &&
    hostelPropertyTypes.has(convertingProperty.type),
  );
  const updateStatus = async (reservation: Reservation, status: ReservationStatus) => {
    setWorkingId(reservation.id);
    setErrorMessage('');
    try {
      await apiClient.patch(`/reservations/${encodeURIComponent(reservation.id)}/status`, { status });
      await loadReservations();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorkingId('');
    }
  };

  const rejectReservation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejecting || !rejectionReason.trim()) return;
    setWorkingId(rejecting.id);
    setErrorMessage('');
    try {
      await apiClient.patch(`/reservations/${encodeURIComponent(rejecting.id)}/status`, {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
      });
      setRejecting(null);
      setRejectionReason('');
      await loadReservations();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorkingId('');
    }
  };

  const openConversion = async (reservation: Reservation) => {
    setConverting(reservation);
    setAvailableUnits([]);
    setSelectedUnitIds([]);
    setAgreedRate('');
    setRateOverrideReason('');
    setInitialDeposit('0');
    setPaymentConfirmed(false);
    setPaymentMethod('CASH');
    setPaymentReference('');
    setErrorMessage('');
    try {
      const [unitResponse, feeResponse] = await Promise.all([
        apiClient.get<AvailableUnit[]>(
          `/reservations/${encodeURIComponent(reservation.id)}/available-units`,
        ),
        apiClient.get<PropertyFeeConfig[]>(
          `/properties/${encodeURIComponent(reservation.propertyId)}/fees`,
        ),
      ]);
      setAvailableUnits(unitResponse.data);
      const depositFee = feeResponse.data.find(
        (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
      );
      setInitialDeposit(
        String(Number(depositFee?.amount || 0) * reservation.requestedQuantity),
      );
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const convertReservation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!converting || selectedUnitIds.length !== converting.requestedQuantity) return;
    if (convertingIsHostel && converting.requestedQuantity > 1) {
      setErrorMessage('This hostel reservation requests multiple beds for one customer. Create a separate reservation for each customer.');
      return;
    }
    if (conversionHasRateOverride && !rateOverrideReason.trim()) {
      setErrorMessage('Enter a reason for changing the standard rate.');
      return;
    }
    setWorkingId(converting.id);
    setErrorMessage('');
    try {
      await apiClient.post(`/reservations/${encodeURIComponent(converting.id)}/convert`, {
        unitId: selectedUnitIds[0],
        additionalUnitIds: selectedUnitIds.slice(1),
        ...(agreedRate ? { agreedRate: agreedRate.trim() } : {}),
        ...(rateOverrideReason.trim()
          ? { rateOverrideReason: rateOverrideReason.trim() }
          : {}),
        initialDeposit: initialDeposit || '0',
        paymentConfirmed,
        paymentMethod,
        ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
      });
      setConverting(null);
      await loadReservations();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorkingId('');
    }
  };

  const propertyFilteredReservations = reservations.filter((reservation) => {
    if (selectedPropertyType === 'ALL') return true;
    const propertyType = properties.find((property) => property.id === reservation.propertyId)?.type;
    if (selectedPropertyType === 'HOSTEL') return propertyType != null && hostelPropertyTypes.has(propertyType);
    return propertyType === 'HOTEL';
  });
  const selectedReservations = selectedStatus === 'ALL'
    ? propertyFilteredReservations
    : propertyFilteredReservations.filter((item) => item.status === selectedStatus);

  return (
    <section className="space-y-5">
      {!creating && (
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide">Reservations & Leads</h1>
            <p className="mt-1 text-xs text-slate-500">Review booking requests and allocate available inventory.</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              to="/admin/reservations/history"
              className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <History className="h-3.5 w-3.5" /> History
            </Link>
            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setCreating(true);
              }}
              disabled={properties.length === 0}
              className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> New lead
            </button>
            <button
              type="button"
              onClick={() => void loadReservations()}
              disabled={loading}
              className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>
      )}

      {errorMessage && !creating && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {creating && (
        <GuestStayEntryForm
          mode="reservation"
          onCancel={() => setCreating(false)}
          onComplete={loadReservations}
        />
      )}

      {!creating && (loading ? (
        <LoadingIndicator label="Loading reservations" className="p-8" />
      ) : (
        <div className="space-y-3">
          <div role="group" aria-label="Filter reservations by property type" className="flex flex-wrap items-center gap-1.5 pt-1">
            {([
              ['ALL', 'All properties'],
              ['HOSTEL', 'Hostels'],
              ['HOTEL', 'Hotels'],
            ] as const).map(([propertyType, label]) => {
              const count = propertyType === 'ALL'
                ? reservations.length
                : reservations.filter((reservation) => {
                  const type = properties.find((property) => property.id === reservation.propertyId)?.type;
                  return propertyType === 'HOSTEL'
                    ? type != null && hostelPropertyTypes.has(type)
                    : type === 'HOTEL';
                }).length;
              const isSelected = selectedPropertyType === propertyType;
              return (
                <button
                  key={propertyType}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPropertyType(propertyType)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                  <span className={`px-1.5 py-0.5 text-[10px] ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div role="tablist" aria-label="Reservation statuses" className="flex flex-wrap items-center gap-1.5 pt-1">
            {(['ALL', ...columns] as ReservationStatusFilter[]).map((status) => {
              const statusCount = status === 'ALL'
                ? propertyFilteredReservations.length
                : propertyFilteredReservations.filter((item) => item.status === status).length;
              const isSelected = selectedStatus === status;
              return (
                <button
                  key={status}
                  id={`reservation-tab-${status.toLowerCase()}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls="reservation-status-panel"
                  onClick={() => setSelectedStatus(status)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {status === 'ALL' ? 'All' : status.replaceAll('_', ' ')}
                  <span className={`px-1.5 py-0.5 text-[10px] ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}>
                    {statusCount}
                  </span>
                </button>
              );
            })}
          </div>
          <section
            id="reservation-status-panel"
            role="tabpanel"
            aria-labelledby={`reservation-tab-${selectedStatus.toLowerCase()}`}
            aria-label={`${selectedStatus === 'ALL' ? 'All' : selectedStatus.replaceAll('_', ' ')} reservations`}
            className="space-y-3"
          >
            {selectedReservations.map((reservation) => (
                    <article
                      key={reservation.id}
                      className="space-y-3 border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div>
                        {selectedStatus === 'ALL' && (
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {reservation.status.replaceAll('_', ' ')}
                          </p>
                        )}
                        <p className="font-mono text-[10px] font-bold text-blue-700 dark:text-blue-300">
                          {reservation.requestCode}
                        </p>
                        <h3 className="mt-1 text-sm font-bold">Booked by {reservation.guestName}</h3>
                        <p className="text-[11px] text-slate-500">{reservation.mobile}</p>
                      </div>
                      <dl className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                        <div className="flex justify-between gap-2">
                          <dt>Category</dt>
                          <dd className="text-right">
                            {reservation.requestedCategory} · {reservation.requestedSharingType
                              ? `${reservation.requestedSharingType} sharing`
                              : reservation.requestedType}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Dates</dt>
                          <dd className="text-right">{formatDate(reservation.expectedCheckIn)} – {formatDate(reservation.expectedCheckOut)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Guests</dt>
                          <dd>{reservation.numberOfAdults} adults · {reservation.numberOfChildren} children</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Channel</dt>
                          <dd className="text-right">{reservation.channelOrigin.replaceAll('_', ' ')}</dd>
                        </div>
                      </dl>
                      {reservation.status === 'PENDING' && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => void updateStatus(reservation, 'APPROVED')}
                            disabled={workingId === reservation.id}
                            className="inline-flex items-center justify-center gap-1 bg-emerald-700 px-2 py-2 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejecting(reservation)}
                            className="inline-flex items-center justify-center gap-1 border border-red-300 px-2 py-2 text-[10px] font-bold text-red-700 hover:bg-red-50"
                          >
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      )}
                      {reservation.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() => void openConversion(reservation)}
                          disabled={workingId === reservation.id}
                          className="w-full bg-blue-700 px-2 py-2 text-[10px] font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          Convert to stay
                        </button>
                      )}
                      {reservation.status === 'REJECTED' && reservation.rejectionReason && (
                        <p className="border-t border-slate-100 pt-2 text-[10px] text-red-700 dark:border-slate-700 dark:text-red-300">
                          {reservation.rejectionReason}
                        </p>
                      )}
                    </article>
            ))}
            {selectedReservations.length === 0 && (
              <p className="border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                No {selectedStatus === 'ALL' ? '' : `${selectedStatus.replaceAll('_', ' ').toLowerCase()} `}reservations
              </p>
            )}
          </section>
        </div>
      ))}

      {rejecting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={rejectReservation} className="w-full max-w-md space-y-4 bg-white p-5 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Reject {rejecting.requestCode}</h2>
              <button type="button" onClick={() => setRejecting(null)} aria-label="Close reject dialog">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block space-y-1 text-xs font-semibold">
              Reason for rejection
              <textarea
                required
                minLength={1}
                maxLength={2000}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                className={inputClass}
                rows={4}
              />
            </label>
            <button disabled={workingId === rejecting.id} className="w-full bg-red-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
              Confirm rejection
            </button>
          </form>
        </div>
      )}

      {converting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={convertReservation} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto bg-white p-5 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">Allocate unit</h2>
                <p className="text-xs text-slate-500">{converting.requestCode} · {converting.guestName}</p>
              </div>
              <button type="button" onClick={() => setConverting(null)} aria-label="Close unit allocation dialog">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block space-y-1 text-xs font-semibold">
              Available {converting.requestedCategory} {converting.requestedType}
              {converting.requestedQuantity > 1 ? (
                <select
                  required
                  multiple
                  size={Math.min(6, Math.max(3, availableUnits.length))}
                  value={selectedUnitIds}
                  onChange={(event) => setSelectedUnitIds(
                    Array.from(event.target.selectedOptions, (option) => option.value),
                  )}
                  className={inputClass}
                >
                  {availableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.type} {unit.unitNumber} · Floor {unit.floor} · Capacity {unit.capacity}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  required
                  value={selectedUnitIds[0] || ''}
                  onChange={(event) => setSelectedUnitIds(event.target.value ? [event.target.value] : [])}
                  className={inputClass}
                >
                  <option value="">Select a room or bed</option>
                  {availableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.type} {unit.unitNumber} · Floor {unit.floor} · Capacity {unit.capacity}
                    </option>
                  ))}
                </select>
              )}
              {converting.requestedQuantity > 1 && (
                <span className="block font-normal text-slate-500">
                  Select {converting.requestedQuantity} units ({selectedUnitIds.length} selected).
                </span>
              )}
              {convertingIsHostel && converting.requestedQuantity > 1 && (
                <span role="alert" className="block font-normal text-rose-700">
                  One hostel customer can be assigned only one bed. Create a separate reservation for each customer.
                </span>
              )}
              {availableUnits.length === 0 && (
                <span className="block font-normal text-amber-700">No matching available units found.</span>
              )}
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Agreed rate (optional, required if the unit has no standard rate)
              <input type="number" min="0.01" step="0.01" value={agreedRate} onChange={(event) => setAgreedRate(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Rate override reason {conversionHasRateOverride ? '*' : '(required if different from standard)'}
              <input required={conversionHasRateOverride} maxLength={2000} value={rateOverrideReason} onChange={(event) => setRateOverrideReason(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Initial security deposit
              <input type="number" min="0" step="0.01" value={initialDeposit} onChange={(event) => setInitialDeposit(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Deposit payment method
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} />
              Payment received / confirmed
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Payment reference (optional)
              <input maxLength={100} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className={inputClass} />
            </label>
            <p className="flex items-center gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
              <CircleDollarSign className="h-4 w-4 shrink-0" />
              A configured security deposit is recorded as a payment receipt and held in escrow.
            </p>
            <button
              disabled={
                selectedUnitIds.length !== converting.requestedQuantity ||
                availableUnits.length < converting.requestedQuantity ||
                (convertingIsHostel && converting.requestedQuantity > 1) ||
                (conversionHasRateOverride && !rateOverrideReason.trim()) ||
                workingId === converting.id
              }
              className="w-full bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Confirm allocation & check in
            </button>
          </form>
        </div>
      )}
    </section>
  );
};
