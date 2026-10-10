"use client";

import type { Address } from "viem";
import { MarketCard } from "./MarketCard";
import type { MarketStruct } from "@/lib/market";

export function MarketsPanel({
  markets,
  count,
  isLoading,
  isError,
  refetch,
  lockWindow,
  gracePeriod,
  resolver,
  nowSec,
}: {
  markets: MarketStruct[];
  count: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  lockWindow: number;
  gracePeriod: number;
  resolver: Address | undefined;
  nowSec: number;
}) {
  if (isLoading) {
    return (
      <div className="grid animate-pulse gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-no/40 bg-no/10 p-4 text-sm">
        <p className="text-no">RPC error while loading markets.</p>
        <button
          onClick={refetch}
          className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
        >
          Retry
        </button>
      </div>
    );
  }
  if (count === 0 || markets.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-gray-400">
        No markets yet. Create the first market from a live Hacker News story.
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {markets.map((m) => (
        <MarketCard
          key={m.id.toString()}
          market={m}
          lockWindow={lockWindow}
          gracePeriod={gracePeriod}
          resolver={resolver}
          nowSec={nowSec}
        />
      ))}
    </div>
  );
}
