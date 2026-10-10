"use client";

import { useState } from "react";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { formatEther } from "viem";
import { APP_CHAIN_ID } from "@/lib/config";
import { useMounted } from "@/lib/wallet";
import { ConnectModal } from "./ConnectModal";

export function WalletButton({ label = "Connect wallet" }: { label?: string }) {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address, chainId: APP_CHAIN_ID });
  const [modalOpen, setModalOpen] = useState(false);

  if (!mounted) {
    return <div className="h-9 w-32 animate-pulse rounded-full bg-white/10" />;
  }
  if (!isConnected || !address) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-full bg-monad px-4 py-2 text-sm font-bold text-white transition hover:bg-monad/80"
        >
          {label}
        </button>
        <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs tabular-nums">
        {address.slice(0, 6)}…{address.slice(-4)}
        {chainId === APP_CHAIN_ID && balance
          ? ` · ${Number(formatEther(balance.value)).toFixed(3)} MON`
          : ""}
      </span>
      <button
        onClick={() => disconnect()}
        aria-label="Disconnect wallet"
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
