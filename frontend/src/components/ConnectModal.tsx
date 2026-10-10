"use client";

import { useState } from "react";
import { useConnect, useSwitchChain } from "wagmi";
import { APP_CHAIN_ID } from "@/lib/config";
import { MONAD_EXPLORER, MONAD_RPC } from "@/lib/network";
import { hasInjectedWallet, injectedConnector } from "@/lib/wallet";
import { Button, Modal } from "./ui";

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connect, isPending, error } = useConnect();
  const { switchChain } = useSwitchChain();
  const [added, setAdded] = useState<string | null>(null);
  const injectedAvailable =
    typeof window !== "undefined" && hasInjectedWallet();

  if (!open) return null;

  const addNetwork = async () => {
    setAdded(null);
    try {
      await (window as unknown as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${APP_CHAIN_ID.toString(16)}`,
            chainName: "Monad Testnet",
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: [MONAD_RPC],
            blockExplorerUrls: [MONAD_EXPLORER],
          },
        ],
      });
      setAdded("Network added — now switch to Monad Testnet.");
      switchChain({ chainId: APP_CHAIN_ID });
    } catch {
      setAdded("Could not add the network. Add it manually (details below).");
    }
  };

  return (
    <Modal title="Connect wallet" onClose={onClose}>
      {!injectedAvailable ? (
        <div className="text-sm text-slate-300">
          <p>No injected wallet detected in this browser.</p>
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-xl border border-[#4F9BFF]/60 bg-[#3b5bff]/25 px-4 py-2 font-semibold text-white"
          >
            Install MetaMask
          </a>
          <p className="mt-3 text-xs text-slate-500">
            After installing, reload this page and connect again.
          </p>
        </div>
      ) : (
        <div>
          <Button
            variant="primary"
            className="w-full"
            disabled={isPending}
            onClick={() =>
              connect(
                { connector: injectedConnector() },
                { onSuccess: () => onClose() },
              )
            }
          >
            {isPending ? "Confirm in wallet…" : "Connect injected wallet"}
          </Button>
          {error && <p className="mt-2 text-xs text-no">{error.message.slice(0, 200)}</p>}
        </div>
      )}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 font-mono text-xs tabular-nums text-slate-400">
        <p className="font-semibold text-slate-300">Monad testnet details</p>
        <p className="mt-1">Chain ID 10143 · Currency MON</p>
        <p className="break-all">RPC {MONAD_RPC}</p>
        <p className="break-all">Explorer {MONAD_EXPLORER}</p>
        {injectedAvailable && (
          <button onClick={addNetwork} className="mt-2 text-azure underline">
            Add network to wallet
          </button>
        )}
        {added && <p className="mt-1 text-slate-300">{added}</p>}
      </div>
    </Modal>
  );
}
