import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getApiOperationsSnapshot,
  subscribeToApiOperations,
} from '../../lib/api';

export const OperationOverlay: React.FC = () => {
  const operations = useSyncExternalStore(
    subscribeToApiOperations,
    getApiOperationsSnapshot,
    getApiOperationsSnapshot,
  );
  const [visible, setVisible] = useState(false);
  const hasOperations = operations.length > 0;

  useEffect(() => {
    if (!hasOperations) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(timer);
  }, [hasOperations]);

  if (!visible || !hasOperations) return null;

  const currentOperation = operations[operations.length - 1];

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-4"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="flex items-center justify-center gap-1 font-mono text-sm font-bold uppercase text-slate-800 dark:text-slate-100">
        <span>{currentOperation.label}</span>
        <span className="operation-overlay-dots" aria-hidden="true">
          <span className="operation-overlay-dot">.</span>
          <span className="operation-overlay-dot">.</span>
          <span className="operation-overlay-dot">.</span>
        </span>
        <span className="sr-only">Please wait</span>
      </div>
    </div>
  );
};
