import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  description,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirming) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirming, onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md space-y-5 border border-slate-300 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="confirm-dialog-title" className="text-sm font-bold uppercase text-slate-900 dark:text-white">
              {title}
            </h2>
            <p id="confirm-dialog-description" className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {description}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            autoFocus
            disabled={isConfirming}
            onClick={onCancel}
            className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isConfirming}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 bg-rose-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirming && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
            {isConfirming ? 'Please wait' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};
