import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { AuditLogItem } from '../../types';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { FileText } from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAuditLogs = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<AuditLogItem[]>('/admin/audit');
        setLogs(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Unable to load audit logs.');
      } finally {
        setLoading(false);
      }
    };
    loadAuditLogs();
  }, []);

  return (
    <div className="space-y-4">
      <header className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold uppercase tracking-wider font-mono">Audit Logs</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Recent append-only administrative events.</p>
      </header>
      {error && <div role="alert" className="border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-200">{error}</div>}
      {loading ? <LoadingIndicator label="Loading audit trail..." /> : logs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-500">
          No audit events are available.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-mono uppercase tracking-wider">
                <th className="py-2.5 px-3">Event</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3">Target</th>
                <th className="py-2.5 px-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-mono">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 px-3"><span className="inline-flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-600" />{log.action}</span></td>
                  <td className="py-2.5 px-3">{log.actorUserId || '—'}</td>
                  <td className="py-2.5 px-3">{log.targetUserId || '—'}</td>
                  <td className="py-2.5 px-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
