import React from "react";
import { Link } from "react-router-dom";
import { Construction, ArrowLeft, ArrowUpRight, BookOpen } from "lucide-react";
import { PageContainer } from "@/src/components/layout/PageContainer";

interface ModulePlaceholderProps {
  moduleTitle: string;
  moduleCategory: string;
  targetPhase: string;
  description: string;
  requiredBackendEndpoints: string[];
  suggestedAction?: {
    label: string;
    href: string;
  };
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
  moduleTitle,
  moduleCategory,
  targetPhase,
  description,
  requiredBackendEndpoints,
  suggestedAction = { label: "Return to Dashboard", href: "/admin/dashboard" },
}) => {
  return (
    <PageContainer
      title={moduleTitle}
      description={`Administrative subsystem scheduled for deployment in ${targetPhase}.`}
      breadcrumbs={[
        { label: moduleCategory },
        { label: moduleTitle },
      ]}
    >
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 sm:p-12 text-center max-w-3xl mx-auto space-y-6">
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center">
          <Construction className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
            <span>{targetPhase} Module Specification</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100">{moduleTitle} Is In Active Preparation</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
            {description}
          </p>
        </div>

        {/* Contract & Integration Requirements */}
        <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              Required Backend Contracts
            </span>
            <span className="text-[11px] text-zinc-500 font-mono">Contract Bound</span>
          </div>
          <ul className="space-y-1 text-xs font-mono text-zinc-400">
            {requiredBackendEndpoints.map((ep) => (
              <li key={ep} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                <span>{ep}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to={suggestedAction.href}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{suggestedAction.label}</span>
          </Link>
          <Link
            to="/admin/properties"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
          >
            <span>View Active Properties</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </PageContainer>
  );
};
