import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { CustomerPersona, User, UserListResponse } from '../../types';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Search, Filter, UserCheck, AlertTriangle, Eye, Pencil, Plus, Save, DoorOpen } from 'lucide-react';

type UserEditorMode = 'create' | 'view' | 'edit' | null;

interface ManagedUser extends User {
  propertyIds: string[];
  activationUrl?: string | null;
  idDocumentType: string | null;
  idDocumentLast4: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  permanentAddress: string | null;
  occupation: string | null;
  initialStay: {
    propertyId: string;
    startDate: string;
    endDate: string | null;
  } | null;
}

interface UserForm {
  email: string;
  username: string;
  fullName: string;
  phone: string;
  gender: string;
  idDocumentType: string;
  idDocumentNumber: string;
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
  staffRole: 'FRONT_DESK' | 'MAINTENANCE' | 'HOUSEKEEPING';
  propertyIds: string[];
  customerPersona: CustomerPersona | '';
  emergencyContactName: string;
  emergencyContactPhone: string;
  permanentAddress: string;
  occupation: string;
  initialStayPropertyId: string;
  stayStartDate: string;
  stayEndDate: string;
}

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

const emptyUserForm: UserForm = {
  email: '',
  username: '',
  fullName: '',
  phone: '',
  gender: '',
  idDocumentType: '',
  idDocumentNumber: '',
  role: 'CUSTOMER',
  staffRole: 'FRONT_DESK',
  propertyIds: [],
  customerPersona: 'HOTEL_GUEST',
  emergencyContactName: '',
  emergencyContactPhone: '',
  permanentAddress: '',
  occupation: '',
  initialStayPropertyId: '',
  stayStartDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  stayEndDate: '',
};

const formFromUser = (user: ManagedUser): UserForm => ({
  email: user.email || '',
  username: user.username || '',
  fullName: user.full_name || '',
  phone: user.phone || '',
  gender: user.gender || '',
  idDocumentType: '',
  idDocumentNumber: '',
  role: user.role,
  staffRole: user.staffRole || 'FRONT_DESK',
  propertyIds: user.propertyIds || [],
  customerPersona: user.customerPersona || '',
  emergencyContactName: user.emergencyContactName || '',
  emergencyContactPhone: user.emergencyContactPhone || '',
  permanentAddress: user.permanentAddress || '',
  occupation: user.occupation || '',
  initialStayPropertyId: user.initialStay?.propertyId || '',
  stayStartDate: user.initialStay?.startDate || '',
  stayEndDate: user.initialStay?.endDate || '',
});

const userInputClass =
  'w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-600 focus:outline-none disabled:opacity-70';

const isPropertyCompatibleWithGuest = (
  propertyType: string,
  persona: CustomerPersona | '',
) => {
  if (persona === 'HOTEL_GUEST') return propertyType === 'HOTEL';
  if (persona === 'HOSTEL_GUEST' || persona === 'HOSTELER') {
    return ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'].includes(propertyType);
  }
  return true;
};

const guestPersonaForProperty = (propertyType: string): CustomerPersona =>
  propertyType === 'HOTEL' ? 'HOTEL_GUEST' : 'HOSTELER';

export const UserList: React.FC = () => {
  const { user: currentAdmin, selectedPropertyId, properties } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [guestSubtypeFilter, setGuestSubtypeFilter] = useState<CustomerPersona | ''>('');
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
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
      if (guestSubtypeFilter) {
        params.set('guest_subtype', guestSubtypeFilter);
      }
      if (segmentFilter) {
        params.set('segment', segmentFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const res = await apiClient.get<UserListResponse>(`/admin/users?${params.toString()}`);
      setUsers(res.data.items);
      setTotal(res.data.total);
    } catch (err: any) {
      console.error('Failed to fetch users', err);
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, guestSubtypeFilter, segmentFilter, search, selectedPropertyId]);

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

  const handleSegmentClick = (segment: string | null) => {
    setSegmentFilter(segment);
    if (segment) {
      setRoleFilter('ALL');
    }
    setPage(0);
  };

  const handleRoleClick = (role: string) => {
    setRoleFilter(role);
    setGuestSubtypeFilter('');
    setSegmentFilter(null);
    setCreateMenuOpen(false);
    setPage(0);
  };

  const handleGuestSubtypeChange = (subtype: CustomerPersona | '') => {
    setGuestSubtypeFilter(subtype);
    setRoleFilter(subtype ? 'CUSTOMER' : 'ALL');
    setSegmentFilter(null);
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
      ...(userForm.username.trim() ? { username: userForm.username.trim() } : {}),
      gender: userForm.gender || null,
      ...(userForm.idDocumentNumber.trim()
        ? {
            idDocumentType: userForm.idDocumentType,
            idDocumentNumber: userForm.idDocumentNumber.trim(),
          }
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
            emergencyContactName: userForm.emergencyContactName.trim() || null,
            emergencyContactPhone: userForm.emergencyContactPhone.trim() || null,
            permanentAddress: userForm.permanentAddress.trim() || null,
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

  const runAction = async (target: User, action: 'force-logout' | 'reset-mfa' | 'suspend' | 'reactivate' | 'resend-invite' | 'issue-reset-link') => {
    if (!isAdmin || !currentAdmin || target.id === currentAdmin.id) return;
    const labels = {
      'force-logout': 'terminate all active sessions for this user',
      'reset-mfa': 'reset MFA for this user',
      suspend: 'suspend this account',
      reactivate: 'reactivate this account',
      'resend-invite': 'resend this activation invite',
      'issue-reset-link': 'send a password reset link to this user',
    };
    if (!window.confirm(`Are you sure you want to ${labels[action]}?`)) return;

    setActionUserId(target.id);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await apiClient.post<{ message: string }>(`/admin/users/${encodeURIComponent(target.id)}/${action}`);
      setActionNotice(response.data.message);
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
            placeholder="Search email, username..."
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
            roleFilter === 'ALL' && !segmentFilter
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

        <label className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
          Guest subtype
          <select
            value={guestSubtypeFilter}
            onChange={(event) => handleGuestSubtypeChange(event.target.value as CustomerPersona | '')}
            className="border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">All guest types</option>
            <option value="HOTEL_GUEST">Hotel guest</option>
            <option value="HOSTEL_GUEST">Hostel guest</option>
            <option value="HOSTELER">Hosteler</option>
          </select>
        </label>

        {/* Admin-only segment filter */}
        {isAdmin && (
          <button
            onClick={() => handleSegmentClick(segmentFilter === 'registered_no_booking' ? null : 'registered_no_booking')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-none border flex items-center space-x-1 ${
              segmentFilter === 'registered_no_booking'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            <span>Registered, no booking [ADMIN ONLY]</span>
          </button>
        )}
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
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      @{u.username || 'unknown'}
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
                      {u.customerPersona ? ` (${u.customerPersona.replaceAll('_', ' ')})` : ''}
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
                          {u.status === 'ACTIVE' && (
                            <>
                              <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'force-logout')} className={actionButton}>
                                Force logout
                              </button>
                              <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'issue-reset-link')} className={actionButton}>
                                Send reset link
                              </button>
                              <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'suspend')} className={actionButton}>
                                Suspend
                              </button>
                            </>
                          )}
                          {u.status === 'SUSPENDED' && (
                            <button type="button" disabled={actionUserId === u.id} onClick={() => runAction(u, 'reactivate')} className={actionButton}>
                              Reactivate
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
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" onClick={closeDeskCheckIn} className="border border-slate-300 px-4 py-2 text-xs font-bold uppercase dark:border-slate-600">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deskSaving || deskLoading || !deskUnitId}
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
          <section
            aria-labelledby="user-editor-title"
            className="border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 id="user-editor-title" className="text-base font-bold uppercase tracking-wide">
                  {editorMode === 'create'
                    ? 'Create account'
                    : editorMode === 'edit'
                      ? 'Edit account'
                      : 'User details'}
                </h2>
                {selectedUser && (
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    ID: {selectedUser.id} · {selectedUser.status}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="text-xs font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300"
              >
                Back to directory
              </button>
            </div>

            {editorError && (
              <div role="alert" className="mb-4 border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                {editorError}
              </div>
            )}
            {editorLoading ? (
              <LoadingIndicator label="Loading user details..." />
            ) : (
              <form onSubmit={saveUser} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold">
                  Full name <span className="text-red-600" aria-hidden="true">*</span>
                  <input
                    required
                    maxLength={128}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={userForm.fullName}
                    onChange={(event) => setUserForm((form) => ({ ...form, fullName: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Email <span className="text-red-600" aria-hidden="true">*</span>
                  <input
                    required
                    type="email"
                    maxLength={255}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={userForm.email}
                    onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Phone <span className="text-red-600" aria-hidden="true">*</span>
                  <input
                    required
                    minLength={5}
                    maxLength={32}
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={userForm.phone}
                    onChange={(event) => setUserForm((form) => ({ ...form, phone: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Username <span className="font-normal text-slate-500">(optional; generated if blank)</span>
                  <input
                    minLength={3}
                    maxLength={64}
                    pattern="[A-Za-z0-9_.-]{3,64}"
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={userForm.username}
                    onChange={(event) => setUserForm((form) => ({ ...form, username: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Account role <span className="text-red-600" aria-hidden="true">*</span>
                  <select
                    disabled={editorMode !== 'create' || editorSaving}
                    className={userInputClass}
                    value={userForm.role}
                    onChange={(event) => {
                      const role = event.target.value as UserForm['role'];
                      const scopedPropertyId =
                        selectedPropertyId && selectedPropertyId !== 'ALL' && properties.some((property) => property.id === selectedPropertyId)
                          ? selectedPropertyId
                          : '';
                      const scopedProperty = properties.find((property) => property.id === scopedPropertyId);
                      const customerPersona = scopedProperty
                        ? guestPersonaForProperty(scopedProperty.type)
                        : 'HOTEL_GUEST';
                      const guestPropertyId = scopedProperty
                        && isPropertyCompatibleWithGuest(scopedProperty.type, customerPersona)
                        ? scopedPropertyId
                        : '';
                      setUserForm((form) => ({
                        ...form,
                        role,
                        customerPersona: role === 'CUSTOMER' ? customerPersona : '',
                        propertyIds: role === 'ADMIN'
                          ? []
                          : role === 'CUSTOMER'
                            ? (guestPropertyId ? [guestPropertyId] : [])
                            : (scopedPropertyId ? [scopedPropertyId] : []),
                        emergencyContactName: '',
                        emergencyContactPhone: '',
                        permanentAddress: '',
                        occupation: '',
                        initialStayPropertyId: role === 'CUSTOMER' ? guestPropertyId : '',
                        stayStartDate: role === 'CUSTOMER' ? form.stayStartDate : '',
                        stayEndDate: '',
                      }));
                    }}
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="STAFF">Staff</option>
                    <option value="CUSTOMER">Customer</option>
                  </select>
                  {editorMode === 'create' && (
                    <span className="block font-normal text-slate-500">
                      Admins get all-property access. Staff need a staff role and property assignment. Guests need a subtype and initial stay.
                    </span>
                  )}
                </label>

                <label className="space-y-1 text-xs font-semibold">
                  Gender
                  <select
                    disabled={editorMode === 'view' || editorSaving}
                    className={userInputClass}
                    value={userForm.gender}
                    onChange={(event) => setUserForm((form) => ({ ...form, gender: event.target.value }))}
                  >
                    <option value="">Not provided</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="NON_BINARY">Non-binary</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <div className="space-y-1 text-xs font-semibold">
                  Government ID <span className="font-normal text-slate-500">(optional)</span>
                  {selectedUser?.idDocumentLast4 && (
                    <p className="font-normal text-slate-500">
                      Current: {selectedUser.idDocumentType || 'ID'} ending in {selectedUser.idDocumentLast4}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      disabled={editorMode === 'view' || editorSaving}
                      required={Boolean(userForm.idDocumentNumber)}
                      className={userInputClass}
                      value={userForm.idDocumentType}
                      onChange={(event) => setUserForm((form) => ({ ...form, idDocumentType: event.target.value }))}
                    >
                      <option value="">Document type</option>
                      <option value="NATIONAL_ID">National ID</option>
                      <option value="PASSPORT">Passport</option>
                      <option value="DRIVERS_LICENSE">Driver's license</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      type="password"
                      autoComplete="new-password"
                      maxLength={128}
                      disabled={editorMode === 'view' || editorSaving}
                      className={userInputClass}
                      placeholder={selectedUser?.idDocumentLast4 ? 'Enter to replace ID' : 'ID number'}
                      value={userForm.idDocumentNumber}
                      onChange={(event) => setUserForm((form) => ({ ...form, idDocumentNumber: event.target.value }))}
                    />
                  </div>
                </div>

                {userForm.role === 'CUSTOMER' && (
                  <>
                    <label className="space-y-1 text-xs font-semibold">
                      Guest subtype <span className="text-red-600" aria-hidden="true">*</span>
                      <select
                        required
                        disabled={editorMode === 'view' || editorSaving}
                        className={userInputClass}
                        value={userForm.customerPersona}
                        onChange={(event) =>
                          setUserForm((form) => {
                            const customerPersona = event.target.value as CustomerPersona;
                            const selectedProperty = properties.find(
                              (property) => property.id === form.initialStayPropertyId,
                            );
                            const keepSelectedProperty = selectedProperty
                              && isPropertyCompatibleWithGuest(selectedProperty.type, customerPersona);
                            return {
                              ...form,
                              customerPersona,
                              initialStayPropertyId: keepSelectedProperty ? form.initialStayPropertyId : '',
                              propertyIds: keepSelectedProperty ? [form.initialStayPropertyId] : [],
                            };
                          })
                        }
                      >
                        <option value="">Select guest subtype</option>
                        <option value="HOTEL_GUEST">Hotel guest</option>
                        <option value="HOSTEL_GUEST">Hostel guest</option>
                        <option value="HOSTELER">Hosteler</option>
                      </select>
                    </label>
                    <div className="border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                      The guest profile section below changes according to this subtype. ID details and conditional details are optional.
                    </div>
                    {userForm.customerPersona === 'HOSTEL_GUEST' && (
                      <>
                        <label className="space-y-1 text-xs font-semibold">
                          Emergency contact name
                          <input
                            maxLength={128}
                            disabled={editorMode === 'view' || editorSaving}
                            className={userInputClass}
                            value={userForm.emergencyContactName}
                            onChange={(event) => setUserForm((form) => ({ ...form, emergencyContactName: event.target.value }))}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold">
                          Emergency contact phone
                          <input
                            maxLength={32}
                            disabled={editorMode === 'view' || editorSaving}
                            className={userInputClass}
                            value={userForm.emergencyContactPhone}
                            onChange={(event) => setUserForm((form) => ({ ...form, emergencyContactPhone: event.target.value }))}
                          />
                        </label>
                      </>
                    )}
                    {userForm.customerPersona === 'HOSTELER' && (
                      <>
                        <label className="space-y-1 text-xs font-semibold md:col-span-2">
                          Permanent address
                          <textarea
                            maxLength={512}
                            disabled={editorMode === 'view' || editorSaving}
                            className={userInputClass}
                            rows={3}
                            value={userForm.permanentAddress}
                            onChange={(event) => setUserForm((form) => ({ ...form, permanentAddress: event.target.value }))}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold">
                          Occupation
                          <input
                            maxLength={128}
                            disabled={editorMode === 'view' || editorSaving}
                            className={userInputClass}
                            value={userForm.occupation}
                            onChange={(event) => setUserForm((form) => ({ ...form, occupation: event.target.value }))}
                          />
                        </label>
                      </>
                    )}
                    <fieldset className="grid grid-cols-1 gap-4 border border-slate-200 p-3 dark:border-slate-700 md:col-span-2 md:grid-cols-2">
                      <legend className="px-1 text-xs font-bold uppercase">Initial stay <span className="text-red-600" aria-hidden="true">*</span></legend>
                      <label className="space-y-1 text-xs font-semibold">
                        Property <span className="text-red-600" aria-hidden="true">*</span>
                        <select
                          required
                          disabled={editorMode === 'view' || editorSaving}
                          className={userInputClass}
                          value={userForm.initialStayPropertyId}
                          onChange={(event) =>
                            setUserForm((form) => ({ ...form, initialStayPropertyId: event.target.value }))
                          }
                        >
                          <option value="">Select property</option>
                          {guestProperties.map((property) => (
                            <option key={property.id} value={property.id}>{property.code} · {property.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-semibold">
                        Start date <span className="text-red-600" aria-hidden="true">*</span>
                        <input
                          required
                          type="date"
                          disabled={editorMode === 'view' || editorSaving}
                          className={userInputClass}
                          value={userForm.stayStartDate}
                          onChange={(event) => setUserForm((form) => ({ ...form, stayStartDate: event.target.value }))}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-semibold">
                        Expected end date <span className="font-normal text-slate-500">(optional)</span>
                        <input
                          type="date"
                          min={userForm.stayStartDate || undefined}
                          disabled={editorMode === 'view' || editorSaving}
                          className={userInputClass}
                          value={userForm.stayEndDate}
                          onChange={(event) => setUserForm((form) => ({ ...form, stayEndDate: event.target.value }))}
                        />
                      </label>
                    </fieldset>
                  </>
                )}

                {userForm.role === 'STAFF' && (
                  <label className="space-y-1 text-xs font-semibold">
                    Staff role <span className="text-red-600" aria-hidden="true">*</span>
                    <select
                      disabled={editorMode === 'view' || editorSaving}
                      className={userInputClass}
                      value={userForm.staffRole}
                      onChange={(event) =>
                        setUserForm((form) => ({
                          ...form,
                          staffRole: event.target.value as UserForm['staffRole'],
                        }))
                      }
                    >
                      <option value="FRONT_DESK">Front desk</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="HOUSEKEEPING">Housekeeping</option>
                    </select>
                  </label>
                )}

                {userForm.role === 'ADMIN' ? (
                  <div className="md:col-span-2 border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                    Admin accounts automatically have access to all properties.
                  </div>
                ) : userForm.role === 'STAFF' ? (
                  <fieldset className="space-y-2 md:col-span-2">
                    <legend className="text-xs font-semibold">
                      Staff property assignments <span className="text-red-600" aria-hidden="true">*</span>
                    </legend>
                    {properties.length === 0 ? (
                      <p className="text-xs text-slate-500">No properties are available to assign.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {properties.map((property) => (
                          <label
                            key={property.id}
                            className="flex items-center gap-2 border border-slate-200 p-2 text-xs dark:border-slate-700"
                          >
                            <input
                              type="checkbox"
                              disabled={editorMode === 'view' || editorSaving}
                              checked={userForm.propertyIds.includes(property.id)}
                              onChange={() => toggleProperty(property.id)}
                            />
                            <span>[{property.code}] {property.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ) : null}

                {activationUrl && (
                  <div className="space-y-2 border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30 md:col-span-2">
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      One-time account setup link. Share it securely; do not post it publicly.
                    </p>
                    <input
                      readOnly
                      aria-label="One-time account setup link"
                      className={userInputClass}
                      value={activationUrl}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 md:col-span-2">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="border border-slate-300 px-4 py-2 text-xs font-bold uppercase dark:border-slate-600"
                  >
                    Close
                  </button>
                  {editorMode === 'view' && isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditorMode('edit')}
                      className="inline-flex items-center gap-2 bg-slate-800 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {editorMode !== 'view' && isAdmin && (
                    <button
                      type="submit"
                      disabled={editorSaving}
                      className="inline-flex items-center gap-2 bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {editorSaving ? 'Saving…' : editorMode === 'create' ? 'Create account' : 'Save changes'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
      )}
    </div>
  );
};

const actionButton =
  'px-2 py-1 border border-slate-400 dark:border-slate-600 text-[10px] uppercase font-mono hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded-none cursor-pointer';
