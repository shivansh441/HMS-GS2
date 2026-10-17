import React, { useState } from "react";
import { FolderTree, Layers, GitBranch, ArrowRight, ShieldCheck, Box, CheckCircle } from "lucide-react";

export const ArchitectureViewer: React.FC = () => {
  const [selectedLayer, setSelectedLayer] = useState<number>(0);

  const layers = [
    {
      title: "1. API Routes & HTTP Handling",
      path: "backend/app/api/v1/",
      responsibility: "HTTP verbs, URL routing, query validation, status codes, OpenAPI documentation.",
      rule: "ZERO business logic in handlers. Delegates entirely to application services with explicit dependencies.",
      files: ["endpoints/health.py", "endpoints/spec.py", "router.py", "deps.py"],
    },
    {
      title: "2. Request & Response Schemas",
      path: "backend/app/schemas/",
      responsibility: "Pydantic v2 strict models, JSON validation, standardized ApiResponse envelopes, Decimal Money precision.",
      rule: "Monetary amounts modeled using high-precision Decimal(12, 2). UTC timezone enforcement.",
      files: ["common.py", "health.py", "property.py", "auth.py"],
    },
    {
      title: "3. Application Services & Workflows",
      path: "backend/app/services/",
      responsibility: "Encapsulates distinct business operations (Hostel bed booking vs Hotel room folio). Orchestrates DB transactions.",
      rule: "Decoupled from FastAPI request objects. Fully unit-testable without HTTP layer.",
      files: ["health_service.py"],
    },
    {
      title: "4. Domain Models & Business Rules",
      path: "backend/app/models/",
      responsibility: "Declarative SQLAlchemy 2.0 entities, UUID primary keys, UTC timestamp mixins, soft-deletes.",
      rule: "Multi-tenant tenant isolation via property_id foreign keys and user property assignments.",
      files: ["base.py", "property.py", "user.py"],
    },
    {
      title: "5. Database Persistence & Migrations",
      path: "backend/app/db/ & backend/alembic/",
      responsibility: "Async connection pool (psycopg/asyncpg), transaction management, Alembic async schema migrations.",
      rule: "Automatic session rollback on unhandled exceptions; connection pool with pre-ping validation.",
      files: ["base.py", "session.py", "alembic/env.py", "alembic.ini"],
    },
    {
      title: "6. Security & Infrastructure Baseline",
      path: "backend/app/core/",
      responsibility: "Bcrypt 12-round password hashing, JWT token generation, structured JSON logging with correlation IDs.",
      rule: "Zero hardcoded secrets. All configuration loaded strictly via pydantic-settings from environment.",
      files: ["config.py", "security.py", "logging.py", "exceptions.py"],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Modular Monolith Architecture</h3>
            <p className="text-xs text-zinc-400">Strict separation of concerns designed for seamless domain expansion</p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          The GrandStay architecture provides shared enterprise infrastructure (users, staff, security, audit logging)
          while maintaining clean isolation between <strong>Hostel operational workflows</strong> (bed-level allocations, dorm sharing rules, lockers)
          and <strong>Hotel operational workflows</strong> (private room folios, housekeeping turn-down, room service, minibar).
        </p>
      </div>

      {/* Layer Interactive Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Layer Selector */}
        <div className="space-y-2 lg:col-span-1">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">Backend Layers</p>
          {layers.map((layer, index) => (
            <button
              key={layer.title}
              onClick={() => setSelectedLayer(index)}
              className={`w-full text-left p-3.5 rounded-lg border text-xs transition-all ${
                selectedLayer === index
                  ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300 font-semibold shadow-sm"
                  : "bg-zinc-900/40 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{layer.title}</span>
                <ArrowRight className={`w-3.5 h-3.5 ${selectedLayer === index ? "text-indigo-400" : "text-zinc-600"}`} />
              </div>
              <p className="text-[11px] text-zinc-500 font-mono mt-1 truncate">{layer.path}</p>
            </button>
          ))}
        </div>

        {/* Right: Layer Detail Inspector */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div>
              <h4 className="text-sm font-bold text-zinc-100">{layers[selectedLayer].title}</h4>
              <p className="text-xs font-mono text-indigo-400 mt-0.5">{layers[selectedLayer].path}</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Verified & Tested
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Responsibility</p>
            <p className="text-xs text-zinc-300 leading-relaxed">{layers[selectedLayer].responsibility}</p>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <p className="text-xs font-semibold text-indigo-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Architectural Boundary Rule
            </p>
            <p className="text-xs text-zinc-300">{layers[selectedLayer].rule}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Core Files Created in Phase 1</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {layers[selectedLayer].files.map((file) => (
                <div key={file} className="flex items-center gap-2 p-2 rounded bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-300">
                  <Box className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{file}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
