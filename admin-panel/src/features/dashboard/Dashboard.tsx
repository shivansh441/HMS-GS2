import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { UserListResponse } from '../../types';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Users, Building2, UserX, ShieldCheck, Hotel } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user, selectedPropertyId, properties } = useAuth();
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [activeGuests, setActiveGuests] = useState<number | null>(null);
  const [unassignedNoBooking, setUnassignedNoBooking] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        // Scoped user count
        const usersRes = await apiClient.get<UserListResponse>('/admin/users?limit=1');
        setTotalUsers(usersRes.data.total);

        // Guest count
        const customersRes = await apiClient.get<UserListResponse>('/admin/users?role=CUSTOMER&limit=1');
        setActiveGuests(customersRes.data.total);

        // Unassigned customer pool is restricted to admins.
        if (user?.role === 'ADMIN') {
          try {
            const noBookRes = await apiClient.get<UserListResponse>('/admin/users?segment=registered_no_booking&limit=1');
            setUnassignedNoBooking(noBookRes.data.total);
          } catch {
            setUnassignedNoBooking(null);
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard counts', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [user, selectedPropertyId]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
          System Overview & Metrics
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Real-time metrics scoped to authorized property tenant boundary: <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{selectedPropertyId === 'ALL' ? 'ALL ACCESSIBLE PROPERTIES' : selectedPropertyId || 'NO ASSIGNED PROPERTY'}</span>
        </p>
      </div>

      {loading ? (
        <LoadingIndicator label="Querying database metrics..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Scoped Users</span>
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">
              {totalUsers ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Active within current scope
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Authorized Properties</span>
              <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">
              {properties.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {user?.role === 'ADMIN' ? 'Organization access' : 'Explicitly assigned'}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Customers</span>
              <Hotel className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">
              {activeGuests ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Customer accounts within scope
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <span>Unassigned Pool</span>
              <UserX className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">
              {user?.role === 'ADMIN' ? (unassignedNoBooking ?? 0) : 'RESTRICTED'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {user?.role === 'ADMIN' ? 'Registered with no property link' : 'Admin visibility only'}
            </div>
          </div>
        </div>
      )}

      {/* Security & Tenant Scoping Notice */}
      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 p-4 text-xs space-y-2">
        <div className="flex items-center space-x-2 font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Tenant Boundary Enforcement</span>
        </div>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Property-scoped API reads are limited to the properties assigned to your account. Out-of-scope records are not available from this panel.
        </p>
      </div>
    </div>
  );
};
