"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount as useWagmiAccount } from "wagmi";
import { parseEther, type Address } from "viem";
import { useReadContract } from "wagmi";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import {
  useCanResolve,
  useChainParams,
  useMarketTx,
  useNow,
  usePosition,
  usePreviewClaim,
  useStory,
} from "@/lib/hooks";
import {
  PHASE_LABEL,
  Status,
  countdown,
  phaseOf,
  type MarketStruct,
  type Phase,
} from "@/lib/market";
import { fmtMon, localTime, relTime } from "@/lib/format";
import { impliedProb, payoutMultiple, previewPayout } from "@/lib/payout";
import { buildEvidence } from "@/lib/metadata";
import { fetchItem, isUsableStory } from "@/lib/hn";
import { ConnectModal } from "@/components/ConnectModal";
import { Button, GlassCard, Pill, Skeleton } from "@/components/ui";

type PhaseTone = "yes" | "no" | "warn" | "accent" | "default";
const PHASE_TONE: Record<string, PhaseTone> = {
  betting: "yes",
  locked: "warn",
  awaiting: "accent",
  refundable: "warn",
  resolvedYes: "yes",
  resolvedNo: "no",
  refunded: "default",
};

export default function MarketDetailPage() {
  const params = useParams();
  const raw = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const idNum = Number(raw);
  const valid = Number.isInteger(idNum) && idNum >= 1;
  const id = valid ? BigInt(idNum) : 0n;

  const { address } = useWagmiAccount();
  const qc = useQueryClient();
  const nowSec = useNow(1000);
  const chain = useChainParams();
  const [big, setBig] = useState(false);

  const marketQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: launchOddsAbi,
    functionName: "getMarket",
    args: [id],
    chainId: APP_CHAIN_ID,
    query: { enabled: isAddressSet(CONTRACT_ADDRESS) && valid, refetchInterval: 5000 },
  });
  const m = marketQuery.data as unknown as MarketStruct | undefined;

  if (!isAddressSet(CONTRACT_ADDRESS)) {
    return <SetupNotice />;
  }
  if (!valid) {
    return <ErrCard msg={`Invalid market id "${raw}".`} />;
  }
  if (marketQuery.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }
  if (marketQuery.isError || !m) {
    return (
      <ErrCard
        msg="Market not found or RPC error."
        retry={() => void marketQuery.refetch()}
      />
    );
  }
  return (
    <DetailBody
      market={m}
      nowSec={nowSec}
      lockWindow={chain.lockWindow}
      gracePeriod={chain.gracePeriod}
      resolver={chain.resolver}
      address={address}
      big={big}
      setBig={setBig}
      invalidate={() => void qc.invalidateQueries()}
    />
  );
}

function DetailBody({
  market: m,
  nowSec,
  lockWindow,
  gracePeriod,
  resolver,
  address,
  big,
  setBig,
  invalidate,
}: {
  market: MarketStruct;
  nowSec: number;
  lockWindow: number;
  gracePeriod: number;
  resolver: Address | undefined;
  address: Address | undefined;
  big: boolean;
  setBig: (b: boolean) => void;
  invalidate: () => void;
}) {
  const id = m.id;
  const storyId = Number(m.sourceId);
  const { data: story } = useStory(storyId);
  const { data: posData } = usePosition(id);
  const { data: preview } = usePreviewClaim(id);
  const { data: canResolve } = useCanResolve(id);
  const tx = useMarketTx();
  const [stake, setStake] = useState("0.1");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [connectOpen, setConnectOpen] = useState(false);

  const phase = phaseOf(m, nowSec, lockWindow, gracePeriod);
  const position = posData as unknown as
    | { amount: bigint; isYes: boolean; claimed: boolean }
    | undefined;
  const canClaim = (preview as unknown as [boolean, bigint] | undefined)?.[0] ?? false;
  const expected = (preview as unknown as [boolean, bigint] | undefined)?.[1] ?? 0n;
  const liveScore = story?.score;
  const final = m.status === Status.ResolvedYes || m.status === Status.ResolvedNo;
  const scoreShown = final ? Number(m.finalScore) : (liveScore ?? Number(m.baselineScore));
  const expiry = Number(m.expiry);
  const target = Number(m.targetScore);
  const baseline = Number(m.baselineScore);
  const need = Math.max(target - scoreShown, 0);
  const settled =
    phase === "resolvedYes" || phase === "resolvedNo" || phase === "refunded";

  const send = (
    fn: "takePosition" | "claim" | "refundUnresolvedMarket" | "resolveMarket",
    args: readonly unknown[],
    value?: bigint,
  ) => {
    if (!CONTRACT_ADDRESS) return;
    tx.writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: launchOddsAbi,
        functionName: fn,
        args: args as never,
        ...(value !== undefined ? { value } : {}),
        chainId: APP_CHAIN_ID,
      } as never,
      {
        pendingTitle:
          fn === "takePosition"
            ? "Placing bet…"
            : fn === "claim"
              ? "Claiming…"
              : fn === "refundUnresolvedMarket"
                ? "Triggering refunds…"
                : "Resolving…",
        onSuccess: () => setTimeout(invalidate, 1500),
      },
    );
  };

  const bet = (isYes: boolean) => {
    let value: bigint;
    try {
      value = parseEther(stake || "0");
    } catch {
      return;
    }
    if (value <= 0n) return;
    send("takePosition", [id, isYes], value);
  };

  const resolveLive = async () => {
    try {
      const item = await fetchItem(storyId);
      if (!isUsableStory(item) || typeof item.score !== "number") return;
      const { hash } = buildEvidence(storyId, item.score);
      send("resolveMarket", [id, BigInt(item.score), hash]);
    } catch {
      /* ignored */
    }
  };

  // Live payout preview for the entered stake (estimate only; the real
  // claimable amount always comes from previewClaim after settlement).
  let stakeAmt = 0n;
  try {
    stakeAmt = parseEther(stake || "0");
  } catch {
    stakeAmt = 0n;
  }
  const ifYes = previewPayout(stakeAmt, m.yesPool, m.noPool);
  const ifNo = previewPayout(stakeAmt, m.noPool, m.yesPool);
  const yesMult = payoutMultiple(m.yesPool, m.noPool);
  const noMult = payoutMultiple(m.noPool, m.yesPool);
  const yesProb = impliedProb(m.yesPool, m.noPool);

  const holdsYes = position && position.amount > 0n && position.isYes;
  const holdsNo = position && position.amount > 0n && !position.isYes;
  const isResolver =
    !!address && !!resolver && address.toLowerCase() === resolver.toLowerCase();
  const sideBlocked = side === "yes" ? !!holdsNo : !!holdsYes;

  const steps = timeline(m, lockWindow, gracePeriod, phase);
  const total = m.yesPool + m.noPool;
  const yesPct = total === 0n ? 50 : Number((m.yesPool * 100n) / total);

  return (
    <div>
      <Link href="/markets" className="text-sm font-semibold text-azure hover:underline">
        ← All markets
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-2xl">
          <a
            href={`https://news.ycombinator.com/item?id=${storyId}`}
            target="_blank"
            rel="noreferrer"
            className="text-2xl font-black tracking-tight hover:text-[#b7a8ff]"
          >
            {story?.title ?? `HN story ${storyId}`}
          </a>
          <p className="mt-1 text-sm text-slate-400">
            Market #{id.toString()} · Will it reach {target} points by deadline? ·
            Created by{" "}
            <span className="font-mono text-xs tabular-nums">
              {m.creator.slice(0, 6)}…{m.creator.slice(-4)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={PHASE_TONE[phase]} dot={phase === "betting"}>
            {PHASE_LABEL[phase]}
          </Pill>
          <button
            onClick={() => setBig(!big)}
            aria-pressed={big}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-300 hover:bg-white/10"
            title="Big-screen mode for presenting"
          >
            {big ? "Normal view" : "Big screen"}
          </button>
        </div>
      </div>

      {big && (
        <GlassCard className="mt-3 border-monad/40 text-center">
          <div className="font-mono text-6xl font-black tabular-nums">
            {phase === "betting" || phase === "locked"
              ? countdown(expiry, nowSec)
              : PHASE_LABEL[phase]}
          </div>
          <div className="mt-2 font-mono text-5xl font-black tabular-nums text-monad">
            {scoreShown} <span className="text-2xl text-slate-400">/ {target}</span>
          </div>
        </GlassCard>
      )}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-5">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-3">
          <GlassCard>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Score progress
            </h3>
            <div className="mt-2 flex items-end justify-between font-mono tabular-nums">
              <span className="text-xs text-slate-400">base {baseline}</span>
              <span className="text-3xl font-black text-white">
                {final ? "final" : "live"} {scoreShown}
              </span>
              <span className="text-xs text-slate-400">target {target}</span>
            </div>
            <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-azure to-monad"
                style={{ width: `${Math.min(100, (scoreShown / Math.max(target, 1)) * 100)}%` }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-white/70"
                style={{ left: `${Math.min(100, (baseline / Math.max(target, 1)) * 100)}%` }}
                title={`Baseline ${baseline}`}
              />
            </div>
            {(phase === "betting" || phase === "locked") && (
              <p className="mt-2 text-sm text-slate-300">
                Needs <b className="font-mono tabular-nums">+{need}</b> in{" "}
                <b className="font-mono tabular-nums">{countdown(expiry, nowSec)}</b>
                <span className="text-slate-500">
                  {" "}
                  · {localTime(expiry)} ({relTime(expiry, nowSec)})
                </span>
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Timeline
            </h3>
            <ol className="mt-2 space-y-1.5">
              {steps.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                      i < s.doneUpTo
                        ? "bg-yes text-black"
                        : i === s.doneUpTo
                          ? "bg-monad text-white"
                          : "bg-white/10 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={i === s.doneUpTo ? "font-semibold text-white" : "text-slate-400"}
                  >
                    {s.label}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-slate-500">{s.when}</span>
                </li>
              ))}
            </ol>
          </GlassCard>

          <GlassCard>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Pools
            </h3>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-yes" style={{ width: `${yesPct}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums">
              <span className="text-yes">
                YES {fmtMon(m.yesPool)} · {m.yesPositions.toString()} wallets
                {yesProb !== null ? ` · ${(yesProb * 100).toFixed(0)}%` : ""}
              </span>
              <span className="text-no">
                NO {fmtMon(m.noPool)} · {m.noPositions.toString()} wallets
                {yesProb !== null ? ` · ${((1 - yesProb) * 100).toFixed(0)}%` : ""}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs tabular-nums text-slate-400">
              total pool {fmtMon(total)} MON
            </p>
          </GlassCard>

          <GlassCard>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
              My position
            </h3>
            {!address ? (
              <div className="mt-2">
                <p className="text-sm text-slate-400">Connect your wallet to trade.</p>
                <Button variant="primary" size="sm" className="mt-2" onClick={() => setConnectOpen(true)}>
                  Connect wallet
                </Button>
              </div>
            ) : !position || position.amount === 0n ? (
              <p className="mt-2 text-sm text-slate-400">No position in this market.</p>
            ) : (
              <div className="mt-2 text-sm">
                <p className="font-mono tabular-nums">
                  {fmtMon(position.amount)} MON on {position.isYes ? "YES" : "NO"}
                  {position.claimed ? " · claimed" : ""}
                </p>
                {canClaim && !position.claimed && (
                  <p className="text-yes">Estimate: {fmtMon(expected)} MON</p>
                )}
                {settled && (
                  <Button
                    variant="primary"
                    className="mt-2 w-full"
                    disabled={!canClaim}
                    title={!canClaim ? "No claimable amount for your position" : undefined}
                    onClick={() => send("claim", [id])}
                  >
                    {canClaim
                      ? phase === "refunded"
                        ? `Claim refund ${fmtMon(expected)} MON`
                        : `Claim ${fmtMon(expected)} MON`
                      : position.claimed
                        ? phase === "refunded"
                          ? "Refund claimed"
                          : "Already claimed"
                        : "Nothing to claim"}
                  </Button>
                )}
              </div>
            )}
          </GlassCard>

          {settled && (
            <GlassCard>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Resolution
              </h3>
              <p className="mt-2 font-mono text-sm tabular-nums">
                final score {m.finalScore.toString()} → {PHASE_LABEL[phase]}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-500">
                evidence {m.evidenceHash}
              </p>
              <a
                href={`https://news.ycombinator.com/item?id=${storyId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-azure underline"
              >
                HN item #{storyId}
              </a>
              <p className="mt-1 text-xs text-slate-500">
                Reported by a trusted resolver; the contract cannot verify the HN API itself.
              </p>
            </GlassCard>
          )}

          <details className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Contract details</summary>
            <dl className="mt-2 grid gap-1 font-mono text-xs tabular-nums text-slate-400">
              <div>id: {id.toString()}</div>
              <div>creator: {m.creator}</div>
              <div>sourceId: {m.sourceId.toString()}</div>
              <div className="break-all">metadataHash: {m.metadataHash}</div>
              <div>
                contract: {CONTRACT_ADDRESS}{" "}
                <a
                  href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-azure underline"
                >
                  explorer
                </a>
              </div>
            </dl>
          </details>
        </div>

        {/* Right column: sticky trade panel */}
        <div className="lg:sticky lg:top-24 lg:col-span-2">
          <GlassCard className="border-monad/25">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Trade
            </h3>
            {phase !== "betting" ? (
              <p className="mt-2 text-sm text-slate-400">
                Betting is closed ({PHASE_LABEL[phase]}).
              </p>
            ) : !address ? (
              <div className="mt-2">
                <p className="text-sm text-slate-400">Connect your wallet to trade.</p>
                <Button variant="primary" className="mt-2 w-full" onClick={() => setConnectOpen(true)}>
                  Connect wallet to trade
                </Button>
              </div>
            ) : (
              <>
                <div
                  role="group"
                  aria-label="Pick a side"
                  className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1"
                >
                  {(["yes", "no"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      aria-pressed={side === s}
                      className={`rounded-lg py-2 text-sm font-bold uppercase tracking-wide transition ${
                        side === s
                          ? s === "yes"
                            ? "bg-yes text-black"
                            : "bg-no text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-1">
                  {["0.1", "0.5", "1"].map((q) => (
                    <button
                      key={q}
                      onClick={() => setStake(q)}
                      className={`rounded-lg px-2 py-1 font-mono text-xs tabular-nums ${stake === q ? "bg-monad text-white" : "bg-white/10 text-slate-300"}`}
                    >
                      {q}
                    </button>
                  ))}
                  <input
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    inputMode="decimal"
                    aria-label="Stake in MON"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="mt-2 min-h-8 font-mono text-xs tabular-nums text-slate-400">
                  {stakeAmt > 0n ? (
                    <>
                      If YES wins you receive {fmtMon(ifYes)} MON
                      {yesMult ? ` (${yesMult.toFixed(2)}x)` : ""} · If NO wins you
                      receive {fmtMon(ifNo)} MON{noMult ? ` (${noMult.toFixed(2)}x)` : ""}
                    </>
                  ) : (
                    "Enter a stake to see live payout previews."
                  )}
                </div>
                <Button
                  variant="primary"
                  className="mt-2 w-full"
                  disabled={sideBlocked || stakeAmt <= 0n}
                  title={
                    sideBlocked
                      ? `You hold ${side === "yes" ? "NO" : "YES"} — the contract rejects opposing positions`
                      : undefined
                  }
                  onClick={() => bet(side === "yes")}
                >
                  Bet {side.toUpperCase()}
                  {stakeAmt > 0n ? ` ${fmtMon(stakeAmt)} MON` : ""}
                </Button>
              </>
            )}

            {phase === "refundable" && address && (
              <Button
                variant="secondary"
                className="mt-3 w-full border-yellow-500/40 text-yellow-300"
                onClick={() => send("refundUnresolvedMarket", [id])}
              >
                Trigger refunds
              </Button>
            )}
            {isResolver && canResolve === true && (
              <button
                onClick={resolveLive}
                className="mt-2 w-full rounded-xl border border-monad/60 px-3 py-2 text-sm text-[#b7a8ff] hover:bg-monad/10"
              >
                Resolve with live HN score (resolver only)
              </button>
            )}
          </GlassCard>
        </div>
      </div>
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
}

function timeline(
  m: MarketStruct,
  lockWindow: number,
  gracePeriod: number,
  phase: Phase,
): { label: string; when: string; doneUpTo: number }[] {
  const expiry = Number(m.expiry);
  const order: Phase[] = ["betting", "locked", "awaiting", "refundable", "resolvedYes"];
  const settled =
    phase === "resolvedYes" || phase === "resolvedNo" || phase === "refunded";
  const idx = settled ? 4 : order.indexOf(phase as Phase);
  const rows = [
    { label: "Created", when: `${localTime(Number(m.createdAt))}` },
    { label: "Betting open", when: `locks ${localTime(expiry - lockWindow)}` },
    { label: "Betting locked", when: `expires ${localTime(expiry)}` },
    { label: "Resolving", when: `refunds open ${localTime(expiry + gracePeriod)}` },
    {
      label: settled ? `Settled (${PHASE_LABEL[phase]})` : "Settled",
      when: settled ? "done" : "pending",
    },
  ];
  return rows.map((r) => ({ ...r, doneUpTo: idx }));
}

function SetupNotice() {
  return (
    <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
      <p className="font-semibold text-yellow-300">Contract address not set</p>
      <p className="mt-1 font-mono text-sm text-slate-300">
        Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local and restart the dev server.
      </p>
    </div>
  );
}

function ErrCard({ msg, retry }: { msg: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-no/40 bg-no/10 p-6 text-center">
      <p className="text-no">{msg}</p>
      {retry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={retry}>
          Retry
        </Button>
      )}
      <div className="mt-2">
        <Link href="/markets" className="text-sm text-azure underline">
          ← All markets
        </Link>
      </div>
    </div>
  );
}
