"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount as useWagmiAccount, useBalance, useSwitchChain } from "wagmi";
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
import { fmtMon, localTime } from "@/lib/format";
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

const PRESETS = ["0.1", "0.5", "1"];

export default function MarketDetailPage() {
  const params = useParams();
  const raw = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const idNum = Number(raw);
  const valid = Number.isInteger(idNum) && idNum >= 1;
  const id = valid ? BigInt(idNum) : 0n;

  const qc = useQueryClient();
  const nowSec = useNow(1000);
  const chain = useChainParams();

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
  invalidate,
}: {
  market: MarketStruct;
  nowSec: number;
  lockWindow: number;
  gracePeriod: number;
  resolver: Address | undefined;
  invalidate: () => void;
}) {
  const id = m.id;
  const storyId = Number(m.sourceId);
  const { data: story } = useStory(storyId);
  const { data: posData } = usePosition(id);
  const { data: preview } = usePreviewClaim(id);
  const { data: canResolve } = useCanResolve(id);
  const { address, chainId } = useWagmiAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: balanceData } = useBalance({
    address,
    chainId: APP_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
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
  const betting = phase === "betting";

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

  // Single validated amount: presets write into the same input, so the input
  // is the only source of truth — derived state can never contradict it.
  let stakeAmt = 0n;
  let stakeError: string | null = null;
  try {
    stakeAmt = parseEther(stake.trim() || "0");
    if (stakeAmt <= 0n) stakeError = "Enter an amount greater than zero.";
  } catch {
    stakeError = "Enter a valid MON amount.";
  }
  const presetActive = (q: string) => {
    try {
      return stakeAmt > 0n && parseEther(q) === stakeAmt;
    } catch {
      return false;
    }
  };

  // Live payout preview from real pool data (estimate only; post-settlement
  // claimable amounts always come from previewClaim).
  const ifYes = previewPayout(stakeAmt, m.yesPool, m.noPool);
  const ifNo = previewPayout(stakeAmt, m.noPool, m.yesPool);
  const yesMult = payoutMultiple(m.yesPool, m.noPool);
  const noMult = payoutMultiple(m.noPool, m.yesPool);
  const yesProb = impliedProb(m.yesPool, m.noPool);
  const selectedPreview = side === "yes" ? ifYes : ifNo;
  const selectedMult = side === "yes" ? yesMult : noMult;

  const holdsYes = position && position.amount > 0n && position.isYes;
  const holdsNo = position && position.amount > 0n && !position.isYes;
  const hasPosition = !!position && position.amount > 0n;
  const isResolver =
    !!address && !!resolver && address.toLowerCase() === resolver.toLowerCase();
  const sideBlocked = side === "yes" ? !!holdsNo : !!holdsYes;
  const wrongNetwork = !!address && chainId !== APP_CHAIN_ID;
  const insufficient =
    !!balanceData && !stakeError && stakeAmt > balanceData.value;
  const pendingTx = tx.phase === "confirm" || tx.phase === "confirming";

  const betDisabled =
    !!sideBlocked || !!stakeError || !!insufficient || pendingTx;
  const betHint = sideBlocked
    ? `You already hold ${side === "yes" ? "NO" : "YES"} — the contract rejects opposing positions.`
    : stakeError
      ? stakeError
      : insufficient
        ? "Insufficient MON balance for this amount."
        : pendingTx
          ? tx.phase === "confirm"
            ? "Waiting for wallet confirmation…"
            : "Confirming on Monad testnet…"
          : null;

  const bet = (isYes: boolean) => {
    if (pendingTx || stakeError || stakeAmt <= 0n) return;
    send("takePosition", [id, isYes], stakeAmt);
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

  const steps = timeline(m, lockWindow, gracePeriod, phase);
  const total = m.yesPool + m.noPool;
  const yesPct = total === 0n ? 0 : Number((m.yesPool * 100n) / total);
  const yesShare = yesProb === null ? null : `${(yesProb * 100).toFixed(0)}%`;
  const noShare =
    yesProb === null ? null : `${((1 - yesProb) * 100).toFixed(0)}%`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/markets" className="text-sm font-semibold text-azure hover:underline">
        ← Markets
      </Link>

      {/* A. Compact market header */}
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={PHASE_TONE[phase]} dot={betting}>
            {PHASE_LABEL[phase]}
          </Pill>
          {(betting || phase === "locked") && (
            <span className="text-xs text-slate-400">
              Closes in{" "}
              <span className="font-mono tabular-nums text-slate-200">
                {countdown(expiry, nowSec)}
              </span>
            </span>
          )}
        </div>
        <a
          href={`https://news.ycombinator.com/item?id=${storyId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-xl font-bold leading-snug tracking-tight hover:text-azure"
        >
          {story?.title ?? `HN story ${storyId}`}
        </a>
        <p className="mt-1 text-sm text-slate-400">
          Will this story reach{" "}
          <span className="font-mono tabular-nums text-slate-200">{target}</span>{" "}
          points before the deadline?
        </p>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-5">
        {/* B. Score progress */}
        <div className="space-y-4 lg:col-span-3">
          <GlassCard className="p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="type-eyebrow">Current score</p>
                <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">
                  {scoreShown}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>
                  Start{" "}
                  <span className="font-mono tabular-nums text-slate-200">
                    {baseline}
                  </span>
                </p>
                <p className="mt-0.5">
                  Target{" "}
                  <span className="font-mono tabular-nums text-slate-200">
                    {target}
                  </span>
                </p>
              </div>
            </div>
            <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-monad"
                style={{ width: `${Math.min(100, (scoreShown / Math.max(target, 1)) * 100)}%` }}
              />
              <div
                className="absolute top-0 h-full w-0.5 bg-white/70"
                style={{ left: `${Math.min(100, (baseline / Math.max(target, 1)) * 100)}%` }}
                title={`Baseline ${baseline}`}
              />
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {final ? (
                Number(m.finalScore) >= target ? (
                  <>Target reached.</>
                ) : (
                  <>Target missed.</>
                )
              ) : need > 0 ? (
                <>
                  <b className="font-mono tabular-nums text-white">{need}</b>{" "}
                  more to reach the target.
                </>
              ) : (
                <>Target reached — awaiting the deadline.</>
              )}
            </p>
          </GlassCard>

          {/* Pools (compact) */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="type-eyebrow">Pools</p>
              <p className="text-xs text-slate-400">
                Total{" "}
                <span className="font-mono tabular-nums text-slate-200">
                  {fmtMon(total)} MON
                </span>
              </p>
            </div>
            {total === 0n ? (
              <p className="mt-2 text-sm text-slate-400">
                No stakes yet — be the first to take a side.
              </p>
            ) : (
              <>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                  role="img"
                  aria-label={`YES ${yesShare ?? "—"} of pool, NO ${noShare ?? "—"} of pool`}
                >
                  <div className="h-full bg-yes" style={{ width: `${yesPct}%` }} />
                </div>
                <div className="mt-2 flex justify-between gap-2 text-xs">
                  <span className="text-yes">
                    YES{" "}
                    <span className="font-mono tabular-nums">
                      {fmtMon(m.yesPool)} MON{yesShare ? ` · ${yesShare}` : ""}
                    </span>
                  </span>
                  <span className="text-no">
                    NO{" "}
                    <span className="font-mono tabular-nums">
                      {fmtMon(m.noPool)} MON{noShare ? ` · ${noShare}` : ""}
                    </span>
                  </span>
                </div>
              </>
            )}
          </GlassCard>
        </div>

        {/* C. Trading panel (primary) */}
        <div className="lg:sticky lg:top-24 lg:col-span-2">
          <GlassCard className="border-monad/25 p-4">
            {phase !== "betting" ? (
              <div>
                <p className="text-sm text-slate-300">
                  Betting is closed ({PHASE_LABEL[phase]}).
                </p>
                {phase === "refundable" && address && (
                  <Button
                    variant="secondary"
                    className="mt-3 w-full border-yellow-500/40 text-yellow-300"
                    onClick={() => send("refundUnresolvedMarket", [id])}
                  >
                    Trigger refunds
                  </Button>
                )}
              </div>
            ) : !address ? (
              <div>
                <p className="text-sm text-slate-400">Connect your wallet to trade.</p>
                <Button
                  variant="primary"
                  className="mt-2 w-full"
                  onClick={() => setConnectOpen(true)}
                >
                  Connect wallet to trade
                </Button>
              </div>
            ) : wrongNetwork ? (
              <div>
                <p className="text-sm font-semibold text-yellow-300">Wrong network</p>
                <p className="mt-1 text-sm text-slate-400">
                  Switch to Monad Testnet to place a position.
                </p>
                <Button
                  variant="primary"
                  className="mt-2 w-full"
                  disabled={isSwitching}
                  onClick={() => switchChain({ chainId: APP_CHAIN_ID })}
                >
                  {isSwitching ? "Switching…" : "Switch to Monad Testnet"}
                </Button>
              </div>
            ) : (
              <div>
                <div
                  role="group"
                  aria-label="Pick a side"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1"
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

                <label
                  htmlFor="stake-amount"
                  className="mt-3 block text-sm font-semibold text-slate-200"
                >
                  Amount
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 focus-within:border-monad/60">
                  <input
                    id="stake-amount"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-describedby="stake-hint"
                    aria-invalid={stakeError !== null}
                    placeholder="0.1"
                    className="w-full min-w-0 bg-transparent font-mono text-sm tabular-nums text-white outline-none placeholder:text-slate-600"
                  />
                  <span className="shrink-0 text-sm text-slate-400">MON</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {PRESETS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setStake(q)}
                      aria-pressed={presetActive(q)}
                      className={`rounded-lg px-2.5 py-1 font-mono text-xs tabular-nums transition ${
                        presetActive(q)
                          ? "bg-monad text-white"
                          : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                  {!!balanceData && (
                    <span className="ml-auto text-xs text-slate-500">
                      Balance{" "}
                      <span className="font-mono tabular-nums">
                        {fmtMon(balanceData.value)}
                      </span>
                    </span>
                  )}
                </div>

                <div id="stake-hint" className="mt-2 text-sm">
                  {stakeError || stakeAmt <= 0n ? (
                    <span className="text-xs text-slate-500">
                      Enter an amount to see the estimated payout.
                    </span>
                  ) : (
                    <>
                      <p className="text-slate-300">
                        Estimated payout if {side.toUpperCase()} wins:{" "}
                        <span className="font-mono tabular-nums text-white">
                          {fmtMon(selectedPreview)} MON
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Includes your stake. Not guaranteed.
                      </p>
                      <details className="mt-1 text-xs text-slate-400">
                        <summary className="cursor-pointer hover:text-white">
                          Payout details
                        </summary>
                        <p className="mt-1">
                          If {side === "yes" ? "NO" : "YES"} wins instead:{" "}
                          <span className="font-mono tabular-nums">
                            {fmtMon(side === "yes" ? ifNo : ifYes)} MON
                          </span>
                          {selectedMult
                            ? ` · Current multiple ${selectedMult.toFixed(2)}x.`
                            : ""}
                          {" "}Estimates use live pools and shift as others bet.
                        </p>
                      </details>
                    </>
                  )}
                </div>

                <Button
                  variant="primary"
                  className="mt-3 w-full"
                  disabled={betDisabled}
                  title={betHint ?? undefined}
                  onClick={() => bet(side === "yes")}
                >
                  {pendingTx
                    ? tx.phase === "confirm"
                      ? "Confirm in wallet…"
                      : "Confirming…"
                    : stakeError || stakeAmt <= 0n
                      ? `Bet ${side.toUpperCase()}`
                      : `Bet ${side.toUpperCase()} · ${fmtMon(stakeAmt)} MON`}
                </Button>
                {betHint && !pendingTx && (
                  <p className="mt-1.5 text-xs text-slate-400">{betHint}</p>
                )}
                {tx.phase === "error" && tx.errorText && (
                  <p className="mt-1.5 text-xs text-no">{tx.errorText}</p>
                )}
              </div>
            )}

            {/* Compact position summary (only when a position exists) */}
            {hasPosition && position && (
              <div className="mt-4 border-t border-white/[0.08] pt-3">
                <p className="type-eyebrow">Your position</p>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold">
                    {position.isYes ? (
                      <span className="text-yes">YES</span>
                    ) : (
                      <span className="text-no">NO</span>
                    )}{" "}
                    <span className="font-mono tabular-nums font-normal text-slate-200">
                      {fmtMon(position.amount)} MON
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {!settled
                      ? "Active"
                      : canClaim && !position.claimed
                        ? "Claimable"
                        : position.claimed
                          ? "Claimed"
                          : "No payout"}
                  </span>
                </div>
                {canClaim && !position.claimed && (
                  <>
                    <p className="mt-1 text-xs text-slate-400">
                      Claimable{" "}
                      <span className="font-mono tabular-nums text-yes">
                        {fmtMon(expected)} MON
                      </span>
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => send("claim", [id])}
                    >
                      {phase === "refunded"
                        ? `Claim refund ${fmtMon(expected)} MON`
                        : `Claim ${fmtMon(expected)} MON`}
                    </Button>
                  </>
                )}
              </div>
            )}

            {isResolver && canResolve === true && (
              <button
                onClick={resolveLive}
                className="mt-3 w-full rounded-xl border border-monad/60 px-3 py-2 text-sm text-blue-300 hover:bg-monad/10"
              >
                Resolve with live HN score (resolver only)
              </button>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Consolidated supporting information */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <details className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Market timeline</summary>
          <ol className="mt-2 space-y-1.5">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
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
                <span className="ml-auto font-mono text-xs tabular-nums text-slate-500">
                  {s.when}
                </span>
              </li>
            ))}
          </ol>
        </details>

        <details className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Technical details</summary>
          <dl className="mt-2 grid gap-1 break-all font-mono text-xs tabular-nums text-slate-400">
            <div>id: {id.toString()}</div>
            <div>creator: {m.creator}</div>
            <div>
              story:{" "}
              <a
                href={`https://news.ycombinator.com/item?id=${storyId}`}
                target="_blank"
                rel="noreferrer"
                className="text-azure underline"
              >
                HN item #{storyId}
              </a>
            </div>
            <div>metadataHash: {m.metadataHash}</div>
            {settled && <div>evidenceHash: {m.evidenceHash}</div>}
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
          ← Markets
        </Link>
      </div>
    </div>
  );
}
