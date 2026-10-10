"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeWagmiConfig, makeQueryClient } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [config] = useState(makeWagmiConfig);
  const [queryClient] = useState(makeQueryClient);
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
