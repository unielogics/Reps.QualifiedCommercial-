"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadManagerProvider } from "@/components/UploadManager";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <UploadManagerProvider>{children}</UploadManagerProvider>
    </QueryClientProvider>
  );
}
