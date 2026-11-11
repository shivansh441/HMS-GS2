import React, { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Receipt } from 'lucide-react';
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
  const { properties, selectedPropertyId, user } = useAuth();
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

  return (
    <div className="space-y-5">
      {property && (
        <Link
          to={`/properties/${encodeURIComponent(property.id)}/inventory`}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inventory
        </Link>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-mono text-slate-500">
            {property ? `${property.code} · ${property.type}` : 'PROPERTY FINANCE'}
          </p>
          <h1 className="mt-1 text-xl font-bold uppercase tracking-wide">
            {property ? `${property.name} fee ledger` : 'Fee ledger'}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Invoices, utility arrears, security deposit escrow, and payment receipts.
          </p>
        </div>
        {property && <Receipt className="h-6 w-6 text-blue-700" />}
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

      {canViewLedger && !activePropertyId && (
        <section className="grid gap-3 md:grid-cols-2">
          {availableProperties.map((item) => (
            <Link
              key={item.id}
              to={`/properties/${encodeURIComponent(item.id)}/fee-ledger`}
              className="border border-slate-200 bg-white p-4 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-xs font-mono text-slate-500">{item.code} · {item.type}</p>
              <p className="mt-1 text-sm font-bold">{item.name}</p>
              <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">Open fee ledger</p>
            </Link>
          ))}
          {availableProperties.length === 0 && (
            <p className="border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              No hostel or co-living properties are available in your property scope.
            </p>
          )}
        </section>
      )}

      {loading && <LoadingIndicator label="Loading property ledger" className="p-6" />}
      {canViewLedger && !loading && property && hostelTypes.includes(property.type) && (
        <PropertyLedger
          propertyId={property.id}
          currency={property.currency}
          canGenerate={user?.role === 'ADMIN'}
        />
      )}
      {canViewLedger && !loading && property && !hostelTypes.includes(property.type) && (
        <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Monthly hostel billing is not configured for this property type.
        </p>
      )}
    </div>
  );
};
