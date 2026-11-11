import React from 'react';

interface LoadingIndicatorProps {
  label?: string;
  className?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  label = 'Loading',
  className = '',
}) => {
  return (
    <div
      className={`pointer-events-none fixed inset-0 z-[90] flex items-center justify-center ${className}`}
      role="status"
      aria-label={label}
    >
      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold uppercase text-slate-700 dark:text-slate-200">
        <span>{label}</span>
        <span aria-hidden="true" className="operation-overlay-dots">
          <span className="operation-overlay-dot">.</span>
          <span className="operation-overlay-dot">.</span>
          <span className="operation-overlay-dot">.</span>
        </span>
      </span>
    </div>
  );
};
