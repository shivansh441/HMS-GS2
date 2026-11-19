import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Banknote, ChevronDown, RefreshCw, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { BackLinkButton } from '../../components/ui/BackLinkButton';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { TablePagination } from '../../components/ui/TablePagination';

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
  assignedPropertyNames: string[];
  allProperties: boolean;
  baseMonthlySalary: number | string;
  joiningDate: string;
  advanceBalance: number | string;
  workedDays: number | null;
  totalDays: number;
  payableSalary: number | string | null;
  paymentStatus: 'PENDING' | 'PAID' | null;
  advanceDeduction: number | string;
  paidAmount: number | string | null;
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

interface EligibleStaffUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: 'ADMIN' | 'STAFF';
  staffRole: StaffRole | null;
}

interface EligibleStaffUsersResponse {
  items: EligibleStaffUser[];
  total: number;
}

const currentDate = new Date();
const currentMonth = currentDate.getMonth() + 1;
const currentYear = currentDate.getFullYear();
const payrollPageSize = 10;
const inputClass =
  'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-600 focus:outline-none font-mono rounded-none';
const periodSelectClass =
  'border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-700 hover:bg-slate-100 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const buttonClass =
  'inline-flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 font-mono rounded-none';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Staff operation failed.';
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
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [selectedSalaries, setSelectedSalaries] = useState<Record<string, string>>({});
  const [advanceAmounts, setAdvanceAmounts] = useState<Record<string, string>>({});
  const [eligibleUsers, setEligibleUsers] = useState<EligibleStaffUser[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<StaffMember[]>([]);
  const [salaryEdits, setSalaryEdits] = useState<Record<string, string>>({});
  const [editingAssignedSalaries, setEditingAssignedSalaries] = useState<Record<string, boolean>>({});
  const [eligibleUsersLoading, setEligibleUsersLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [workedDays, setWorkedDays] = useState<Record<string, string>>({});
  const [paymentStaff, setPaymentStaff] = useState<StaffMember | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [transactionReference, setTransactionReference] = useState('');
  const [deductAdvance, setDeductAdvance] = useState(false);
  const [advanceDeduction, setAdvanceDeduction] = useState('');
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [staffPage, setStaffPage] = useState(1);
  const salaryAssignmentRowCount = assignedStaff.length + eligibleUsers.length;
  const salaryAssignmentPageCount = Math.max(
    1,
    Math.ceil(salaryAssignmentRowCount / payrollPageSize),
  );
  const currentAssignmentPage = Math.min(assignmentPage, salaryAssignmentPageCount);
  const assignmentPageStart = (currentAssignmentPage - 1) * payrollPageSize;
  const assignmentPageEnd = assignmentPageStart + payrollPageSize;
  const visibleAssignedStaff = assignedStaff.slice(
    assignmentPageStart,
    Math.min(assignmentPageEnd, assignedStaff.length),
  );
  const visibleEligibleUsers = eligibleUsers.slice(
    Math.max(0, assignmentPageStart - assignedStaff.length),
    Math.max(0, assignmentPageEnd - assignedStaff.length),
  );
  const staffPageCount = Math.max(1, Math.ceil(staff.length / payrollPageSize));
  const currentStaffPage = Math.min(staffPage, staffPageCount);
  const visibleStaff = staff.slice(
    (currentStaffPage - 1) * payrollPageSize,
    currentStaffPage * payrollPageSize,
  );

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const { data } = await apiClient.get<StaffListResponse>('/staff', {
        params: { year, month },
      });
      setStaff(data.items);
      setSelectedAttendance({});
      setWorkedDays(
        Object.fromEntries(
          data.items.map((member) => [
            member.id,
            String(member.workedDays ?? member.totalDays),
          ]),
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

  useEffect(() => {
    setStaffPage(1);
  }, [year, month]);

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const yearOptions = Array.from(
    { length: Math.min(currentYear + 5, 9999) - 2000 + 1 },
    (_, index) => 2000 + index,
  );
  const payrollTotal = staff.reduce((total, member) => {
    const days = workedDays[member.id] === undefined
      ? member.workedDays ?? member.totalDays
      : Number(workedDays[member.id]);
    if (days == null || !Number.isFinite(days)) return total;
    return total + calculateProratedSalary(member.baseMonthlySalary, days, daysInMonth);
  }, 0);
  const selectedAttendanceCount = staff.filter(
    (member) => selectedAttendance[member.id] && member.paymentStatus !== 'PAID',
  ).length;
  const editedAssignedSalaryCount = assignedStaff.filter((member) =>
    editingAssignedSalaries[member.id] &&
    Number(salaryEdits[member.id] ?? member.baseMonthlySalary) !== Number(member.baseMonthlySalary),
  ).length;
  const selectedSalaryCount =
    Object.keys(selectedSalaries).length +
    assignedStaff.filter((member) => editingAssignedSalaries[member.id]).length;
  const salaryChangeCount = Object.keys(selectedSalaries).length + editedAssignedSalaryCount;
  const advanceIssueCount = Object.values(advanceAmounts).filter((amount) => amount.trim() !== '').length;
  const changeCount = salaryChangeCount + advanceIssueCount;
  const paymentWorkedDays = paymentStaff
    ? Number(paymentStaff.workedDays ?? workedDays[paymentStaff.id] ?? 0)
    : 0;
  const paymentGross = paymentStaff
    ? Number(
      paymentStaff.payableSalary ??
      calculateProratedSalary(paymentStaff.baseMonthlySalary, paymentWorkedDays, daysInMonth),
    )
    : 0;
  const maxAdvanceDeduction = paymentStaff
    ? Math.min(Number(paymentStaff.advanceBalance), paymentGross)
    : 0;
  const paymentNet = paymentGross - (deductAdvance ? Number(advanceDeduction || 0) : 0);

  const openSalaryAssignment = async () => {
    setAssignmentPage(1);
    setSelectedSalaries({});
    setAdvanceAmounts({});
    setEditingAssignedSalaries({});
    setEligibleUsers([]);
    setErrorMessage('');
    setAssignmentOpen(true);
    setEligibleUsersLoading(true);
    try {
      const [{ data: eligibleData }, { data: staffData }] = await Promise.all([
        apiClient.get<EligibleStaffUsersResponse>('/staff/eligible-users'),
        apiClient.get<StaffListResponse>('/staff'),
      ]);
      setEligibleUsers(eligibleData.items);
      setAssignedStaff(staffData.items);
      setSalaryEdits(
        Object.fromEntries(
          staffData.items.map((member) => [member.id, String(member.baseMonthlySalary)]),
        ),
      );
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setEligibleUsersLoading(false);
    }
  };

  const assignSalary = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    const assignments = Object.entries(selectedSalaries).map(([userId, baseMonthlySalary]) => ({
      userId,
      baseMonthlySalary,
    }));
    const salaryUpdates = assignedStaff
      .filter((member) =>
        editingAssignedSalaries[member.id] &&
        Number(salaryEdits[member.id] ?? member.baseMonthlySalary) !== Number(member.baseMonthlySalary),
      )
      .map((member) => ({
        staffId: member.id,
        baseMonthlySalary: salaryEdits[member.id] ?? String(member.baseMonthlySalary),
      }));
    const advanceIssues = Object.entries(advanceAmounts)
      .filter(([, amount]) => amount.trim() !== '')
      .map(([staffId, amount]) => ({ staffId, amount: amount.trim() }));
    if (assignments.length === 0 && salaryUpdates.length === 0 && advanceIssues.length === 0) {
      setErrorMessage('Select accounts, change a salary, or enter an advance to issue.');
      return;
    }
    if (assignments.some(({ baseMonthlySalary }) => !Number.isFinite(Number(baseMonthlySalary)) || Number(baseMonthlySalary) <= 0)) {
      setErrorMessage('Enter a valid monthly salary for every selected account.');
      return;
    }
    if (salaryUpdates.some(({ baseMonthlySalary }) => !Number.isFinite(Number(baseMonthlySalary)) || Number(baseMonthlySalary) <= 0)) {
      setErrorMessage('Enter a valid monthly salary for every selected staff member.');
      return;
    }
    if (advanceIssues.some(({ amount }) => !Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
      setErrorMessage('Enter a valid positive advance amount for every staff member.');
      return;
    }
    setAssignmentSaving(true);
    try {
      await apiClient.post('/staff/assign/bulk', { assignments, salaryUpdates, advanceIssues });
      await loadStaff();
      setAssignmentOpen(false);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setAssignmentSaving(false);
    }
  };

  const saveAttendance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedStaff = staff.filter(
      (member) => selectedAttendance[member.id] && member.paymentStatus !== 'PAID',
    );
    if (selectedStaff.length === 0) {
      setErrorMessage('Select at least one staff member to record attendance.');
      return;
    }
    const attendanceItems = selectedStaff.map((member) => ({
      staffId: member.id,
      workedDays: Number(workedDays[member.id] ?? member.workedDays ?? member.totalDays),
    }));
    const invalidItem = attendanceItems.find(({ staffId, workedDays: days }) => {
      const value = workedDays[staffId] ?? '';
      return value === '' || !Number.isInteger(days) || days < 0 || days > daysInMonth;
    });
    if (invalidItem) {
      setErrorMessage(`Enter whole worked days between 0 and ${daysInMonth} for every selected staff member.`);
      return;
    }

    setAttendanceSaving(true);
    setErrorMessage('');
    try {
      await apiClient.post('/staff/attendance/bulk', {
        year,
        month,
        items: attendanceItems,
      });
      await loadStaff();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setAttendanceSaving(false);
    }
  };

  const markPaid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentStaff) return;
    const deduction = deductAdvance ? Number(advanceDeduction) : 0;
    if (
      !Number.isFinite(deduction) ||
      deduction < 0 ||
      deduction > Number(paymentStaff.advanceBalance) ||
      deduction > paymentGross
    ) {
      setErrorMessage('Advance deduction must not exceed the outstanding balance or payable salary.');
      return;
    }
    setSavingId(paymentStaff.id);
    setErrorMessage('');
    try {
      await apiClient.post('/payroll/disburse', {
        staffId: paymentStaff.id,
        year,
        month,
        paymentStatus: 'PAID',
        paymentMode,
        advanceDeduction: deduction.toFixed(2),
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
      <div className="border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-800 font-mono">
        Payroll records are available to administrators only.
      </div>
    );
  }

  if (assignmentOpen) {
    return (
      <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-5 font-mono text-xs">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wider">Assign salary</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Assign salary to unassigned accounts or update an existing payroll profile.
            </p>
          </div>
          <BackLinkButton
            onClick={() => {
              setAssignmentOpen(false);
              setErrorMessage('');
            }}
          >
            Back to payroll
          </BackLinkButton>
        </div>

        {errorMessage && (
          <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="flex w-full flex-1 flex-col overflow-auto border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          {eligibleUsersLoading ? (
            <LoadingIndicator label="Loading eligible accounts" />
          ) : (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold uppercase">Staff salary assignments</h2>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Select an assigned staff member to edit salary, or select an unassigned account to add one.
                </p>
              </div>
              {assignedStaff.length === 0 && eligibleUsers.length === 0 ? (
                <div className="flex flex-col gap-4 border border-slate-200 p-4 dark:border-slate-700">
                  <p className="text-slate-600 dark:text-slate-300">
                    {errorMessage
                      ? 'Unable to load staff accounts.'
                      : 'No eligible accounts found. Add a staff or administrator account in the User Directory first.'}
                  </p>
                  {errorMessage ? (
                    <button type="button" onClick={() => void openSalaryAssignment()} className={buttonClass}>
                      Retry
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/users', { state: { openCreateUser: true, role: 'STAFF' } })}
                      className="inline-flex items-center gap-2 bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
                    >
                      Create staff in User Directory
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={assignSalary} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-slate-600 dark:text-slate-300">
                      Update existing salaries or select accounts to assign a salary.
                    </p>
                    <span className="font-bold">
                      {selectedSalaryCount} selected · {advanceIssueCount} advances entered
                    </span>
                  </div>
                  <div className="overflow-auto border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[1200px] border-collapse text-left text-xs">
                      <thead className="bg-slate-100 uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <tr>
                          <th className="p-3">Select</th>
                          <th className="p-3">Staff account</th>
                          <th className="p-3">Role</th>
                          <th className="p-3">Email</th>
                          <th className="p-3">Phone</th>
                          <th className="p-3">Account ID</th>
                          <th className="p-3">Monthly salary</th>
                          <th className="p-3">Advance balance / issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAssignedStaff.map((member) => {
                          const salaryValue = salaryEdits[member.id] ?? String(member.baseMonthlySalary);
                          const editingSalary = editingAssignedSalaries[member.id] === true;
                          return (
                            <tr key={member.id} className="border-t border-slate-200 dark:border-slate-700">
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={editingSalary}
                                  aria-label={`Edit salary for ${member.fullName}`}
                                  disabled={assignmentSaving}
                                  onChange={(event) => {
                                    const checked = event.currentTarget.checked;
                                    setEditingAssignedSalaries((current) => ({
                                      ...current,
                                      [member.id]: checked,
                                    }));
                                    if (!checked) {
                                      setSalaryEdits((current) => ({
                                        ...current,
                                        [member.id]: String(member.baseMonthlySalary),
                                      }));
                                    }
                                  }}
                                  className="h-4 w-4 accent-blue-700"
                                />
                              </td>
                              <td className="p-3 font-bold">{member.fullName || 'Unnamed account'}</td>
                              <td className="p-3">
                                {member.staffRole ? (
                                  <>
                                    <div>STAFF</div>
                                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                      {member.staffRole}
                                    </div>
                                  </>
                                ) : (
                                  'ADMIN'
                                )}
                              </td>
                              <td className="break-all p-3">{member.email || '—'}</td>
                              <td className="p-3">{member.phone || '—'}</td>
                              <td className="p-3 font-mono text-[10px]">{member.userId.slice(0, 8)}</td>
                              <td className="p-3">
                                {editingSalary ? (
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    required
                                    aria-label={`Monthly salary for ${member.fullName}`}
                                    value={salaryValue}
                                    onChange={(event) => setSalaryEdits((current) => ({
                                      ...current,
                                      [member.id]: event.target.value,
                                    }))}
                                    className={`${inputClass} min-w-36`}
                                    disabled={assignmentSaving}
                                  />
                                ) : (
                                  <span className="font-semibold">{formatCurrency(member.baseMonthlySalary)}</span>
                                )}
                              </td>
                              <td className="min-w-52 p-3">
                                <div className="mb-1 text-slate-500">
                                  Balance: {formatCurrency(member.advanceBalance)}
                                </div>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  aria-label={`Advance amount to issue to ${member.fullName}`}
                                  value={advanceAmounts[member.id] ?? ''}
                                  onChange={(event) => setAdvanceAmounts((current) => ({
                                    ...current,
                                    [member.id]: event.target.value,
                                  }))}
                                  className={`${inputClass} min-w-36`}
                                  placeholder="Issue advance"
                                  disabled={assignmentSaving}
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {visibleEligibleUsers.map((eligibleUser) => {
                          const selected = selectedSalaries[eligibleUser.id] !== undefined;
                          const atSelectionLimit = Object.keys(selectedSalaries).length >= 100;
                          return (
                            <tr
                              key={eligibleUser.id}
                              className={`border-t border-slate-200 dark:border-slate-700 ${selected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                            >
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  disabled={assignmentSaving || (!selected && atSelectionLimit)}
                                  aria-label={`Select ${eligibleUser.fullName}, account ${eligibleUser.id.slice(0, 8)}, for salary assignment`}
                                  onChange={(event) => {
                                    const checked = event.currentTarget.checked;
                                    setSelectedSalaries((current) => {
                                      if (checked) {
                                        return { ...current, [eligibleUser.id]: current[eligibleUser.id] ?? '' };
                                      }
                                      const next = { ...current };
                                      delete next[eligibleUser.id];
                                      return next;
                                    });
                                  }}
                                  className="h-4 w-4 accent-blue-700"
                                />
                              </td>
                              <td className="p-3 font-bold">{eligibleUser.fullName || 'Unnamed account'}</td>
                              <td className="p-3">
                                <div>{eligibleUser.role}</div>
                                {eligibleUser.staffRole && (
                                  <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                    {eligibleUser.staffRole}
                                  </div>
                                )}
                              </td>
                              <td className="break-all p-3">{eligibleUser.email || '—'}</td>
                              <td className="p-3">{eligibleUser.phone || '—'}</td>
                              <td className="p-3 font-mono text-[10px]">{eligibleUser.id.slice(0, 8)}</td>
                              <td className="p-3">
                                {selected ? (
                                  <input
                                    required
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={selectedSalaries[eligibleUser.id]}
                                    aria-label={`Monthly salary for ${eligibleUser.fullName}`}
                                    onChange={(event) => setSelectedSalaries((current) => ({
                                      ...current,
                                      [eligibleUser.id]: event.target.value,
                                    }))}
                                    className={`${inputClass} min-w-36`}
                                    disabled={assignmentSaving}
                                  />
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-3 text-slate-400">Assign salary first</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    label="Staff salary assignments"
                    page={currentAssignmentPage}
                    pageCount={salaryAssignmentPageCount}
                    pageSize={payrollPageSize}
                    totalItems={salaryAssignmentRowCount}
                    onPageChange={setAssignmentPage}
                  />
                  {eligibleUsers.length === 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-slate-500">No unassigned accounts are available.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/users', { state: { openCreateUser: true, role: 'STAFF' } })}
                        className="inline-flex items-center gap-2 bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
                      >
                        Create staff in User Directory
                      </button>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAssignmentOpen(false);
                        setErrorMessage('');
                      }}
                      className={buttonClass}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={assignmentSaving || changeCount === 0}
                      className="inline-flex items-center gap-2 bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      <Banknote className="h-4 w-4" />
                      Assign salary
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-mono text-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Staff & Payroll</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Staff profiles, monthly attendance, and prorated salary payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadStaff()} className={buttonClass} aria-label="Refresh staff">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void openSalaryAssignment()} className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800">
            <Banknote className="h-4 w-4" />
            Assign salary
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
          <div className="mt-2 text-2xl font-bold">{staff.length}<span className="ml-1 text-sm font-normal text-slate-500">total</span></div>
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

      <div className="flex flex-wrap items-center justify-between gap-3" role="group" aria-label="Payroll period filters">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Payroll period
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
            Month
            <select
              aria-label="Payroll month"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className={periodSelectClass}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {new Date(year, value - 1).toLocaleString('en', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
            Year
            <select
              aria-label="Payroll year"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className={periodSelectClass}
            >
              {yearOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <form onSubmit={saveAttendance} className="space-y-3">
          <table className="w-full min-w-[1200px] border-collapse text-left text-xs">
            <thead className="bg-slate-100 uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="p-3">Select</th>
                <th className="p-3">Staff</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Department / role</th>
                <th className="p-3">Assigned to</th>
                <th className="p-3">Monthly base</th>
                <th className="p-3">Worked days</th>
                <th className="p-3">Prorated salary</th>
                <th className="p-3">Payment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-500"><LoadingIndicator label="Loading staff" /></td></tr>
              ) : staff.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-500">No staff profiles in this property scope.</td></tr>
              ) : visibleStaff.map((member) => {
              const assignedPropertyNames = member.assignedPropertyNames ?? [];
              const workedDaysInput = workedDays[member.id] ??
                String(member.workedDays ?? member.totalDays);
              const selectedForAttendance = selectedAttendance[member.id] === true;
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
                <tr
                  key={member.id}
                  className={`border-t border-slate-200 align-top dark:border-slate-700 ${selectedForAttendance ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedForAttendance}
                      disabled={paid || attendanceSaving || (!selectedForAttendance && selectedAttendanceCount >= 100)}
                      aria-label={`Select ${member.fullName} to record worked days`}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedAttendance((current) => ({
                          ...current,
                          [member.id]: checked,
                        }));
                        if (!checked) {
                          setWorkedDays((current) => {
                            const next = { ...current };
                            if (member.workedDays == null) {
                              delete next[member.id];
                            } else {
                              next[member.id] = String(member.workedDays);
                            }
                            return next;
                          });
                        }
                      }}
                      className="h-4 w-4 accent-blue-700"
                    />
                  </td>
                  <td className="p-3">
                    <div className="font-bold">{member.fullName}</div>
                    <div className="mt-1 text-slate-500">ID {member.userId.slice(0, 8)}</div>
                  </td>
                  <td className="p-3">
                    <div>{member.email || 'No email'}</div>
                    <div className="mt-1 text-slate-500">{member.phone || 'No phone'}</div>
                  </td>
                  <td className="p-3">
                    <div>{member.department}</div>
                    <div className="mt-1 text-slate-500">{member.designation} · {member.staffRole || 'STAFF'}</div>
                  </td>
                  <td className="p-3">
                    {assignedPropertyNames.length === 0 ? (
                      <span className="text-slate-500">Unassigned</span>
                    ) : member.allProperties || assignedPropertyNames.length > 1 ? (
                      <details className="group relative">
                        <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-blue-700 dark:text-blue-400">
                          {member.allProperties
                            ? 'All properties'
                            : `${assignedPropertyNames.length} properties`}
                          <ChevronDown className="h-3.5 w-3.5" />
                        </summary>
                        <div className="absolute left-0 top-full z-20 mt-1 max-h-60 min-w-48 overflow-y-auto border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          {assignedPropertyNames.map((propertyName, index) => (
                            <div key={`${propertyName}-${index}`} className="py-1 text-slate-600 dark:text-slate-300">
                              {propertyName}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : (
                      assignedPropertyNames[0]
                    )}
                  </td>
                  <td className="p-3 font-semibold">{formatCurrency(member.baseMonthlySalary)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {selectedForAttendance ? (
                        <input
                          type="number"
                          aria-label={`Worked days for ${member.fullName}`}
                          required
                          min={0}
                          max={daysInMonth}
                          step={1}
                          value={workedDaysInput}
                          onChange={(event) => setWorkedDays((current) => ({ ...current, [member.id]: event.target.value }))}
                          className={`${inputClass} hide-number-spinner w-20`}
                          disabled={attendanceSaving}
                        />
                      ) : (
                        <span className="text-slate-600 dark:text-slate-300">{workedDaysInput || '—'}</span>
                      )}
                      <span className="text-slate-500">/ {daysInMonth}</span>
                    </div>
                  </td>
                  <td className="p-3 font-semibold">
                    {paid ? (
                      <div>
                        <div>Paid {formatCurrency(member.paidAmount ?? member.payableSalary)}</div>
                        {Number(member.advanceDeduction) > 0 && (
                          <div className="mt-1 text-[10px] font-normal text-slate-500">
                            Advance deducted: {formatCurrency(member.advanceDeduction)}
                          </div>
                        )}
                      </div>
                    ) : formatCurrency(
                      member.paymentStatus === 'PENDING' && !hasUnsavedAttendance
                        ? member.payableSalary
                        : estimatedPay,
                    )}
                  </td>
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
                          setDeductAdvance(false);
                          setAdvanceDeduction('');
                        }}
                        className="inline-flex items-center gap-1 bg-emerald-700 px-3 py-2 font-bold uppercase text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <Banknote className="h-4 w-4" />
                        Pay now
                      </button>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          <TablePagination
            label="Staff payroll"
            page={currentStaffPage}
            pageCount={staffPageCount}
            pageSize={payrollPageSize}
            totalItems={staff.length}
            onPageChange={setStaffPage}
          />
          <div className="flex items-center justify-between gap-3 p-3">
            <span className="text-slate-500">{selectedAttendanceCount} selected</span>
            <button
              type="submit"
              disabled={attendanceSaving || selectedAttendanceCount === 0}
              className="bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {attendanceSaving ? 'Saving attendance…' : 'Save attendance'}
            </button>
          </div>
        </form>
      </div>

      {paymentStaff && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={markPaid} className="w-full max-w-md space-y-4 border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Disburse salary</h2>
              <button type="button" onClick={() => setPaymentStaff(null)} aria-label="Close" className="p-1"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm">{paymentStaff.fullName} · {year}-{String(month).padStart(2, '0')}</p>
            <div className="border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="text-slate-500">Calculated for {paymentWorkedDays} worked days</div>
              <div className="mt-1 flex justify-between"><span>Gross salary</span><strong>{formatCurrency(paymentGross)}</strong></div>
              <div className="mt-1 flex justify-between"><span>Outstanding advance</span><strong>{formatCurrency(paymentStaff.advanceBalance)}</strong></div>
              {deductAdvance && (
                <label className="mt-3 block font-semibold">
                  Advance amount to deduct
                  <input
                    type="number"
                    min="0.01"
                    max={maxAdvanceDeduction}
                    step="0.01"
                    required
                    aria-label="Advance amount to deduct"
                    value={advanceDeduction}
                    onChange={(event) => setAdvanceDeduction(event.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deductAdvance}
                  disabled={maxAdvanceDeduction <= 0}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setDeductAdvance(checked);
                    setAdvanceDeduction(checked ? maxAdvanceDeduction.toFixed(2) : '');
                  }}
                  className="h-4 w-4 accent-blue-700"
                />
                Deduct advance from this salary
              </label>
              <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-base">
                <span>Net amount to pay</span><strong>{formatCurrency(paymentNet)}</strong>
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
