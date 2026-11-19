import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { Property, User, UserListResponse } from '../../types';
import { X } from 'lucide-react';

interface DeskCheckInFloor {
  rooms: DeskCheckInRoom[];
}

interface DeskCheckInRoom {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  capacity: number;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
  beds: DeskCheckInBed[];
}

interface DeskCheckInBed {
  id: string;
  unitNumber: string;
  capacity: number;
  category: string;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
}

interface DeskCheckInFee {
  feeType: string;
  amount: number | string | null;
  isActive: boolean;
}

interface ActiveAssignment {
  userId: string;
  occupantUserIds?: string[];
}

interface AvailableDeskUnit {
  id: string;
  unitNumber: string;
  sharingType: string | null;
  category: string;
  capacity: number;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
}

const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load desk check-in options.';
}

function getNextDate(dateValue: string): string {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function getOccupiedUserIds(assignments: ActiveAssignment[]): Set<string> {
  return new Set(
    assignments.flatMap((assignment) =>
      assignment.occupantUserIds?.length
        ? assignment.occupantUserIds
        : [assignment.userId],
    ),
  );
}

export interface DeskCheckInProps {
  open: boolean;
  propertyId?: string;
  propertyTypes?: string[];
  onClose: () => void;
  onAssigned: () => void | Promise<void>;
}

export const DeskCheckIn: React.FC<DeskCheckInProps> = ({
  open,
  propertyId,
  propertyTypes,
  onClose,
  onAssigned,
}) => {
  const { properties, selectedPropertyId } = useAuth();
  const availableProperties = useMemo(
    () => properties.filter((property) =>
      (!propertyId || property.id === propertyId)
      && (selectedPropertyId === 'ALL' || property.id === selectedPropertyId)
      && (!propertyTypes || propertyTypes.includes(property.type))),
    [properties, propertyId, propertyTypes, selectedPropertyId],
  );
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [floors, setFloors] = useState<DeskCheckInFloor[]>([]);
  const [fees, setFees] = useState<DeskCheckInFee[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [selectedOccupantUserIds, setSelectedOccupantUserIds] = useState<string[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkOutDate, setCheckOutDate] = useState('');
  const [rate, setRate] = useState('');
  const [rateOverrideReason, setRateOverrideReason] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [depositMethod, setDepositMethod] = useState('CASH');

  useEffect(() => {
    if (!open) return;
    const defaultProperty = propertyId
      ? availableProperties.find((property) => property.id === propertyId)
      : selectedPropertyId && selectedPropertyId !== 'ALL'
        ? availableProperties.find((property) => property.id === selectedPropertyId)
        : availableProperties[0];
    setSelectedProperty(defaultProperty || null);
    setCustomerId('');
    setSelectedOccupantUserIds([]);
    setUnitId('');
    setCheckInDate(new Date().toISOString().slice(0, 10));
    setCheckOutDate('');
    setRate('');
    setRateOverrideReason('');
    setDepositAmount('0');
    setDepositMethod('CASH');
    setOptionsError('');
  }, [open, propertyId, availableProperties, selectedPropertyId]);

  useEffect(() => {
    if (!open || !selectedProperty) {
      setFloors([]);
      setFees([]);
      setCustomers([]);
      setOptionsLoading(false);
      return;
    }

    let active = true;
    const loadOptions = async () => {
      setOptionsLoading(true);
      setOptionsError('');
      try {
        const [inventoryResponse, feeResponse, firstPage, assignmentsResponse] = await Promise.all([
          apiClient.get<{ floors: DeskCheckInFloor[] }>(
            `/properties/${encodeURIComponent(selectedProperty.id)}/units/matrix`,
          ),
          apiClient.get<DeskCheckInFee[]>(
            `/properties/${encodeURIComponent(selectedProperty.id)}/fees`,
          ),
          apiClient.get<UserListResponse>('/admin/users?role=CUSTOMER&limit=100&offset=0'),
          apiClient.get<ActiveAssignment[]>(
            '/stay/assignments/active?includeHostelers=true',
          ),
        ]);
        const allCustomers = [...firstPage.data.items];
        for (let offset = allCustomers.length; offset < firstPage.data.total; offset += 100) {
          const response = await apiClient.get<UserListResponse>(
            `/admin/users?role=CUSTOMER&limit=100&offset=${offset}`,
          );
          allCustomers.push(...response.data.items);
        }
        if (!active) return;

        const assignedUserIds = getOccupiedUserIds(assignmentsResponse.data);
        setFloors(inventoryResponse.data.floors || []);
        setFees(feeResponse.data);
        setCustomers(allCustomers.filter((customer) =>
          customer.role === 'CUSTOMER'
          && customer.status === 'ACTIVE'
          && !assignedUserIds.has(customer.id)));
        const deposit = feeResponse.data.find(
          (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
        );
        setDepositAmount(String(deposit?.amount ?? '0'));
      } catch (error: unknown) {
        if (active) setOptionsError(getErrorMessage(error));
      } finally {
        if (active) setOptionsLoading(false);
      }
    };
    void loadOptions();
    return () => {
      active = false;
    };
  }, [open, selectedProperty]);

  const isHostel = hostelTypes.includes(selectedProperty?.type || '');

  const availableUnits = useMemo<AvailableDeskUnit[]>(() => {
    const rooms = floors.flatMap((floor) => floor.rooms).filter((room) => room.type !== 'BED');
    return rooms.flatMap((room) => (
      isHostel
        ? room.beds
            .filter((bed) => bed.status === 'AVAILABLE')
            .map((bed) => ({ ...bed, capacity: 1 }))
        : [room]
    )).filter((unit) => unit.status === 'AVAILABLE');
  }, [floors, isHostel]);
  const selectedUnit = availableUnits.find((unit) => unit.id === unitId);
  const additionalGuestOptions = customers.filter(
    (customer) =>
      customer.id !== customerId &&
      customer.customerPersona === 'HOTEL_GUEST' &&
      Boolean(customer.email && customer.phone),
  );
  useEffect(() => {
    const maxAdditionalGuests = Math.max(0, (selectedUnit?.capacity ?? 1) - 1);
    setSelectedOccupantUserIds((current) =>
      current.slice(0, maxAdditionalGuests),
    );
  }, [selectedUnit?.capacity]);
  const hasRateOverride = Boolean(
    selectedUnit &&
    rate !== '' &&
    (isHostel ? selectedUnit.baseRateMonthly : selectedUnit.defaultPricePerNight) != null &&
    Number(rate) !== Number(isHostel ? selectedUnit.baseRateMonthly : selectedUnit.defaultPricePerNight),
  );
  const depositConfigured = fees.some(
    (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProperty || !customerId || !unitId) return;
    setSaving(true);
    setOptionsError('');
    try {
      await apiClient.post('/stay/assignments', {
        unitId,
        userId: customerId,
        ...(selectedOccupantUserIds.length
          ? { guestUserIds: selectedOccupantUserIds }
          : {}),
        expectedCheckIn: `${checkInDate}T12:00:00Z`,
        ...(checkOutDate
          ? { expectedCheckOut: `${checkOutDate}T11:00:00Z` }
          : {}),
        billingStrategy: isHostel ? 'RECURRING_MONTHLY' : 'PER_NIGHT_STAY',
        ...(rate ? { agreedRate: rate } : {}),
        ...(rateOverrideReason.trim()
          ? { rateOverrideReason: rateOverrideReason.trim() }
          : {}),
        ...(depositConfigured ? {
          depositPaymentAmount: depositAmount,
          depositPaymentMethod: depositMethod,
        } : {}),
      });
      await onAssigned();
      onClose();
    } catch (error: unknown) {
      setOptionsError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 bg-white p-5 dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Desk walk-in check-in</h2>
            <p className="text-xs text-slate-500">The agreed rate is stored only on this assignment.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close walk-in dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        {optionsError && <p role="alert" className="text-xs text-rose-700">{optionsError}</p>}
        {!propertyId && availableProperties.length > 1 && (
          <label className="block space-y-1 text-xs font-semibold">
            Property
            <select
              required
              value={selectedProperty?.id || ''}
              onChange={(event) => {
                const nextProperty = availableProperties.find((property) => property.id === event.target.value);
                setSelectedProperty(nextProperty || null);
                setUnitId('');
              }}
              className={inputClass}
            >
              <option value="">Select property</option>
              {availableProperties.map((property) => (
                <option key={property.id} value={property.id}>{property.name} · {property.type}</option>
              ))}
            </select>
          </label>
        )}
        {optionsLoading && <p className="text-xs text-slate-500">Loading active customers and available units…</p>}
        {!selectedProperty && !optionsLoading && availableProperties.length === 0 && (
          <p role="alert" className="text-xs text-rose-700">No eligible properties are available in this scope.</p>
        )}
        <label className="block space-y-1 text-xs font-semibold">
          Active customer
          <select
            required
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setSelectedOccupantUserIds([]);
            }}
            className={inputClass}
            disabled={optionsLoading}
          >
            <option value="">{optionsLoading ? 'Loading active customers…' : 'Select active customer'}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name || customer.email || customer.id}{customer.email && customer.full_name ? ` · ${customer.email}` : ''}
              </option>
            ))}
          </select>
          {!optionsLoading && !optionsError && customers.length === 0 && (
            <span className="block text-slate-500">No unassigned active customers are available.</span>
          )}
        </label>
        <label className="block space-y-1 text-xs font-semibold">
          Available {isHostel ? 'bed' : 'room'}
          <select
            required
            value={unitId}
            onChange={(event) => {
              setUnitId(event.target.value);
              setRateOverrideReason('');
            }}
            className={inputClass}
            disabled={optionsLoading}
          >
            <option value="">Select unit</option>
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                  {unit.unitNumber} · {unit.sharingType || unit.category} · {unit.status}
              </option>
            ))}
          </select>
        </label>
        {!isHostel && customerId && (
          <fieldset className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <legend className="text-xs font-semibold">Additional occupants</legend>
            <p className="text-xs text-slate-500">
              The selected customer is billed for the room. Choose other guest accounts to share it.
            </p>
            {additionalGuestOptions.length ? (
              additionalGuestOptions.map((guest) => (
                <label key={guest.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedOccupantUserIds.includes(guest.id)}
                    disabled={
                      saving ||
                      !selectedUnit ||
                      (!selectedOccupantUserIds.includes(guest.id) &&
                        selectedOccupantUserIds.length >= selectedUnit.capacity - 1)
                    }
                    onChange={(event) => {
                      setSelectedOccupantUserIds((current) =>
                        event.target.checked
                          ? [...current, guest.id]
                          : current.filter((id) => id !== guest.id),
                      );
                    }}
                  />
                  <span>
                    {guest.full_name || guest.email}
                    {guest.email && guest.full_name ? ` · ${guest.email}` : ''}
                  </span>
                </label>
              ))
            ) : (
              <p className="text-xs text-slate-500">No other available guest accounts are registered.</p>
            )}
            {selectedUnit &&
              selectedOccupantUserIds.length + 1 > selectedUnit.capacity && (
                <p role="alert" className="text-xs text-rose-700">
                  This room can hold at most {selectedUnit.capacity} people.
                </p>
              )}
          </fieldset>
        )}
        <label className="block space-y-1 text-xs font-semibold">
          Check-in date
          <input
            required
            type="date"
            value={checkInDate}
            onChange={(event) => {
              const nextCheckInDate = event.target.value;
              setCheckInDate(nextCheckInDate);
              if (checkOutDate && nextCheckInDate && checkOutDate < getNextDate(nextCheckInDate)) {
                setCheckOutDate('');
              }
            }}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-xs font-semibold">
          Expected check-out (optional)
          <input
            type="date"
            min={checkInDate ? getNextDate(checkInDate) : undefined}
            value={checkOutDate}
            onChange={(event) => setCheckOutDate(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-xs font-semibold">
          Agreed rate override ({selectedProperty?.currency}/{isHostel ? 'month' : 'night'}, optional)
          <input type="number" min="0.01" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1 text-xs font-semibold">
          Rate override reason {hasRateOverride ? '*' : '(required if different from standard)'}
          <input required={hasRateOverride} maxLength={2000} value={rateOverrideReason} onChange={(event) => setRateOverrideReason(event.target.value)} className={inputClass} />
        </label>
        {depositConfigured ? (
          <>
            <label className="block space-y-1 text-xs font-semibold">
              Security deposit collected upfront ({selectedProperty?.currency})
              <input required type="number" min="0.01" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Deposit payment method
              <select value={depositMethod} onChange={(event) => setDepositMethod(event.target.value)} className={inputClass}>
                <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </label>
          </>
        ) : selectedProperty ? (
          <p className="text-xs text-slate-500">No security deposit is configured for this property.</p>
        ) : null}
        <button
          type="submit"
          disabled={saving || optionsLoading || optionsError !== '' || customers.length === 0 || availableUnits.length === 0 || (selectedUnit !== undefined && selectedOccupantUserIds.length + 1 > selectedUnit.capacity) || (hasRateOverride && !rateOverrideReason.trim())}
          className="w-full bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Assign walk-in
        </button>
      </form>
    </div>
  );
};
