"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useChainParams, useNow } from "@/lib/hooks";
import { Status, phaseOf } from "@/lib/market";
import { MarketsPanel } from "@/components/MarketsPanel";
import { ConnectModal } from "@/components/ConnectModal";
import { Button, EmptyState, Skeleton, Tabs } from "@/components/ui";

type Tab = "open" | "resolving" | "settled" | "mine";
type Sort = "newest" | "closing" | "pool";
const INITIAL_MARKETS = 6;

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [sort, setSort] = useState<Sort>("newest");
  const [loaded, setLoaded] = useState(INITIAL_MARKETS);
  const [connectOpen, setConnectOpen] = useState(false);
  const { address } = useAccount();
  const { markets, count, isLoading, isError, refetch } = useAllMarkets(loaded);
  const params = useChainParams();
  const nowSec = useNow(5000);

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
    const list = markets.filter((m) => {
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
    const by =
      sort === "closing"
        ? (a: (typeof list)[number], b: (typeof list)[number]) =>
            Number(a.expiry) - Number(b.expiry)
        : sort === "pool"
          ? (a: (typeof list)[number], b: (typeof list)[number]) =>
              b.totalPool > a.totalPool ? 1 : b.totalPool < a.totalPool ? -1 : 0
          : (a: (typeof list)[number], b: (typeof list)[number]) =>
              b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
    return [...list].sort(by);
  }, [markets, tab, sort, nowSec, params.lockWindow, params.gracePeriod, address, hasPosition]);


  if (!isAddressSet(CONTRACT_ADDRESS)) {
    return (
      <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
        <p className="font-semibold text-yellow-300">Contract address not set</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Markets</h1>
          <p className="mt-1 text-sm text-slate-400">Pick a story, choose YES or NO, and follow its score.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">{count} markets so far</p>
      <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs<Tab>
          ariaLabel="Market filters"
          value={tab}
          onChange={(t) => {
            setTab(t);
          }}
          options={[
            { value: "open", label: "Open" },
            { value: "resolving", label: "Resolving" },
            { value: "settled", label: "Settled" },
            { value: "mine", label: "Mine" },
          ]}
        />
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-slate-200"
          >
            <option value="newest">Newest</option>
            <option value="closing">Closing soon</option>
            <option value="pool">Biggest pool</option>
          </select>
        </label>
      </div>

      {tab === "mine" && !address ? (
        <EmptyState
          title="Connect to see your markets"
          body="See the markets you created and the ones you joined."
          action={
            <Button variant="primary" onClick={() => setConnectOpen(true)}>
              Connect wallet
            </Button>
          }
        />
      ) : isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <>
          <MarketsPanel
            markets={filtered}
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
          {markets.length < count && (
            <div className="mt-5 text-center">
              <Button
                variant="secondary"
                onClick={() => setLoaded((n) => n + INITIAL_MARKETS)}
              >
                Show 6 more markets
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
