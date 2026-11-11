import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { FileText, RefreshCw, ShieldAlert } from 'lucide-react';

interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  targetUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  propertyId: string | null;
  action: string;
  entityName: string | null;
  entityId: string | null;
  clientIp: string;
  userAgent: string | null;
  requestMethod: string | null;
  requestUrl: string | null;
  payloadDiff: Record<string, unknown> | null;
  statusCode: number;
  timestamp: string;
}

interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface SecurityAlert {
  id: string;
  alertType: string;
  severity: 'LOW' | 'INFO' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  sourceIp: string;
  userId: string | null;
  isResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

interface AuditSummary {
  totalEvents: number;
  highSeverityAlerts: number;
  activeLockouts: number;
  recentPrivilegedOverrides: number;
  unresolvedAlerts: number;
}

interface Filters {
  actor: string;
  action: string;
  clientIp: string;
  startDate: string;
  endDate: string;
}

const pageSize = 25;
const inputClass = 'w-full border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900';
const emptyFilters: Filters = { actor: '', action: '', clientIp: '', startDate: '', endDate: '' };

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load security monitoring data.';
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState<'all' | 'privileged'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingAlert, setResolvingAlert] = useState<SecurityAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const params = {
        page,
        page_size: pageSize,
        privileged_only: tab === 'privileged',
        ...(appliedFilters.actor ? { actor: appliedFilters.actor } : {}),
        ...(appliedFilters.action ? { action: appliedFilters.action } : {}),
        ...(appliedFilters.clientIp ? { client_ip: appliedFilters.clientIp } : {}),
        ...(appliedFilters.startDate ? { start_date: appliedFilters.startDate } : {}),
        ...(appliedFilters.endDate ? { end_date: appliedFilters.endDate } : {}),
      };
      const [logResponse, alertResponse, summaryResponse] = await Promise.all([
        apiClient.get<AuditLogPage>('/audit/logs', { params }),
        apiClient.get<SecurityAlert[]>('/audit/alerts', { params: { is_resolved: false, limit: 100 } }),
        apiClient.get<AuditSummary>('/audit/summary'),
      ]);
      setLogs(logResponse.data.items);
      setTotal(logResponse.data.total);
      setAlerts(alertResponse.data);
      setSummary(summaryResponse.data);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, tab]);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 30000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const highPriorityAlerts = alerts.filter(
    (alert) => alert.severity === 'HIGH' || alert.severity === 'CRITICAL',
  );
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...filters });
  };

  const setActiveTab = (nextTab: 'all' | 'privileged') => {
    setPage(1);
    setTab(nextTab);
  };

  const resolveAlert = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvingAlert) return;
    setSaving(true);
    setError('');
    try {
      await apiClient.patch(`/audit/alerts/${encodeURIComponent(resolvingAlert.id)}/resolve`, {
        resolutionNote: resolutionNote.trim() || null,
      });
      setResolvingAlert(null);
      setResolutionNote('');
      await loadData();
    } catch (resolveError: unknown) {
      setError(getErrorMessage(resolveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-mono text-slate-500">SECURITY OPERATIONS</p>
          <h1 className="mt-1 text-xl font-bold uppercase tracking-wider font-mono">Audit & Security Monitoring</h1>
          <p className="mt-1 text-xs text-slate-500">Immutable request history, privileged actions, active alerts, and account lockouts.</p>
        </div>
        <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-xs font-bold dark:border-slate-700">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</div>}

      {highPriorityAlerts.length > 0 && (
        <section aria-label="High priority security alerts" className="space-y-2 border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <div className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-200">
            <ShieldAlert className="h-4 w-4" />
            {highPriorityAlerts.length} unresolved high-priority security alert(s)
          </div>
          {highPriorityAlerts.map((alert) => (
            <article key={alert.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-red-200 pt-2 text-xs dark:border-red-900">
              <div>
                <strong>{alert.severity} · {alert.alertType.replaceAll('_', ' ')}</strong>
                <p className="mt-1">{alert.description} · IP {alert.sourceIp}</p>
              </div>
              <button type="button" onClick={() => { setResolvingAlert(alert); setResolutionNote(''); }} className="border border-red-400 px-3 py-1.5 font-bold uppercase text-red-900 dark:text-red-100">
                Mark as resolved
              </button>
            </article>
          ))}
        </section>
      )}

      {summary && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Audit events', summary.totalEvents],
            ['High / critical alerts', summary.highSeverityAlerts],
            ['Active lockouts', summary.activeLockouts],
            ['Privileged actions · 24h', summary.recentPrivilegedOverrides],
            ['Unresolved alerts', summary.unresolvedAlerts],
          ].map(([label, value]) => (
            <article key={label} className="border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </article>
          ))}
        </section>
      )}

      <form onSubmit={applyFilters} className="grid gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-3 xl:grid-cols-6">
        <input aria-label="Filter by actor" placeholder="Actor email or ID" value={filters.actor} onChange={(event) => setFilters((current) => ({ ...current, actor: event.target.value }))} className={inputClass} />
        <input aria-label="Filter by action" placeholder="Action" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value.toUpperCase() }))} className={inputClass} />
        <input aria-label="Filter by IP address" placeholder="Client IP" value={filters.clientIp} onChange={(event) => setFilters((current) => ({ ...current, clientIp: event.target.value }))} className={inputClass} />
        <input aria-label="Start date" type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className={inputClass} />
        <input aria-label="End date" type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className={inputClass} />
        <button className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white">Apply filters</button>
      </form>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button type="button" onClick={() => setActiveTab('all')} className={`px-3 py-2 text-xs font-bold uppercase ${tab === 'all' ? 'border-b-2 border-blue-700 text-blue-700 dark:text-blue-300' : 'text-slate-500'}`}>All activity</button>
        <button type="button" onClick={() => setActiveTab('privileged')} className={`px-3 py-2 text-xs font-bold uppercase ${tab === 'privileged' ? 'border-b-2 border-blue-700 text-blue-700 dark:text-blue-300' : 'text-slate-500'}`}>Privileged actions</button>
      </div>

      {loading ? <LoadingIndicator label="Loading audit and security events..." /> : logs.length === 0 ? (
        <div className="border border-slate-300 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          No events match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 font-mono uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <th className="p-3">Action / Entity</th><th className="p-3">Actor</th><th className="p-3">Request</th><th className="p-3">IP / Status</th><th className="p-3">Timestamp</th><th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr>
                    <td className="p-3"><span className="inline-flex items-center gap-1.5 font-bold"><FileText className="h-3.5 w-3.5 text-blue-600" />{log.action}</span><p className="mt-1 text-[10px] text-slate-500">{log.entityName || '—'}{log.entityId ? ` · ${log.entityId}` : ''}</p></td>
                    <td className="p-3">{log.actorEmail || log.actorUserId || 'Anonymous'}<p className="mt-1 text-[10px] text-slate-500">{log.actorRole || 'Unauthenticated'}</p></td>
                    <td className="p-3 font-mono">{log.requestMethod || '—'} {log.requestUrl || '—'}</td>
                    <td className="p-3 font-mono">{log.clientIp}<p className={`mt-1 ${log.statusCode >= 400 ? 'text-red-700' : 'text-slate-500'}`}>{log.statusCode}</p></td>
                    <td className="p-3 text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3"><button type="button" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)} className="font-bold text-blue-700 dark:text-blue-300">{expandedId === log.id ? 'Hide diff' : 'View diff'}</button></td>
                  </tr>
                  {expandedId === log.id && (
                    <tr><td colSpan={6} className="bg-slate-50 p-3 dark:bg-slate-900">
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(log.payloadDiff || {}, null, 2)}</pre>
                      {log.userAgent && <p className="mt-2 break-all text-[10px] text-slate-500">User agent: {log.userAgent}</p>}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <footer className="flex items-center justify-between border-t border-slate-200 p-3 text-xs dark:border-slate-700">
            <span>{total} events · Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-700">Previous</button>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-700">Next</button>
            </div>
          </footer>
        </div>
      )}

      {resolvingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={resolveAlert} className="w-full max-w-lg space-y-4 border border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div>
              <h2 className="text-sm font-bold uppercase">Resolve security alert</h2>
              <p className="mt-1 text-xs text-slate-500">{resolvingAlert.alertType.replaceAll('_', ' ')} · {resolvingAlert.severity}</p>
            </div>
            <p className="text-xs">{resolvingAlert.description}</p>
            <label className="block space-y-1 text-xs font-semibold">
              Resolution note
              <textarea maxLength={2000} rows={4} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} className={inputClass} placeholder="Summarize your review and action taken (optional)" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResolvingAlert(null)} className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase dark:border-slate-700">Cancel</button>
              <button disabled={saving} className="bg-red-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">{saving ? 'Saving…' : 'Confirm resolution'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
