import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { User, UserListResponse } from '../../types';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Search, Filter, Shield, UserCheck, AlertTriangle } from 'lucide-react';

export const UserList: React.FC = () => {
  const { user: currentAdmin, selectedPropertyId } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('ALL');
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 15;

  const isSuperAdmin = currentAdmin?.account_type === 'SUPER_ADMIN';

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      if (accountTypeFilter !== 'ALL') {
        params.set('account_type', accountTypeFilter);
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
  }, [page, accountTypeFilter, segmentFilter, search, selectedPropertyId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSegmentClick = (segment: string | null) => {
    setSegmentFilter(segment);
    if (segment) {
      setAccountTypeFilter('ALL');
    }
    setPage(0);
  };

  const handleTypeClick = (type: string) => {
    setAccountTypeFilter(type);
    setSegmentFilter(null);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      {/* Title & Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
            User Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Scoped access control. {isSuperAdmin ? 'Full tenant directory access.' : 'Showing users assigned to your property scope.'}
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
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center">
          <Filter className="w-3 h-3 mr-1" /> Filters:
        </span>

        <button
          onClick={() => handleTypeClick('ALL')}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            accountTypeFilter === 'ALL' && !segmentFilter
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          All Users
        </button>

        <button
          onClick={() => handleTypeClick('HOTEL_GUEST')}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            accountTypeFilter === 'HOTEL_GUEST'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          Hotel Guests
        </button>

        <button
          onClick={() => handleTypeClick('SHORT_TERM_HOSTEL_GUEST')}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            accountTypeFilter === 'SHORT_TERM_HOSTEL_GUEST'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          Hostel Guests
        </button>

        <button
          onClick={() => handleTypeClick('LONG_TERM_RESIDENT')}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            accountTypeFilter === 'LONG_TERM_RESIDENT'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          Residents
        </button>

        <button
          onClick={() => handleTypeClick('STAFF')}
          className={`px-2.5 py-1 text-xs font-mono rounded-none border ${
            accountTypeFilter === 'STAFF'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
          }`}
        >
          Staff Members
        </button>

        {/* Super Admin Only Segment Filter Chip */}
        {isSuperAdmin && (
          <button
            onClick={() => handleSegmentClick(segmentFilter === 'registered_no_booking' ? null : 'registered_no_booking')}
            className={`px-2.5 py-1 text-xs font-mono font-bold rounded-none border flex items-center space-x-1 ${
              segmentFilter === 'registered_no_booking'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            <span>Registered, no booking [Super Admin Only]</span>
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
                <th className="py-2.5 px-3 font-semibold">Account Type</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Security / MFA</th>
                <th className="py-2.5 px-3 font-semibold">Created</th>
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
                  </td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                    <div>{u.email || 'No email'}</div>
                    {u.phone && <div className="text-[11px] text-slate-500">{u.phone}</div>}
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600">
                      {u.account_type.replace(/_/g, ' ')}
                      {u.staff_role ? ` (${u.staff_role})` : ''}
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
    </div>
  );
};
