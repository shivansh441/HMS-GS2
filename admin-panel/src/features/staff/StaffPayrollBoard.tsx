import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Banknote, Pencil, Plus, RefreshCw, Users, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Property } from '../../types';

type PaymentMode = 'CASH' | 'BANK_TRANSFER' | 'UPI';
type StaffRole = 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING';

interface StaffMember {
  id: string;
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  staffRole: StaffRole | null;
  designation: string;
  department: string;
  propertyId: string;
  propertyName: string;
  baseMonthlySalary: number | string;
  joiningDate: string;
  isActive: boolean;
  workedDays: number | null;
  totalDays: number;
  payableSalary: number | string | null;
  paymentStatus: 'PENDING' | 'PAID' | null;
  paymentMode: PaymentMode | null;
  transactionReference: string | null;
  paymentDate: string | null;
}

interface StaffListResponse {
  items: StaffMember[];
  total: number;
  year: number;
  month: number;
}

interface StaffForm {
  email: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  idDocumentType: string;
  idDocumentNumber: string;
  staffRole: StaffRole;
  designation: string;
  department: string;
  propertyId: string;
  baseMonthlySalary: string;
  joiningDate: string;
}

const currentDate = new Date();
const currentMonth = currentDate.getMonth() + 1;
const currentYear = currentDate.getFullYear();
const inputClass =
  'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-600 focus:outline-none';
const buttonClass =
  'inline-flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Staff operation failed.';
}

function emptyStaffForm(propertyId: string): StaffForm {
  return {
    email: '',
    fullName: '',
    phone: '',
    dateOfBirth: '',
    idDocumentType: '',
    idDocumentNumber: '',
    staffRole: 'FRONT_DESK',
    designation: '',
    department: '',
    propertyId,
    baseMonthlySalary: '',
    joiningDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10),
  };
}

function formatCurrency(value: number | string | null) {
  return value == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));
}

function calculateProratedSalary(baseSalary: number | string, workedDays: number, daysInMonth: number) {
  const baseCents = Math.round(Number(baseSalary) * 100);
  return Math.round((baseCents * workedDays) / daysInMonth) / 100;
}

export const StaffPayrollBoard: React.FC = () => {
  const { user, properties, selectedPropertyId } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState<StaffForm>(emptyStaffForm(''));
  const [activationUrl, setActivationUrl] = useState('');
  const [workedDays, setWorkedDays] = useState<Record<string, string>>({});
  const [paymentStaff, setPaymentStaff] = useState<StaffMember | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [transactionReference, setTransactionReference] = useState('');

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const { data } = await apiClient.get<StaffListResponse>('/staff', {
        params: { year, month },
      });
      setStaff(data.items);
      setWorkedDays(
        Object.fromEntries(
          data.items
            .filter((member) => member.workedDays != null)
            .map((member) => [member.id, String(member.workedDays)]),
        ),
      );
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const activeCount = staff.filter((member) => member.isActive).length;
  const selectableProperties = selectedPropertyId && selectedPropertyId !== 'ALL'
    ? properties.filter((property) => property.id === selectedPropertyId)
    : properties;
  const payrollTotal = staff.reduce((total, member) => {
    const days = workedDays[member.id] === undefined
      ? member.workedDays
      : Number(workedDays[member.id]);
    if (days == null || !Number.isFinite(days)) return total;
    return total + calculateProratedSalary(member.baseMonthlySalary, days, daysInMonth);
  }, 0);

  const openCreate = () => {
    const defaultProperty = selectedPropertyId && selectedPropertyId !== 'ALL'
      ? selectedPropertyId
      : properties[0]?.id || '';
    setEditingStaff(null);
    setStaffForm(emptyStaffForm(defaultProperty));
    setActivationUrl('');
    setErrorMessage('');
    setEditorOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditingStaff(member);
    setStaffForm({
      ...emptyStaffForm(member.propertyId),
      designation: member.designation,
      department: member.department,
      baseMonthlySalary: String(member.baseMonthlySalary),
    });
    setActivationUrl('');
    setErrorMessage('');
    setEditorOpen(true);
  };

  const saveStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    try {
      if (editingStaff) {
        await apiClient.put(`/staff/${encodeURIComponent(editingStaff.id)}`, {
          designation: staffForm.designation,
          department: staffForm.department,
          baseMonthlySalary: staffForm.baseMonthlySalary,
        });
        setEditorOpen(false);
      } else {
        const { data } = await apiClient.post('/staff', {
          ...staffForm,
          joiningDate: `${staffForm.joiningDate}T00:00:00Z`,
        });
        setActivationUrl(data.activationUrl);
      }
      await loadStaff();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const toggleActive = async (member: StaffMember) => {
    setSavingId(member.id);
    setErrorMessage('');
    try {
      await apiClient.put(`/staff/${encodeURIComponent(member.id)}`, {
        isActive: !member.isActive,
      });
      await loadStaff();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingId('');
    }
  };

  const saveAttendance = async (member: StaffMember) => {
    const days = Number(workedDays[member.id]);
    if (!Number.isInteger(days) || days < 0 || days > daysInMonth) {
      setErrorMessage(`Enter whole worked days between 0 and ${daysInMonth}.`);
      return;
    }
    setSavingId(member.id);
    setErrorMessage('');
    try {
      await apiClient.post(`/staff/${encodeURIComponent(member.id)}/attendance`, {
        year,
        month,
        workedDays: days,
      });
      await apiClient.post('/payroll/disburse', {
        staffId: member.id,
        year,
        month,
        paymentStatus: 'PENDING',
      });
      await loadStaff();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
      await loadStaff();
    } finally {
      setSavingId('');
    }
  };

  const markPaid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentStaff) return;
    setSavingId(paymentStaff.id);
    setErrorMessage('');
    try {
      await apiClient.post('/payroll/disburse', {
        staffId: paymentStaff.id,
        year,
        month,
        paymentStatus: 'PAID',
        paymentMode,
        ...(transactionReference.trim()
          ? { transactionReference: transactionReference.trim() }
          : {}),
      });
      setPaymentStaff(null);
      setTransactionReference('');
      await loadStaff();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingId('');
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-800">
        Payroll records are available to administrators only.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Staff & Payroll</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Manage staff profiles, monthly attendance, and prorated salary payments.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold">
            Month
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className={`${inputClass} mt-1`}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {new Date(year, value - 1).toLocaleString('en', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Year
            <input
              type="number"
              min="2000"
              max="9999"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className={`${inputClass} mt-1 w-28`}
            />
          </label>
          <button type="button" onClick={() => void loadStaff()} className={buttonClass} aria-label="Refresh staff">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800">
            <Plus className="h-4 w-4" />
            Add staff
          </button>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><Users className="h-4 w-4" /> Staff members</div>
          <div className="mt-2 text-2xl font-bold">{activeCount}<span className="ml-1 text-sm font-normal text-slate-500">active / {staff.length} total</span></div>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-xs font-bold uppercase text-slate-500">Prorated payroll estimate</div>
          <div className="mt-2 text-2xl font-bold">{formatCurrency(payrollTotal)}</div>
          <div className="mt-1 text-xs text-slate-500">{daysInMonth} calendar days in {year}-{String(month).padStart(2, '0')}</div>
        </div>
        <div className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-xs font-bold uppercase text-slate-500">Property scope</div>
          <div className="mt-2 text-sm font-semibold">
            {selectedPropertyId && selectedPropertyId !== 'ALL'
              ? properties.find((property) => property.id === selectedPropertyId)?.name || 'Selected property'
              : 'All authorized properties'}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
          <thead className="bg-slate-100 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="p-3">Staff</th>
              <th className="p-3">Department / Property</th>
              <th className="p-3">Monthly base</th>
              <th className="p-3">Worked days</th>
              <th className="p-3">Prorated salary</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Profile</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500"><LoadingIndicator label="Loading staff" /></td></tr>
            ) : staff.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">No staff profiles in this property scope.</td></tr>
            ) : staff.map((member) => {
              const workedDaysInput = workedDays[member.id] ??
                (member.workedDays == null ? '' : String(member.workedDays));
              const days = workedDaysInput === '' ? null : Number(workedDaysInput);
              const hasUnsavedAttendance =
                member.workedDays != null &&
                workedDays[member.id] !== undefined &&
                Number(workedDays[member.id]) !== member.workedDays;
              const estimatedPay = days == null || !Number.isFinite(days)
                ? null
                : calculateProratedSalary(member.baseMonthlySalary, days, daysInMonth);
              const paid = member.paymentStatus === 'PAID';
              return (
                <tr key={member.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                  <td className="p-3">
                    <div className="font-bold">{member.fullName}</div>
                    <div className="mt-1 text-slate-500">{member.designation} · {member.staffRole || 'STAFF'}</div>
                    <div className="mt-1 text-slate-500">{member.email || member.phone || '—'}</div>
                  </td>
                  <td className="p-3">
                    <div>{member.department}</div>
                    <div className="mt-1 text-slate-500">{member.propertyName}</div>
                  </td>
                  <td className="p-3 font-semibold">{formatCurrency(member.baseMonthlySalary)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        aria-label={`Worked days for ${member.fullName}`}
                        min={0}
                        max={daysInMonth}
                        step={1}
                        value={workedDaysInput}
                        onChange={(event) => setWorkedDays((current) => ({ ...current, [member.id]: event.target.value }))}
                        className={`${inputClass} w-20`}
                        disabled={paid}
                      />
                      <span className="text-slate-500">/ {daysInMonth}</span>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={paid || savingId === member.id || workedDaysInput === ''}
                        onClick={() => void saveAttendance(member)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                  <td className="p-3 font-semibold">{paid ? formatCurrency(member.payableSalary) : formatCurrency(estimatedPay)}</td>
                  <td className="p-3">
                    {paid ? (
                      <div>
                        <div className="font-bold text-emerald-700 dark:text-emerald-400">PAID · {member.paymentMode}</div>
                        {member.transactionReference && <div className="mt-1 text-slate-500">Ref: {member.transactionReference}</div>}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={member.workedDays == null || hasUnsavedAttendance || savingId === member.id}
                        onClick={() => {
                          setPaymentStaff(member);
                          setTransactionReference('');
                        }}
                        className="inline-flex items-center gap-1 bg-emerald-700 px-3 py-2 font-bold uppercase text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <Banknote className="h-4 w-4" />
                        Pay now
                      </button>
                    )}
                  </td>
                  <td className="p-3">
                    <div className={`mb-2 font-bold ${member.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                      {member.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEdit(member)} className={buttonClass} aria-label={`Edit ${member.fullName}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button type="button" onClick={() => void toggleActive(member)} disabled={savingId === member.id} className={buttonClass}>
                        {member.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveStaff} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingStaff ? 'Edit staff profile' : 'Create staff account'}</h2>
              <button type="button" onClick={() => setEditorOpen(false)} aria-label="Close" className="p-1"><X className="h-5 w-5" /></button>
            </div>
            {activationUrl ? (
              <div className="space-y-3">
                <p className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Staff account created. An activation invitation was sent to the email address.
                </p>
                <label className="block text-xs font-semibold">
                  Activation link
                  <input readOnly value={activationUrl} className={`${inputClass} mt-1`} onFocus={(event) => event.currentTarget.select()} />
                </label>
                <button type="button" onClick={() => setEditorOpen(false)} className="bg-blue-700 px-4 py-2 text-sm font-bold text-white">Done</button>
              </div>
            ) : (
              <>
                {!editingStaff && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold">Full name<input required maxLength={128} value={staffForm.fullName} onChange={(event) => setStaffForm({ ...staffForm, fullName: event.target.value })} className={`${inputClass} mt-1`} /></label>
                    <label className="text-xs font-semibold">Email<input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} className={`${inputClass} mt-1`} /></label>
                    <label className="text-xs font-semibold">Phone<input required minLength={5} maxLength={32} value={staffForm.phone} onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })} className={`${inputClass} mt-1`} /></label>
                    <label className="text-xs font-semibold">Date of birth<input required type="date" max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)} value={staffForm.dateOfBirth} onChange={(event) => setStaffForm({ ...staffForm, dateOfBirth: event.target.value })} className={`${inputClass} mt-1`} /></label>
                    <label className="text-xs font-semibold">Government ID type<select required value={staffForm.idDocumentType} onChange={(event) => setStaffForm({ ...staffForm, idDocumentType: event.target.value })} className={`${inputClass} mt-1`}><option value="">Select an ID type</option><option value="AADHAAR">Aadhaar</option><option value="PAN">PAN</option><option value="VOTER_ID">Voter ID</option><option value="PASSPORT">Passport</option><option value="DRIVING_LICENSE">Driving licence</option><option value="OTHER_GOVERNMENT_ID">Other government ID</option></select></label>
                    <label className="text-xs font-semibold">Government ID number<input required minLength={2} maxLength={128} value={staffForm.idDocumentNumber} onChange={(event) => setStaffForm({ ...staffForm, idDocumentNumber: event.target.value })} className={`${inputClass} mt-1`} /></label>
                    <label className="text-xs font-semibold">Staff role<select value={staffForm.staffRole} onChange={(event) => setStaffForm({ ...staffForm, staffRole: event.target.value as StaffRole })} className={`${inputClass} mt-1`}><option value="FRONT_DESK">Front desk</option><option value="MAINTENANCE">Maintenance</option><option value="HOUSEKEEPING">Housekeeping</option></select></label>
                    <label className="text-xs font-semibold">Property<select required value={staffForm.propertyId} onChange={(event) => setStaffForm({ ...staffForm, propertyId: event.target.value })} className={`${inputClass} mt-1`}><option value="">Select property</option>{selectableProperties.map((property: Property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                    <label className="text-xs font-semibold">Joining date<input required type="date" value={staffForm.joiningDate} onChange={(event) => setStaffForm({ ...staffForm, joiningDate: event.target.value })} className={`${inputClass} mt-1`} /></label>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">Designation<input required maxLength={100} value={staffForm.designation} onChange={(event) => setStaffForm({ ...staffForm, designation: event.target.value })} className={`${inputClass} mt-1`} /></label>
                  <label className="text-xs font-semibold">Department<input required maxLength={100} value={staffForm.department} onChange={(event) => setStaffForm({ ...staffForm, department: event.target.value })} className={`${inputClass} mt-1`} /></label>
                  <label className="text-xs font-semibold">Base monthly salary<input required type="number" min="0.01" step="0.01" value={staffForm.baseMonthlySalary} onChange={(event) => setStaffForm({ ...staffForm, baseMonthlySalary: event.target.value })} className={`${inputClass} mt-1`} /></label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditorOpen(false)} className={buttonClass}>Cancel</button>
                  <button type="submit" className="bg-blue-700 px-4 py-2 text-sm font-bold text-white">{editingStaff ? 'Save changes' : 'Create staff'}</button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {paymentStaff && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={markPaid} className="w-full max-w-md space-y-4 border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Disburse salary</h2>
              <button type="button" onClick={() => setPaymentStaff(null)} aria-label="Close" className="p-1"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm">{paymentStaff.fullName} · {year}-{String(month).padStart(2, '0')}</p>
            <div className="border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="text-slate-500">Calculated for {paymentStaff.workedDays ?? workedDays[paymentStaff.id] ?? 0} worked days</div>
              <div className="mt-1 text-xl font-bold">
                {formatCurrency(
                  calculateProratedSalary(
                    paymentStaff.baseMonthlySalary,
                    Number(paymentStaff.workedDays ?? workedDays[paymentStaff.id] ?? 0),
                    daysInMonth,
                  ),
                )}
              </div>
            </div>
            <label className="block text-xs font-semibold">Payment mode<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)} className={`${inputClass} mt-1`}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="UPI">UPI</option></select></label>
            <label className="block text-xs font-semibold">Transaction reference (optional)<input maxLength={100} value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} className={`${inputClass} mt-1`} /></label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPaymentStaff(null)} className={buttonClass}>Cancel</button>
              <button type="submit" disabled={savingId === paymentStaff.id} className="bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Mark as paid</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
