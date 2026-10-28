import React, { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Building2, CheckCircle, Globe, Pencil, Plus, Save } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { Property } from '../../types';

const propertyTypes = ['HOTEL', 'HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
const propertyStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'CLOSED'];
const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED'];
const bedLevelPropertyTypes = [...hostelTypes, 'CO_LIVING'];
const feeTypes = [
  { value: 'UNIT_FEE', name: 'Hostel Rent' },
  { value: 'MESS_FEE', name: 'Mess Fee' },
  { value: 'SECURITY_DEPOSIT', name: 'Security Deposit' },
  { value: 'ELECTRICITY_FEE', name: 'Electricity Fee' },
  { value: 'MAINTENANCE_FEE', name: 'Maintenance Fee' },
  { value: 'WATER_CHARGE', name: 'Water Charge' },
  { value: 'CUSTOM', name: 'Custom Fee' },
] as const;

type FeeType = (typeof feeTypes)[number]['value'];

interface PropertyFee {
  id: string;
  feeType: FeeType;
  name: string;
  amount: string | number | null;
  isMandatory: boolean | null;
  isActive: boolean;
  pricingBasis: string;
  billingTiming: string;
  ratePerUnit: string | number | null;
  unitOfMeasure: string | null;
}

interface FeeForm {
  feeType: FeeType | '';
  name: string;
  amount: string;
  isMandatory: boolean;
  isActive: boolean;
  ratePerUnit: string;
  unitOfMeasure: string;
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

interface InventoryBed {
  id: string;
  unitNumber: string;
  category: string;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
}

interface InventoryFloor {
  floorNumber: number;
  rooms: InventoryRoom[];
}

interface PropertyDetails extends Property {
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactPhone: string;
  contactEmail: string | null;
  facilities: string[];
  feeConfigs: PropertyFee[];
  unitMatrix: InventoryFloor[];
}

interface PropertyForm {
  name: string;
  type: string;
  status: string;
  floors: number;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactPhone: string;
  contactEmail: string;
  facilities: string;
  currency: string;
  timezone: string;
}

const emptyForm: PropertyForm = {
  name: '',
  type: 'HOTEL',
  status: 'ACTIVE',
  floors: 1,
  address: '',
  city: '',
  state: '',
  pincode: '',
  contactPhone: '',
  contactEmail: '',
  facilities: '',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

const isMeteredFee = (feeType: FeeType | string) => feeType === 'ELECTRICITY_FEE';
const isAssignmentFee = (feeType: FeeType | string) => feeType === 'UNIT_FEE';
const isConfigurationOnlyFee = (feeType: FeeType | string) => feeType === 'WATER_CHARGE';
const hasFlatAmount = (feeType: FeeType | string) =>
  !isMeteredFee(feeType) && !isAssignmentFee(feeType) && !isConfigurationOnlyFee(feeType);

const inputClass =
  'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-600 focus:outline-none';

function getErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return (
    axiosError.response?.data?.error?.message ||
    axiosError.message ||
    'Unable to save property. Please try again.'
  );
}

function formFromDetails(property: PropertyDetails): PropertyForm {
  return {
    name: property.name,
    type: property.type,
    status: property.status,
    floors: property.floors,
    address: property.address,
    city: property.city,
    state: property.state,
    pincode: property.pincode,
    contactPhone: property.contactPhone,
    contactEmail: property.contactEmail || '',
    facilities: property.facilities.join(', '),
    currency: property.currency,
    timezone: property.timezone,
  };
}

export const PropertyList: React.FC = () => {
  const { user, properties, selectedPropertyId, refreshProfile } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [editorMode, setEditorMode] = useState<'create' | 'view' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PropertyForm>(emptyForm);
  const [feeConfigs, setFeeConfigs] = useState<PropertyFee[]>([]);
  const [newFee, setNewFee] = useState<FeeForm | null>(null);
  const [savingFeeType, setSavingFeeType] = useState<FeeType | null>(null);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryFloor[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const inventoryRooms = inventoryUnits.flatMap((floor) => floor.rooms).filter((unit) => unit.type !== 'BED');
  const inventoryBedCount = inventoryUnits
    .flatMap((floor) => floor.rooms)
    .reduce((total, room) => total + room.beds.length, 0);

  useEffect(() => {
    let active = true;
    if (!editorMode || editorMode === 'create' || !editingId) return () => { active = false; };

    setIsLoadingDetails(true);
    setErrorMessage('');
    apiClient
      .get<PropertyDetails>(`/admin/properties/${editingId}`)
      .then(({ data }) => {
        if (active) {
          setForm(formFromDetails(data));
          setFeeConfigs(data.feeConfigs || []);
          setInventoryUnits(data.unitMatrix || []);
          setNewFee(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoadingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [editingId, editorMode]);

  const startCreate = () => {
    setEditorMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setFeeConfigs([]);
    setNewFee(null);
    setInventoryUnits([]);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const startEdit = (propertyId: string) => {
    setEditorMode('view');
    setEditingId(propertyId);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    setNewFee(null);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const updateField = <K extends keyof PropertyForm>(key: K, value: PropertyForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveProperty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const payload = {
      name: form.name,
      type: form.type,
      status: form.status,
      floors: form.floors,
      address: form.address,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail.trim() || null,
      currency: form.currency,
      timezone: form.timezone,
      facilities: form.facilities
        .split(',')
        .map((facility) => facility.trim())
        .filter(Boolean),
    };

    try {
      if (editingId) {
        await apiClient.put(`/admin/properties/${editingId}`, payload);
        setSuccessMessage('Property updated successfully.');
        setEditorMode('view');
      } else {
        await apiClient.post('/admin/properties', payload);
        setSuccessMessage('Property created successfully.');
      }
      await refreshProfile();
      if (!editingId) {
        setEditorMode(null);
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const addFeeDraft = (feeType: FeeType) => {
    const fee = feeTypes.find((item) => item.value === feeType);
    if (!fee) return;
    setNewFee({
      feeType,
      name: fee.name,
      amount: '0',
      isMandatory: feeType === 'UNIT_FEE' || feeType === 'SECURITY_DEPOSIT',
      isActive: feeType === 'UNIT_FEE',
      ratePerUnit: '',
      unitOfMeasure: feeType === 'ELECTRICITY_FEE' ? 'KWH' : '',
    });
  };

  const saveFee = async (fee: FeeForm) => {
    if (!editingId || !fee.feeType) return;
    setSavingFeeType(fee.feeType);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data } = await apiClient.post<PropertyFee>(
        `/properties/${editingId}/fee-configs`,
        {
          feeType: fee.feeType,
          name: fee.name.trim(),
          amount: hasFlatAmount(fee.feeType) ? fee.amount : '0',
          isMandatory: fee.feeType === 'UNIT_FEE' || fee.feeType === 'SECURITY_DEPOSIT' || fee.isMandatory,
          isActive: isAssignmentFee(fee.feeType) ? true : fee.isActive,
          pricingBasis: isAssignmentFee(fee.feeType)
            ? 'ASSIGNMENT'
            : isMeteredFee(fee.feeType)
              ? 'METERED'
              : isConfigurationOnlyFee(fee.feeType)
                ? 'CONFIG_ONLY'
                : 'FIXED_FLAT',
          billingTiming: isAssignmentFee(fee.feeType)
            ? 'AT_ASSIGNMENT'
            : isMeteredFee(fee.feeType)
              ? 'ARREARS'
              : isConfigurationOnlyFee(fee.feeType)
                ? 'NONE'
                : 'ADVANCE',
          ratePerUnit: isMeteredFee(fee.feeType) ? fee.ratePerUnit : null,
          unitOfMeasure: isMeteredFee(fee.feeType) ? fee.unitOfMeasure : null,
        },
      );
      setFeeConfigs((current) =>
        [
          ...current.filter((item) => item.feeType !== data.feeType),
          data,
        ].sort((a, b) => a.feeType.localeCompare(b.feeType)),
      );
      if (newFee?.feeType === data.feeType) setNewFee(null);
      setSuccessMessage(`${data.name} configuration saved.`);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingFeeType(null);
    }
  };

  return (
    <div className="space-y-5">
      {!editorMode && (
        <>
      <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
            Properties
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? 'View and manage every property in the organization.'
              : 'View properties assigned to your account.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Add property
          </button>
        )}
      </div>

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

      {properties.length === 0 ? (
        <div className="border border-slate-300 bg-white p-8 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {isAdmin ? 'No properties yet. Add a property to get started.' : 'No property assigned yet, contact an admin.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {properties.map((property) => {
            const isSelected =
              selectedPropertyId === property.id || selectedPropertyId === 'ALL';
            return (
              <article
                key={property.id}
                className={`border p-4 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/20 dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="mb-2 inline-block bg-slate-900 px-1.5 py-0.5 text-xs font-mono font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                      {property.code}
                    </span>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {property.name}
                    </h2>
                    <p className="mt-1 text-[10px] font-mono text-slate-500">
                      {property.type} · {property.unitCount} units · {property.floorCount} floors
                    </p>
                  </div>
                  <span className="flex items-center text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                    {property.status}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 font-mono text-xs text-slate-500 dark:border-slate-700/60">
                  <span className="flex items-center">
                    <Globe className="mr-1 h-3.5 w-3.5" />
                    {property.timezone}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => startEdit(property.id)}
                      className="inline-flex items-center gap-1.5 font-sans font-bold text-blue-700 hover:text-blue-900 dark:text-blue-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      View / edit
                    </button>
                  )}
                  {!isAdmin && <span>ID: {property.id.slice(0, 8)}...</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
        </>
      )}

      {isAdmin && editorMode && (
        <div className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <Building2 className="h-4 w-4" />
              {editorMode === 'create'
                ? 'Create property'
                : editorMode === 'edit'
                  ? 'Edit property'
                  : 'Property details'}
            </h2>
            <div className="flex items-center gap-3">
              {editorMode === 'view' && (
                <button
                  type="button"
                  onClick={() => setEditorMode('edit')}
                  className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit property
                </button>
              )}
              <button
                type="button"
                onClick={closeEditor}
                className="text-xs font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300"
              >
                Back to properties
              </button>
            </div>
          </div>

          {errorMessage && (
            <div role="alert" className="mb-4 border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div role="status" className="mb-4 border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              {successMessage}
            </div>
          )}
          {isLoadingDetails ? (
            <p className="text-sm text-slate-500">Loading property details…</p>
          ) : (
            <form onSubmit={saveProperty} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">
                Name
                <input required maxLength={128} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Type
                <select disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.type} onChange={(e) => updateField('type', e.target.value)}>
                  {propertyTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
                </select>
              </label>
              {editingId && editorMode !== 'create' && (
                <section className="space-y-4 border border-slate-200 p-4 dark:border-slate-700 md:col-span-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide">Property inventory</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Inventory is managed separately so room and bed setup stays focused.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-xl font-bold">{inventoryRooms.length}</p>
                      <p className="text-xs uppercase text-slate-500">Rooms / suites</p>
                    </div>
                    {bedLevelPropertyTypes.includes(form.type) && (
                      <div className="border border-slate-200 p-3 dark:border-slate-700">
                        <p className="text-xl font-bold">{inventoryBedCount}</p>
                        <p className="text-xs uppercase text-slate-500">Total configured beds</p>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {editingId && (
                <label className="space-y-1 text-xs font-semibold">
                  Status
                  <select disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.status} onChange={(e) => updateField('status', e.target.value)}>
                    {propertyStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              )}
              <label className="space-y-1 text-xs font-semibold">
                Floors
                <input required type="number" min={0} max={100} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.floors} onChange={(e) => updateField('floors', Number(e.target.value))} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Address
                <input required maxLength={255} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.address} onChange={(e) => updateField('address', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                City
                <input required maxLength={128} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.city} onChange={(e) => updateField('city', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                State
                <input required maxLength={128} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.state} onChange={(e) => updateField('state', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Postal code
                <input required maxLength={32} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.pincode} onChange={(e) => updateField('pincode', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Contact phone
                <input required maxLength={32} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.contactPhone} onChange={(e) => updateField('contactPhone', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Contact email
                <input type="email" maxLength={255} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.contactEmail} onChange={(e) => updateField('contactEmail', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Currency
                <input required minLength={3} maxLength={3} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.currency} onChange={(e) => updateField('currency', e.target.value.toUpperCase())} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Time zone
                <input required maxLength={64} disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.timezone} onChange={(e) => updateField('timezone', e.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold md:col-span-2">
                Facilities (comma-separated)
                <input disabled={editorMode === 'view' || isSaving} className={inputClass} value={form.facilities} onChange={(e) => updateField('facilities', e.target.value)} />
              </label>
              {hostelTypes.includes(form.type) && (
                <section
                  className="space-y-3 border border-slate-200 p-4 dark:border-slate-700 md:col-span-2"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                      event.preventDefault();
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wide">Property fee configuration</h3>
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        Hostel Rent is included by default; its charge is entered on each stay assignment.
                        Electricity is metered and billed in arrears. Water Charge is a property setting only,
                        with no per-liter rate. Mess Fee and Security Deposit use flat amounts. Currency: {form.currency}.
                      </p>
                    </div>
                    {editorMode === 'view' && (
                      <button
                        type="button"
                        onClick={() => setEditorMode('edit')}
                        className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Manage fees
                      </button>
                    )}
                    {editorMode === 'edit' && editingId && (
                      <label className="flex items-center gap-2 text-xs font-semibold">
                        Add optional fee
                        <select
                          value=""
                          disabled={savingFeeType !== null}
                          onChange={(event) => {
                            if (event.target.value) addFeeDraft(event.target.value as FeeType);
                          }}
                          className="border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="">Select fee type</option>
                          {feeTypes
                            .filter(
                              (fee) =>
                                !feeConfigs.some((config) => config.feeType === fee.value) &&
                                newFee?.feeType !== fee.value,
                            )
                            .map((fee) => (
                              <option key={fee.value} value={fee.value}>{fee.name}</option>
                            ))}
                        </select>
                      </label>
                    )}
                  </div>

                  {!editingId ? (
                    <p className="border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                      Hostel Rent is added automatically for every hostel and is charged per assignment.
                      Standard room/bed rates are configured separately in the inventory section.
                    </p>
                  ) : feeConfigs.length === 0 && !newFee ? (
                    <p className="text-xs text-slate-500">No fee types configured yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {feeConfigs.map((fee) => (
                        <div key={fee.feeType} className="grid grid-cols-1 gap-3 border border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                          <div className="space-y-1 text-xs font-semibold">
                            Fee type
                            <p className="py-2 font-mono text-xs font-normal">
                              {fee.name}
                              {fee.feeType === 'UNIT_FEE' && (
                                <span className="ml-1 inline-block bg-blue-100 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                                  Default · required
                                </span>
                              )}
                              <span className="ml-1 text-slate-500">({fee.feeType})</span>
                            </p>
                          </div>
                          {editorMode === 'edit' ? (
                            <>
                              <label className="space-y-1 text-xs font-semibold">
                                Display name
                                <input
                                  required
                                  maxLength={128}
                                  disabled={savingFeeType === fee.feeType}
                                  className={inputClass}
                                  value={fee.name}
                                  onChange={(event) =>
                                    setFeeConfigs((current) =>
                                      current.map((item) =>
                                        item.feeType === fee.feeType
                                          ? { ...item, name: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              {isMeteredFee(fee.feeType) ? (
                                <>
                                  <label className="space-y-1 text-xs font-semibold">
                                    Rate per unit ({form.currency})
                                    <input
                                      required
                                      type="number"
                                      min="0.0001"
                                      step="0.0001"
                                      disabled={savingFeeType === fee.feeType}
                                      className={inputClass}
                                      value={fee.ratePerUnit ?? ''}
                                      onChange={(event) =>
                                        setFeeConfigs((current) =>
                                          current.map((item) =>
                                            item.feeType === fee.feeType
                                              ? { ...item, ratePerUnit: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs font-semibold">
                                    Meter unit
                                    <input
                                      required
                                      maxLength={32}
                                      disabled={savingFeeType === fee.feeType}
                                      className={inputClass}
                                      value={fee.unitOfMeasure || ''}
                                      placeholder="KWH"
                                      onChange={(event) =>
                                        setFeeConfigs((current) =>
                                          current.map((item) =>
                                            item.feeType === fee.feeType
                                              ? { ...item, unitOfMeasure: event.target.value.toUpperCase() }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                  </label>
                                </>
                              ) : isAssignmentFee(fee.feeType) ? (
                                <p className="self-center text-xs text-slate-600 dark:text-slate-300">
                                  Amount is set on each stay assignment, not on this property.
                                </p>
                              ) : isConfigurationOnlyFee(fee.feeType) ? (
                                <p className="self-center text-xs text-slate-600 dark:text-slate-300">
                                  This setting only records whether Water Charge applies; no amount or per-liter rate is configured here.
                                </p>
                              ) : (
                                <label className="space-y-1 text-xs font-semibold">
                                  Fixed amount ({form.currency})
                                  <input
                                    required
                                    type="number"
                                    min={fee.isActive ? '0.01' : '0'}
                                    step="0.01"
                                    disabled={savingFeeType === fee.feeType}
                                    className={inputClass}
                                    value={fee.amount ?? ''}
                                    onChange={(event) =>
                                      setFeeConfigs((current) =>
                                        current.map((item) =>
                                          item.feeType === fee.feeType
                                            ? { ...item, amount: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              )}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-4">
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={fee.feeType === 'UNIT_FEE' || fee.feeType === 'SECURITY_DEPOSIT' || Boolean(fee.isMandatory)}
                                    disabled={fee.feeType === 'UNIT_FEE' || fee.feeType === 'SECURITY_DEPOSIT' || isMeteredFee(fee.feeType) || isConfigurationOnlyFee(fee.feeType) || savingFeeType === fee.feeType}
                                    onChange={(event) =>
                                      setFeeConfigs((current) =>
                                        current.map((item) =>
                                          item.feeType === fee.feeType
                                            ? { ...item, isMandatory: event.target.checked }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  Mandatory
                                </label>
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={isAssignmentFee(fee.feeType) || fee.isActive}
                                    disabled={isAssignmentFee(fee.feeType) || savingFeeType === fee.feeType}
                                    onChange={(event) =>
                                      setFeeConfigs((current) =>
                                        current.map((item) =>
                                          item.feeType === fee.feeType
                                            ? { ...item, isActive: event.target.checked }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  Active
                                </label>
                                <button
                                  type="button"
                                  disabled={savingFeeType !== null}
                                  onClick={() =>
                                    saveFee({
                                      feeType: fee.feeType,
                                      name: fee.name,
                                      amount: String(fee.amount ?? ''),
                                      isMandatory: fee.feeType === 'SECURITY_DEPOSIT' || Boolean(fee.isMandatory),
                                      isActive: fee.isActive,
                                      ratePerUnit: String(fee.ratePerUnit ?? ''),
                                      unitOfMeasure: fee.unitOfMeasure || '',
                                    })
                                  }
                                  className="ml-auto inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-60"
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  {savingFeeType === fee.feeType ? 'Saving…' : 'Save fee'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="py-2 text-xs">
                                {isAssignmentFee(fee.feeType)
                                  ? 'Amount set per assignment'
                                  : isMeteredFee(fee.feeType)
                                    ? `${fee.ratePerUnit ?? '—'} ${form.currency}/${fee.unitOfMeasure || 'KWH'} · metered arrears`
                                    : isConfigurationOnlyFee(fee.feeType)
                                      ? 'Water charge setting only · no fixed amount'
                                      : `${fee.amount ?? '—'} ${form.currency} flat`}
                              </p>
                              <p className="py-2 text-xs">
                                {fee.isMandatory ? 'Mandatory' : 'Optional'} · {fee.isActive ? 'Active' : 'Inactive'}
                              </p>
                              <button
                                type="button"
                                onClick={() => setEditorMode('edit')}
                                className="inline-flex items-center justify-center gap-2 border border-blue-700 px-3 py-2 text-xs font-bold uppercase text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/30"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit fee
                              </button>
                            </>
                          )}
                        </div>
                      ))}

                      {newFee && editorMode === 'edit' && (
                        <div className="grid grid-cols-1 gap-3 border border-blue-300 bg-blue-50/40 p-3 dark:border-blue-800 dark:bg-blue-950/20 md:grid-cols-3">
                          <div className="py-2 text-xs font-bold">
                            {feeTypes.find((fee) => fee.value === newFee.feeType)?.name}
                            <p className="mt-1 font-mono font-normal text-slate-500">{newFee.feeType}</p>
                          </div>
                          <label className="space-y-1 text-xs font-semibold">
                            Display name
                            <input
                              required
                              maxLength={128}
                              disabled={savingFeeType === newFee.feeType}
                              className={inputClass}
                              value={newFee.name}
                              onChange={(event) => setNewFee((current) => current && ({ ...current, name: event.target.value }))}
                            />
                          </label>
                          {isMeteredFee(newFee.feeType) ? (
                            <>
                              <label className="space-y-1 text-xs font-semibold">
                                Rate per unit ({form.currency})
                                <input
                                  required
                                  type="number"
                                  min="0.0001"
                                  step="0.0001"
                                  disabled={savingFeeType === newFee.feeType}
                                  className={inputClass}
                                  value={newFee.ratePerUnit}
                                  onChange={(event) => setNewFee((current) => current && ({ ...current, ratePerUnit: event.target.value }))}
                                />
                              </label>
                              <label className="space-y-1 text-xs font-semibold">
                                Meter unit
                                <input
                                  required
                                  maxLength={32}
                                  disabled={savingFeeType === newFee.feeType}
                                  className={inputClass}
                                  value={newFee.unitOfMeasure}
                                  onChange={(event) => setNewFee((current) => current && ({ ...current, unitOfMeasure: event.target.value.toUpperCase() }))}
                                />
                              </label>
                            </>
                          ) : isAssignmentFee(newFee.feeType) ? (
                            <p className="self-center text-xs text-slate-600 dark:text-slate-300">
                              Amount is set on each stay assignment.
                            </p>
                          ) : isConfigurationOnlyFee(newFee.feeType) ? (
                            <p className="self-center text-xs text-slate-600 dark:text-slate-300">
                              Enable or disable this setting; no amount or per-liter rate is configured.
                            </p>
                          ) : (
                            <label className="space-y-1 text-xs font-semibold">
                              Fixed amount ({form.currency})
                              <input
                                required
                                type="number"
                                min={newFee.isActive ? '0.01' : '0'}
                                step="0.01"
                                disabled={savingFeeType === newFee.feeType}
                                className={inputClass}
                                value={newFee.amount}
                                onChange={(event) => setNewFee((current) => current && ({ ...current, amount: event.target.value }))}
                              />
                            </label>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-3">
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={newFee.feeType === 'UNIT_FEE' || newFee.feeType === 'SECURITY_DEPOSIT' || newFee.isMandatory}
                                disabled={newFee.feeType === 'UNIT_FEE' || newFee.feeType === 'SECURITY_DEPOSIT' || isMeteredFee(newFee.feeType) || isConfigurationOnlyFee(newFee.feeType) || savingFeeType === newFee.feeType}
                                onChange={(event) => setNewFee((current) => current && ({ ...current, isMandatory: event.target.checked }))}
                              />
                              Mandatory
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={isAssignmentFee(newFee.feeType) || newFee.isActive}
                                disabled={isAssignmentFee(newFee.feeType) || savingFeeType === newFee.feeType}
                                onChange={(event) => setNewFee((current) => current && ({ ...current, isActive: event.target.checked }))}
                              />
                              Active
                            </label>
                            <button
                              type="button"
                              disabled={savingFeeType !== null}
                              onClick={() => saveFee(newFee)}
                              className="ml-auto inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-60"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {savingFeeType === newFee.feeType ? 'Saving…' : 'Create fee'}
                            </button>
                            <button
                              type="button"
                              disabled={savingFeeType !== null}
                              onClick={() => setNewFee(null)}
                              className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase dark:border-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
              <div className="flex justify-end gap-2 md:col-span-2">
                {editorMode === 'view' ? (
                  <button type="button" onClick={() => setEditorMode('edit')} className="inline-flex items-center gap-2 bg-slate-800 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-slate-700">
                    <Pencil className="h-4 w-4" />
                    Edit property & fees
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving…' : editorMode === 'edit' ? 'Save changes' : 'Create property'}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
