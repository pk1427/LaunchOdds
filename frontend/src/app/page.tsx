"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useChainParams, useNow } from "@/lib/hooks";
import { Status, phaseOf } from "@/lib/market";
import { fmtMon } from "@/lib/format";
import {
  ageString,
  fetchShowStories,
  fetchUsableStories,
  pointsPerHour,
} from "@/lib/hn";
import { MarketsPanel } from "@/components/MarketsPanel";
import { GlassCard, Pill, Skeleton, StatCard } from "@/components/ui";

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 12L12 4M12 4H6M12 4V10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 2.5h7.5A1.5 1.5 0 0 1 12 4v9.5H4.5A1.5 1.5 0 0 1 3 12V2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M3 10.5h9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const FLOAT_CARDS = [
  {
    title: "Live HN scores",
    caption: "STREAMING",
    body: "Story scores refresh every few seconds.",
    live: true,
  },
  {
    title: "On-chain escrow",
    caption: "PULL CLAIMS",
    body: "Stakes sit in the contract until winners claim.",
    live: false,
  },
  {
    title: "Timeout refunds",
    caption: "PERMISSIONLESS",
    body: "Silent resolver? Anyone triggers refunds after grace.",
    live: false,
  },
];

export default function Home() {
  const { markets, count, isLoading, isError, refetch } = useAllMarkets(200);
  const params = useChainParams();
  const nowSec = useNow(5000);

  const pulse = useQuery({
    queryKey: ["showhn-pulse"],
    queryFn: async () => {
      const ids = await fetchShowStories();
      return fetchUsableStories(ids.slice(0, 40), 4);
    },
    refetchInterval: 20_000,
    retry: 2,
  });

  const open = markets.filter(
    (m) =>
      m.status === Status.Open &&
      phaseOf(m, nowSec, params.lockWindow, params.gracePeriod) === "betting",
  );
  const totalStaked = markets.reduce((a, m) => a + m.totalPool, 0n);

  return (
    <div>
      {/* a. Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div className="anim-rise">
          <Pill tone="accent" dot>
            Live on Monad testnet
          </Pill>
          <h1 className="mt-4 text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl">
            Bet on the next
            <br />
            <span className="bg-gradient-to-r from-azure to-monad bg-clip-text text-transparent">
              breakout launch.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-400">
            LaunchOdds turns Show HN story scores into parimutuel prediction markets.
            Stake MON on YES if a launch hits its target — winners split the losing
            side.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/markets"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#4F9BFF]/60 bg-[#3b5bff]/25 px-5 py-2.5 font-semibold text-white transition hover:bg-[#3b5bff]/40"
            >
              Launch App <ArrowIcon />
            </Link>
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 font-semibold text-white transition hover:bg-white/10"
            >
              Create a market
            </Link>
          </div>
          <div className="mt-4 flex gap-5 font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
            <Link href="/how-it-works" className="inline-flex items-center gap-1.5 hover:text-slate-200">
              <BookIcon /> How it works
            </Link>
            {isAddressSet(CONTRACT_ADDRESS) && (
              <a
                href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-slate-200"
              >
                <BookIcon /> Contract on explorer
              </a>
            )}
          </div>
        </div>
        <div className="hidden flex-col gap-3 sm:flex" aria-hidden="true">
          {FLOAT_CARDS.map((c, i) => (
            <GlassCard
              key={c.title}
              className={`${i === 0 ? "anim-float ml-8" : i === 1 ? "anim-float-slow" : "anim-float ml-4"} max-w-sm p-4`}
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">{c.title}</p>
                <Pill tone={c.live ? "yes" : "default"} dot={c.live}>
                  {c.caption}
                </Pill>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-400">{c.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* b. Live stats */}
      <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Live stats">
        {isLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : isError ? (
          <GlassCard className="sm:col-span-3">
            <p className="text-sm text-no">Live stats unavailable (RPC error).</p>
            <button
              onClick={() => void refetch()}
              className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              Retry
            </button>
          </GlassCard>
        ) : (
          <>
            <div className="anim-rise-1">
              <StatCard label="Total markets" value={count.toString()} />
            </div>
            <div className="anim-rise-2">
              <StatCard label="Total MON staked" value={`${fmtMon(totalStaked)} MON`} />
            </div>
            <div className="anim-rise-3">
              <StatCard label="Open markets" value={open.length.toString()} />
            </div>
          </>
        )}
      </section>

      {/* c. Show HN pulse */}
      <section className="mt-8" aria-label="Live Show HN pulse">
        <h2 className="text-lg font-bold">Live Show HN pulse</h2>
        {pulse.isLoading ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : pulse.isError ? (
          <p className="mt-2 text-sm text-slate-400">
            HN feed unavailable.{" "}
            <button onClick={() => void pulse.refetch()} className="text-azure underline">
              Retry
            </button>
          </p>
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(pulse.data ?? []).map((s) => (
              <a
                key={s.id}
                href={`https://news.ycombinator.com/item?id=${s.id}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 transition hover:border-white/[0.14]"
              >
                <p className="line-clamp-2 text-sm font-semibold text-white">{s.title}</p>
                <p className="mt-2 font-mono text-xs tabular-nums text-slate-400">
                  {s.score} pts · {ageString(s.time, nowSec)} ago ·{" "}
                  {pointsPerHour(s, nowSec).toFixed(1)} pts/h
                </p>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* d. How it works strip */}
      <section className="mt-8" aria-label="How it works">
        <h2 className="text-lg font-bold">How it works</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", "Pick a launch", "Choose a Show HN story gaining traction."],
            ["02", "Set target and deadline", "Target score plus a 3m–1h deadline."],
            ["03", "Bet YES or NO", "Stake MON. One side per wallet per market."],
            ["04", "Settle and claim", "Resolver reports the score; winners pull payouts."],
          ].map(([n, t, d]) => (
            <GlassCard key={n} className="p-4">
              <p className="font-mono text-xs tracking-[0.2em] text-monad">{n}</p>
              <p className="mt-1 font-bold">{t}</p>
              <p className="mt-1 text-sm text-slate-400">{d}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* e. Open preview */}
      <section className="mt-8" aria-label="Open markets preview">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">Open now</h2>
          <Link href="/markets" className="text-sm font-semibold text-azure hover:underline">
            View all markets →
          </Link>
        </div>
        <MarketsPanel
          markets={open.slice(0, 3)}
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
      </section>

      {/* f. Trust and safety */}
      <section className="mt-8" aria-label="Trust and safety">
        <h2 className="text-lg font-bold">Trust and safety</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Funds stay escrowed", "Stakes live in the contract until a winning claim or refund moves them."],
            ["Pull-based claims", "Winners claim their own payouts; settlement never pushes funds."],
            ["Reentrancy-guarded", "Claims update accounting before any transfer and are non-reentrant."],
            ["Empty-side refunds", "If nobody backed the winning side, everyone gets their stake back."],
            ["Quiet-resolver refunds", "Past expiry plus grace, anyone can permissionlessly trigger refunds."],
            ["Trusted resolver", "One address reports HN scores. The contract cannot verify the API — testnet, unaudited."],
          ].map(([t, d]) => (
            <GlassCard key={t} className="p-4">
              <p className="font-bold">{t}</p>
              <p className="mt-1 text-sm text-slate-400">{d}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* g. Final CTA */}
      <section className="mt-8 rounded-2xl border border-monad/30 bg-gradient-to-r from-monad/15 to-azure/10 p-8 text-center">
        <h2 className="text-2xl font-black">Found a launch taking off?</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          Create a market in under a minute and let the crowd price the breakout.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[#4F9BFF]/60 bg-[#3b5bff]/25 px-5 py-2.5 font-semibold text-white transition hover:bg-[#3b5bff]/40"
        >
          Create a market <ArrowIcon />
        </Link>
      </section>
    </div>
  );
}
