"use client";

/**
 * Client-side providers (US-303).
 * Wraps the app in React Query's QueryClientProvider so all hooks
 * can use useQuery / useMutation / useQueryClient.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session — useState ensures it's not
  // re-created on every render in React Strict Mode.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,        // 30 s — prevents redundant refetches on nav
            gcTime:    5 * 60_000,    // 5 min — keep unused cache in memory
            retry:     1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
