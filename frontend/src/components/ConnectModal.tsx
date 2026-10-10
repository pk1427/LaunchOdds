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
      <p className="-mt-1 text-sm text-slate-400">
        Connect a browser wallet to trade, create markets, and manage positions.
      </p>
      {!injectedAvailable ? (
        <div className="text-sm text-slate-300">
          <p>No injected wallet detected in this browser.</p>
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-xl bg-monad px-4 py-2 font-semibold text-white"
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
            {isPending ? "Confirm in wallet…" : "Connect browser wallet"}
          </Button>
          {error && <p className="mt-2 text-xs text-no">{error.message.slice(0, 200)}</p>}
        </div>
      )}
      <div className="mt-4 border-t border-white/10 pt-4 text-sm text-slate-400">
        <p>Use Monad Testnet (chain ID 10143) to place positions.</p>
        {injectedAvailable && (
          <button onClick={addNetwork} className="mt-3 text-sm font-semibold text-azure hover:underline">
            Add Monad Testnet to wallet
          </button>
        )}
        {added && <p className="mt-2 text-sm text-slate-300">{added}</p>}
      </div>
    </Modal>
  );
}
