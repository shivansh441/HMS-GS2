import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Activity, Clock3, Globe2, MapPin, RefreshCw, Users } from 'lucide-react';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import {
  apiClient,
  getAccessToken,
  refreshAdminSession,
} from '../../lib/api';

interface ApiHealthMetric {
  method: string;
  path: string;
  statusCode: number | null;
  latencyMs: number;
  requestCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  lastCheckedAt: string;
}

interface WebsiteApiHealthData {
  checkedAt: string;
  adminPanel: ApiHealthMetric[];
  publicWebsite: ApiHealthMetric[];
}

interface WebsiteMonitorData {
  checkedAt: string;
  pageViews24h: number;
  pageViews30d: number;
  uniqueVisitors30d: number;
  topPages: Array<{ path: string; views: number }>;
  topCountries: Array<{ country: string; views: number }>;
  recentVisits: Array<{
    id: string;
    path: string;
    visitorIp: string;
    countryCode: string | null;
    referrerHost: string | null;
    browser: string;
    deviceType: string;
    visitedAt: string;
  }>;
}

interface WebsiteUptimeData {
  checkedAt: string;
  historicalUptimeAvailable: boolean;
  services: Array<{
    service: string;
    url: string;
    status: 'up' | 'down';
    responseMs: number | null;
  }>;
}

type MonitorTab = 'public' | 'admin-apis' | 'uptime';

const cardClass =
  'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4';
const tablePageSize = 10;

const requestErrorMessage = (error: unknown) =>
  isAxiosError(error) && error.response?.status === 401
    ? 'Your admin session was rejected. Sign in again, then reload this monitor.'
    : 'Monitoring data could not be loaded. Please try again.';

const ApiHealthTable: React.FC<{
  title: string;
  metrics: ApiHealthMetric[];
  emptyMessage: string;
}> = ({ title, metrics, emptyMessage }) => {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(metrics.length / tablePageSize));
  const currentPage = Math.min(page, pageCount);
  const firstItemIndex = (currentPage - 1) * tablePageSize;
  const visibleMetrics = metrics.slice(firstItemIndex, firstItemIndex + tablePageSize);

  return (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {title} · Observed Traffic
        </h2>
        <span className="text-[10px] text-slate-500">
          {metrics.length} endpoint groups · {metrics.reduce((count, item) => count + item.requestCount, 0)} requests
        </span>
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Requests are collected across sessions handled by this backend process; counters reset on restart. Routes not used yet remain unobserved, and no endpoints are actively probed.
      </p>
      {metrics.length === 0 ? (
        <p className="py-5 text-center text-xs text-slate-500">{emptyMessage}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <th className="px-2 py-2">Method</th>
                  <th className="px-2 py-2">API Route</th>
                  <th className="px-2 py-2">Latest Response</th>
                  <th className="px-2 py-2">Latency</th>
                  <th className="px-2 py-2">Requests</th>
                  <th className="px-2 py-2">4xx</th>
                  <th className="px-2 py-2">5xx</th>
                  <th className="px-2 py-2">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {visibleMetrics.map((metric) => {
                  const serverError = metric.statusCode === null || metric.statusCode >= 500;
                  const clientError = metric.statusCode !== null && metric.statusCode >= 400;
                  return (
                    <tr key={`${metric.method} ${metric.path}`} className="border-b border-slate-100 last:border-0 dark:border-slate-700">
                      <td className="px-2 py-2 font-mono">{metric.method}</td>
                      <td className="max-w-72 truncate px-2 py-2 font-mono">{metric.path}</td>
                      <td className={`whitespace-nowrap px-2 py-2 font-mono ${serverError ? 'text-red-700 dark:text-red-400' : clientError ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {metric.statusCode === null ? 'NETWORK ERROR' : `${serverError ? 'ERROR' : clientError ? 'CLIENT RESPONSE' : 'OK'} · ${metric.statusCode}`}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{metric.latencyMs} ms</td>
                      <td className="px-2 py-2">{metric.requestCount}</td>
                      <td className="px-2 py-2">{metric.clientErrorCount}</td>
                      <td className="px-2 py-2">{metric.serverErrorCount}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-500">{new Date(metric.lastCheckedAt).toLocaleTimeString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {metrics.length > tablePageSize && (
            <nav
              aria-label={`${title} table pagination`}
              className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] dark:border-slate-700"
            >
              <span className="text-slate-500">
                Showing {firstItemIndex + 1}-{Math.min(firstItemIndex + tablePageSize, metrics.length)} of {metrics.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600"
                >
                  Previous
                </button>
                <span className="text-slate-500">Page {currentPage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  );
};

export const WebsiteMonitor: React.FC = () => {
  const [data, setData] = useState<WebsiteMonitorData | null>(null);
  const [uptimeData, setUptimeData] = useState<WebsiteUptimeData | null>(null);
  const [apiHealthData, setApiHealthData] = useState<WebsiteApiHealthData | null>(null);
  const [activeTab, setActiveTab] = useState<MonitorTab>('public');
  const [recentVisitsPage, setRecentVisitsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [uptimeError, setUptimeError] = useState<string | null>(null);
  const [apiHealthError, setApiHealthError] = useState<string | null>(null);
  const pollingPaused = useRef(false);
  const totalRecentVisits = data?.recentVisits.length ?? 0;
  const recentVisitsPageCount = Math.max(1, Math.ceil(totalRecentVisits / tablePageSize));
  const currentRecentVisitsPage = Math.min(recentVisitsPage, recentVisitsPageCount);
  const recentVisitsStart = (currentRecentVisitsPage - 1) * tablePageSize;
  const visibleRecentVisits =
    data?.recentVisits.slice(recentVisitsStart, recentVisitsStart + tablePageSize) ?? [];

  const refresh = useCallback(async () => {
    pollingPaused.current = false;
    setRefreshing(true);
    try {
      if (!getAccessToken()) await refreshAdminSession();
      const [analyticsResult, uptimeResult, apiHealthResult] = await Promise.allSettled([
        apiClient.get<WebsiteMonitorData>('/website/monitor'),
        apiClient.get<WebsiteUptimeData>('/website/uptime'),
        apiClient.get<WebsiteApiHealthData>('/website/api-health'),
      ]);

      if (analyticsResult.status === 'fulfilled') {
        setData(analyticsResult.value.data);
        setAnalyticsError(null);
      } else {
        console.error('Error fetching public website analytics', analyticsResult.reason);
        setAnalyticsError(requestErrorMessage(analyticsResult.reason));
      }

      if (uptimeResult.status === 'fulfilled') {
        setUptimeData(uptimeResult.value.data);
        setUptimeError(null);
      } else {
        console.error('Error fetching platform uptime data', uptimeResult.reason);
        setUptimeError(requestErrorMessage(uptimeResult.reason));
      }

      if (apiHealthResult.status === 'fulfilled') {
        setApiHealthData(apiHealthResult.value.data);
        setApiHealthError(null);
      } else {
        console.error('Error fetching observed frontend API health', apiHealthResult.reason);
        setApiHealthError(requestErrorMessage(apiHealthResult.reason));
      }

      const hasUnauthorizedResponse = [analyticsResult, uptimeResult, apiHealthResult].some(
        (result) =>
          result.status === 'rejected' &&
          isAxiosError(result.reason) &&
          result.reason.response?.status === 401,
      );
      pollingPaused.current = hasUnauthorizedResponse;
    } catch (requestError) {
      console.error('Error refreshing website monitor', requestError);
      const message = requestErrorMessage(requestError);
      setAnalyticsError(message);
      setUptimeError(message);
      setApiHealthError(message);
      pollingPaused.current =
        isAxiosError(requestError) && requestError.response?.status === 401;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!pollingPaused.current) void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (loading && !data && !uptimeData && !apiHealthData) {
    return <LoadingIndicator label="Loading website monitor" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider font-mono text-slate-900 dark:text-white">
            Platform Monitor
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Admin API health, public-site traffic, and current platform availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Website monitor sections"
        className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800"
      >
        {([
          ['public', 'Public Website'],
          ['admin-apis', 'Admin APIs'],
          ['uptime', 'Platform Uptime'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            id={`website-monitor-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`website-monitor-panel-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
              activeTab === tab
                ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'public' && (
        <section
          id="website-monitor-panel-public"
          role="tabpanel"
          aria-labelledby="website-monitor-tab-public"
          className="space-y-6"
        >
          {analyticsError && (
            <div role="alert" className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {analyticsError}{data ? ' Showing the last successfully loaded results.' : ''}
            </div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className={cardClass}>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>Page Views · 24 Hours</span>
                    <Activity className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">{data.pageViews24h}</div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Recorded page visits</div>
                </div>

                <div className={cardClass}>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>Page Views · 30 Days</span>
                    <Clock3 className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">{data.pageViews30d}</div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Rolling retention window</div>
                </div>

                <div className={cardClass}>
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>Approx. Visitors · 30 Days</span>
                    <Users className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">{data.uniqueVisitors30d}</div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Estimated from masked networks</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <section className={cardClass}>
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Top Pages · 30 Days</h2>
                  {data.topPages.length === 0 ? (
                    <p className="text-xs text-slate-500">No page views recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.topPages.map((page) => (
                        <div key={page.path} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-xs last:border-0 dark:border-slate-700">
                          <span className="truncate font-mono">{page.path}</span>
                          <span className="shrink-0 font-mono text-slate-500">{page.views}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className={cardClass}>
                  <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    <MapPin className="h-3.5 w-3.5" />
                    Approximate Visitor Countries · 30 Days
                  </h2>
                  {data.topCountries.length === 0 ? (
                    <p className="text-xs text-slate-500">No country data recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.topCountries.map((country) => (
                        <div key={country.country} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-xs last:border-0 dark:border-slate-700">
                          <span>{country.country}</span>
                          <span className="font-mono text-slate-500">{country.views} views</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[10px] text-slate-500">Country is shown only when a trusted Cloudflare edge header is enabled; no precise location is collected.</p>
                </section>
              </div>

              <section className={`${cardClass} overflow-hidden`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">Recent Page Visits</h2>
                  <span className="text-[10px] text-slate-500">Latest {totalRecentVisits} · IPs masked to network prefix</span>
                </div>
                {data.recentVisits.length === 0 ? (
                  <p className="py-5 text-center text-xs text-slate-500">No visits recorded yet. Page views will appear after analytics is enabled on the public site.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-700">
                          <th className="px-2 py-2">Visited</th>
                          <th className="px-2 py-2">Page</th>
                          <th className="px-2 py-2">Masked IP</th>
                          <th className="px-2 py-2">Country</th>
                          <th className="px-2 py-2">Device / Browser</th>
                          <th className="px-2 py-2">Referrer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRecentVisits.map((visit) => (
                          <tr key={visit.id} className="border-b border-slate-100 last:border-0 dark:border-slate-700">
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">{new Date(visit.visitedAt).toLocaleString()}</td>
                            <td className="max-w-56 truncate px-2 py-2 font-mono">{visit.path}</td>
                            <td className="whitespace-nowrap px-2 py-2 font-mono">{visit.visitorIp}</td>
                            <td className="px-2 py-2">{visit.countryCode || 'Unavailable'}</td>
                            <td className="whitespace-nowrap px-2 py-2">{visit.deviceType} · {visit.browser}</td>
                            <td className="max-w-40 truncate px-2 py-2 text-slate-500">{visit.referrerHost || 'Direct'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {totalRecentVisits > tablePageSize && (
                  <nav
                    aria-label="Recent page visits table pagination"
                    className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] dark:border-slate-700"
                  >
                    <span className="text-slate-500">
                      Showing {recentVisitsStart + 1}-{Math.min(recentVisitsStart + tablePageSize, totalRecentVisits)} of {totalRecentVisits}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRecentVisitsPage(currentRecentVisitsPage - 1)}
                        disabled={currentRecentVisitsPage === 1}
                        className="border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600"
                      >
                        Previous
                      </button>
                      <span className="text-slate-500">Page {currentRecentVisitsPage} of {recentVisitsPageCount}</span>
                      <button
                        type="button"
                        onClick={() => setRecentVisitsPage(currentRecentVisitsPage + 1)}
                        disabled={currentRecentVisitsPage === recentVisitsPageCount}
                        className="border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600"
                      >
                        Next
                      </button>
                    </div>
                  </nav>
                )}
              </section>
              <p className="text-[10px] text-slate-500">
                Analytics are retained for 30 days. Last updated: {new Date(data.checkedAt).toLocaleString()}.
              </p>
            </>
          )}
          {apiHealthError && (
            <div role="alert" className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {apiHealthError}{apiHealthData ? ' Showing the last successfully loaded results.' : ''}
            </div>
          )}
          {apiHealthData ? (
            <ApiHealthTable
              title="Public Website API Health"
              metrics={apiHealthData.publicWebsite}
              emptyMessage="No public website API requests have been observed since the backend started."
            />
          ) : !apiHealthError ? (
            <LoadingIndicator label="Loading public website API health" />
          ) : null}
          {!data && !analyticsError && (
            <LoadingIndicator label="Loading public website analytics" />
          )}
        </section>
      )}

      {activeTab === 'admin-apis' && (
        <section
          id="website-monitor-panel-admin-apis"
          role="tabpanel"
          aria-labelledby="website-monitor-tab-admin-apis"
          className="space-y-4"
        >
          {apiHealthError && (
            <div role="alert" className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {apiHealthError}{apiHealthData ? ' Showing the last successfully loaded results.' : ''}
            </div>
          )}
          {apiHealthData ? (
            <ApiHealthTable
              title="Admin Panel API Health"
              metrics={apiHealthData.adminPanel}
              emptyMessage="No admin-panel API requests have been observed since the backend started."
            />
          ) : !apiHealthError ? (
            <LoadingIndicator label="Loading admin API health" />
          ) : null}
        </section>
      )}

      {activeTab === 'uptime' && (
        <section
          id="website-monitor-panel-uptime"
          role="tabpanel"
          aria-labelledby="website-monitor-tab-uptime"
          className="space-y-4"
        >
          {uptimeError && (
            <div role="alert" className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {uptimeError}{uptimeData ? ' Showing the last successfully loaded results.' : ''}
            </div>
          )}
          {uptimeData && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {uptimeData.services.map((service) => (
                  <div key={service.service} className={cardClass}>
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <span>{service.service}</span>
                      <Globe2 className={`h-4 w-4 ${service.status === 'up' ? 'text-emerald-600' : 'text-red-600'}`} />
                    </div>
                    <div className={`mt-2 text-2xl font-bold font-mono uppercase ${service.status === 'up' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                      {service.status}
                    </div>
                    <div className="mt-1 break-words text-[11px] text-slate-500 dark:text-slate-400">{service.url}</div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {service.responseMs === null
                        ? service.service === 'Backend API' ? 'Monitor API responding' : 'No response time'
                        : `${service.responseMs} ms response`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-3 border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-bold uppercase tracking-wider">Live checks, not historical uptime</div>
                  <p className="mt-1 leading-relaxed">
                    Frontends and database are checked when this monitor loads and every minute while it is open. The backend is marked up because this uptime API request completed successfully. Historical uptime requires scheduled monitoring and is not available.
                  </p>
                  <p className="mt-1 text-[11px] opacity-80">Last checked: {new Date(uptimeData.checkedAt).toLocaleString()}</p>
                </div>
              </div>
            </>
          )}
          {!uptimeData && !uptimeError && (
            <LoadingIndicator label="Checking platform uptime" />
          )}
        </section>
      )}
    </div>
  );
};
