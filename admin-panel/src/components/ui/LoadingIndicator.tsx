import React from 'react';

interface LoadingIndicatorProps {
  label?: string;
}

/**
 * STRICT NO-ANIMATION LOADING INDICATOR
 * Displays an enterprise-grade static indicator with clear textual state.
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ label = 'Loading...' }) => {
  return (
    <div className="flex items-center space-x-2 py-4 px-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-mono select-none" role="status">
      <span className="font-bold px-1.5 py-0.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[10px]">
        EXEC
      </span>
      <span>{label}</span>
      <span className="text-slate-400 dark:text-slate-500 font-sans">[Static Indicator - No Motion]</span>
    </div>
  );
};
