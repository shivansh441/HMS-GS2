import React from "react";
import { Database, GitFork, Key, Table, ShieldCheck, Cpu } from "lucide-react";

export const DatabaseSchemaCard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">PostgreSQL 16 & SQLAlchemy 2.0 Schema Architecture</h3>
            <p className="text-xs text-zinc-400">Asynchronous database access via psycopg3 with Alembic migration versioning</p>
          </div>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed mt-2">
          The Phase 1 schema establishes strict relational foreign key constraints and multi-property tenant isolation.
          All primary keys use standard UUIDv4 strings. Every record tracks timezone-aware UTC timestamps
          (<code className="text-sky-300 font-mono">created_at</code> and <code className="text-sky-300 font-mono">updated_at</code>).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Table 1: properties */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-bold text-zinc-200 font-mono">properties</h4>
            </div>
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">table</span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-indigo-300">
              <span className="flex items-center gap-1"><Key className="w-3 h-3 text-amber-400" /> id</span>
              <span className="text-zinc-500">VARCHAR(36) [PK]</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>code</span>
              <span className="text-zinc-500">VARCHAR(50) [UQ]</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>name</span>
              <span className="text-zinc-500">VARCHAR(150)</span>
            </div>
            <div className="flex justify-between text-amber-300">
              <span>property_type</span>
              <span className="text-zinc-500">ENUM (hostel/hotel/hybrid)</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>currency / tz</span>
              <span className="text-zinc-500">VARCHAR(3) / (50)</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>total_rooms / beds</span>
              <span className="text-zinc-500">INTEGER</span>
            </div>
            <div className="flex justify-between text-emerald-300">
              <span>configuration</span>
              <span className="text-zinc-500">JSON / JSONB</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>created_at / updated_at</span>
              <span className="text-zinc-500">TIMESTAMPTZ (UTC)</span>
            </div>
          </div>
        </div>

        {/* Table 2: users */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-bold text-zinc-200 font-mono">users</h4>
            </div>
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">table</span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-indigo-300">
              <span className="flex items-center gap-1"><Key className="w-3 h-3 text-amber-400" /> id</span>
              <span className="text-zinc-500">VARCHAR(36) [PK]</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>email</span>
              <span className="text-zinc-500">VARCHAR(255) [UQ]</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>hashed_password</span>
              <span className="text-zinc-500">VARCHAR(255) [bcrypt]</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>first_name / last_name</span>
              <span className="text-zinc-500">VARCHAR(100)</span>
            </div>
            <div className="flex justify-between text-purple-300">
              <span>global_role</span>
              <span className="text-zinc-500">ENUM (UserRole)</span>
            </div>
            <div className="flex justify-between text-zinc-300">
              <span>is_superuser</span>
              <span className="text-zinc-500">BOOLEAN</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>created_at / updated_at</span>
              <span className="text-zinc-500">TIMESTAMPTZ (UTC)</span>
            </div>
          </div>
        </div>

        {/* Table 3: user_property_assignments */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-zinc-200 font-mono">user_property_assignments</h4>
            </div>
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">table</span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-indigo-300">
              <span className="flex items-center gap-1"><Key className="w-3 h-3 text-amber-400" /> id</span>
              <span className="text-zinc-500">VARCHAR(36) [PK]</span>
            </div>
            <div className="flex justify-between text-sky-300">
              <span className="flex items-center gap-1"><GitFork className="w-3 h-3 text-sky-400" /> user_id</span>
              <span className="text-zinc-500">FK -&gt; users.id</span>
            </div>
            <div className="flex justify-between text-sky-300">
              <span className="flex items-center gap-1"><GitFork className="w-3 h-3 text-sky-400" /> property_id</span>
              <span className="text-zinc-500">FK -&gt; properties.id</span>
            </div>
            <div className="flex justify-between text-amber-300">
              <span>property_role</span>
              <span className="text-zinc-500">ENUM (Scoped Role)</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>uq_user_property</span>
              <span className="text-zinc-500">UNIQUE(user_id, prop_id)</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>created_at / updated_at</span>
              <span className="text-zinc-500">TIMESTAMPTZ (UTC)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Migration and Pool Config Summary */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Alembic Migration Pipeline
          </h4>
          <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
            <li>Asynchronous migration runner configured in <code className="text-sky-300 font-mono">backend/alembic/env.py</code></li>
            <li>Autogenerate metadata binds directly to <code className="text-sky-300 font-mono">Base.metadata</code></li>
            <li>Standard date-prefixed revision filename template enabled</li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            Connection Pool & Concurrency
          </h4>
          <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
            <li>QueuePool: size 10, max overflow 20, timeout 30s</li>
            <li>Connection pre-ping enabled to discard dead sockets</li>
            <li>Hermetic in-memory SQLite engine utilized in unit tests</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
