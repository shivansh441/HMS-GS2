import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, Building2, Plus, Save, UserRoundPlus, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { Property } from '../../types';

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
  type: 'ROOM' | 'SUITE' | 'BED';
  category: string;
  sharingType: string | null;
  capacity: number;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
  beds: InventoryBed[];
}

interface InventoryFloor {
  floorNumber: number;
  rooms: InventoryRoom[];
}

interface PropertyDetails extends Property {
  address: string;
  city: string;
  state: string;
  currency: string;
  unitMatrix: InventoryFloor[];
  feeConfigs: PropertyFeeConfig[];
}

interface PropertyFeeConfig {
  id: string;
  feeType: string;
  name: string;
  amount: number | string | null;
  ratePerUnit: number | string | null;
  unitOfMeasure: string | null;
  isActive: boolean;
}

interface InventoryForm {
  unitNumber: string;
  floor: number;
  category: string;
  capacity: number;
  bedsPerRoom: number;
  sharingType: string;
  baseRateMonthly: string;
  defaultPricePerNight: string;
}

const emptyForm: InventoryForm = {
  unitNumber: '',
  floor: 0,
  category: 'CLASSIC',
  capacity: 2,
  bedsPerRoom: 2,
  sharingType: 'DOUBLE',
  baseRateMonthly: '',
  defaultPricePerNight: '',
};

const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load inventory.';
}

export const PropertyInventory: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { user, properties, selectedPropertyId } = useAuth();
  const activePropertyId =
    propertyId || (selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : '');
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [floors, setFloors] = useState<InventoryFloor[]>([]);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [feeAmounts, setFeeAmounts] = useState({
    mess: '',
    securityDeposit: '',
    electricityRate: '',
    electricityUnit: 'KWH',
    waterRate: '',
    waterUnit: 'LITER',
  });
  const [savingFees, setSavingFees] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskUserId, setDeskUserId] = useState('');
  const [deskUnitId, setDeskUnitId] = useState('');
  const [deskCheckIn, setDeskCheckIn] = useState(new Date().toISOString().slice(0, 10));
  const [deskRate, setDeskRate] = useState('');
  const [deskRateOverrideReason, setDeskRateOverrideReason] = useState('');
  const [deskDepositAmount, setDeskDepositAmount] = useState('0');
  const [deskDepositMethod, setDeskDepositMethod] = useState('CASH');
  const [deskSaving, setDeskSaving] = useState(false);

  const isHostel = hostelTypes.includes(property?.type || '');
  const canDeskCheckIn = user?.role === 'ADMIN' || user?.staffRole === 'FRONT_DESK';
  const rooms = useMemo(
    () => floors.flatMap((floor) => floor.rooms).filter((unit) => unit.type !== 'BED'),
    [floors],
  );
  const totalBeds = useMemo(
    () => floors.flatMap((floor) => floor.rooms).reduce((total, room) => total + room.beds.length, 0),
    [floors],
  );

  const loadInventory = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [propertyResponse, matrixResponse] = await Promise.all([
        apiClient.get<PropertyDetails>(`/admin/properties/${encodeURIComponent(activePropertyId)}`),
        apiClient.get<{ floors: InventoryFloor[] }>(`/properties/${encodeURIComponent(activePropertyId)}/units/matrix`),
      ]);
      const feeResponse = await apiClient.get<PropertyFeeConfig[]>(
        `/properties/${encodeURIComponent(activePropertyId)}/fees`,
      );
      const feeConfigs = propertyResponse.data.feeConfigs?.length
        ? propertyResponse.data.feeConfigs
        : feeResponse.data;
      setProperty({ ...propertyResponse.data, feeConfigs });
      setFloors(matrixResponse.data.floors || propertyResponse.data.unitMatrix || []);
      const configs = feeConfigs || [];
      setFeeAmounts({
        mess: String(configs.find((fee) => fee.feeType === 'MESS_FEE' && fee.isActive)?.amount ?? ''),
        securityDeposit: String(configs.find((fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive)?.amount ?? ''),
        electricityRate: String(configs.find((fee) => fee.feeType === 'ELECTRICITY_FEE' && fee.isActive)?.ratePerUnit ?? ''),
        electricityUnit: configs.find((fee) => fee.feeType === 'ELECTRICITY_FEE' && fee.isActive)?.unitOfMeasure || 'KWH',
        waterRate: String(configs.find((fee) => fee.feeType === 'WATER_CHARGE' && fee.isActive)?.ratePerUnit ?? ''),
        waterUnit: configs.find((fee) => fee.feeType === 'WATER_CHARGE' && fee.isActive)?.unitOfMeasure || 'LITER',
      });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activePropertyId) return;
    void loadInventory();
  }, [activePropertyId]);

  const createUnit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!property) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const payload = {
      unitNumber: form.unitNumber.trim(),
      floor: form.floor,
      type: 'ROOM',
      category: form.category,
      capacity: isHostel
        ? form.sharingType === 'DORMITORY'
          ? form.bedsPerRoom
          : ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3 }[form.sharingType] || form.bedsPerRoom)
        : form.capacity,
      ...(isHostel ? {
        bedsPerRoom: form.sharingType === 'DORMITORY'
          ? form.bedsPerRoom
          : ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3 }[form.sharingType] || form.bedsPerRoom),
        sharingType: form.sharingType,
        baseRateMonthly: form.baseRateMonthly,
      } : {}),
      ...(!isHostel && form.defaultPricePerNight ? { defaultPricePerNight: form.defaultPricePerNight } : {}),
    };
    try {
      await apiClient.post(`/properties/${encodeURIComponent(property.id)}/units`, payload);
      setForm(emptyForm);
      setIsCreating(false);
      setSuccessMessage(isHostel
        ? `Room added with ${form.bedsPerRoom} configured bed${form.bedsPerRoom === 1 ? '' : 's'}.`
        : 'Room added.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const savePropertyFees = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!property) return;
    setSavingFees(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const configs = [
        {
          feeType: 'MESS_FEE',
          name: 'Monthly Mess Fee',
          amount: feeAmounts.mess || '0',
          isActive: Number(feeAmounts.mess) > 0,
          pricingBasis: 'FIXED_FLAT',
          billingTiming: 'ADVANCE',
        },
        {
          feeType: 'SECURITY_DEPOSIT',
          name: 'Security Deposit',
          amount: feeAmounts.securityDeposit || '0',
          isActive: Number(feeAmounts.securityDeposit) > 0,
          pricingBasis: 'FIXED_FLAT',
          billingTiming: 'ADVANCE',
        },
        ...(feeAmounts.electricityRate && feeAmounts.electricityUnit ? [{
          feeType: 'ELECTRICITY_FEE',
          name: 'Electricity',
          amount: '0',
          isActive: true,
          pricingBasis: 'METERED',
          billingTiming: 'ARREARS',
          ratePerUnit: feeAmounts.electricityRate,
          unitOfMeasure: feeAmounts.electricityUnit,
        }] : []),
        ...(feeAmounts.waterRate && feeAmounts.waterUnit ? [{
          feeType: 'WATER_CHARGE',
          name: 'Water',
          amount: '0',
          isActive: true,
          pricingBasis: 'METERED',
          billingTiming: 'ARREARS',
          ratePerUnit: feeAmounts.waterRate,
          unitOfMeasure: feeAmounts.waterUnit,
        }] : []),
      ];
      await Promise.all(configs.map((config) => apiClient.post(
        `/properties/${encodeURIComponent(property.id)}/fee-configs`,
        {
          ...config,
          isMandatory: true,
        },
      )));
      setSuccessMessage('Property fee and metered utility settings saved.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingFees(false);
    }
  };

  const createDeskAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!property) return;
    setDeskSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const depositConfig = property.feeConfigs.find(
        (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
      );
      await apiClient.post('/stay/assignments', {
        unitId: deskUnitId,
        userId: deskUserId.trim(),
        expectedCheckIn: `${deskCheckIn}T12:00:00Z`,
        billingStrategy: isHostel ? 'RECURRING_MONTHLY' : 'PER_NIGHT_STAY',
        ...(deskRate ? { agreedRate: deskRate } : {}),
        ...(deskRateOverrideReason.trim()
          ? { rateOverrideReason: deskRateOverrideReason.trim() }
          : {}),
        ...(depositConfig ? {
          depositPaymentAmount: deskDepositAmount,
          depositPaymentMethod: deskDepositMethod,
        } : {}),
      });
      setDeskOpen(false);
      setDeskUserId('');
      setDeskUnitId('');
      setDeskRate('');
      setDeskRateOverrideReason('');
      setSuccessMessage('Walk-in stay assigned with the standard rate or agreed desk rate.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeskSaving(false);
    }
  };

  const availableDeskUnits = rooms.flatMap((room) => (
    isHostel ? room.beds.filter((bed) => bed.status === 'AVAILABLE') : [room]
  )).filter((unit) => unit.status === 'AVAILABLE');
  const selectedDeskUnit = availableDeskUnits.find((unit) => unit.id === deskUnitId);
  const deskHasRateOverride = Boolean(
    selectedDeskUnit &&
    deskRate !== '' &&
    (isHostel ? selectedDeskUnit.baseRateMonthly : selectedDeskUnit.defaultPricePerNight) != null &&
    Number(deskRate) !== Number(isHostel ? selectedDeskUnit.baseRateMonthly : selectedDeskUnit.defaultPricePerNight),
  );

  if (!activePropertyId) {
    return (
      <div className="space-y-5">
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="text-xl font-bold uppercase tracking-wide">Unit inventory</h1>
          <p className="mt-1 text-xs text-slate-500">
            Select a property from the property scope selector, or choose one below.
          </p>
        </header>
        {properties.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            No properties are available for your account.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {properties.map((item) => (
              <Link
                key={item.id}
                to={`/properties/${encodeURIComponent(item.id)}/inventory`}
                className="border border-slate-200 bg-white p-4 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-xs font-mono text-slate-500">{item.code} · {item.type}</p>
                <p className="mt-1 text-sm font-bold">{item.name}</p>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">Open inventory</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Loading property inventory…</p>;
  }

  if (!property) {
    return (
      <div role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        {errorMessage || 'Property not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/properties" className="inline-flex items-center gap-2 text-xs font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300">
        <ArrowLeft className="h-4 w-4" />
        Back to properties
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-mono text-slate-500">{property.code} · {property.type}</p>
          <h1 className="mt-1 text-xl font-bold uppercase tracking-wide">
            {isCreating ? `Create ${isHostel ? 'hostel' : 'hotel'} room` : `${property.name} inventory`}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{property.city}, {property.state}</p>
        </div>
        {!isCreating && (
          <div className="flex flex-wrap gap-2">
            {canDeskCheckIn && (
              <button type="button" onClick={() => {
                const deposit = property.feeConfigs.find(
                  (fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive,
                );
                setDeskDepositAmount(String(deposit?.amount ?? '0'));
                setDeskRate('');
                setDeskRateOverrideReason('');
                setDeskOpen(true);
              }} className="inline-flex items-center gap-2 border border-blue-700 px-3 py-2 text-xs font-bold uppercase text-blue-700 hover:bg-blue-50 dark:text-blue-300">
                <UserRoundPlus className="h-4 w-4" /> Desk walk-in
              </button>
            )}
            {user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm);
                  setErrorMessage('');
                  setSuccessMessage('');
                  setIsCreating(true);
                }}
                className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" />
                Create room
              </button>
            )}
          </div>
        )}
        {isCreating && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setIsCreating(false);
              setForm(emptyForm);
              setErrorMessage('');
            }}
            className="text-xs font-bold uppercase text-blue-700 hover:text-blue-900 disabled:opacity-60 dark:text-blue-300"
          >
            Back to inventory
          </button>
        )}
        {!isCreating && isHostel && (
          <Link
            to={`/properties/${encodeURIComponent(activePropertyId)}/fee-ledger`}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold uppercase text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Open fee ledger
          </Link>
        )}
      </header>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {successMessage}
        </div>
      )}

      {!isCreating && <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Building2 className="h-5 w-5 text-blue-700" />
          <div>
            <p className="text-xl font-bold">{rooms.length}</p>
            <p className="text-xs uppercase text-slate-500">{isHostel ? 'Rooms' : 'Rooms / suites'}</p>
          </div>
        </div>
        {isHostel && (
          <div className="flex items-center gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <BedDouble className="h-5 w-5 text-blue-700" />
            <div>
              <p className="text-xl font-bold">{totalBeds}</p>
              <p className="text-xs uppercase text-slate-500">Total configured beds</p>
            </div>
          </div>
        )}
      </section>}

      {user?.role === 'ADMIN' && isCreating ? (
        <section className="space-y-4 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div>
              <h2 className="text-sm font-bold uppercase">Add {isHostel ? 'hostel room' : 'hotel room'}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {isHostel
                  ? 'Set category, sharing and the standard monthly baseline; individual bed records are created automatically.'
                  : 'Set the room category and standard nightly rate.'}
              </p>
          </div>
          <form onSubmit={createUnit} className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
          <label className="space-y-1 text-xs font-semibold">
            Unit number *
            <input required maxLength={64} className={inputClass} value={form.unitNumber} onChange={(event) => setForm((current) => ({ ...current, unitNumber: event.target.value }))} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Floor
            <input type="number" min="0" max="100" className={inputClass} value={form.floor} onChange={(event) => setForm((current) => ({ ...current, floor: Number(event.target.value) }))} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Category
            <select className={inputClass} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
              <option value="CLASSIC">Classic</option>
              <option value="DELUXE">Deluxe</option>
              <option value="EXECUTIVE">Executive</option>
              <option value="DORMITORY" disabled={isHostel && form.sharingType !== 'DORMITORY'}>Dormitory</option>
            </select>
          </label>
          {isHostel ? (
            <>
              <label className="space-y-1 text-xs font-semibold">
                Sharing type
                <select className={inputClass} value={form.sharingType} onChange={(event) => setForm((current) => ({
                  ...current,
                  sharingType: event.target.value,
                  category: event.target.value === 'DORMITORY'
                    ? 'DORMITORY'
                    : current.category === 'DORMITORY' ? 'CLASSIC' : current.category,
                  bedsPerRoom: event.target.value === 'DORMITORY'
                    ? Math.max(4, current.bedsPerRoom)
                    : current.bedsPerRoom,
                }))}>
                  <option value="SINGLE">Single sharing</option>
                  <option value="DOUBLE">Double sharing</option>
                  <option value="TRIPLE">Triple sharing</option>
                  <option value="DORMITORY">Dormitory</option>
                </select>
              </label>
              {form.sharingType === 'DORMITORY' ? (
                <label className="space-y-1 text-xs font-semibold">
                  Beds in dormitory *
                  <input required type="number" min="4" max="100" className={inputClass} value={form.bedsPerRoom} onChange={(event) => setForm((current) => ({ ...current, bedsPerRoom: Number(event.target.value) }))} />
                </label>
              ) : (
                <div className="space-y-1 text-xs font-semibold">
                  <span>Beds in room</span>
                  <p className={`${inputClass} text-slate-500`}>{form.sharingType === 'SINGLE' ? 1 : form.sharingType === 'DOUBLE' ? 2 : 3}</p>
                </div>
              )}
            </>
          ) : (
            <label className="space-y-1 text-xs font-semibold">
              Occupancy capacity *
              <input required type="number" min="1" max="100" className={inputClass} value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) }))} />
            </label>
          )}
          <label className="space-y-1 text-xs font-semibold">
            {isHostel ? `Standard monthly rate per bed (${property.currency})` : `Standard nightly rate (${property.currency})`}
            <input required type="number" min="0.01" step="0.01" className={inputClass} value={isHostel ? form.baseRateMonthly : form.defaultPricePerNight} onChange={(event) => setForm((current) => isHostel ? { ...current, baseRateMonthly: event.target.value } : { ...current, defaultPricePerNight: event.target.value })} />
          </label>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-60">
            {saving ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Create room'}
          </button>
          </form>
        </section>
      ) : null}

      {!isCreating && <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase">Configured rooms and beds</h2>
        {rooms.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">No rooms have been added to this property.</p>
        ) : floors.map((floor) => (
          <div key={floor.floorNumber} className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-slate-500">Floor {floor.floorNumber}</h3>
            {floor.rooms.filter((room) => room.type !== 'BED').map((room) => (
              <article key={room.id} className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold">{room.type} {room.unitNumber} · {room.category}</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Capacity {room.capacity}{room.sharingType ? ` · ${room.sharingType} sharing` : ''} · {room.status}
                    </p>
                  </div>
                  <p className="text-xs font-semibold">
                    {isHostel
                      ? `${room.baseRateMonthly ?? '—'} ${property.currency}/bed/month`
                      : `${room.defaultPricePerNight ?? '—'} ${property.currency}/night`}
                  </p>
                </div>
                {room.beds.length > 0 && (
                  <ul className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700 sm:grid-cols-2">
                    {room.beds.map((bed) => (
                      <li key={bed.id} className="flex justify-between gap-2">
                        <span>Bed {bed.unitNumber.split('-').at(-1)} · {bed.sharingType || room.sharingType} · {bed.status}</span>
                        <span>{bed.baseRateMonthly ?? '—'} {property.currency}/month</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        ))}
      </section>}

      {!isCreating && isHostel && user?.role === 'ADMIN' && (
        <section className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold uppercase">Property fee settings</h2>
            <p className="mt-1 text-xs text-slate-500">
              Mess fees are billed monthly; security deposits are collected upfront and tracked in escrow.
            </p>
          </div>
          <form onSubmit={savePropertyFees} className="grid gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold">
              Fixed monthly mess fee ({property.currency})
              <input type="number" min="0" step="0.01" value={feeAmounts.mess} onChange={(event) => setFeeAmounts((current) => ({ ...current, mess: event.target.value }))} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Fixed security deposit ({property.currency})
              <input type="number" min="0" step="0.01" value={feeAmounts.securityDeposit} onChange={(event) => setFeeAmounts((current) => ({ ...current, securityDeposit: event.target.value }))} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Electricity rate per unit
              <input type="number" min="0.0001" step="0.0001" value={feeAmounts.electricityRate} onChange={(event) => setFeeAmounts((current) => ({ ...current, electricityRate: event.target.value }))} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Electricity unit of measure
              <input required={Boolean(feeAmounts.electricityRate)} maxLength={32} value={feeAmounts.electricityUnit} onChange={(event) => setFeeAmounts((current) => ({ ...current, electricityUnit: event.target.value.toUpperCase() }))} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Water rate per unit
              <input type="number" min="0.0001" step="0.0001" value={feeAmounts.waterRate} onChange={(event) => setFeeAmounts((current) => ({ ...current, waterRate: event.target.value }))} className={inputClass} />
            </label>
            <label className="space-y-1 text-xs font-semibold">
              Water unit of measure
              <input required={Boolean(feeAmounts.waterRate)} maxLength={32} value={feeAmounts.waterUnit} onChange={(event) => setFeeAmounts((current) => ({ ...current, waterUnit: event.target.value.toUpperCase() }))} className={inputClass} />
            </label>
            <button type="submit" disabled={savingFees} className="inline-flex items-center justify-center gap-2 self-end bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">
              <Save className="h-4 w-4" /> {savingFees ? 'Saving…' : 'Save fee settings'}
            </button>
            <p className="text-[11px] text-slate-500 lg:col-span-3">Enter 0 to deactivate fixed fees. Utility rates are applied only to actual month-end readings and billed as arrears.</p>
          </form>
        </section>
      )}

      {deskOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={createDeskAssignment} className="w-full max-w-lg space-y-4 bg-white p-5 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">Desk walk-in check-in</h2>
                <p className="text-xs text-slate-500">The agreed rate is stored only on this assignment.</p>
              </div>
              <button type="button" onClick={() => setDeskOpen(false)} aria-label="Close walk-in dialog"><X className="h-5 w-5" /></button>
            </div>
            <label className="block space-y-1 text-xs font-semibold">
              Active customer account ID
              <input required minLength={1} maxLength={36} value={deskUserId} onChange={(event) => setDeskUserId(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Available {isHostel ? 'bed' : 'room'}
              <select required value={deskUnitId} onChange={(event) => {
                setDeskUnitId(event.target.value);
                setDeskRateOverrideReason('');
              }} className={inputClass}>
                <option value="">Select unit</option>
                {availableDeskUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitNumber} · {unit.sharingType || unit.category} · {unit.status}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Check-in date
              <input required type="date" value={deskCheckIn} onChange={(event) => setDeskCheckIn(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Agreed rate override ({property.currency}/{isHostel ? 'month' : 'night'}, optional)
              <input type="number" min="0.01" step="0.01" value={deskRate} onChange={(event) => setDeskRate(event.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Rate override reason {deskHasRateOverride ? '*' : '(required if different from standard)'}
              <input required={deskHasRateOverride} maxLength={2000} value={deskRateOverrideReason} onChange={(event) => setDeskRateOverrideReason(event.target.value)} className={inputClass} />
            </label>
            {property.feeConfigs.some((fee) => fee.feeType === 'SECURITY_DEPOSIT' && fee.isActive) ? (
              <>
                <label className="block space-y-1 text-xs font-semibold">
                  Security deposit collected upfront ({property.currency})
                  <input required type="number" min="0.01" step="0.01" value={deskDepositAmount} onChange={(event) => setDeskDepositAmount(event.target.value)} className={inputClass} />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Deposit payment method
                  <select value={deskDepositMethod} onChange={(event) => setDeskDepositMethod(event.target.value)} className={inputClass}>
                    <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option>
                  </select>
                </label>
              </>
            ) : <p className="text-xs text-slate-500">No security deposit is configured for this property.</p>}
            <button type="submit" disabled={deskSaving || availableDeskUnits.length === 0 || (deskHasRateOverride && !deskRateOverrideReason.trim())} className="w-full bg-blue-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
              {deskSaving ? 'Checking in…' : 'Assign walk-in'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
