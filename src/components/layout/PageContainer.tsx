import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageContainerProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  description,
  breadcrumbs,
  actions,
  children,
  className = "",
}) => {
  return (
    <div className={`space-y-6 max-w-7xl mx-auto ${className}`}>
      {/* Top Header Block: Breadcrumbs & Page-level Actions */}
      <div className="space-y-2">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Admin</span>
            </Link>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={`${crumb.label}-${idx}`}>
                <ChevronRight className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
                {crumb.href ? (
                  <Link
                    to={crumb.href}
                    className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors capitalize"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-zinc-800 dark:text-zinc-300 font-medium capitalize">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h1>
            {description && (
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-3xl leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
        </div>
      </div>

      {/* Main Content Viewport */}
      <div>{children}</div>
    </div>
  );
};
