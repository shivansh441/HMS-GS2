import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { BackLinkButton } from '../../components/ui/BackLinkButton';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { User, UserListResponse } from '../../types';

interface InventoryBed {
  id: string;
  unitNumber: string;
  category: string;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
}

interface InventoryRoom {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  capacity: number;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
  beds: InventoryBed[];
}

interface InventoryMatrix {
  propertyId: string;
  floors: Array<{ rooms: InventoryRoom[] }>;
}

interface ActiveAssignment {
  userId: string;
  occupantUserIds?: string[];
}

interface PropertyFee {
  feeType: string;
  amount: number | string | null;
  isActive: boolean;
}

interface InventoryCandidate {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  capacity: number;
  sharingType: string | null;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
}

interface InventoryOption extends InventoryCandidate {
  key: string;
  filterKey: string;
  label: string;
  availableCount: number;
}

interface InventoryFilterOption {
  key: string;
  label: string;
}

interface GuestStayEntryFormProps {
  mode: 'reservation' | 'checkin';
  propertyId?: string;
  onCancel: () => void;
  onComplete: () => void | Promise<void>;
}

const hostelTypes = new Set(['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING']);
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to save the guest stay.';
}

function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getFilterKey(candidate: InventoryCandidate, isHostel: boolean) {
  return isHostel
    ? `${candidate.category}|${candidate.sharingType || ''}`
    : candidate.category;
}

function getFilterLabel(candidate: InventoryCandidate, isHostel: boolean) {
  return isHostel
    ? `${candidate.category}${candidate.sharingType ? ` · ${candidate.sharingType} sharing` : ''}`
    : candidate.category;
}

export const GuestStayEntryForm: React.FC<GuestStayEntryFormProps> = ({
  mode,
  propertyId: fixedPropertyId,
  onCancel,
  onComplete,
}) => {
  const { properties, selectedPropertyId } = useAuth();
  const availableProperties = useMemo(
    () => properties.filter((property) =>
      (!fixedPropertyId || property.id === fixedPropertyId)
      && (selectedPropertyId === 'ALL' || property.id === selectedPropertyId)),
    [fixedPropertyId, properties, selectedPropertyId],
  );
  const [selectedPropertyIdValue, setSelectedPropertyIdValue] = useState('');
  const [inventory, setInventory] = useState<InventoryMatrix | null>(null);
  const [fees, setFees] = useState<PropertyFee[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState('');
  const [inventoryOptionKey, setInventoryOptionKey] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [additionalGuestIds, setAdditionalGuestIds] = useState<string[]>([]);
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkOutDate, setCheckOutDate] = useState('');
  const [rate, setRate] = useState('');
  const [rateOverrideReason, setRateOverrideReason] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [depositMethod, setDepositMethod] = useState('CASH');

  useEffect(() => {
    const defaultPropertyId = fixedPropertyId
      || (selectedPropertyId !== 'ALL' ? selectedPropertyId : '')
      || availableProperties[0]?.id
      || '';
    setSelectedPropertyIdValue(defaultPropertyId);
  }, [availableProperties, fixedPropertyId, selectedPropertyId]);

  const selectedProperty = availableProperties.find(
    (property) => property.id === selectedPropertyIdValue,
  );
  const isHostel = Boolean(selectedProperty && hostelTypes.has(selectedProperty.type));

  useEffect(() => {
    let active = true;
    const loadCustomers = async () => {
      setLoadingCustomers(true);
      setCustomerError('');
      try {
        const [firstPage, assignmentsResponse] = await Promise.all([
          apiClient.get<UserListResponse>('/admin/users?role=CUSTOMER&limit=100&offset=0'),
          apiClient.get<ActiveAssignment[]>('/stay/assignments/active?includeHostelers=true'),
        ]);
        const allCustomers = [...firstPage.data.items];
        for (let offset = allCustomers.length; offset < firstPage.data.total; offset += 100) {
          const response = await apiClient.get<UserListResponse>(
            `/admin/users?role=CUSTOMER&limit=100&offset=${offset}`,
          );
          allCustomers.push(...response.data.items);
        }
        const assignedUserIds = new Set(
          assignmentsResponse.data.flatMap((assignment) =>
            assignment.occupantUserIds?.length
              ? assignment.occupantUserIds
              : [assignment.userId],
          ),
        );
        if (active) {
          setCustomers(allCustomers.filter((customer) =>
            customer.role === 'CUSTOMER'
            && customer.status === 'ACTIVE'
            && Boolean(customer.phone)
            && !assignedUserIds.has(customer.id)));
        }
      } catch (error: unknown) {
        if (active) setCustomerError(getErrorMessage(error));
      } finally {
        if (active) setLoadingCustomers(false);
      }
    };
    void loadCustomers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPropertyIdValue) {
      setInventory(null);
      setFees([]);
      setInventoryFilter('');
      setInventoryOptionKey('');
      setCustomerId('');
      setAdditionalGuestIds([]);
      setLoadingInventory(false);
      return;
    }

    let active = true;
    setInventory(null);
    setFees([]);
    setInventoryFilter('');
    setInventoryOptionKey('');
    setCustomerId('');
    setAdditionalGuestIds([]);
    setLoadingInventory(true);
    setFormError('');
    const inventoryRequest = apiClient.get<InventoryMatrix>(
      `/properties/${encodeURIComponent(selectedPropertyIdValue)}/units/matrix`,
    );
    const feesRequest = mode === 'checkin'
      ? apiClient.get<PropertyFee[]>(
          `/properties/${encodeURIComponent(selectedPropertyIdValue)}/fees`,
        )
      : Promise.resolve(null);
    Promise.all([inventoryRequest, feesRequest])
      .then(([inventoryResponse, feesResponse]) => {
        if (!active) return;
        setInventory(inventoryResponse.data);
        if (feesResponse) {
          setFees(feesResponse.data);
          const deposit = feesResponse.data.find(
            (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
          );
          setDepositAmount(String(deposit?.amount ?? '0'));
        }
      })
      .catch((error: unknown) => {
        if (active) setFormError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingInventory(false);
      });
    return () => {
      active = false;
    };
  }, [mode, selectedPropertyIdValue]);

  const customerPersona = isHostel ? 'HOSTELER' : 'HOTEL_GUEST';
  const eligibleCustomers = customers.filter(
    (customer) => customer.customerPersona === customerPersona,
  );
  const customer = eligibleCustomers.find((item) => item.id === customerId);
  const additionalGuestOptions = eligibleCustomers.filter(
    (item) => item.id !== customerId && Boolean(item.email),
  );
  const candidates = useMemo<InventoryCandidate[]>(() => {
    if (!inventory || inventory.propertyId !== selectedPropertyIdValue) return [];
    return inventory.floors.flatMap((floor) => floor.rooms).flatMap((room) => {
      if (isHostel) {
        return room.beds
          .filter((bed) => bed.status === 'AVAILABLE')
          .map((bed) => ({
            id: bed.id,
            unitNumber: bed.unitNumber,
            type: 'BED',
            category: bed.category,
            capacity: 1,
            sharingType: bed.sharingType || room.sharingType,
            baseRateMonthly: bed.baseRateMonthly ?? room.baseRateMonthly,
            defaultPricePerNight: bed.defaultPricePerNight ?? room.defaultPricePerNight,
          }));
      }
      if (room.status !== 'AVAILABLE' || !['ROOM', 'SUITE'].includes(room.type)) return [];
      return [{
        id: room.id,
        unitNumber: room.unitNumber,
        type: room.type,
        category: room.category,
        capacity: room.capacity,
        sharingType: null,
        baseRateMonthly: room.baseRateMonthly,
        defaultPricePerNight: room.defaultPricePerNight,
      }];
    });
  }, [inventory, isHostel, selectedPropertyIdValue]);
  const inventoryOptions = useMemo<InventoryOption[]>(() => {
    if (mode === 'checkin') {
      return candidates.map((candidate) => ({
        ...candidate,
        key: candidate.id,
        filterKey: getFilterKey(candidate, isHostel),
        label: isHostel
          ? `${candidate.unitNumber} · ${candidate.category}${candidate.sharingType ? ` · ${candidate.sharingType} sharing` : ''}`
          : `${candidate.unitNumber} · ${candidate.type} · ${candidate.category} · capacity ${candidate.capacity}`,
        availableCount: 1,
      }));
    }
    const grouped = new Map<string, InventoryOption>();
    for (const candidate of candidates) {
      const key = isHostel
        ? `BED|${candidate.category}|${candidate.sharingType || ''}`
        : `${candidate.type}|${candidate.category}|${candidate.capacity}`;
      const option = grouped.get(key);
      if (option) {
        option.availableCount += 1;
      } else {
        grouped.set(key, {
          ...candidate,
          key,
          filterKey: getFilterKey(candidate, isHostel),
          label: isHostel
            ? `Bed · ${candidate.category}${candidate.sharingType ? ` · ${candidate.sharingType} sharing` : ''}`
            : `${candidate.type} · ${candidate.category}`,
          availableCount: 1,
        });
      }
    }
    return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [candidates, isHostel, mode]);
  const inventoryFilterOptions = useMemo<InventoryFilterOption[]>(() => {
    const options = new Map<string, InventoryFilterOption>();
    for (const option of inventoryOptions) {
      options.set(option.filterKey, {
        key: option.filterKey,
        label: getFilterLabel(option, isHostel),
      });
    }
    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [inventoryOptions, isHostel]);
  const filteredInventoryOptions = inventoryOptions.filter(
    (option) => option.filterKey === inventoryFilter,
  );
  const selectedInventoryOption = filteredInventoryOptions.find(
    (option) => option.key === inventoryOptionKey,
  );
  const selectedAdditionalGuestIds = additionalGuestIds.filter(Boolean);
  const depositConfigured = fees.some(
    (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
  );
  const standardRate = selectedInventoryOption
    ? isHostel
      ? selectedInventoryOption.baseRateMonthly
      : selectedInventoryOption.defaultPricePerNight
    : null;
  const hasRateOverride = Boolean(
    mode === 'checkin'
    && rate !== ''
    && standardRate != null
    && Number(rate) !== Number(standardRate),
  );
  const minimumStayDays = isHostel ? 2 : 1;

  useEffect(() => {
    setAdditionalGuestIds((current) =>
      current.slice(0, Math.max(0, (selectedInventoryOption?.capacity ?? 1) - 1)),
    );
  }, [selectedInventoryOption?.capacity]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProperty || !customer || !customer.phone || !selectedInventoryOption) {
      setFormError('Select a property, eligible active customer, and available room or bed.');
      return;
    }
    if (selectedAdditionalGuestIds.length > selectedInventoryOption.capacity - 1) {
      setFormError('Additional guests must fit the selected room capacity.');
      return;
    }
    if (checkOutDate && checkOutDate <= checkInDate) {
      setFormError('Choose a check-out date after check-in.');
      return;
    }
    if (
      isHostel
      && checkOutDate
      && (Date.parse(`${checkOutDate}T00:00:00Z`) - Date.parse(`${checkInDate}T00:00:00Z`))
        / 86_400_000 < minimumStayDays
    ) {
      setFormError('Hostel stays must be at least two nights.');
      return;
    }
    if (mode === 'checkin' && hasRateOverride && !rateOverrideReason.trim()) {
      setFormError('Enter a reason for changing the standard rate.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (mode === 'reservation') {
        await apiClient.post('/reservations', {
          propertyId: selectedProperty.id,
          primaryGuestUserId: customer.id,
          ...(selectedAdditionalGuestIds.length
            ? { guestUserIds: selectedAdditionalGuestIds }
            : {}),
          guestName: customer.full_name?.trim() || customer.email || 'Customer',
          mobile: customer.phone,
          email: customer.email,
          requestedCategory: selectedInventoryOption.category,
          requestedType: selectedInventoryOption.type,
          ...(selectedInventoryOption.sharingType
            ? { requestedSharingType: selectedInventoryOption.sharingType }
            : {}),
          requestedQuantity: 1,
          numberOfAdults: 1 + selectedAdditionalGuestIds.length,
          numberOfChildren: 0,
          expectedCheckIn: checkInDate,
          expectedCheckOut: checkOutDate || null,
          channelOrigin: 'WALK_IN',
        });
      } else {
        await apiClient.post('/stay/assignments', {
          unitId: selectedInventoryOption.id,
          userId: customer.id,
          ...(selectedAdditionalGuestIds.length
            ? { guestUserIds: selectedAdditionalGuestIds }
            : {}),
          expectedCheckIn: `${checkInDate}T12:00:00Z`,
          ...(checkOutDate ? { expectedCheckOut: `${checkOutDate}T11:00:00Z` } : {}),
          billingStrategy: isHostel ? 'RECURRING_MONTHLY' : 'PER_NIGHT_STAY',
          ...(rate ? { agreedRate: rate } : {}),
          ...(rateOverrideReason.trim()
            ? { rateOverrideReason: rateOverrideReason.trim() }
            : {}),
          ...(depositConfigured
            ? {
                depositPaymentAmount: depositAmount,
                depositPaymentMethod: depositMethod,
              }
            : {}),
        });
      }
      await onComplete();
      onCancel();
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const allPropertiesSelected = selectedPropertyId === 'ALL' && !fixedPropertyId;
  const showPropertySelector = allPropertiesSelected || (!selectedProperty && !fixedPropertyId);
  const title = mode === 'reservation' ? 'New reservation' : 'Desk walk-in check-in';

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {mode === 'reservation'
              ? 'Create a pending reservation for a customer who needs a room or bed.'
              : 'Assign an available room or bed and check in the selected customer.'}
          </p>
        </div>
        <BackLinkButton onClick={onCancel}>
          {mode === 'reservation' ? 'Back to reservations' : 'Back to inventory'}
        </BackLinkButton>
      </header>

      <form
        onSubmit={submit}
        className="flex min-h-[calc(100vh-12rem)] w-full flex-col gap-5 border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        {(formError || customerError) && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {formError || customerError}
          </div>
        )}
        <div className="grid flex-1 content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {showPropertySelector && (
            <label className="block space-y-1 text-xs font-semibold">
              Property
              <select
                required
                value={selectedPropertyIdValue}
                onChange={(event) => {
                  setSelectedPropertyIdValue(event.target.value);
                  setInventoryFilter('');
                  setInventoryOptionKey('');
                  setCustomerId('');
                  setAdditionalGuestIds([]);
                }}
                className={inputClass}
              >
                <option value="">Select property</option>
                {availableProperties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1 text-xs font-semibold">
            {isHostel ? 'Hostel room type' : 'Room category'}
            <select
              required
              value={inventoryFilter}
              onChange={(event) => {
                setInventoryFilter(event.target.value);
                setInventoryOptionKey('');
                setAdditionalGuestIds([]);
              }}
              disabled={loadingInventory || inventoryFilterOptions.length === 0}
              className={inputClass}
            >
              <option value="">
                {loadingInventory
                  ? 'Loading available types…'
                  : `Select ${isHostel ? 'hostel room type' : 'room category'}`}
              </option>
              {inventoryFilterOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            {loadingInventory && <LoadingIndicator label="Loading available inventory" />}
            {!loadingInventory && inventoryFilterOptions.length === 0 && !formError && (
              <span className="block font-normal text-amber-700">
                No available {isHostel ? 'hostel room types' : 'room categories'} in this property.
              </span>
            )}
          </label>
          <label className="block space-y-1 text-xs font-semibold">
            Available {isHostel ? 'bed' : 'room / suite'}
            <select
              required
              value={inventoryOptionKey}
              onChange={(event) => {
                setInventoryOptionKey(event.target.value);
                setRateOverrideReason('');
              }}
              disabled={loadingInventory || !inventoryFilter || filteredInventoryOptions.length === 0}
              className={inputClass}
            >
              <option value="">
                {!inventoryFilter
                  ? `Select ${isHostel ? 'a room type' : 'a room category'} first`
                  : `Select available ${isHostel ? 'bed' : 'room / suite'}`}
              </option>
              {filteredInventoryOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} · {option.availableCount} available
                </option>
              ))}
            </select>
            {inventoryFilter && filteredInventoryOptions.length === 0 && !loadingInventory && (
              <span className="block font-normal text-amber-700">
                No available {isHostel ? 'beds' : 'rooms'} match this selection.
              </span>
            )}
          </label>
          <label className="block space-y-1 text-xs font-semibold">
            Active {isHostel ? 'hosteler' : 'hotel guest'}
            <select
              required
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setAdditionalGuestIds([]);
              }}
              className={inputClass}
              disabled={loadingCustomers || Boolean(customerError)}
            >
              <option value="">
                {loadingCustomers ? 'Loading active customers…' : 'Select active customer'}
              </option>
              {eligibleCustomers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name || item.email || item.phone || item.id}
                  {item.email && item.full_name ? ` · ${item.email}` : ''}
                </option>
              ))}
            </select>
            {!loadingCustomers && !customerError && eligibleCustomers.length === 0 && (
              <span className="block font-normal text-slate-500">
                No unassigned active {isHostel ? 'hostelers' : 'hotel guests'} with a phone number are available.
              </span>
            )}
          </label>
          {customer && !isHostel && selectedInventoryOption && (
            Array.from(
              { length: Math.max(0, selectedInventoryOption.capacity - 1) },
              (_, index) => index,
            ).map((slot) => {
              const selectedGuestId = additionalGuestIds[slot] || '';
              const slotOptions = additionalGuestOptions.filter(
                (item) =>
                  !additionalGuestIds.includes(item.id)
                  || item.id === selectedGuestId,
              );
              return (
                <label key={slot} className="block space-y-1 text-xs font-semibold">
                  Additional guest {slot + 1} (optional)
                  <select
                    value={selectedGuestId}
                    onChange={(event) => {
                      const guestId = event.target.value;
                      setAdditionalGuestIds((current) => {
                        const next = [...current];
                        next[slot] = guestId;
                        return next;
                      });
                    }}
                    className={inputClass}
                    disabled={loadingCustomers || Boolean(customerError)}
                  >
                    <option value="">Select additional guest</option>
                    {slotOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.full_name || item.email || item.phone || item.id}
                        {item.email && item.full_name ? ` · ${item.email}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })
          )}
          <label className="block space-y-1 text-xs font-semibold">
            Check-in date
            <input
              required
              type="date"
              value={checkInDate}
              onChange={(event) => {
                const nextDate = event.target.value;
                setCheckInDate(nextDate);
                if (
                  checkOutDate
                  && nextDate
                  && checkOutDate < addCalendarDays(nextDate, minimumStayDays)
                ) {
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
              min={checkInDate ? addCalendarDays(checkInDate, minimumStayDays) : undefined}
              value={checkOutDate}
              onChange={(event) => setCheckOutDate(event.target.value)}
              className={inputClass}
            />
          </label>
          {mode === 'checkin' && (
            <>
              <label className="block space-y-1 text-xs font-semibold">
                Agreed rate override ({selectedProperty?.currency}/{isHostel ? 'month' : 'night'}, optional)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Rate override reason {hasRateOverride ? '*' : '(required if different from standard)'}
                <input
                  required={hasRateOverride}
                  maxLength={2000}
                  value={rateOverrideReason}
                  onChange={(event) => setRateOverrideReason(event.target.value)}
                  className={inputClass}
                />
              </label>
              {depositConfigured && (
                <>
                  <label className="block space-y-1 text-xs font-semibold">
                    Security deposit collected upfront ({selectedProperty?.currency})
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={depositAmount}
                      onChange={(event) => setDepositAmount(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold">
                    Deposit payment method
                    <select
                      value={depositMethod}
                      onChange={(event) => setDepositMethod(event.target.value)}
                      className={inputClass}
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                    </select>
                  </label>
                </>
              )}
            </>
          )}
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onCancel}
            className="border border-slate-300 px-4 py-2 text-xs font-bold uppercase dark:border-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              saving
              || loadingInventory
              || loadingCustomers
              || !customer
              || !selectedInventoryOption
              || selectedInventoryOption.availableCount < 1
              || (hasRateOverride && !rateOverrideReason.trim())
            }
            className="bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-60"
          >
            {mode === 'reservation' ? 'Create pending reservation' : 'Assign walk-in & check in'}
          </button>
        </div>
      </form>
    </section>
  );
};
