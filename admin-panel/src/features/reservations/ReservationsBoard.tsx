import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Check, CircleDollarSign, Plus, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';

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

interface InventoryBed {
  id: string;
  unitNumber: string;
  category: string;
  sharingType: string | null;
  status: string;
}

interface InventoryRoom {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  sharingType: string | null;
  status: string;
  beds: InventoryBed[];
}

interface InventoryFloor {
  floorNumber: number;
  rooms: InventoryRoom[];
}

interface PropertyInventory {
  propertyId: string;
  floors: InventoryFloor[];
}

interface LeadInventoryOption {
  key: string;
  label: string;
  type: string;
  category: string;
  sharingType: string | null;
  availableCount: number;
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
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [leadErrorMessage, setLeadErrorMessage] = useState('');
  const [leadPropertyId, setLeadPropertyId] = useState('');
  const [leadInventory, setLeadInventory] = useState<PropertyInventory | null>(null);
  const [loadingLeadInventory, setLoadingLeadInventory] = useState(false);
  const [leadInventoryOption, setLeadInventoryOption] = useState('');
  const [leadGuestName, setLeadGuestName] = useState('');
  const [leadMobile, setLeadMobile] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadQuantity, setLeadQuantity] = useState(1);
  const [leadAdults, setLeadAdults] = useState(1);
  const [leadChildren, setLeadChildren] = useState(0);
  const [leadCheckIn, setLeadCheckIn] = useState('');
  const [leadCheckOut, setLeadCheckOut] = useState('');
  const [leadChannel, setLeadChannel] = useState('WALK_IN');
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
      const { data } = await apiClient.get<{ items: Reservation[] }>('/reservations', {
        params: {
          status: columns.join(','),
          ...(selectedPropertyId && selectedPropertyId !== 'ALL'
            ? { propertyId: selectedPropertyId }
            : {}),
          limit: 100,
        },
      });
      setReservations(data.items);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    if (!creating || !leadPropertyId) {
      setLeadInventory(null);
      setLoadingLeadInventory(false);
      return;
    }

    let active = true;
    setLeadInventory(null);
    setLeadInventoryOption('');
    setLoadingLeadInventory(true);
    setLeadErrorMessage('');
    apiClient.get<PropertyInventory>(
      `/properties/${encodeURIComponent(leadPropertyId)}/units/matrix`,
    )
      .then(({ data }) => {
        if (active) setLeadInventory(data);
      })
      .catch((error: unknown) => {
        if (active) setLeadErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingLeadInventory(false);
      });

    return () => {
      active = false;
    };
  }, [creating, leadPropertyId]);

  const leadProperty = properties.find((property) => property.id === leadPropertyId);
  const leadIsHostel = Boolean(
    leadProperty &&
    ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'].includes(leadProperty.type),
  );
  const leadInventoryOptions = useMemo<LeadInventoryOption[]>(() => {
    if (!leadInventory || leadInventory.propertyId !== leadPropertyId) return [];

    const optionCounts = new Map<string, LeadInventoryOption>();
    for (const room of leadInventory.floors.flatMap((floor) => floor.rooms)) {
      if (leadIsHostel) {
        for (const bed of room.beds) {
          if (bed.status !== 'AVAILABLE') continue;
          const sharingType = bed.sharingType || room.sharingType;
          const key = `BED|${bed.category}|${sharingType || ''}`;
          const existing = optionCounts.get(key);
          if (existing) {
            existing.availableCount += 1;
          } else {
            optionCounts.set(key, {
              key,
              label: `Bed · ${bed.category}${sharingType ? ` · ${sharingType} sharing` : ''}`,
              type: 'BED',
              category: bed.category,
              sharingType,
              availableCount: 1,
            });
          }
        }
      } else if (
        room.status === 'AVAILABLE' &&
        ['ROOM', 'SUITE'].includes(room.type)
      ) {
        const key = `${room.type}|${room.category}`;
        const existing = optionCounts.get(key);
        if (existing) {
          existing.availableCount += 1;
        } else {
          optionCounts.set(key, {
            key,
            label: `${room.type} · ${room.category}`,
            type: room.type,
            category: room.category,
            sharingType: null,
            availableCount: 1,
          });
        }
      }
    }
    return [...optionCounts.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [leadInventory, leadIsHostel, leadPropertyId]);
  const selectedLeadInventoryOption = leadInventoryOptions.find(
    (option) => option.key === leadInventoryOption,
  );

  useEffect(() => {
    if (
      leadInventoryOptions.length > 0 &&
      !leadInventoryOptions.some((option) => option.key === leadInventoryOption)
    ) {
      setLeadInventoryOption(leadInventoryOptions[0].key);
    }
  }, [leadInventoryOption, leadInventoryOptions]);

  useEffect(() => {
    if (selectedLeadInventoryOption) {
      setLeadQuantity((current) =>
        Math.min(Math.max(current, 1), selectedLeadInventoryOption.availableCount),
      );
    }
  }, [selectedLeadInventoryOption]);

  const openCreateLead = () => {
    setLeadPropertyId(
      selectedPropertyId && selectedPropertyId !== 'ALL'
        ? selectedPropertyId
        : properties[0]?.id || '',
    );
    setErrorMessage('');
    setLeadErrorMessage('');
    setLeadInventory(null);
    setLeadInventoryOption('');
    setLeadQuantity(1);
    setCreating(true);
  };

  const createLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const property = properties.find((item) => item.id === leadPropertyId);
    if (!property) return;
    if (!selectedLeadInventoryOption || leadQuantity > selectedLeadInventoryOption.availableCount) {
      setLeadErrorMessage('Select an available room or bed type and a quantity within current availability.');
      return;
    }
    if (leadCheckOut <= leadCheckIn) {
      setLeadErrorMessage('Choose a check-out date after check-in.');
      return;
    }
    if (leadAdults + leadChildren > 100) {
      setLeadErrorMessage('A reservation can include at most 100 occupants.');
      return;
    }
    setCreatingLead(true);
    setLeadErrorMessage('');
    try {
      await apiClient.post('/reservations', {
        propertyId: property.id,
        guestName: leadGuestName.trim(),
        mobile: leadMobile.trim(),
        email: leadEmail.trim() || null,
        requestedCategory: selectedLeadInventoryOption.category,
        requestedType: selectedLeadInventoryOption.type,
        ...(selectedLeadInventoryOption.sharingType
          ? { requestedSharingType: selectedLeadInventoryOption.sharingType }
          : {}),
        requestedQuantity: leadQuantity,
        numberOfAdults: leadAdults,
        numberOfChildren: leadChildren,
        expectedCheckIn: leadCheckIn,
        expectedCheckOut: leadCheckOut,
        channelOrigin: leadChannel,
      });
      setCreating(false);
      setLeadGuestName('');
      setLeadMobile('');
      setLeadEmail('');
      setLeadCheckIn('');
      setLeadCheckOut('');
      await loadReservations();
    } catch (error: unknown) {
      setLeadErrorMessage(getErrorMessage(error));
    } finally {
      setCreatingLead(false);
    }
  };

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

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">Reservations & Leads</h1>
          <p className="mt-1 text-xs text-slate-500">Review booking requests and allocate available inventory.</p>
        </div>
        <button
          type="button"
          onClick={openCreateLead}
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
      </header>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={createLead} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto bg-white p-5 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">Create reservation lead</h2>
                <p className="text-xs text-slate-500">Record a walk-in, phone, or OTA request.</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} aria-label="Close new lead dialog">
                <X className="h-5 w-5" />
              </button>
            </div>
            {leadErrorMessage && (
              <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {leadErrorMessage}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-semibold sm:col-span-2">
                Property
                <select required value={leadPropertyId} onChange={(event) => {
                  setLeadPropertyId(event.target.value);
                  setLeadInventoryOption('');
                  setLeadQuantity(1);
                }} className={inputClass}>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs font-semibold sm:col-span-2">
                Available {leadIsHostel ? 'bed type' : 'room type'}
                <select
                  required
                  value={leadInventoryOption}
                  onChange={(event) => setLeadInventoryOption(event.target.value)}
                  disabled={loadingLeadInventory || leadInventoryOptions.length === 0}
                  className={inputClass}
                >
                  {loadingLeadInventory && <option value="">Loading available inventory…</option>}
                  {!loadingLeadInventory && leadInventoryOptions.length === 0 && (
                    <option value="">No available {leadIsHostel ? 'beds' : 'rooms'}</option>
                  )}
                  {leadInventoryOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label} · {option.availableCount} available
                    </option>
                  ))}
                </select>
                {!loadingLeadInventory && leadInventoryOptions.length === 0 && !leadErrorMessage && (
                  <span className="block font-normal text-amber-700">
                    This property has no currently available {leadIsHostel ? 'beds' : 'rooms'}.
                  </span>
                )}
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Booker name
                <input required maxLength={100} value={leadGuestName} onChange={(event) => setLeadGuestName(event.target.value)} className={inputClass} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Phone
                <input required type="tel" maxLength={20} value={leadMobile} onChange={(event) => setLeadMobile(event.target.value)} className={inputClass} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Email (optional)
                <input type="email" value={leadEmail} onChange={(event) => setLeadEmail(event.target.value)} className={inputClass} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Channel
                <select value={leadChannel} onChange={(event) => setLeadChannel(event.target.value)} className={inputClass}>
                  <option value="WALK_IN">Walk-in</option>
                  <option value="PHONE">Phone</option>
                  <option value="OTA_IMPORT">OTA import</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                {leadIsHostel ? 'Beds requested' : 'Rooms requested'}
                <input
                  required
                  type="number"
                  min={1}
                  max={selectedLeadInventoryOption?.availableCount || 1}
                  value={leadQuantity}
                  onChange={(event) => setLeadQuantity(Number(event.target.value))}
                  disabled={!selectedLeadInventoryOption}
                  className={inputClass}
                />
                {selectedLeadInventoryOption && (
                  <span className="block font-normal text-slate-500">
                    Up to {selectedLeadInventoryOption.availableCount} currently available.
                  </span>
                )}
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Check-in
                <input required type="date" value={leadCheckIn} onChange={(event) => setLeadCheckIn(event.target.value)} className={inputClass} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Check-out
                <input required type="date" min={leadCheckIn || undefined} value={leadCheckOut} onChange={(event) => setLeadCheckOut(event.target.value)} className={inputClass} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Adults
                <input required type="number" min={1} max={100 - leadChildren} value={leadAdults} onChange={(event) => setLeadAdults(Number(event.target.value))} className={inputClass} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Children
                <input required type="number" min={0} max={100 - leadAdults} value={leadChildren} onChange={(event) => setLeadChildren(Number(event.target.value))} className={inputClass} />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">
                Record the booker and guest count now. Add the actual occupants and their IDs to each assigned room or bed when they are known.
              </p>
            </div>
            <button
              disabled={
                creatingLead ||
                loadingLeadInventory ||
                !selectedLeadInventoryOption ||
                leadQuantity > (selectedLeadInventoryOption?.availableCount || 0)
              }
              className="w-full bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {creatingLead ? 'Creating…' : 'Create lead'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-500">Loading reservation pipeline…</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-7">
          {columns.map((status) => {
            const columnReservations = reservations.filter((item) => item.status === status);
            return (
              <section
                key={status}
                aria-label={`${status} reservations`}
                className="min-w-0 border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider">{status.replace('_', ' ')}</h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] dark:bg-slate-800">
                    {columnReservations.length}
                  </span>
                </header>
                <div className="space-y-3">
                  {columnReservations.map((reservation) => (
                    <article
                      key={reservation.id}
                      className="space-y-3 border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div>
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
                  {columnReservations.length === 0 && (
                    <p className="py-4 text-center text-[10px] text-slate-400">No requests</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

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
