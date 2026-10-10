"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useStory } from "@/lib/hooks";
import { PHASE_LABEL, countdown, phaseOf, type MarketStruct } from "@/lib/market";
import { fmtMon } from "@/lib/format";
import { impliedProb } from "@/lib/payout";
import { GlassCard, Pill } from "./ui";

type PhaseTone = "yes" | "no" | "warn" | "accent" | "default";
const PHASE_TONE: Record<string, PhaseTone> = { betting: "yes", locked: "warn", awaiting: "accent", refundable: "warn", resolvedYes: "yes", resolvedNo: "no", refunded: "default" };

// Discovery cards stay read-only. Transaction actions remain on the detail route.
export function MarketCard({ market, lockWindow, gracePeriod, nowSec }: { market: MarketStruct; lockWindow: number; gracePeriod: number; resolver: Address | undefined; nowSec: number }) {
  const { data: story } = useStory(Number(market.sourceId));
  const phase = phaseOf(market, nowSec, lockWindow, gracePeriod);
  const total = market.yesPool + market.noPool;
  const yesPct = total === 0n ? 50 : Number((market.yesPool * 100n) / total);
  const yesOdds = impliedProb(market.yesPool, market.noPool);
  const settled = phase === "resolvedYes" || phase === "resolvedNo";
  const score = settled ? Number(market.finalScore) : (story?.score ?? Number(market.baselineScore));
  const baseline = Number(market.baselineScore);
  const target = Number(market.targetScore);
  const progress = Math.max(0, Math.min(100, (score / Math.max(target, 1)) * 100));
  const counting = phase === "betting" || phase === "locked";
  return <GlassCard className="p-5">
    <div className="flex items-center justify-between gap-3"><Pill tone={PHASE_TONE[phase]} dot={phase === "betting"}>{PHASE_LABEL[phase]}</Pill><span className={counting ? "font-mono text-xs tabular-nums text-slate-400" : "text-xs text-slate-400"}>{counting ? countdown(Number(market.expiry), nowSec) : "closed"}</span></div>
    <Link href={`/markets/${market.id.toString()}`} className="mt-3 block text-base font-bold leading-snug text-white hover:text-azure">{story?.title ?? `HN story ${market.sourceId.toString()}`}</Link>
    <div className="mt-4"><div className="flex justify-between text-xs text-slate-400"><span>start <span className="font-mono tabular-nums text-slate-200">{baseline}</span></span><span className="font-semibold text-white">now <span className="font-mono tabular-nums">{score}</span></span><span>goal <span className="font-mono tabular-nums text-slate-200">{target}</span></span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-monad" style={{ width: `${progress}%` }} /></div></div>
    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-no/70"><div className="h-full bg-yes" style={{ width: `${yesPct}%` }} /></div>
    <div className="mt-2 flex justify-between text-xs"><span className="text-yes">YES <span className="font-mono tabular-nums">{yesOdds === null ? "—" : `${(yesOdds * 100).toFixed(0)}%`}</span></span><span className="text-no">NO <span className="font-mono tabular-nums">{yesOdds === null ? "—" : `${((1 - yesOdds) * 100).toFixed(0)}%`}</span></span></div>
    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">Pool <span className="font-mono tabular-nums">{fmtMon(total)} MON</span></span><Link href={`/markets/${market.id.toString()}`} className="rounded-xl bg-monad px-3 py-2 text-sm font-semibold text-white hover:bg-monad/80">{phase === "betting" ? "View & trade" : "View market"}</Link></div>
  </GlassCard>;
}
