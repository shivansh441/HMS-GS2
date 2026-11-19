import React from 'react';

interface TablePaginationProps {
  label: string;
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  label,
  page,
  pageCount,
  pageSize,
  totalItems,
  onPageChange,
}) => {
  if (totalItems <= pageSize) return null;

  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav
      aria-label={`${label} table pagination`}
      className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] dark:border-slate-700"
    >
      <span className="text-slate-500" aria-live="polite">
        Showing {firstItem}-{lastItem} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600"
        >
          Previous
        </button>
        <span className="text-slate-500">Page {currentPage} of {pageCount}</span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === pageCount}
          className="border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600"
        >
          Next
        </button>
      </div>
    </nav>
  );
};
