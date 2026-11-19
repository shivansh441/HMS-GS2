import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { ArrowLeft, Filter, History, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { SortByOption, SortBySelect } from '../../components/ui/SortBySelect';
import { TablePagination } from '../../components/ui/TablePagination';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

type ReservationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITLISTED'
  | 'REJECTED'
  | 'CONVERTED'
  | 'CANCELLED'
  | 'NO_SHOW';

interface Reservation {
  id: string;
  requestCode: string;
  propertyId: string;
  primaryUserId: string | null;
  guestName: string;
  mobile: string;
  email: string | null;
  requestedCategory: string;
  requestedType: string;
  requestedSharingType: string | null;
  requestedQuantity: number;
  expectedCheckIn: string;
  expectedCheckOut: string | null;
  channelOrigin: string;
  status: ReservationStatus;
  createdAt: string;
}

interface ActiveStay {
  id: string;
  userId: string;
  propertyId: string;
  propertyName: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  unitNumber: string;
  unitType: string;
  unitCategory: string;
  expectedCheckIn: string;
  expectedCheckOut: string | null;
  actualCheckIn: string | null;
}

interface HistoryItem {
  id: string;
  requestCode: string;
  propertyId: string;
  propertyName?: string;
  guestName: string;
  mobile: string;
  email: string | null;
  requestedCategory: string;
  requestedType: string;
  requestedSharingType: string | null;
  requestedQuantity: number;
  expectedCheckIn: string;
  expectedCheckOut: string | null;
  channelOrigin: string;
  status: ReservationStatus | 'CHECKED_IN';
  createdAt: string;
  unitNumber: string | null;
}

type HistoryTab = 'ALL' | 'CONVERTED' | 'UNCONVERTED';
type HistorySort = 'A_TO_Z' | 'Z_TO_A' | 'NEWEST' | 'OLDEST';
const historyPageSize = 10;

const historySortOptions: SortByOption<HistorySort>[] = [
  { value: 'A_TO_Z', label: 'A to Z' },
  { value: 'Z_TO_A', label: 'Z to A' },
  { value: 'NEWEST', label: 'Newest first' },
  { value: 'OLDEST', label: 'Oldest first' },
];

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Reservation history failed to load.';
}

function formatDate(value: string | null) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString() : 'Open-ended';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export const ReservationHistoryPage: React.FC = () => {
  const { properties, selectedPropertyId } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeStays, setActiveStays] = useState<ActiveStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<HistoryTab>('ALL');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<HistorySort>('NEWEST');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const allItems: Reservation[] = [];
      let offset = 0;
      let total = 0;
      do {
        const { data } = await apiClient.get<{ items: Reservation[]; total: number }>('/reservations', {
          params: {
            ...(selectedPropertyId && selectedPropertyId !== 'ALL'
              ? { propertyId: selectedPropertyId }
              : {}),
            limit: 100,
            offset,
          },
        });
        allItems.push(...data.items);
        total = data.total;
        if (data.items.length === 0 && offset < total) {
          throw new Error('The reservation history returned an incomplete page.');
        }
        offset += data.items.length;
      } while (offset < total);
      const { data: activeStayItems } = await apiClient.get<ActiveStay[]>('/stay/assignments/active', {
        params: {
          includeHostelers: true,
          ...(selectedPropertyId && selectedPropertyId !== 'ALL'
            ? { propertyId: selectedPropertyId }
            : {}),
        },
      });
      setReservations(allItems);
      setActiveStays(activeStayItems);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, dateFrom, dateTo, search, selectedPropertyId, sortOrder]);

  const staysForReservation = (reservation: Reservation) => activeStays.filter((stay) =>
    reservation.status === 'CONVERTED' &&
    reservation.primaryUserId === stay.userId &&
    reservation.propertyId === stay.propertyId &&
    reservation.expectedCheckIn.slice(0, 10) === stay.expectedCheckIn.slice(0, 10),
  );
  const linkedStays = new Set(
    reservations
      .flatMap(staysForReservation)
      .map((stay) => stay.id),
  );
  const historyItems: HistoryItem[] = [
    ...reservations.map((reservation): HistoryItem => {
      const activeStay = staysForReservation(reservation)[0];
      return {
        ...reservation,
        propertyName: undefined,
        status: activeStay ? 'CHECKED_IN' : reservation.status,
        expectedCheckIn: activeStay?.expectedCheckIn || reservation.expectedCheckIn,
        expectedCheckOut: activeStay?.expectedCheckOut || reservation.expectedCheckOut,
        requestedCategory: activeStay?.unitCategory || reservation.requestedCategory,
        requestedType: activeStay?.unitType || reservation.requestedType,
        unitNumber: activeStay?.unitNumber || null,
      };
    }),
    ...activeStays
      .filter((stay) => !linkedStays.has(stay.id))
      .map((stay): HistoryItem => ({
        id: `stay-${stay.id}`,
        requestCode: 'Direct stay',
        propertyId: stay.propertyId,
        propertyName: stay.propertyName,
        guestName: stay.guestName || 'Guest',
        mobile: stay.guestPhone || '—',
        email: stay.guestEmail,
        requestedCategory: stay.unitCategory,
        requestedType: stay.unitType,
        requestedSharingType: null,
        requestedQuantity: 1,
        expectedCheckIn: stay.expectedCheckIn,
        expectedCheckOut: stay.expectedCheckOut,
        channelOrigin: 'WALK_IN',
        status: 'CHECKED_IN',
        createdAt: stay.actualCheckIn || stay.expectedCheckIn,
        unitNumber: stay.unitNumber,
      })),
  ].sort((a, b) => {
    if (a.status === 'CHECKED_IN' && b.status !== 'CHECKED_IN') return -1;
    if (a.status !== 'CHECKED_IN' && b.status === 'CHECKED_IN') return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const convertedCount = historyItems.filter((item) =>
    item.status === 'CONVERTED' || item.status === 'CHECKED_IN',
  ).length;
  const unconvertedCount = historyItems.length - convertedCount;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = historyItems
    .filter((item) => {
      const isConverted = item.status === 'CONVERTED' || item.status === 'CHECKED_IN';
      if (activeTab === 'CONVERTED' && !isConverted) return false;
      if (activeTab === 'UNCONVERTED' && isConverted) return false;
      const checkInDate = item.expectedCheckIn.slice(0, 10);
      if (dateFrom && checkInDate < dateFrom) return false;
      if (dateTo && checkInDate > dateTo) return false;
      if (normalizedSearch) {
        const propertyName = item.propertyName
          || properties.find((property) => property.id === item.propertyId)?.name
          || '';
        const searchableValues = [
          item.requestCode,
          item.guestName,
          item.mobile,
          item.email || '',
          propertyName,
        ];
        if (!searchableValues.some((value) => value.toLocaleLowerCase().includes(normalizedSearch))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'A_TO_Z') return a.guestName.localeCompare(b.guestName);
      if (sortOrder === 'Z_TO_A') return b.guestName.localeCompare(a.guestName);
      return sortOrder === 'NEWEST'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt);
    });
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / historyPageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * historyPageSize;
  const pageItems = visibleItems.slice(pageStart, pageStart + historyPageSize);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <Link
            to="/admin/reservations"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Reservations
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold uppercase tracking-wide">
            <History className="h-5 w-5" /> Reservation history
          </h1>
          <p className="mt-1 text-xs text-slate-500">All current and past reservations across your accessible properties.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadReservations()}
          disabled={loading}
          className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Reservation history filters">
        <span className="mr-2 flex items-center text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <Filter className="mr-1 h-3 w-3" /> Filters:
        </span>
        <div role="tablist" aria-label="Filter by conversion status" className="flex flex-wrap items-center gap-1.5">
          {([
            ['ALL', 'All', historyItems.length],
            ['CONVERTED', 'Converted', convertedCount],
            ['UNCONVERTED', 'Unconverted', unconvertedCount],
          ] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`inline-flex items-center gap-1.5 rounded-none border px-2.5 py-1 text-xs font-mono ${
                activeTab === tab
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-blue-600 dark:bg-blue-600'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {label}
              <span className="text-[10px] opacity-80">{count}</span>
            </button>
          ))}
        </div>
        <SortBySelect
          value={sortOrder}
          options={historySortOptions}
          onChange={setSortOrder}
        />
        <div className="flex shrink-0 items-center gap-1.5 text-xs font-mono text-slate-500">
          <span>Check-in</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="Check-in from"
            className="w-[135px] border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
          <span>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            aria-label="Check-in to"
            className="w-[135px] border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />
        </div>
        <div className="relative ml-auto w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search guest, phone or code..."
            aria-label="Search reservations"
            className="w-full rounded-none border border-slate-300 bg-white py-1.5 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {loading ? (
        <LoadingIndicator label="Loading reservation history" className="p-8" />
      ) : (
        <>
          <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3">Reservation / guest</th>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">Requested stay</th>
                <th className="px-3 py-3">Dates</th>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {pageItems.map((item) => {
                const property = properties.find((candidate) => candidate.id === item.propertyId);
                return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-3 py-3">
                      <p className="font-mono font-bold text-blue-700 dark:text-blue-300">{item.requestCode}</p>
                      <p className="mt-1 font-semibold">{item.guestName}</p>
                      <p className="text-slate-500">{item.mobile}{item.email ? ` · ${item.email}` : ''}</p>
                    </td>
                    <td className="px-3 py-3">{item.propertyName || property?.name || 'Unknown property'}</td>
                    <td className="px-3 py-3">
                      {item.requestedCategory} · {item.requestedSharingType
                        ? `${item.requestedSharingType} sharing`
                        : item.requestedType}
                      {item.requestedQuantity > 1 ? ` · ${item.requestedQuantity} units` : ''}
                      {item.unitNumber ? ` · Unit ${item.unitNumber}` : ''}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDate(item.expectedCheckIn)} – {formatDate(item.expectedCheckOut)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{statusLabel(item.channelOrigin)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block whitespace-nowrap border px-2 py-1 text-[10px] font-bold ${
                        item.status === 'CONVERTED' || item.status === 'CHECKED_IN'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : ['REJECTED', 'CANCELLED', 'NO_SHOW'].includes(item.status)
                            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                            : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
                      }`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visibleItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    No reservations match your search and date range.
                  </td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
          <TablePagination
            label="Reservation history"
            page={currentPage}
            pageCount={pageCount}
            pageSize={historyPageSize}
            totalItems={visibleItems.length}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
};
