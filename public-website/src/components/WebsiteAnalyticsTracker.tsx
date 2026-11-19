'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export function WebsiteAnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    void fetch(`${API_BASE_URL.replace(/\/$/, '')}/website/analytics/page-view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Application': 'public-website',
      },
      body: JSON.stringify({ path: pathname, referrer: document.referrer || null }),
      keepalive: true,
    }).catch((error: unknown) => {
      console.warn('Website page-view tracking request failed', error);
    });
  }, [pathname]);

  return null;
}
