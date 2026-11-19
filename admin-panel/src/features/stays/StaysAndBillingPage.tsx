import React, { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { PropertyLedgerPage } from '../properties/PropertyLedgerPage';
import { ActiveStaysBoard } from './ActiveStaysBoard';
import { DeskCheckIn } from './DeskCheckIn';

const hostelPropertyTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
type StaysBillingTab = 'stays' | 'billing';
type DeskCheckInSource = 'stays' | 'billing';

export const StaysAndBillingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StaysBillingTab>('stays');
  const [deskCheckInOpen, setDeskCheckInOpen] = useState(false);
  const [deskCheckInSource, setDeskCheckInSource] = useState<DeskCheckInSource>('stays');
  const [ledgerRefreshSignal, setLedgerRefreshSignal] = useState(0);
  const [staysRefreshSignal, setStaysRefreshSignal] = useState(0);
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
  const openDeskCheckIn = (source: DeskCheckInSource) => {
    setDeskCheckInSource(source);
    setDeskCheckInOpen(true);
  };
  const completeDeskCheckIn = () => {
    if (deskCheckInSource === 'billing') {
      setLedgerRefreshSignal((signal) => signal + 1);
    } else {
      setStaysRefreshSignal((signal) => signal + 1);
    }
  };

  return (
    <div className="space-y-6">
      {showTabs && (
        <>
          <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
            <h1 className="text-xl font-bold uppercase tracking-wide">Stays &amp; Billing</h1>
          </header>
          <div role="tablist" aria-label="Stays and billing sections" className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              role="tab"
              id="active-stays-tab"
              aria-selected={activeTab === 'stays'}
              aria-controls="active-stays-panel"
              onClick={() => setActiveTab('stays')}
              className={`border-b-2 px-4 py-2 text-sm font-bold ${
                activeTab === 'stays'
                  ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Active Stays
            </button>
              <button
                type="button"
                role="tab"
                id="billing-tab"
                aria-selected={activeTab === 'billing'}
                aria-controls="billing-panel"
                onClick={() => setActiveTab('billing')}
                className={`border-b-2 px-4 py-2 text-sm font-bold ${
                  activeTab === 'billing'
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Fee Ledger
              </button>
            </div>
        </>
      )}
      {visibleTab === 'stays' && showStays && (
        showTabs ? (
            <section role="tabpanel" id="active-stays-panel" aria-labelledby="active-stays-tab">
              <ActiveStaysBoard
                onDeskCheckIn={() => openDeskCheckIn('stays')}
                refreshSignal={staysRefreshSignal}
              />
            </section>
        ) : (
            <ActiveStaysBoard
              onDeskCheckIn={() => openDeskCheckIn('stays')}
              refreshSignal={staysRefreshSignal}
            />
        )
      )}
      {visibleTab === 'billing' && showLedger && (
        showTabs ? (
            <section role="tabpanel" id="billing-panel" aria-labelledby="billing-tab">
              <PropertyLedgerPage
                onDeskCheckIn={() => openDeskCheckIn('billing')}
                refreshSignal={ledgerRefreshSignal}
              />
            </section>
        ) : (
            <PropertyLedgerPage
              onDeskCheckIn={() => openDeskCheckIn('billing')}
              refreshSignal={ledgerRefreshSignal}
            />
        )
      )}
      <DeskCheckIn
        open={deskCheckInOpen}
        propertyId={selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : undefined}
        propertyTypes={deskCheckInSource === 'billing' ? hostelPropertyTypes : undefined}
        onClose={() => setDeskCheckInOpen(false)}
        onAssigned={completeDeskCheckIn}
      />
    </div>
  );
};
