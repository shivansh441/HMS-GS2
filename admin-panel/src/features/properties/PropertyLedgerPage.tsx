import React, { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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

export const PropertyLedgerPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { properties, selectedPropertyId, setSelectedPropertyId, user } = useAuth();
  const canViewLedger = user?.role === 'ADMIN'
    || (user?.role === 'STAFF' && user.staffRole === 'FRONT_DESK');
  const activePropertyId = propertyId
    || (selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : '');
  const [property, setProperty] = useState<LedgerProperty | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      {property && (
        <Link
          to="/inventory"
          onClick={() => setSelectedPropertyId(property.id)}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inventory
        </Link>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-xl font-bold tracking-tight">
          {property ? `${property.name} fees` : 'Fee ledger'}
        </h1>
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
        <section key={item.id} className="space-y-3">
          {showingAllProperties && (
            <h2 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase dark:border-slate-800">
              {item.name}
            </h2>
          )}
          <PropertyLedger
            propertyId={item.id}
            propertyName={item.name}
            currency={item.currency}
            canRecordUtilities={user?.role === 'ADMIN' || (user?.role === 'STAFF' && user.staffRole === 'FRONT_DESK')}
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
