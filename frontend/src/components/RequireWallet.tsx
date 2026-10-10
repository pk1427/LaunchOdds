"use client";

import { useState, type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { APP_CHAIN_ID } from "@/lib/config";
import { useMounted } from "@/lib/wallet";
import { Button, Skeleton } from "./ui";
import { ConnectModal } from "./ConnectModal";

// Client-side wallet gate. While disconnected, protected markup is never
// rendered (not even server-side: the first render is always the skeleton).
export function RequireWallet({
  children,
  reason,
}: {
  children: ReactNode;
  reason: string;
}) {
  const mounted = useMounted();
  const { isConnected, chainId, status } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [modalOpen, setModalOpen] = useState(false);

  if (!mounted || status === "connecting" || status === "reconnecting") {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <>
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-lg font-bold">Connect your wallet to continue</p>
          <p className="mt-1 text-sm text-slate-400">{reason}</p>
          <Button variant="primary" className="mt-4" onClick={() => setModalOpen(true)}>
            Connect wallet
          </Button>
        </div>
        <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  if (chainId !== APP_CHAIN_ID) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-8 text-center">
        <p className="text-lg font-bold">Wrong network</p>
        <p className="mt-1 text-sm text-slate-400">
          This page needs Monad Testnet (chain ID 10143).
        </p>
        <Button
          variant="primary"
          className="mt-4"
          disabled={isPending}
          onClick={() => switchChain({ chainId: APP_CHAIN_ID })}
        >
          {isPending ? "Switching…" : "Switch to Monad Testnet"}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
