import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { PropertyLedgerPage } from '../properties/PropertyLedgerPage';
import { ActiveStaysBoard } from './ActiveStaysBoard';

const hostelPropertyTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
type StaysBillingTab = 'stays' | 'billing';

interface ActiveStayCounts {
  activeGuests: number;
  activeHostelers: number;
}

export const StaysAndBillingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StaysBillingTab>('stays');
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [activeStayCounts, setActiveStayCounts] = useState<ActiveStayCounts | null>(null);
  const { properties, selectedPropertyId, user } = useAuth();
  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId,
  );
  const isAllProperties = selectedPropertyId === 'ALL';
  const isHostelScope = hostelPropertyTypes.includes(selectedProperty?.type || '');
  const canViewLedger = user?.role === 'ADMIN'
    || (user?.role === 'STAFF' && user.staffRole === 'FRONT_DESK');
  const showStays = isAllProperties || !isHostelScope;
  const showLedger = canViewLedger && (isAllProperties || isHostelScope);
  const showTabs = isAllProperties && showStays && showLedger;
  const visibleTab = showTabs
    ? activeTab
    : showLedger && isHostelScope
      ? 'billing'
      : 'stays';
  const totalActiveOccupants = activeStayCounts
    ? activeStayCounts.activeGuests + activeStayCounts.activeHostelers
    : '—';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-xl font-bold uppercase tracking-wide">Stays &amp; Billing</h1>
        <button
          type="button"
          onClick={() => setRefreshSignal((signal) => signal + 1)}
          className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {isAllProperties && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="All-property active guest summary">
          <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Current active guests</p>
            <p className="mt-2 text-2xl font-bold">{activeStayCounts?.activeGuests ?? '—'}</p>
          </article>
          <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Current active hostelers</p>
            <p className="mt-2 text-2xl font-bold">{activeStayCounts?.activeHostelers ?? '—'}</p>
          </article>
          <article className="border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Total active guests and hostelers</p>
            <p className="mt-2 text-2xl font-bold">{totalActiveOccupants}</p>
          </article>
        </section>
      )}

      {showTabs && (
        <div role="tablist" aria-label="Stays and billing sections" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            role="tab"
            id="billing-counter-tab"
            aria-selected={activeTab === 'stays'}
            aria-controls="billing-counter-panel"
            onClick={() => setActiveTab('stays')}
            className={`border px-2.5 py-1 text-xs font-mono ${
              activeTab === 'stays'
                ? 'border-slate-900 bg-slate-900 text-white dark:border-blue-600 dark:bg-blue-600'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Billing Counter
          </button>
          <button
            type="button"
            role="tab"
            id="billing-tab"
            aria-selected={activeTab === 'billing'}
            aria-controls="billing-panel"
            onClick={() => setActiveTab('billing')}
            className={`border px-2.5 py-1 text-xs font-mono ${
              activeTab === 'billing'
                ? 'border-slate-900 bg-slate-900 text-white dark:border-blue-600 dark:bg-blue-600'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Fee Ledger
          </button>
        </div>
      )}

      {showTabs ? (
        <>
          <section
            role="tabpanel"
            id="billing-counter-panel"
            aria-labelledby="billing-counter-tab"
            hidden={activeTab !== 'stays'}
          >
            <ActiveStaysBoard
              refreshSignal={refreshSignal}
              showSummaryCards={false}
              onActiveStayCountsChange={setActiveStayCounts}
            />
          </section>
          <section
            role="tabpanel"
            id="billing-panel"
            aria-labelledby="billing-tab"
            hidden={activeTab !== 'billing'}
          >
            <PropertyLedgerPage refreshSignal={refreshSignal} showSummaryCards={false} />
          </section>
        </>
      ) : (
        <>
          {visibleTab === 'stays' && showStays && (
            <ActiveStaysBoard
              refreshSignal={refreshSignal}
              onActiveStayCountsChange={setActiveStayCounts}
            />
          )}
          {visibleTab === 'billing' && showLedger && (
            <PropertyLedgerPage refreshSignal={refreshSignal} />
          )}
        </>
      )}
    </div>
  );
};
