import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { useParams } from 'react-router-dom';
import { RefreshCw, UserRoundPlus } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { PropertyLedger } from './PropertyLedger';

interface LedgerProperty {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
  currency: string;
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load property.';
}

const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];

interface PropertyLedgerPageProps {
  onDeskCheckIn?: () => void;
  refreshSignal?: number;
}

export const PropertyLedgerPage: React.FC<PropertyLedgerPageProps> = ({
  onDeskCheckIn,
  refreshSignal = 0,
}) => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { properties, selectedPropertyId, user } = useAuth();
  const refreshers = useRef(new Map<string, () => Promise<void>>());
  const [refreshing, setRefreshing] = useState(false);
  const canViewLedger = user?.role === 'ADMIN'
    || (user?.role === 'STAFF' && user.staffRole === 'FRONT_DESK');
  const activePropertyId = propertyId
    || (selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : '');
  const [property, setProperty] = useState<LedgerProperty | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const registerRefresh = useCallback(
    (id: string, refresh: () => Promise<void>) => {
      refreshers.current.set(id, refresh);
      return () => {
        if (refreshers.current.get(id) === refresh) refreshers.current.delete(id);
      };
    },
    [],
  );

  const refreshLedgers = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([...refreshers.current.values()].map((refresh) => refresh()));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (refreshSignal > 0) void refreshLedgers();
  }, [refreshLedgers, refreshSignal]);

  useEffect(() => {
    if (!activePropertyId || !canViewLedger) {
      setProperty(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setProperty(null);
    setErrorMessage('');
    apiClient.get<LedgerProperty>(
      `/admin/properties/${encodeURIComponent(activePropertyId)}`,
    )
      .then(({ data }) => {
        if (active) setProperty(data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activePropertyId, canViewLedger]);

  const availableProperties = properties.filter(
    (item) => hostelTypes.includes(item.type),
  );
  const showingAllProperties = !propertyId && selectedPropertyId === 'ALL';
  const ledgerProperties = showingAllProperties
    ? availableProperties
    : property && hostelTypes.includes(property.type)
      ? [property]
      : [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">
            Fee ledger
          </h1>
          <p className="mt-1 text-xs text-slate-500">Manage hostel bills, payments, and utility readings.</p>
        </div>
        <div className="flex gap-2">
          {onDeskCheckIn && (
            <button
              type="button"
              onClick={onDeskCheckIn}
              className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800"
            >
              <UserRoundPlus className="h-4 w-4" /> Desk walk-in
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshLedgers()}
            disabled={refreshing || loading || ledgerProperties.length === 0}
            className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700 disabled:opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {!canViewLedger && (
        <p role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Only admins and front-desk staff can access the financial ledger.
        </p>
      )}

      {canViewLedger && showingAllProperties && availableProperties.length === 0 && (
        <p className="border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          No hostel or co-living properties are available in your property scope.
        </p>
      )}

      {loading && <LoadingIndicator label="Loading property ledger" className="p-6" />}
      {canViewLedger && !loading && ledgerProperties.map((item) => (
        <section key={item.id}>
          <PropertyLedger
            propertyId={item.id}
            propertyName={item.name}
            currency={item.currency}
            canRecordUtilities={user?.role === 'ADMIN' || (user?.role === 'STAFF' && user.staffRole === 'FRONT_DESK')}
            onRegisterRefresh={registerRefresh}
          />
        </section>
      ))}
      {canViewLedger && !loading && property && !hostelTypes.includes(property.type) && (
        <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Fee ledger is available only for hostel and co-living properties.
        </p>
      )}
    </div>
  );
};
