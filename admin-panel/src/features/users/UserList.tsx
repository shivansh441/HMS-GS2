import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { User, UserListResponse } from '../../types';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Search, Filter, UserCheck, Eye, Plus, DoorOpen } from 'lucide-react';
import { UserEditor } from './UserEditor';
import {
  addressStringFromParts,
  emptyUserForm,
  formFromUser,
  guestPersonaForProperty,
  isPropertyCompatibleWithGuest,
} from './userForm';
import { userInputClass } from './userStyles';
import { ManagedUser, UserEditorMode, UserForm } from './userTypes';

interface DeskBed {
  id: string;
  unitNumber: string;
  status: string;
  category: string;
  sharingType: string | null;
  baseRateMonthly: number | string | null;
}

interface DeskRoom {
  id: string;
  unitNumber: string;
  type: string;
  category: string;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
  beds: DeskBed[];
}

interface DeskInventory {
  floors: Array<{ floorNumber: number; rooms: DeskRoom[] }>;
}

export const UserList: React.FC = () => {
  const { user: currentAdmin, selectedPropertyId, properties } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [primaryAdminId, setPrimaryAdminId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editorMode, setEditorMode] = useState<UserEditorMode>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [deskUser, setDeskUser] = useState<User | null>(null);
  const [deskPropertyId, setDeskPropertyId] = useState('');
  const [deskUnitId, setDeskUnitId] = useState('');
  const [deskCheckIn, setDeskCheckIn] = useState('');
  const [deskCheckOut, setDeskCheckOut] = useState('');
  const [deskAgreedRate, setDeskAgreedRate] = useState('');
  const [deskRateOverrideReason, setDeskRateOverrideReason] = useState('');
  const [deskInventory, setDeskInventory] = useState<DeskInventory | null>(null);
  const [deskLoading, setDeskLoading] = useState(false);
  const [deskSaving, setDeskSaving] = useState(false);
  const [deskError, setDeskError] = useState('');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const limit = 15;

  const isAdmin = currentAdmin?.role === 'ADMIN';
  const canCheckIn = isAdmin || (currentAdmin?.role === 'STAFF' && currentAdmin.staffRole === 'FRONT_DESK');
  const selectedCreateRole =
    roleFilter === 'ADMIN' || roleFilter === 'STAFF' || roleFilter === 'CUSTOMER'
      ? roleFilter
      : null;
  const guestProperties = properties.filter((property) =>
    isPropertyCompatibleWithGuest(property.type, userForm.customerPersona),
  );

  useEffect(() => {
    if (editorMode !== 'create' || !selectedPropertyId || selectedPropertyId === 'ALL') return;
    const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
    if (!selectedProperty) return;
    setUserForm((form) => {
      if (form.role === 'ADMIN') return form;
      if (
        form.role === 'CUSTOMER' &&
        !isPropertyCompatibleWithGuest(selectedProperty.type, form.customerPersona)
      ) return form;
      const propertyIds = Array.from(new Set([...form.propertyIds, selectedPropertyId]));
      return {
        ...form,
        propertyIds: form.role === 'CUSTOMER' ? [selectedPropertyId] : propertyIds,
        ...(form.role === 'CUSTOMER' ? { initialStayPropertyId: selectedPropertyId } : {}),
      };
    });
  }, [editorMode, selectedPropertyId, properties]);

  useEffect(() => {
    if (!deskUser || !deskPropertyId) {
      setDeskInventory(null);
      setDeskUnitId('');
      return;
    }
    let active = true;
    setDeskLoading(true);
    setDeskError('');
    apiClient.get<DeskInventory>(`/properties/${encodeURIComponent(deskPropertyId)}/units/matrix`)
      .then(({ data }) => {
        if (active) {
          setDeskInventory(data);
          setDeskUnitId('');
        }
      })
      .catch((error: any) => {
        if (active) setDeskError(error.response?.data?.error?.message || 'Unable to load available inventory.');
      })
      .finally(() => {
        if (active) setDeskLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deskUser, deskPropertyId]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      if (roleFilter !== 'ALL') {
        params.set('role', roleFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const res = await apiClient.get<UserListResponse>(`/admin/users?${params.toString()}`);
      setUsers(res.data.items);
      setPrimaryAdminId(res.data.primaryAdminId);
      setTotal(res.data.total);
    } catch (err: any) {
      console.error('Failed to fetch users', err);
      setUsers([]);
      setPrimaryAdminId(null);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search, selectedPropertyId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!selectedUserId || !editorMode || editorMode === 'create') return;
    let active = true;
    setEditorLoading(true);
    setEditorError(null);
    apiClient
      .get<ManagedUser>(`/admin/users/${encodeURIComponent(selectedUserId)}`)
      .then(({ data }) => {
        if (!active) return;
        setSelectedUser(data);
        setUserForm(formFromUser(data));
      })
      .catch((err: any) => {
        if (active) {
          setEditorError(err.response?.data?.error?.message || 'Unable to load user details.');
        }
      })
      .finally(() => {
        if (active) setEditorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedUserId, editorMode]);

  const handleRoleClick = (role: string) => {
    setRoleFilter(role);
    setCreateMenuOpen(false);
    setPage(0);
  };

  const openCreateUser = (role: UserForm['role']) => {
    const scopedPropertyId =
      selectedPropertyId && selectedPropertyId !== 'ALL' && properties.some((property) => property.id === selectedPropertyId)
        ? selectedPropertyId
        : '';
    const selectedProperty = properties.find((property) => property.id === scopedPropertyId);
    const guestPersona = selectedProperty
      ? guestPersonaForProperty(selectedProperty.type)
      : emptyUserForm.customerPersona;
    const guestPropertyId = selectedProperty
      && isPropertyCompatibleWithGuest(selectedProperty.type, guestPersona)
      ? scopedPropertyId
      : '';
    setSelectedUserId(null);
    setSelectedUser(null);
    setUserForm({
      ...emptyUserForm,
      role,
      customerPersona: role === 'CUSTOMER' ? guestPersona : '',
      propertyIds: role === 'ADMIN'
        ? []
        : role === 'CUSTOMER'
          ? (guestPropertyId ? [guestPropertyId] : [])
          : (scopedPropertyId ? [scopedPropertyId] : []),
      initialStayPropertyId: role === 'CUSTOMER' ? guestPropertyId : '',
      guestCount: 1,
      additionalGuests: [],
    });
    setActivationUrl(null);
    setEditorError(null);
    setCreateMenuOpen(false);
    setEditorMode('create');
  };

  const openUser = (target: User) => {
    setSelectedUserId(target.id);
    setSelectedUser(null);
    setActivationUrl(null);
    setEditorError(null);
    setEditorMode('view');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setSelectedUserId(null);
    setSelectedUser(null);
    setEditorError(null);
    setActivationUrl(null);
  };

  const toggleProperty = (propertyId: string) => {
    setUserForm((current) => ({
      ...current,
      propertyIds: current.propertyIds.includes(propertyId)
        ? current.propertyIds.filter((id) => id !== propertyId)
        : [...current.propertyIds, propertyId],
    }));
  };

  const saveUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditorSaving(true);
    setEditorError(null);
    setActivationUrl(null);
    const payload = {
      email: userForm.email.trim(),
      fullName: userForm.fullName.trim(),
      phone: userForm.phone.trim(),
      permanentAddress: addressStringFromParts(userForm) || null,
      gender: userForm.gender || null,
      dateOfBirth: userForm.dateOfBirth,
      ...(editorMode === 'create' || userForm.idDocumentNumber.trim()
        ? {
            idDocumentType: userForm.idDocumentType,
            idDocumentNumber: userForm.idDocumentNumber.trim(),
          }
        : {}),
      ...(editorMode === 'create' &&
      userForm.role === 'CUSTOMER' &&
      userForm.customerPersona === 'HOTEL_GUEST'
        ? {
            guestCount: userForm.guestCount,
            additionalGuests: userForm.additionalGuests.map((guest) => ({
              fullName: guest.fullName.trim(),
              dateOfBirth: guest.dateOfBirth,
              gender: guest.gender || null,
              email: guest.email.trim() || null,
              phone: guest.phone.trim() || null,
              permanentAddress: addressStringFromParts(guest) || null,
              idDocumentType: guest.idDocumentType,
              idDocumentNumber: guest.idDocumentNumber.trim(),
            })),
          }
        : {}),
      ...(editorMode !== 'create' &&
      userForm.role === 'CUSTOMER' &&
      userForm.customerPersona === 'HOTEL_GUEST'
        ? {
            additionalGuests: userForm.additionalGuests.map((guest) => ({
              ...(guest.id ? { id: guest.id } : {}),
              fullName: guest.fullName.trim(),
              dateOfBirth: guest.dateOfBirth || null,
              gender: guest.gender || null,
              email: guest.email.trim() || null,
              phone: guest.phone.trim() || null,
              permanentAddress: addressStringFromParts(guest) || null,
              idDocumentType: guest.idDocumentType,
              ...(guest.idDocumentNumber.trim()
                ? { idDocumentNumber: guest.idDocumentNumber.trim() }
                : {}),
            })),
          }
        : {}),
      ...(editorMode !== 'create' &&
      userForm.role === 'CUSTOMER' &&
      userForm.customerPersona === 'HOTEL_GUEST'
        ? { guestCount: userForm.guestCount }
        : {}),
      ...(editorMode === 'create' ? { role: userForm.role } : {}),
      ...(userForm.role === 'STAFF' ? { staffRole: userForm.staffRole } : {}),
      ...(userForm.role === 'STAFF' ? { propertyIds: userForm.propertyIds } : {}),
      ...(userForm.role === 'CUSTOMER' && editorMode === 'create'
        ? { propertyIds: userForm.initialStayPropertyId ? [userForm.initialStayPropertyId] : [] }
        : {}),
      ...(userForm.role === 'CUSTOMER'
        ? {
            customerPersona: userForm.customerPersona || undefined,
            emergencyContactPhone: userForm.emergencyContactPhone.trim() || null,
            occupation: userForm.occupation.trim() || null,
            initialStayPropertyId: userForm.initialStayPropertyId || null,
            stayStartDate: userForm.stayStartDate || null,
            stayEndDate: userForm.stayEndDate || null,
          }
        : {}),
    };
    try {
      if (editorMode === 'create') {
        const { data } = await apiClient.post<ManagedUser>('/admin/users', payload);
        setSelectedUser(data);
        setActivationUrl(data.activationUrl || null);
        setSelectedUserId(data.id);
        setUserForm(formFromUser(data));
        setEditorMode('view');
        setActionNotice('User created. Share the one-time setup link with them securely.');
      } else if (selectedUserId) {
        const { data } = await apiClient.patch<ManagedUser>(
          `/admin/users/${encodeURIComponent(selectedUserId)}`,
          payload,
        );
        setSelectedUser(data);
        setUserForm(formFromUser(data));
        setActivationUrl(data.activationUrl || null);
        setEditorMode('view');
        setActionNotice(
          data.activationUrl
            ? 'User updated. Their email changed; share the new setup link securely.'
            : 'User updated successfully.',
        );
      }
      await fetchUsers();
    } catch (err: any) {
      setEditorError(err.response?.data?.error?.message || 'Unable to save user account.');
    } finally {
      setEditorSaving(false);
    }
  };

  const runAction = async (target: User, action: 'deactivate' | 'force-logout' | 'reset-mfa' | 'reactivate' | 'resend-invite' | 'issue-reset-link') => {
    if (!isAdmin || !currentAdmin || target.id === currentAdmin.id) return;
    const labels = {
      deactivate: 'set this account inactive',
      'force-logout': 'force logout this admin',
      'reset-mfa': 'reset MFA for this user',
      reactivate: 'reactivate this account',
      'resend-invite': 'resend this activation invite',
      'issue-reset-link': 'resend an invite to this user',
    };
    if (!window.confirm(`Are you sure you want to ${labels[action]}?`)) return;

    setActionUserId(target.id);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await apiClient.post<{
        message: string;
        resetUrl?: string | null;
        activationUrl?: string | null;
      }>(
        `/admin/users/${encodeURIComponent(target.id)}/${action}`,
      );
      setActionNotice(response.data.message);
      if (action === 'issue-reset-link' && response.data.resetUrl) {
        console.log('Password reset link:', response.data.resetUrl);
      }
      if (action === 'resend-invite' && response.data.activationUrl) {
        console.log('New activation link:', response.data.activationUrl);
      }
      await fetchUsers();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || `Unable to ${labels[action]}.`);
    } finally {
      setActionUserId(null);
    }
  };

  const openDeskCheckIn = (target: User) => {
    const now = new Date();
    const localDateTime = (date: Date) =>
      new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setDeskUser(target);
    setDeskPropertyId(
      selectedPropertyId && selectedPropertyId !== 'ALL' && properties.some((property) => property.id === selectedPropertyId)
        ? selectedPropertyId
        : properties[0]?.id || '',
    );
    setDeskCheckIn(localDateTime(now));
    setDeskCheckOut('');
    setDeskAgreedRate('');
    setDeskRateOverrideReason('');
    setDeskError('');
  };

  const closeDeskCheckIn = () => {
    setDeskUser(null);
    setDeskInventory(null);
    setDeskError('');
  };

  const deskProperty = properties.find((property) => property.id === deskPropertyId);
  const deskIsHostel = Boolean(deskProperty && ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'].includes(deskProperty.type));
  const deskAvailableUnits = deskInventory?.floors.flatMap((floor) =>
    floor.rooms.flatMap((room) => {
      if (deskIsHostel) {
        return room.beds
          .filter((bed) => bed.status === 'AVAILABLE')
          .map((bed) => ({
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
    }),
  ) || [];
  const selectedDeskUnit = deskAvailableUnits.find((unit) => unit.id === deskUnitId);
  const deskHasRateOverride = Boolean(
    selectedDeskUnit &&
    deskAgreedRate !== '' &&
    selectedDeskUnit.standardRate != null &&
    Number(deskAgreedRate) !== Number(selectedDeskUnit.standardRate),
  );

  const submitDeskCheckIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deskUser || !deskProperty || !deskUnitId) return;
    setDeskSaving(true);
    setDeskError('');
    try {
      await apiClient.post('/stay/assignments', {
        unitId: deskUnitId,
        userId: deskUser.id,
        expectedCheckIn: new Date(deskCheckIn).toISOString(),
        ...(deskCheckOut ? { expectedCheckOut: new Date(deskCheckOut).toISOString() } : {}),
        billingStrategy: deskIsHostel ? 'RECURRING_MONTHLY' : 'PER_NIGHT_STAY',
        ...(deskAgreedRate ? { agreedRate: deskAgreedRate } : {}),
        ...(deskRateOverrideReason.trim()
          ? { rateOverrideReason: deskRateOverrideReason.trim() }
          : {}),
      });
      setActionNotice(`Walk-in check-in completed for ${deskUser.full_name || deskUser.email || 'guest'}.`);
      closeDeskCheckIn();
      await fetchUsers();
    } catch (error: any) {
      setDeskError(error.response?.data?.error?.message || 'Unable to complete walk-in check-in.');
    } finally {
      setDeskSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <div role="alert" className="border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-200">
          {actionError}
        </div>
      )}
      {actionNotice && (
        <div role="status" className="border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">
          {actionNotice}
        </div>
      )}
      {!editorMode && (
        <>
      {/* Title & Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
            User Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Scoped access control. {isAdmin ? 'Administrative directory access.' : 'Read-only users in your assigned property scope.'}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search email or name..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 rounded-none font-mono"
          />
        </div>
        {isAdmin && (
          <div className="relative flex shrink-0">
            <button
              type="button"
              onClick={() => selectedCreateRole ? openCreateUser(selectedCreateRole) : setCreateMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
              aria-haspopup={selectedCreateRole ? undefined : 'menu'}
              aria-expanded={selectedCreateRole ? undefined : createMenuOpen}
            >
              <Plus className="h-4 w-4" />
              {selectedCreateRole ? `Create ${selectedCreateRole === 'CUSTOMER' ? 'customer' : selectedCreateRole.toLowerCase()}` : 'Create'}
            </button>
            {!selectedCreateRole && (
              <>
                <button
                  type="button"
                  aria-label="Choose account type to create"
                  aria-haspopup="menu"
                  aria-expanded={createMenuOpen}
                  onClick={() => setCreateMenuOpen((open) => !open)}
                  className="border-l border-blue-500 bg-blue-700 px-2 text-white hover:bg-blue-800"
                >
                  <span aria-hidden="true">▾</span>
                </button>
                {createMenuOpen && (
                  <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-44 border border-slate-300 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {([
                      ['ADMIN', 'Create admin'],
                      ['STAFF', 'Create staff'],
                      ['CUSTOMER', 'Create customer'],
                    ] as const).map(([role, label]) => (
                      <button
                        key={role}
                        type="button"
                        role="menuitem"
                        onClick={() => openCreateUser(role)}
                        className="block w-full px-3 py-2 text-left text-xs font-bold uppercase text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center">
          <Filter className="w-3 h-3 mr-1" /> Filters:
        </span>

        <button
          onClick={() => handleRoleClick('ALL')}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            roleFilter === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          All Roles
        </button>

        {(['ADMIN', 'STAFF', 'CUSTOMER'] as const).map((role) => (
          <button
          key={role}
          onClick={() => handleRoleClick(role)}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            roleFilter === role
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          {role}
        </button>
        ))}

      </div>

      {/* Users Table */}
      {loading ? (
        <LoadingIndicator label="Loading scoped user records..." />
      ) : users.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No users match the active filter criteria within the selected property scope.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 font-semibold">User</th>
                <th className="py-2.5 px-3 font-semibold">Contact / Email</th>
                <th className="py-2.5 px-3 font-semibold">Role</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Security / MFA</th>
                <th className="py-2.5 px-3 font-semibold">Created</th>
                {canCheckIn && <th className="py-2.5 px-3 font-semibold">Desk check-in</th>}
                {isAdmin && <th className="py-2.5 px-3 font-semibold">Admin Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-mono">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                  <td className="py-2 px-3">
                    <div className="font-sans font-medium text-slate-900 dark:text-white">
                      {u.full_name || '—'}
                    </div>
                    <button
                      type="button"
                      onClick={() => openUser(u)}
                      className="mt-1 inline-flex items-center gap-1 text-[10px] font-sans font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </button>
                  </td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                    <div>{u.email || 'No email'}</div>
                    {u.phone && <div className="text-[11px] text-slate-500">{u.phone}</div>}
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
                      {u.role}
                      {u.staffRole ? ` (${u.staffRole})` : ''}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        u.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : u.status === 'PENDING_ACTIVATION'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                    {u.mfa_enabled ? (
                      <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-[11px]">
                        <UserCheck className="w-3.5 h-3.5 mr-1" /> MFA Active
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Password only</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  {canCheckIn && (
                    <td className="py-2 px-3">
                      {u.role === 'CUSTOMER' && u.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => openDeskCheckIn(u)}
                          className="inline-flex items-center gap-1 border border-blue-700 px-2 py-1 text-[10px] font-sans font-bold uppercase text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/30"
                        >
                          <DoorOpen className="h-3 w-3" />
                          Walk-in
                        </button>
                      ) : <span className="text-[10px] text-slate-400">—</span>}
                    </td>
                  )}
                  {isAdmin && (
                    <td className="py-2 px-3">
                      {u.id === currentAdmin?.id ? (
                        <span className="text-[10px] text-slate-400">Current account</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {u.status === 'PENDING_ACTIVATION' && (
                            <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'resend-invite')} className={actionButton}>
                              Resend invite
                            </button>
                          )}
                          {u.status !== 'INACTIVE' && u.status !== 'ARCHIVED' && (u.role !== 'ADMIN' || primaryAdminId === currentAdmin?.id) && (
                            <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'deactivate')} className={actionButton}>
                              Set inactive
                            </button>
                          )}
                          {u.status === 'ACTIVE' && (
                            <>
                              <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'issue-reset-link')} className={actionButton}>
                                Resend invite
                              </button>
                            </>
                          )}
                          {(u.status === 'SUSPENDED' || u.status === 'INACTIVE') && (u.role !== 'ADMIN' || primaryAdminId === currentAdmin?.id) && (
                            <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'reactivate')} className={actionButton}>
                              Reactivate
                            </button>
                          )}
                          {u.role === 'ADMIN' && u.status === 'ACTIVE' && primaryAdminId === currentAdmin?.id && (
                            <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'force-logout')} className={actionButton}>
                              Force logout
                            </button>
                          )}
                          {u.mfa_enabled && (
                            <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'reset-mfa')} className={actionButton}>
                              Reset MFA
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-mono">
              Showing {users.length} of {total} records
            </span>
            <div className="flex items-center space-x-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 rounded-none cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-mono">Page {page + 1}</span>
              <button
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 rounded-none cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {deskUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="desk-check-in-title"
            className="w-full max-w-2xl space-y-5 border border-slate-300 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="desk-check-in-title" className="text-base font-bold uppercase">Walk-in check-in</h2>
                <p className="mt-1 text-xs text-slate-500">{deskUser.full_name || deskUser.email}</p>
              </div>
              <button type="button" onClick={closeDeskCheckIn} className="text-xs font-bold uppercase text-slate-600 hover:text-slate-900">
                Cancel
              </button>
            </div>
            {deskError && (
              <div role="alert" className="border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                {deskError}
              </div>
            )}
            <form onSubmit={submitDeskCheckIn} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">
                Property *
                <select
                  required
                  value={deskPropertyId}
                  onChange={(event) => {
                    setDeskPropertyId(event.target.value);
                    setDeskUnitId('');
                  }}
                  className={userInputClass}
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name} · {property.type}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Available {deskIsHostel ? 'bed' : 'room / suite'} *
                <select
                  required
                  value={deskUnitId}
                  onChange={(event) => setDeskUnitId(event.target.value)}
                  disabled={!deskPropertyId || deskLoading || deskAvailableUnits.length === 0}
                  className={userInputClass}
                >
                  <option value="">{deskLoading ? 'Loading inventory…' : 'Select available unit'}</option>
                  {deskAvailableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}{unit.standardRate != null ? ` · standard ${unit.standardRate}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Check-in date and time *
                <input
                  required
                  type="datetime-local"
                  value={deskCheckIn}
                  onChange={(event) => setDeskCheckIn(event.target.value)}
                  className={userInputClass}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Expected check-out
                <input
                  type="datetime-local"
                  min={deskCheckIn}
                  value={deskCheckOut}
                  onChange={(event) => setDeskCheckOut(event.target.value)}
                  className={userInputClass}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold md:col-span-2">
                Agreed rate ({deskProperty?.currency || 'property currency'})
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={deskAgreedRate}
                  onChange={(event) => setDeskAgreedRate(event.target.value)}
                  placeholder="Leave blank to use the standard baseline rate"
                  className={userInputClass}
                />
                <span className="block font-normal text-slate-500">
                  Optional override for this offline assignment only; it does not change the public baseline rate.
                </span>
              </label>
              <label className="space-y-1 text-xs font-semibold md:col-span-2">
                Rate override reason {deskHasRateOverride ? '*' : '(required if different from standard)'}
                <input
                  required={deskHasRateOverride}
                  maxLength={2000}
                  value={deskRateOverrideReason}
                  onChange={(event) => setDeskRateOverrideReason(event.target.value)}
                  className={userInputClass}
                />
              </label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" onClick={closeDeskCheckIn} className="border border-slate-300 px-4 py-2 text-xs font-bold uppercase dark:border-slate-600">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deskSaving || deskLoading || !deskUnitId || (deskHasRateOverride && !deskRateOverrideReason.trim())}
                  className="inline-flex items-center gap-2 bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  {deskSaving ? 'Checking in…' : 'Complete check-in'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editorMode && (
        <UserEditor
          editorMode={editorMode}
          selectedUser={selectedUser}
          userForm={userForm}
          setUserForm={setUserForm}
          editorLoading={editorLoading}
          editorSaving={editorSaving}
          editorError={editorError}
          activationUrl={activationUrl}
          isAdmin={isAdmin}
          selectedPropertyId={selectedPropertyId}
          properties={properties}
          guestProperties={guestProperties}
          closeEditor={closeEditor}
          saveUser={saveUser}
          toggleProperty={toggleProperty}
          setEditorMode={setEditorMode}
        />
      )}
    </div>
  );
};

const actionButton =
  'px-2 py-1 border border-slate-400 dark:border-slate-600 text-[10px] uppercase font-mono hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded-none cursor-pointer';
