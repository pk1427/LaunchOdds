"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useChainParams, useNow } from "@/lib/hooks";
import { Status, phaseOf } from "@/lib/market";
import { MarketsPanel } from "@/components/MarketsPanel";

type Tab = "open" | "resolving" | "settled" | "mine";
const TABS: Tab[] = ["open", "resolving", "settled", "mine"];
const PAGE = 20;

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [page, setPage] = useState(0);
  const { address } = useAccount();
  const { markets, count, isLoading, isError, refetch } = useAllMarkets(200);
  const params = useChainParams();
  const nowSec = useNow(5000);

  // Batched position reads for the "Mine" tab (one multicall under the hood).
  const posQuery = useReadContracts({
    contracts: markets.map((m) => ({
      address: CONTRACT_ADDRESS as Address,
      abi: launchOddsAbi,
      functionName: "getPosition",
      args: [m.id, address as Address],
      chainId: APP_CHAIN_ID,
    })),
    query: { enabled: isAddressSet(CONTRACT_ADDRESS) && !!address && markets.length > 0 },
  });
  const hasPosition = useMemo(() => {
    const set = new Set<string>();
    (posQuery.data ?? []).forEach((r, i) => {
      const p = r.result as unknown as { amount: bigint } | undefined;
      if (r.status === "success" && p && p.amount > 0n) {
        set.add(markets[i].id.toString());
      }
    });
    return set;
  }, [posQuery.data, markets]);

  const filtered = useMemo(() => {
    return markets.filter((m) => {
      const phase = phaseOf(m, nowSec, params.lockWindow, params.gracePeriod);
      if (tab === "open") return phase === "betting" || phase === "locked";
      if (tab === "resolving") return phase === "awaiting" || phase === "refundable";
      if (tab === "settled")
        return (
          m.status === Status.ResolvedYes ||
          m.status === Status.ResolvedNo ||
          m.status === Status.Refunded
        );
      return (
        (!!address && m.creator.toLowerCase() === address.toLowerCase()) ||
        hasPosition.has(m.id.toString())
      );
    });
  }, [markets, tab, nowSec, params.lockWindow, params.gracePeriod, address, hasPosition]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  if (!isAddressSet(CONTRACT_ADDRESS)) {
    return (
      <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
        <p className="font-semibold text-yellow-300">Contract address not set</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold">Markets ({count})</h2>
      <div className="mb-3 mt-2 flex gap-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setPage(0);
            }}
            className={`rounded-lg px-3 py-1.5 font-semibold capitalize ${
              tab === t ? "bg-monad text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"
            }`}
          >
            {t === "mine" ? "Mine" : t}
          </button>
        ))}
      </div>
      {isLoading ? (
        <SkeletonList />
      ) : (
        <>
          <MarketsPanel
            markets={slice}
            count={filtered.length}
            isLoading={false}
            isError={isError || params.isError}
            refetch={() => {
              void refetch();
              params.refetch();
            }}
            lockWindow={params.lockWindow}
            gracePeriod={params.gracePeriod}
            resolver={params.resolver}
            nowSec={nowSec}
          />
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <button
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="rounded-lg bg-white/10 px-3 py-1.5 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="font-mono tabular-nums">
                {safePage + 1} / {pages}
              </span>
              <button
                onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
                disabled={safePage >= pages - 1}
                className="rounded-lg bg-white/10 px-3 py-1.5 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="grid animate-pulse gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-48 rounded-xl bg-white/5" />
      ))}
    </div>
  );
}
