"use client";

import { http, createConfig } from "wagmi";
import { injected } from "@wagmi/core";
import { QueryClient } from "@tanstack/react-query";
import { monadTestnet, rpcUrl } from "./chain";

// NOTE: `injected` is imported from "@wagmi/core", NOT from
// "wagmi/connectors" — the barrel pulls in extra wallet SDKs and breaks
// `next build` (Module not found: @x402/evm).

export function makeWagmiConfig() {
  return createConfig({
    chains: [monadTestnet],
    connectors: [injected()],
    transports: {
      [monadTestnet.id]: http(rpcUrl(), { retryCount: 5, timeout: 20_000 }),
    },
  });
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 3, refetchOnWindowFocus: false },
    },
  });
}
