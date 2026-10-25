import React from 'react';
import { useAuth } from '../../lib/auth-context';
import { Building, Globe, CheckCircle } from 'lucide-react';

export const PropertyList: React.FC = () => {
  const { properties, selectedPropertyId } = useAuth();

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
          Accessible Properties
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Properties assigned to your role. Full CRUD management will be unlocked in Module 2.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {properties.map((p) => {
          const isSelected = selectedPropertyId === p.id;
          return (
            <div
              key={p.id}
              className={`p-4 border ${
                isSelected
                  ? 'border-blue-600 dark:border-blue-500 bg-blue-50/20 dark:bg-blue-950/20'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-1.5 py-0.5 text-xs font-mono font-bold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 mb-2">
                    {p.code}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</h3>
                </div>
                <span className="flex items-center text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  {p.status}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span className="flex items-center">
                  <Globe className="w-3.5 h-3.5 mr-1" />
                  {p.timezone}
                </span>
                <span>ID: {p.id.slice(0, 8)}...</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
