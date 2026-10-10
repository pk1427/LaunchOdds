import { defineChain } from "viem";

export const DEFAULT_RPC = "https://testnet-rpc.monad.xyz";

export function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_MONAD_RPC || DEFAULT_RPC;
}

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl()] } },
  blockExplorers: {
    default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" },
  },
  // Canonical Multicall3 — code verified on-chain via `cast code` before adding.
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 0,
    },
  },
});

export const MONAD_CHAIN_ID = 10143;
