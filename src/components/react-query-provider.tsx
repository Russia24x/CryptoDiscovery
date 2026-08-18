"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** React Query provider — wraps the entire app.
 *
 * QueryClient is created once per client (not per render) via useState.
 * Default staleTime: 90s (matches backend cache TTL).
 * Default gcTime: 5min (was cacheTime in v4).
 */
export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 90_000, // 90s — matches backend cache TTL
            gcTime: 300_000, // 5min — garbage collect unused data
            retry: 1, // one retry on failure (not the default 3)
            refetchOnWindowFocus: false, // don't hammer APIs on tab switch
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
