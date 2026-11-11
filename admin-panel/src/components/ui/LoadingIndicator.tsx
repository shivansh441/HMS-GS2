import React from 'react';

interface LoadingIndicatorProps {
  label?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ label = 'Loading...' }) => {
  return (
    <div className="flex items-center space-x-2 py-4 px-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-mono select-none" role="status">
      <span>{label}</span>
      <span aria-hidden="true" className="flex gap-0.5 text-slate-500 dark:text-slate-400">
        <span className="animate-pulse motion-reduce:animate-none">.</span>
        <span className="animate-pulse [animation-delay:200ms] motion-reduce:animate-none">.</span>
        <span className="animate-pulse [animation-delay:400ms] motion-reduce:animate-none">.</span>
      </span>
    </div>
  );
};
