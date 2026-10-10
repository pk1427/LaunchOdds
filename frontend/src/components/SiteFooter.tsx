"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";

export function SiteFooter() {
  const [copied, setCopied] = useState(false);
  const { data } = useQuery({
    queryKey: ["resolve-status"],
    queryFn: async () => {
      const res = await fetch("/api/resolve/status");
      if (!res.ok) throw new Error("status failed");
      return (await res.json()) as { resolver: string; configured: boolean };
    },
    refetchInterval: 30_000,
    retry: 1,
  });
  const online = data?.configured === true;

  const copy = async () => {
    if (!CONTRACT_ADDRESS) return;
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <footer className="mt-8 border-t border-white/10 pt-3 text-xs text-gray-500">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            online ? "bg-yes/20 text-yes" : "bg-white/10 text-gray-400"
          }`}
          title="Server auto-resolver watching for expirable markets"
        >
          Auto-resolver {online ? "online" : "offline"}
        </span>
        {isAddressSet(CONTRACT_ADDRESS) ? (
          <>
            <button onClick={copy} className="font-mono hover:text-gray-300" title="Copy contract address">
              {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-8)} {copied ? "copied" : "copy"}
            </button>
            <a
              href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-monad underline"
            >
              explorer
            </a>
          </>
        ) : (
          <span>contract address not set</span>
        )}
      </div>
      <p className="mt-1">
        Parimutuel markets on Monad testnet. Outcomes are reported by a single trusted
        resolver — the contract enforces the rules but cannot verify the HN API. Not
        financial advice.
      </p>
    </footer>
  );
}
