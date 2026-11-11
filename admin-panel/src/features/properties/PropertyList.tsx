import React, { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Building2, CheckCircle, Globe, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { Property } from '../../types';
import { userInputClass, userLabelClass, userSectionClass } from '../users/userStyles';
import { BackLinkButton } from '../../components/ui/BackLinkButton';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

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
  ratePerUnit: string;
  unitOfMeasure: string;
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
}

interface PropertyForm {
  name: string;
  type: string;
  hasMessFacility: boolean;
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
  hasMessFacility: false,
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

const isMeteredFee = (feeType: FeeType | string) =>
  feeType === 'ELECTRICITY_FEE' || feeType === 'WATER_CHARGE';
const isAssignmentFee = (feeType: FeeType | string) => feeType === 'UNIT_FEE';
const hasFlatAmount = (feeType: FeeType | string) =>
  !isMeteredFee(feeType) && !isAssignmentFee(feeType);
const sortFeesHostelRentFirst = <T extends { feeType: string }>(fees: T[]) =>
  [...fees].sort((a, b) => {
    if (a.feeType === 'UNIT_FEE') return b.feeType === 'UNIT_FEE' ? 0 : -1;
    if (b.feeType === 'UNIT_FEE') return 1;
    return a.feeType.localeCompare(b.feeType);
  });

const inputClass =
  'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-600 focus:outline-none';

function getErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{
    error?: {
      message?: string;
      details?: Array<{ field?: string; issue?: string }>;
    };
  }>;
  const apiError = axiosError.response?.data?.error;
  const firstDetail = apiError?.details?.[0];
  const detailMessage = firstDetail
    ? [firstDetail.field, firstDetail.issue].filter(Boolean).join(': ')
    : '';
  return (
    (apiError?.message && detailMessage
      ? `${apiError.message} (${detailMessage})`
      : apiError?.message) ||
    axiosError.message ||
    'Unable to save property. Please try again.'
  );
}

function formFromDetails(property: PropertyDetails): PropertyForm {
  return {
    name: property.name,
    type: property.type,
    hasMessFacility: property.hasMessFacility,
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
  const [dirtyFeeTypes, setDirtyFeeTypes] = useState<Set<FeeType>>(() => new Set());
  const [newFees, setNewFees] = useState<FeeForm[]>([]);
  const [inventoryCounts, setInventoryCounts] = useState({
    roomCount: 0,
    bedCount: 0,
    availableBedCount: 0,
  });
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingPropertyId, setDeletingPropertyId] = useState<string | null>(null);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const deleteProperty = async (property: Property) => {
    setDeletingPropertyId(property.id);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.delete(`/properties/${encodeURIComponent(property.id)}`);
      setPropertyToDelete(null);
      if (editingId === property.id) closeEditor();
      await refreshProfile();
      setSuccessMessage(`${property.name} was deleted.`);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDeletingPropertyId(null);
    }
  };
  useEffect(() => {
    let active = true;
    if (!editingId) return () => { active = false; };

    setIsLoadingDetails(true);
    apiClient
      .get<PropertyDetails>(`/admin/properties/${editingId}?include_unit_matrix=false`)
      .then(({ data }) => {
        if (active) {
          setForm(formFromDetails(data));
          setFeeConfigs(sortFeesHostelRentFirst(data.feeConfigs || []));
          setDirtyFeeTypes(new Set());
          setInventoryCounts({
            roomCount: data.roomCount,
            bedCount: data.bedCount,
            availableBedCount: data.availableBedCount,
          });
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
  }, [editingId]);

  const startCreate = () => {
    setEditorMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setFeeConfigs([]);
    setDirtyFeeTypes(new Set());
    setNewFees([]);
    setInventoryCounts({ roomCount: 0, bedCount: 0, availableBedCount: 0 });
    setErrorMessage('');
    setSuccessMessage('');
  };

  const startEdit = (propertyId: string) => {
    setEditorMode('view');
    setEditingId(propertyId);
    setNewFees([]);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    setNewFees([]);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const updateField = <K extends keyof PropertyForm>(key: K, value: PropertyForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateFeeConfig = (
    feeType: FeeType,
    update: (fee: PropertyFee) => PropertyFee,
  ) => {
    setFeeConfigs((current) =>
      current.map((fee) => (fee.feeType === feeType ? update(fee) : fee)),
    );
    setDirtyFeeTypes((current) => new Set(current).add(feeType));
  };

  const saveProperty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const payload = {
      name: form.name,
      type: form.type,
      hasMessFacility: form.hasMessFacility,
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
        if (hostelTypes.includes(form.type)) {
          const feesToSave: Array<PropertyFee | FeeForm> = [
            ...feeConfigs.filter((fee) => dirtyFeeTypes.has(fee.feeType)),
            ...newFees,
          ];
          const savedFees: PropertyFee[] = [];
          for (const fee of feesToSave) {
            if (!fee.feeType) continue;
            const { data } = await apiClient.post<PropertyFee>(`/properties/${editingId}/fee-configs`, {
              feeType: fee.feeType,
              name: fee.name.trim(),
              amount: hasFlatAmount(fee.feeType) ? fee.amount : '0',
              isMandatory: true,
              isActive: true,
              pricingBasis: isAssignmentFee(fee.feeType)
                ? 'ASSIGNMENT'
                : isMeteredFee(fee.feeType)
                  ? 'METERED'
                  : 'FIXED_FLAT',
              billingTiming: isAssignmentFee(fee.feeType)
                ? 'AT_ASSIGNMENT'
                : isMeteredFee(fee.feeType)
                  ? 'ARREARS'
                  : 'ADVANCE',
              ratePerUnit: isMeteredFee(fee.feeType) ? fee.ratePerUnit : null,
              unitOfMeasure: isMeteredFee(fee.feeType) ? fee.unitOfMeasure : null,
            });
            savedFees.push(data);
          }
          if (savedFees.length > 0) {
            const savedByType = new Map(savedFees.map((fee) => [fee.feeType, fee]));
            setFeeConfigs((current) =>
              sortFeesHostelRentFirst(
                current.map((fee) => savedByType.get(fee.feeType) || fee),
              ),
            );
          }
          setDirtyFeeTypes(new Set());
        }
        setSuccessMessage('Property and fee configuration updated successfully.');
        setEditorMode('view');
        setNewFees([]);
        setDirtyFeeTypes(new Set());
      } else {
        const { data: createdProperty } = await apiClient.post<Property>(
          '/admin/properties',
          payload,
        );
        setEditingId(createdProperty.id);
        setEditorMode('edit');
        if (hostelTypes.includes(form.type)) {
          for (const fee of newFees) {
            if (!fee.feeType) continue;
            await apiClient.post(`/properties/${createdProperty.id}/fee-configs`, {
              feeType: fee.feeType,
              name: fee.name.trim(),
              amount: hasFlatAmount(fee.feeType) ? fee.amount : '0',
              isMandatory: true,
              isActive: true,
              pricingBasis: isAssignmentFee(fee.feeType)
                ? 'ASSIGNMENT'
                : isMeteredFee(fee.feeType)
                  ? 'METERED'
                  : 'FIXED_FLAT',
              billingTiming: isAssignmentFee(fee.feeType)
                ? 'AT_ASSIGNMENT'
                : isMeteredFee(fee.feeType)
                  ? 'ARREARS'
                  : 'ADVANCE',
              ratePerUnit: isMeteredFee(fee.feeType) ? fee.ratePerUnit : null,
              unitOfMeasure: isMeteredFee(fee.feeType) ? fee.unitOfMeasure : null,
            });
          }
        }
        setSuccessMessage('Property created successfully.');
        setNewFees([]);
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
    setNewFees((current) => [...current, {
      feeType,
      name: fee.name,
      amount: '0',
      ratePerUnit: '',
      unitOfMeasure: feeType === 'ELECTRICITY_FEE'
        ? 'KWH'
        : feeType === 'WATER_CHARGE'
          ? 'LITER'
          : '',
    }]);
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
                      {property.type} · {property.roomCount} {property.roomCount === 1 ? 'room' : 'rooms'}
                      {bedLevelPropertyTypes.includes(property.type)
                        ? ` · ${property.bedCount} beds · ${property.availableBedCount} available`
                        : ''}
                      {' · '}{property.floorCount} {property.floorCount === 1 ? 'floor' : 'floors'}
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
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(property.id)}
                        className="inline-flex items-center gap-1.5 font-sans font-bold text-blue-700 hover:text-blue-900 dark:text-blue-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        View / edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPropertyToDelete(property)}
                        disabled={deletingPropertyId !== null}
                        aria-label={`Delete ${property.name}`}
                        title="Soft-delete property"
                        className="inline-flex items-center gap-1.5 font-sans font-bold text-rose-700 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
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
        <section aria-labelledby="property-editor-title" className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 id="property-editor-title" className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
              <Building2 className="h-5 w-5" />
              {editorMode === 'create'
                ? 'Create property'
                : editorMode === 'edit'
                  ? 'Edit property'
                  : 'Property details'}
            </h2>
            <div className="flex items-center">
              <BackLinkButton onClick={closeEditor}>
                Back to properties
              </BackLinkButton>
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
            <LoadingIndicator label="Loading property details" className="py-4" />
          ) : (
            <form onSubmit={saveProperty} className="flex w-full flex-col gap-4 font-mono">
              {editingId && (
                <section className={`${userSectionClass} md:col-span-2 lg:col-span-3`}>
                  <h3 className="col-span-full mb-1 text-base font-semibold text-slate-900 dark:text-white">Property inventory</h3>
                  <label className={userLabelClass}>
                    Rooms / suites
                    <input
                      readOnly
                      className={userInputClass}
                      value={inventoryCounts.roomCount}
                      aria-label="Total rooms and suites"
                    />
                  </label>
                  <label className={userLabelClass}>
                    Total beds
                    <input
                      readOnly
                      className={userInputClass}
                      value={inventoryCounts.bedCount}
                      aria-label="Total configured beds"
                    />
                  </label>
                  <label className={userLabelClass}>
                    Available beds
                    <input
                      readOnly
                      className={userInputClass}
                      value={inventoryCounts.availableBedCount}
                      aria-label="Available beds"
                    />
                  </label>
                  <p className="col-span-full text-xs font-normal text-slate-500 dark:text-slate-400">
                    Inventory is managed separately and cannot be changed here.
                  </p>
                </section>
              )}
              <fieldset className={`${userSectionClass} md:col-span-2 lg:col-span-3`}>
                <legend className="col-span-full mb-1 text-base font-semibold text-slate-900 dark:text-white">Property information</legend>
                <div className="col-span-full grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className={userLabelClass}>
                    <span>Name <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required maxLength={128} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
                  </label>
                  <label className={userLabelClass}>
                    <span>Type <span className="text-red-600" aria-hidden="true">*</span></span>
                    <select required disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.type} onChange={(e) => {
                      updateField('type', e.target.value);
                      if (!hostelTypes.includes(e.target.value)) updateField('hasMessFacility', false);
                    }}>
                      {propertyTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
                    </select>
                  </label>
                  <label className={userLabelClass}>
                    <span>Floors <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required type="number" min={0} max={100} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.floors} onChange={(e) => updateField('floors', Number(e.target.value))} />
                  </label>
                </div>
                <label className={`${userLabelClass} col-span-full`}>
                  <span>Address <span className="text-red-600" aria-hidden="true">*</span></span>
                  <input required maxLength={255} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.address} onChange={(e) => updateField('address', e.target.value)} />
                </label>
                <div className="col-span-full grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className={userLabelClass}>
                    <span>City <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required maxLength={128} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.city} onChange={(e) => updateField('city', e.target.value)} />
                  </label>
                  <label className={userLabelClass}>
                    <span>State <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required maxLength={128} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.state} onChange={(e) => updateField('state', e.target.value)} />
                  </label>
                  <label className={userLabelClass}>
                    <span>Postal code <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required maxLength={32} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.pincode} onChange={(e) => updateField('pincode', e.target.value)} />
                  </label>
                </div>
                <div className="col-span-full grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className={userLabelClass}>
                    <span>Contact phone <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required type="tel" maxLength={32} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.contactPhone} onChange={(e) => updateField('contactPhone', e.target.value)} />
                  </label>
                  <label className={userLabelClass}>
                    Contact email
                    <input type="email" maxLength={255} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.contactEmail} onChange={(e) => updateField('contactEmail', e.target.value)} />
                  </label>
                  <label className={userLabelClass}>
                    Status
                    <select disabled={editorMode !== 'edit' || isSaving} className={userInputClass} value={form.status} onChange={(e) => updateField('status', e.target.value)}>
                      {propertyStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <div className="col-span-full grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label className={userLabelClass}>
                    <span>Currency <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required minLength={3} maxLength={3} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.currency} onChange={(e) => updateField('currency', e.target.value.toUpperCase())} />
                  </label>
                  <label className={userLabelClass}>
                    <span>Time zone <span className="text-red-600" aria-hidden="true">*</span></span>
                    <input required maxLength={64} disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.timezone} onChange={(e) => updateField('timezone', e.target.value)} />
                  </label>
                  <label className={userLabelClass}>
                    Facilities
                    <input disabled={editorMode === 'view' || isSaving} className={userInputClass} value={form.facilities} onChange={(e) => updateField('facilities', e.target.value)} />
                  </label>
                </div>
              </fieldset>
              {hostelTypes.includes(form.type) && (
                <fieldset
                  className={`w-full ${userSectionClass} md:col-span-2 lg:col-span-3`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                      event.preventDefault();
                    }
                  }}
                >
                  <legend className="col-span-full mb-1 flex w-full flex-wrap items-center justify-between gap-3 text-base font-semibold text-slate-900 dark:text-white">
                    <span>Property fee configuration</span>
                    {(editorMode === 'create' || editorMode === 'edit') && (
                      <label className="flex items-center gap-2 text-xs font-semibold">
                        Add fee
                        <select
                          value=""
                          disabled={isSaving}
                          onChange={(event) => {
                            if (event.target.value) addFeeDraft(event.target.value as FeeType);
                          }}
                          className="border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="">Select fee type</option>
                          {feeTypes
                            .filter(
                              (fee) =>
                                !(editorMode === 'create' && fee.value === 'UNIT_FEE') &&
                                !feeConfigs.some((config) => config.feeType === fee.value) &&
                                !newFees.some((draft) => draft.feeType === fee.value),
                            )
                            .map((fee) => (
                              <option key={fee.value} value={fee.value}>{fee.name}</option>
                            ))}
                        </select>
                      </label>
                    )}
                  </legend>
                  <p className="col-span-full text-xs font-normal text-slate-500 dark:text-slate-400">
                    Hostel Rent is included by default
                  </p>
                  {feeConfigs.length === 0 && newFees.length === 0 && editingId ? (
                    <p className="col-span-full text-xs text-slate-500">No fee types configured yet.</p>
                  ) : (
                    <div className="col-span-full w-full divide-y divide-slate-200 dark:divide-slate-700">
                      {feeConfigs.map((fee) => (
                        <div key={fee.feeType} className="grid w-full grid-cols-1 items-end gap-3 py-4 md:grid-cols-[minmax(9rem,1fr)_repeat(3,minmax(0,1.35fr))_auto]">
                          <div className="min-w-0">
                            <p className="font-sans text-sm font-semibold text-slate-900 dark:text-white">{fee.name}</p>
                            <p className="mt-1 font-mono text-[11px] text-slate-500">{fee.feeType}</p>
                            {fee.feeType === 'UNIT_FEE' && (
                              <span className="mt-1 inline-block text-[11px] font-medium text-blue-700 dark:text-blue-300">
                                Included by default
                              </span>
                            )}
                          </div>
                          {editorMode === 'edit' ? (
                            <>
                              <label className={`min-w-0 space-y-1 text-xs font-semibold ${isAssignmentFee(fee.feeType) ? 'md:col-span-3' : ''}`}>
                                Display name
                                <input
                                  required
                                  maxLength={128}
                                  disabled={isSaving}
                                  className={inputClass}
                                  value={fee.name}
                                  onChange={(event) =>
                                    updateFeeConfig(fee.feeType, (item) => ({
                                      ...item,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              {isMeteredFee(fee.feeType) ? (
                                <>
                                  <label className="min-w-0 space-y-1 text-xs font-semibold">
                                    Rate per unit ({form.currency})
                                    <input
                                      required
                                      type="number"
                                      min="0.0001"
                                      step="0.0001"
                                      disabled={isSaving}
                                      className={inputClass}
                                      value={fee.ratePerUnit ?? ''}
                                      onChange={(event) =>
                                        updateFeeConfig(fee.feeType, (item) => ({
                                          ...item,
                                          ratePerUnit: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className="min-w-0 space-y-1 text-xs font-semibold">
                                    Meter unit
                                    <input
                                      required
                                      maxLength={32}
                                      disabled={isSaving}
                                      className={inputClass}
                                      value={fee.unitOfMeasure || ''}
                                      placeholder={fee.feeType === 'WATER_CHARGE' ? 'LITER' : 'KWH'}
                                      onChange={(event) =>
                                        updateFeeConfig(fee.feeType, (item) => ({
                                          ...item,
                                          unitOfMeasure: event.target.value.toUpperCase(),
                                        }))
                                      }
                                    />
                                  </label>
                                </>
                              ) : isAssignmentFee(fee.feeType) ? (
                                null
                              ) : (
                                <label className="min-w-0 space-y-1 text-xs font-semibold md:col-span-2">
                                  Fixed amount ({form.currency})
                                  <input
                                    required={
                                      dirtyFeeTypes.has(fee.feeType) ||
                                      Number(fee.amount ?? 0) > 0
                                    }
                                    type="number"
                                    min={dirtyFeeTypes.has(fee.feeType) ? '0.01' : '0'}
                                    step="0.01"
                                    disabled={isSaving}
                                    className={inputClass}
                                    value={fee.amount ?? ''}
                                    onChange={(event) =>
                                      updateFeeConfig(fee.feeType, (item) => ({
                                        ...item,
                                        amount: event.target.value,
                                      }))
                                    }
                                  />
                                </label>
                              )}
                            </>
                          ) : (
                            <p className="font-sans text-sm font-medium text-slate-700 dark:text-slate-200 md:col-span-4">
                              {isAssignmentFee(fee.feeType)
                                ? 'Included by default'
                                : isMeteredFee(fee.feeType)
                                  ? `${fee.ratePerUnit ?? '—'} ${form.currency}/${fee.unitOfMeasure || (fee.feeType === 'WATER_CHARGE' ? 'LITER' : 'KWH')}`
                                  : `${fee.amount ?? '—'} ${form.currency}`}
                            </p>
                          )}
                        </div>
                      ))}

                      {newFees.map((draftFee) => (
                        <div key={draftFee.feeType} className="grid w-full grid-cols-1 items-end gap-3 py-4 md:grid-cols-[minmax(9rem,1fr)_repeat(3,minmax(0,1.35fr))_auto]">
                          <div className="min-w-0">
                            <p className="font-sans text-sm font-semibold text-slate-900 dark:text-white">
                              {feeTypes.find((fee) => fee.value === draftFee.feeType)?.name}
                            </p>
                            <p className="mt-1 font-mono text-[11px] text-slate-500">{draftFee.feeType}</p>
                          </div>
                          <label className={`min-w-0 space-y-1 text-xs font-semibold ${isAssignmentFee(draftFee.feeType) ? 'md:col-span-3' : ''}`}>
                            Display name
                            <input
                              required
                              maxLength={128}
                              disabled={isSaving}
                              className={inputClass}
                              value={draftFee.name}
                              onChange={(event) =>
                                setNewFees((current) =>
                                  current.map((item) =>
                                    item.feeType === draftFee.feeType
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          {isMeteredFee(draftFee.feeType) ? (
                            <>
                              <label className="min-w-0 space-y-1 text-xs font-semibold">
                                Rate per unit ({form.currency})
                                <input
                                  required
                                  type="number"
                                  min="0.0001"
                                  step="0.0001"
                                  disabled={isSaving}
                                  className={inputClass}
                                  value={draftFee.ratePerUnit}
                                  onChange={(event) =>
                                    setNewFees((current) =>
                                      current.map((item) =>
                                        item.feeType === draftFee.feeType
                                          ? { ...item, ratePerUnit: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <label className="min-w-0 space-y-1 text-xs font-semibold">
                                Meter unit
                                <input
                                  required
                                  maxLength={32}
                                  disabled={isSaving}
                                  className={inputClass}
                                  value={draftFee.unitOfMeasure}
                                  onChange={(event) =>
                                    setNewFees((current) =>
                                      current.map((item) =>
                                        item.feeType === draftFee.feeType
                                          ? { ...item, unitOfMeasure: event.target.value.toUpperCase() }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>
                            </>
                          ) : isAssignmentFee(draftFee.feeType) ? (
                            null
                          ) : (
                            <label className="min-w-0 space-y-1 text-xs font-semibold md:col-span-2">
                              Fixed amount ({form.currency})
                              <input
                                required
                                type="number"
                                min="0.01"
                                step="0.01"
                                disabled={isSaving}
                                className={inputClass}
                                value={draftFee.amount}
                                onChange={(event) =>
                                  setNewFees((current) =>
                                    current.map((item) =>
                                      item.feeType === draftFee.feeType
                                        ? { ...item, amount: event.target.value }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            disabled={isSaving}
                            aria-label={`Remove ${draftFee.name}`}
                            title="Remove fee"
                            onClick={() =>
                              setNewFees((current) =>
                                current.filter((item) => item.feeType !== draftFee.feeType),
                              )
                            }
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-slate-800"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
              <div className="flex flex-wrap justify-end gap-3 pt-1 md:col-span-2 lg:col-span-3">
                {editorMode === 'view' && (
                  <>
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium dark:border-slate-600"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('edit')}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                  </>
                )}
                {editorMode !== 'view' && (
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {editorMode === 'edit' ? 'Save changes' : 'Create property'}
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      )}
      {propertyToDelete && (
        <ConfirmDialog
          title="Delete property?"
          description={`Delete ${propertyToDelete.name} (${propertyToDelete.code})? It will be removed from active property lists. Historical records will be retained.`}
          confirmLabel="Delete property"
          isConfirming={deletingPropertyId === propertyToDelete.id}
          onConfirm={() => void deleteProperty(propertyToDelete)}
          onCancel={() => setPropertyToDelete(null)}
        />
      )}
    </div>
  );
};
