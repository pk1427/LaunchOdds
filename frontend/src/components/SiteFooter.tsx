"use client";

import { CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { MONAD_EXPLORER } from "@/lib/network";
import { LogoMark } from "./Logo";
import { CopyButton } from "./ui";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/[0.07] pt-6 text-xs text-slate-500">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2">
          <LogoMark size={18} />
          <span className="font-bold text-slate-300">LaunchOdds</span>
        </span>
        {isAddressSet(CONTRACT_ADDRESS) ? (
          <>
            <span className="font-mono tabular-nums">
              {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-8)}
            </span>
            <CopyButton text={CONTRACT_ADDRESS} label="Copy address" />
            <a
              href={`${MONAD_EXPLORER}/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-azure underline"
            >
              explorer
            </a>
          </>
        ) : (
          <span>contract address not set</span>
        )}
      </div>
      <p className="mt-2 max-w-3xl">
        Testnet demo — unaudited. Outcomes are reported by a single trusted resolver;
        the contract enforces the rules but cannot verify the HN API. Not financial
        advice.
      </p>
    </footer>
  );
}
