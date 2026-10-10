"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "@wagmi/core";
import { formatEther } from "viem";
import { APP_CHAIN_ID } from "@/lib/config";

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address, chainId: APP_CHAIN_ID });

  if (!mounted) {
    return <div className="h-10 w-36 animate-pulse rounded-lg bg-white/10" />;
  }
  if (!isConnected || !address) {
    return (
      <button
        onClick={() => connect({ connector: injected() })}
        disabled={isPending}
        className="rounded-lg bg-monad px-4 py-2 font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (chainId !== APP_CHAIN_ID) {
    return (
      <button
        onClick={() => switchChain({ chainId: APP_CHAIN_ID })}
        className="rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-black hover:brightness-110"
      >
        Switch to Monad Testnet
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="rounded-lg bg-white/10 px-3 py-2 font-mono">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <span className="rounded-lg bg-white/10 px-3 py-2 font-mono">
        {balance ? `${Number(formatEther(balance.value)).toFixed(3)} MON` : "…"}
      </span>
      <button
        onClick={() => disconnect()}
        className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"
      >
        Disconnect
      </button>
    </div>
  );
}
