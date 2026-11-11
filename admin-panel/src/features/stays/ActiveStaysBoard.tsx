import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { BedDouble, DoorOpen, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Property } from '../../types';

interface StayAssignment {
  id: string;
  unitId: string;
  userId: string;
  billingStrategy: 'PER_NIGHT_STAY' | 'RECURRING_MONTHLY';
  status: 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
  agreedRate: number | string | null;
  standardRate: number | string | null;
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
  persona: string | null;
  stayRecordId: string | null;
}

interface CustomerOption {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface InventoryBed {
  id: string;
  unitNumber: string;
  category: string;
  status: string;
  sharingType: string | null;
  baseRateMonthly: number | string | null;
}

interface InventoryRoom {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  status: string;
  sharingType: string | null;
  defaultPricePerNight: number | string | null;
  baseRateMonthly: number | string | null;
  beds: InventoryBed[];
}

interface PropertyInventory {
  floors: Array<{ rooms: InventoryRoom[] }>;
}

interface AvailableDeskUnit {
  id: string;
  label: string;
  standardRate: number | string | null;
}

interface FeeConfig {
  feeType: string;
  amount: number | string | null;
  isActive: boolean;
}

interface StayOccupant {
  id?: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  permanentAddress: string;
  idDocumentType: string;
  idDocumentNumber: string;
  idDocumentLast4?: string;
}

const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
const governmentIdTypes = [
  'AADHAAR',
  'PAN',
  'VOTER_ID',
  'PASSPORT',
  'DRIVING_LICENSE',
  'OTHER_GOVERNMENT_ID',
];
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Stay operation failed.';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export const ActiveStaysBoard: React.FC = () => {
  const { properties, selectedPropertyId } = useAuth();
  const [stays, setStays] = useState<StayAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [workingId, setWorkingId] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [inventory, setInventory] = useState<PropertyInventory | null>(null);
  const [unitId, setUnitId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [agreedRate, setAgreedRate] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [depositMethod, setDepositMethod] = useState('CASH');
  const [saving, setSaving] = useState(false);
  const [selectedStay, setSelectedStay] = useState<StayAssignment | null>(null);
  const [stayModalMode, setStayModalMode] = useState<'manage' | 'check-out'>('manage');
  const [folioSettled, setFolioSettled] = useState(false);
  const [keycardReturned, setKeycardReturned] = useState(false);
  const [finalAmountPaid, setFinalAmountPaid] = useState('0');
  const [stayOccupants, setStayOccupants] = useState<StayOccupant[]>([]);
  const [occupantsLoading, setOccupantsLoading] = useState(false);
  const [occupantsSaving, setOccupantsSaving] = useState(false);

  const loadStays = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const { data } = await apiClient.get<StayAssignment[]>('/stay/assignments/active', {
        params: selectedPropertyId && selectedPropertyId !== 'ALL'
          ? { propertyId: selectedPropertyId }
          : {},
      });
      setStays(data);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    void loadStays();
  }, [loadStays]);

  useEffect(() => {
    if (!selectedStay || stayModalMode !== 'manage') return;
    let active = true;
    setOccupantsLoading(true);
    apiClient.get<StayOccupant[]>(
      `/stay/assignments/${encodeURIComponent(selectedStay.id)}/occupants`,
    ).then(({ data }) => {
      if (active) {
        setStayOccupants(data.map((occupant) => ({
          ...occupant,
          dateOfBirth: occupant.dateOfBirth || '',
          gender: occupant.gender || '',
          email: occupant.email || '',
          phone: occupant.phone || '',
          permanentAddress: occupant.permanentAddress || '',
          idDocumentNumber: '',
        })));
      }
    }).catch((error: unknown) => {
      if (active) setErrorMessage(getErrorMessage(error));
    }).finally(() => {
      if (active) setOccupantsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [selectedStay?.id, stayModalMode]);

  useEffect(() => {
    if (!creating || !search.trim()) {
      setCustomers([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      apiClient.get<{ items: CustomerOption[] }>('/admin/users', {
        params: { role: 'CUSTOMER', search: search.trim(), limit: 25 },
      }).then(({ data }) => {
        if (active) setCustomers(data.items);
      }).catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [creating, search]);

  useEffect(() => {
    if (!creating || !propertyId) {
      setInventory(null);
      return;
    }
    let active = true;
    setInventory(null);
    setUnitId('');
    Promise.all([
      apiClient.get<PropertyInventory>(`/properties/${encodeURIComponent(propertyId)}/units/matrix`),
      apiClient.get<FeeConfig[]>(`/properties/${encodeURIComponent(propertyId)}/fees`),
    ]).then(([inventoryResponse, feeResponse]) => {
      if (!active) return;
      setInventory(inventoryResponse.data);
      const deposit = feeResponse.data.find((fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive);
      setDepositAmount(String(deposit?.amount || 0));
    }).catch((error: unknown) => {
      if (active) setErrorMessage(getErrorMessage(error));
    });
    return () => {
      active = false;
    };
  }, [creating, propertyId]);

  const selectedProperty = properties.find((property) => property.id === propertyId);
  const isHostel = hostelTypes.includes(selectedProperty?.type || '');
  const availableUnits = useMemo<AvailableDeskUnit[]>(() => {
    const rooms = inventory?.floors.flatMap((floor) => floor.rooms) || [];
    return rooms.flatMap((room) => {
      if (isHostel) {
        return room.beds.filter((bed) => bed.status === 'AVAILABLE').map((bed) => ({
          id: bed.id,
          label: `Room ${room.unitNumber} · Bed ${bed.unitNumber} · ${bed.sharingType || room.sharingType || 'sharing unspecified'}`,
          standardRate: bed.baseRateMonthly,
        }));
      }
      return room.status === 'AVAILABLE' && ['ROOM', 'SUITE'].includes(room.type)
        ? [{
            id: room.id,
            label: `${room.type} ${room.unitNumber} · ${room.category}`,
            standardRate: room.defaultPricePerNight,
          }]
        : [];
    });
  }, [inventory, isHostel]);
  const selectedUnit = availableUnits.find((unit) => unit.id === unitId);
  const hasRateOverride = Boolean(
    selectedUnit &&
    agreedRate !== '' &&
    selectedUnit.standardRate != null &&
    Number(agreedRate) !== Number(selectedUnit.standardRate),
  );

  const openCreate = () => {
    setPropertyId(
      selectedPropertyId && selectedPropertyId !== 'ALL'
        ? selectedPropertyId
        : properties[0]?.id || '',
    );
    setSearch('');
    setSelectedCustomerId('');
    setUnitId('');
    setAgreedRate('');
    setOverrideReason('');
    setErrorMessage('');
    setCreating(true);
  };

  const createWalkIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCustomerId || !selectedProperty || !selectedUnit) return;
    if (hasRateOverride && !overrideReason.trim()) {
      setErrorMessage('Enter a reason for changing the standard rate.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      await apiClient.post('/stay/assignments', {
        unitId,
        userId: selectedCustomerId,
        expectedCheckIn: new Date(checkIn).toISOString(),
        ...(checkOut ? { expectedCheckOut: new Date(checkOut).toISOString() } : {}),
        billingStrategy: isHostel ? 'RECURRING_MONTHLY' : 'PER_NIGHT_STAY',
        checkInNow: true,
        ...(agreedRate ? { agreedRate } : {}),
        ...(overrideReason.trim() ? { rateOverrideReason: overrideReason.trim() } : {}),
        ...(Number(depositAmount) > 0
          ? { depositPaymentAmount: depositAmount, depositPaymentMethod: depositMethod }
          : {}),
      });
      setCreating(false);
      await loadStays();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const checkOutStay = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStay) return;
    setWorkingId(selectedStay.id);
    setErrorMessage('');
    try {
      await apiClient.post(`/stay/assignments/${encodeURIComponent(selectedStay.id)}/check-out`, {
        folioSettled,
        keycardReturned,
        finalAmountPaid,
      });
      setSelectedStay(null);
      await loadStays();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setWorkingId('');
    }
  };

  const updateStayOccupant = (
    index: number,
    field: keyof StayOccupant,
    value: string,
  ) => {
    setStayOccupants((current) =>
      current.map((occupant, itemIndex) =>
        itemIndex === index ? { ...occupant, [field]: value } : occupant,
      ),
    );
  };

  const saveStayOccupants = async () => {
    if (!selectedStay) return;
    setOccupantsSaving(true);
    setErrorMessage('');
    try {
      const { data } = await apiClient.put<StayOccupant[]>(
        `/stay/assignments/${encodeURIComponent(selectedStay.id)}/occupants`,
        {
          occupants: stayOccupants.map((occupant) => ({
            ...(occupant.id ? { id: occupant.id } : {}),
            fullName: occupant.fullName.trim(),
            dateOfBirth: occupant.dateOfBirth || null,
            gender: occupant.gender || null,
            email: occupant.email.trim() || null,
            phone: occupant.phone.trim() || null,
            permanentAddress: occupant.permanentAddress.trim() || null,
            idDocumentType: occupant.idDocumentType || null,
            ...(occupant.idDocumentNumber.trim()
              ? { idDocumentNumber: occupant.idDocumentNumber.trim() }
              : {}),
          })),
        },
      );
      setStayOccupants(data.map((occupant) => ({
        ...occupant,
        dateOfBirth: occupant.dateOfBirth || '',
        gender: occupant.gender || '',
        email: occupant.email || '',
        phone: occupant.phone || '',
        permanentAddress: occupant.permanentAddress || '',
        idDocumentNumber: '',
      })));
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setOccupantsSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">Active stays</h1>
          <p className="mt-1 text-xs text-slate-500">Manage checked-in guests and front-desk walk-ins.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800">
            <DoorOpen className="h-4 w-4" /> Walk-in check-in
          </button>
          <button type="button" onClick={() => void loadStays()} disabled={loading} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </header>
      {errorMessage && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>}
      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-3">Guest</th><th className="p-3">Property / unit</th>
              <th className="p-3">Billing</th><th className="p-3">Scheduled</th>
              <th className="p-3">Checked in</th><th className="p-3">Rate</th><th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stays.map((stay) => (
              <tr key={stay.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3"><strong>{stay.guestName || 'Guest'}</strong><div className="mt-1 text-slate-500">{stay.guestPhone || stay.guestEmail}</div></td>
                <td className="p-3">{stay.propertyName}<div className="mt-1 text-slate-500">{stay.unitType} {stay.unitNumber} · {stay.unitCategory}</div></td>
                <td className="p-3">{stay.billingStrategy === 'RECURRING_MONTHLY' ? 'Monthly' : 'Per night'}<div className="mt-1 text-slate-500">{stay.persona || '—'}</div></td>
                <td className="p-3">{formatDate(stay.expectedCheckIn)}<div className="mt-1 text-slate-500">Out: {formatDate(stay.expectedCheckOut)}</div></td>
                <td className="p-3">{formatDate(stay.actualCheckIn)}</td>
                <td className="p-3">{stay.agreedRate ?? stay.standardRate ?? '—'}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setSelectedStay(stay); setStayModalMode('manage'); }} className="border border-slate-300 px-2 py-1 font-semibold dark:border-slate-700">Manage</button>
                    <button type="button" onClick={() => { setSelectedStay(stay); setStayModalMode('check-out'); setFolioSettled(false); setKeycardReturned(false); setFinalAmountPaid('0'); }} className="bg-slate-900 px-2 py-1 font-semibold text-white">Check out</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && stays.length === 0 && <tr><td className="p-8 text-center text-slate-500" colSpan={7}>No active stays in this property scope.</td></tr>}
            {loading && <tr><td className="p-8 text-center text-slate-500" colSpan={7}><LoadingIndicator label="Loading active stays" /></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={createWalkIn} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto bg-white p-5 dark:bg-slate-900">
            <header className="flex items-center justify-between"><div><h2 className="font-bold">Walk-in check-in</h2><p className="text-xs text-slate-500">Assign an available unit and record the agreed rate.</p></div><button type="button" onClick={() => setCreating(false)} aria-label="Close walk-in form"><X className="h-5 w-5" /></button></header>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">Property
                <select required value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={inputClass}>
                  {properties.map((property: Property) => <option key={property.id} value={property.id}>{property.name} · {property.type}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold">Find customer
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, or email" className={inputClass} />
                <div className="flex items-center gap-1 text-[10px] font-normal text-slate-500"><Search className="h-3 w-3" /> Choose an active customer account.</div>
                <select required value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className={inputClass}>
                  <option value="">Select customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.email || customer.phone} · {customer.phone || customer.email}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold sm:col-span-2">Available {isHostel ? 'bed' : 'room / suite'}
                <select required value={unitId} onChange={(event) => setUnitId(event.target.value)} className={inputClass}>
                  <option value="">Select available unit</option>
                  {availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.label} · Standard rate {unit.standardRate ?? 'not set'}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold">Scheduled check-in
                <input required type="datetime-local" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1 text-xs font-semibold">Scheduled check-out
                <input type="datetime-local" min={checkIn || undefined} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1 text-xs font-semibold">Agreed rate ({isHostel ? 'monthly' : 'nightly'})
                <input type="number" min="0.01" step="0.01" value={agreedRate} onChange={(event) => setAgreedRate(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1 text-xs font-semibold">Rate override reason {hasRateOverride ? '*' : '(if different from standard)'}
                <input required={hasRateOverride} maxLength={2000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} className={inputClass} />
              </label>
              {Number(depositAmount) > 0 && <>
                <label className="space-y-1 text-xs font-semibold">Security deposit collected
                  <input required type="number" min="0" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className={inputClass} />
                </label>
                <label className="space-y-1 text-xs font-semibold">Deposit method
                  <select value={depositMethod} onChange={(event) => setDepositMethod(event.target.value)} className={inputClass}>
                    <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option>
                  </select>
                </label>
              </>}
            </div>
            <button disabled={saving || !unitId || !selectedCustomerId || (hasRateOverride && !overrideReason.trim())} className="w-full bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm check-in</button>
          </form>
        </div>
      )}

      {selectedStay && !creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={stayModalMode === 'check-out' ? checkOutStay : (event) => event.preventDefault()} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto bg-white p-5 dark:bg-slate-900">
            <header className="flex items-center justify-between"><div><h2 className="font-bold">{stayModalMode === 'check-out' ? 'Check out stay' : 'Manage stay'}</h2><p className="text-xs text-slate-500">{selectedStay.guestName} · {selectedStay.propertyName} · {selectedStay.unitNumber}</p></div><button type="button" onClick={() => setSelectedStay(null)} aria-label="Close stay details"><X className="h-5 w-5" /></button></header>
            <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Stay type</dt><dd>{selectedStay.persona || '—'}</dd></div><div><dt className="text-slate-500">Billing</dt><dd>{selectedStay.billingStrategy}</dd></div><div><dt className="text-slate-500">Check-in</dt><dd>{formatDate(selectedStay.actualCheckIn)}</dd></div><div><dt className="text-slate-500">Scheduled out</dt><dd>{formatDate(selectedStay.expectedCheckOut)}</dd></div><div><dt className="text-slate-500">Rate</dt><dd>{selectedStay.agreedRate ?? selectedStay.standardRate ?? '—'}</dd></div><div><dt className="text-slate-500">Override reason</dt><dd>{selectedStay.rateOverrideReason || '—'}</dd></div></dl>
            <p className="text-xs text-slate-500">Digital access details are not managed by the current key system. Verify key return at the desk.</p>
            {stayModalMode === 'check-out' ? (
              <>
                <label className="space-y-1 text-xs font-semibold">Final amount paid
                  <input type="number" min="0" step="0.01" value={finalAmountPaid} onChange={(event) => setFinalAmountPaid(event.target.value)} className={inputClass} />
                </label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={folioSettled} onChange={(event) => setFolioSettled(event.target.checked)} />Folio settled</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={keycardReturned} onChange={(event) => setKeycardReturned(event.target.checked)} />Keycard returned</label>
                <button disabled={workingId === selectedStay.id || !folioSettled || !keycardReturned} className="w-full bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm check-out</button>
              </>
            ) : (
              <>
                <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <header className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-bold">Actual occupants in this unit</h3><p className="text-xs text-slate-500">Record the people who will stay in this specific room or bed. Government ID numbers are encrypted.</p></div>
                    <button type="button" onClick={() => setStayOccupants((current) => [...current, { fullName: '', dateOfBirth: '', gender: '', email: '', phone: '', permanentAddress: '', idDocumentType: '', idDocumentNumber: '' }])} className="shrink-0 border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-700">Add occupant</button>
                  </header>
                  {occupantsLoading ? <LoadingIndicator label="Loading occupants" /> : stayOccupants.map((occupant, index) => (
                    <fieldset key={occupant.id || `new-${index}`} className="grid gap-3 border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
                      <legend className="px-1 text-xs font-bold">Occupant {index + 1}</legend>
                      <label className="space-y-1 text-xs font-semibold sm:col-span-2">Full name
                        <input required maxLength={128} value={occupant.fullName} onChange={(event) => updateStayOccupant(index, 'fullName', event.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold">Date of birth
                        <input type="date" value={occupant.dateOfBirth} onChange={(event) => updateStayOccupant(index, 'dateOfBirth', event.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold">Gender
                        <input maxLength={16} value={occupant.gender} onChange={(event) => updateStayOccupant(index, 'gender', event.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold">Phone
                        <input type="tel" maxLength={32} value={occupant.phone} onChange={(event) => updateStayOccupant(index, 'phone', event.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold">Email
                        <input type="email" maxLength={255} value={occupant.email} onChange={(event) => updateStayOccupant(index, 'email', event.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold sm:col-span-2">Address
                        <input maxLength={512} value={occupant.permanentAddress} onChange={(event) => updateStayOccupant(index, 'permanentAddress', event.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1 text-xs font-semibold">Government ID type
                        <select required={!occupant.id} value={occupant.idDocumentType} onChange={(event) => updateStayOccupant(index, 'idDocumentType', event.target.value)} className={inputClass}>
                          <option value="">Select ID type</option>
                          {governmentIdTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-semibold">Government ID number {occupant.id && occupant.idDocumentLast4 ? `(stored ending ${occupant.idDocumentLast4})` : ''}
                        <input required={!occupant.id} minLength={2} maxLength={128} value={occupant.idDocumentNumber} onChange={(event) => updateStayOccupant(index, 'idDocumentNumber', event.target.value)} className={inputClass} />
                      </label>
                      <button type="button" onClick={() => setStayOccupants((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="justify-self-start text-xs font-semibold text-red-700 sm:col-span-2">Remove occupant</button>
                    </fieldset>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveStayOccupants()} disabled={occupantsLoading || occupantsSaving} className="bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save occupants</button>
                    <button type="button" onClick={() => { setStayModalMode('check-out'); setFolioSettled(false); setKeycardReturned(false); }} className="border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">Start check-out</button>
                  </div>
                </section>
              </>
            )}
          </form>
        </div>
      )}
    </section>
  );
};
