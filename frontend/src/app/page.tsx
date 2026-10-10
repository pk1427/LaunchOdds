"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useChainParams, useNow } from "@/lib/hooks";
import { Status, phaseOf } from "@/lib/market";
import { fmtMon } from "@/lib/format";
import { MarketsPanel } from "@/components/MarketsPanel";

export default function Home() {
  const { chainId } = useAccount();
  const { markets, count, isLoading, isError, refetch } = useAllMarkets(200);
  const params = useChainParams();
  const nowSec = useNow(5000);

  const open = markets.filter(
    (m) => m.status === Status.Open && phaseOf(m, nowSec, params.lockWindow, params.gracePeriod) === "betting",
  );
  const totalStaked = markets.reduce((a, m) => a + m.totalPool, 0n);

  if (!isAddressSet(CONTRACT_ADDRESS)) {
    return (
      <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
        <p className="font-semibold text-yellow-300">Contract address not set</p>
        <p className="mt-1 font-mono text-sm text-gray-300">
          Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local and restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className="rounded-xl border border-monad/30 bg-monad/10 p-6">
        <h2 className="text-2xl font-black">Will that Show HN launch take off? Bet on it.</h2>
        <p className="mt-2 max-w-3xl text-sm text-gray-300">
          LaunchOdds turns Hacker News launch scores into parimutuel prediction markets.
          Stake MON on YES if a story reaches its target by the deadline — winners split
          the losing side&apos;s pool.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-gray-400">
          Honest limitation: outcomes are reported by a single trusted resolver. The
          contract enforces the rules but cannot verify the HN API itself. Silent
          resolver? Anyone can trigger refunds after the grace period.
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            href="/create"
            className="rounded-lg bg-monad px-4 py-2 font-semibold text-white hover:brightness-110"
          >
            Create a market
          </Link>
          <Link
            href="/markets"
            className="rounded-lg bg-white/10 px-4 py-2 font-semibold hover:bg-white/20"
          >
            Browse markets
          </Link>
        </div>
      </section>

      <section className="mt-4 grid gap-2 md:grid-cols-3">
        {[
          ["1 · Pick a launch", "Find a climbing Show HN story and set a target score + deadline."],
          ["2 · Take a side", "Stake MON on YES or NO. Same-side top-ups aggregate; no switching sides."],
          ["3 · Claim winnings", "After the resolver reports the final score, winners pull their payout."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-bold">{t}</p>
            <p className="mt-1 text-sm text-gray-400">{d}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-2 md:grid-cols-3">
        <Stat label="Markets created" value={isLoading ? "…" : count.toString()} />
        <Stat label="Total MON staked" value={isLoading ? "…" : `${fmtMon(totalStaked)} MON`} mono />
        <Stat label="Open now" value={isLoading ? "…" : open.length.toString()} />
      </section>

      {chainId !== undefined && chainId !== APP_CHAIN_ID && (
        <div className="mt-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          Wrong network — switch your wallet to Monad Testnet to interact.
        </div>
      )}

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="text-lg font-bold">Open now</h2>
        <Link href="/markets" className="text-sm text-monad underline">
          All markets →
        </Link>
      </div>
      <MarketsPanel
        markets={open.slice(0, 4)}
        count={open.length}
        isLoading={isLoading}
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
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-black ${mono ? "font-mono tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}
