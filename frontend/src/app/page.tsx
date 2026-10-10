"use client";

import Link from "next/link";
import { CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useChainParams, useNow } from "@/lib/hooks";
import { Status, phaseOf } from "@/lib/market";
import { fmtMon } from "@/lib/format";
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

export default function Home() {
  const { markets, count, isLoading, isError, refetch } = useAllMarkets(6);
  const params = useChainParams();
  const nowSec = useNow(5000);

  const open = markets.filter(
    (m) =>
      m.status === Status.Open &&
      phaseOf(m, nowSec, params.lockWindow, params.gracePeriod) === "betting",
  );
  const totalStaked = markets.reduce((a, m) => a + m.totalPool, 0n);

  return (
    <div>
      {/* a. Hero */}
      <section className="mx-auto max-w-2xl py-8 text-center sm:py-12">
        <div className="anim-rise">
          <Pill tone="accent" dot>
            Monad Testnet
          </Pill>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            Back the next
            <br className="hidden sm:block" />
            <span className="text-monad">
              breakout launch
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
            Predict whether a Show HN story will reach its score target. Pick a side,
            stake MON, and claim if your position wins.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Monad Testnet only. Outcomes are submitted by a trusted resolver.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/markets"
              className="inline-flex items-center gap-1.5 rounded-xl bg-monad px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700"
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
          <div className="mt-5 flex justify-center gap-5 text-sm text-slate-500">
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
              <StatCard label="Pool in latest markets" value={`${fmtMon(totalStaked)} MON`} />
            </div>
            <div className="anim-rise-3">
              <StatCard label="Open in latest markets" value={open.length.toString()} />
            </div>
          </>
        )}
      </section>

      {/* c. How it works strip */}
      <section className="mt-12" aria-label="How it works">
        <h2 className="text-xl font-bold">How it works</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", "Pick a launch", "Choose a Show HN story gaining traction."],
            ["02", "Set target and deadline", "Target score plus a 3m–1h deadline."],
            ["03", "Bet YES or NO", "Stake MON. One side per wallet per market."],
            ["04", "Settle and claim", "Resolver reports the score; winners pull payouts."],
          ].map(([n, t, d]) => (
            <GlassCard key={n} className="p-4">
              <p className="text-sm font-semibold text-monad">{n}</p>
              <p className="mt-1 font-bold">{t}</p>
              <p className="mt-1 text-sm text-slate-400">{d}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* d. Open preview */}
      <section className="mt-12" aria-label="Open markets preview">
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

      <section className="mt-10 border-y border-white/[0.08] py-5" aria-label="Market safeguards">
        <div className="grid gap-5 text-sm sm:grid-cols-3">
          {[
            ["Funds stay escrowed", "Stakes live in the contract until a winning claim or refund moves them."],
            ["Pull-based claims", "Winners claim their own payouts; settlement never pushes funds."],
            ["Refund conditions", "The contract decides when a position can be refunded or claimed."],
          ].map(([t, d]) => (
            <div key={t}>
              <p className="font-bold">{t}</p>
              <p className="mt-1 text-sm text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* g. Final CTA */}
      <section className="mt-12 rounded-2xl bg-white/[0.04] p-8 text-center">
        <h2 className="text-2xl font-black">See a story gaining momentum?</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          Create a market in under a minute and let the crowd price the breakout.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-monad px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700"
        >
          Create a market <ArrowIcon />
        </Link>
      </section>
    </div>
  );
}
