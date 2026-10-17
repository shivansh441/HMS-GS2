import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Server, Activity, ShieldCheck, Clock } from "lucide-react";
import { HealthResponse } from "@/src/types/api";

interface HealthMonitorCardProps {
  healthData: HealthResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  rawResponse: unknown;
  error?: string | null;
}

export const HealthMonitorCard: React.FC<HealthMonitorCardProps> = ({
  healthData,
  isLoading,
  onRefresh,
  rawResponse,
  error,
}) => {
  const [showJson, setShowJson] = useState(false);

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case "degraded":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "unhealthy":
        return <XCircle className="w-5 h-5 text-rose-400" />;
      default:
        return <Activity className="w-5 h-5 text-zinc-400" />;
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Backend Health & Readiness Probe</h3>
            <p className="text-xs text-zinc-400">Endpoint: <code className="text-indigo-400 font-mono">GET /api/v1/health</code></p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJson(!showJson)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            {showJson ? "Hide Envelope" : "Inspect Raw Envelope"}
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Run Probe
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <p className="font-semibold mb-1">Probe Communication Alert</p>
          <p>{error}</p>
        </div>
      ) : null}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Status */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Service Status</span>
            {getStatusIcon(healthData?.status)}
          </div>
          <div className="text-xl font-bold capitalize text-zinc-100">
            {healthData?.status || (isLoading ? "Probing..." : "Offline")}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Env: <span className="font-mono text-zinc-300">{healthData?.environment || "development"}</span>
          </p>
        </div>

        {/* Database Probe */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Database Probe</span>
            <Activity className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-xl font-bold capitalize text-zinc-100 flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                healthData?.database.status === "connected"
                  ? "bg-emerald-400"
                  : healthData?.database.status === "degraded"
                  ? "bg-amber-400"
                  : "bg-rose-400"
              }`}
            />
            {healthData?.database.status || "Unknown"}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Latency: <span className="font-mono text-zinc-300">{healthData?.database.latency_ms ?? "N/A"} ms</span>
          </p>
        </div>

        {/* Python Runtime */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Runtime Engine</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100 font-mono">
            Python {healthData?.system.python_version || "3.11"}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            FastAPI + SQLAlchemy 2.0 Async
          </p>
        </div>

        {/* Uptime */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-2">
            <span>Process Uptime</span>
            <Clock className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-xl font-bold text-zinc-100 font-mono">
            {healthData?.system.uptime_seconds != null
              ? `${Math.floor(healthData.system.uptime_seconds)}s`
              : "Active"}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            v{healthData?.version || "0.1.0"}
          </p>
        </div>
      </div>

      {/* Raw JSON Envelope Viewer */}
      {showJson && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>HTTP 200 OK — Standard Envelope (`ApiResponse&lt;HealthResponse&gt;`)</span>
            <span>Content-Type: application/json</span>
          </div>
          <pre className="text-xs font-mono bg-zinc-900/80 p-3 rounded-lg overflow-x-auto text-emerald-400">
            {JSON.stringify(rawResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
