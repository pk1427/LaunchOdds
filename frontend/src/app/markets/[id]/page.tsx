"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
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
    return <Skeleton />;
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

  const send = (fn: "takePosition" | "claim" | "refundUnresolvedMarket" | "resolveMarket", args: readonly unknown[], value?: bigint, extra?: { score: number }) => {
    if (!CONTRACT_ADDRESS) return;
    void extra;
    tx.writeContract(
      { address: CONTRACT_ADDRESS, abi: launchOddsAbi, functionName: fn, args: args as never, ...(value !== undefined ? { value } : {}), chainId: APP_CHAIN_ID } as never,
      {
        pendingTitle: fn === "takePosition" ? "Placing bet…" : fn === "claim" ? "Claiming…" : fn === "refundUnresolvedMarket" ? "Triggering refunds…" : "Resolving…",
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
  const isResolver = !!address && !!resolver && address.toLowerCase() === resolver.toLowerCase();

  const steps = timeline(m, lockWindow, gracePeriod, phase);

  return (
    <div>
      <Link href="/markets" className="text-sm text-monad underline">
        ← All markets
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <a
            href={`https://news.ycombinator.com/item?id=${storyId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xl font-bold hover:text-monad"
          >
            {story?.title ?? `HN story ${storyId}`}
          </a>
          <p className="text-sm text-gray-400">
            Market #{id.toString()} · Will it reach {target} points by deadline? · Created by{" "}
            <span className="font-mono text-xs">
              {m.creator.slice(0, 6)}…{m.creator.slice(-4)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PhaseBadge phase={phase} />
          <button
            onClick={() => setBig(!big)}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            title="Big-screen mode for presenting"
          >
            {big ? "Normal view" : "Big screen"}
          </button>
        </div>
      </div>

      {big && (
        <div className="mt-3 rounded-xl border border-monad/40 bg-monad/10 p-6 text-center">
          <div className="font-mono text-6xl font-black tabular-nums">
            {phase === "betting" || phase === "locked" ? countdown(expiry, nowSec) : PHASE_LABEL[phase]}
          </div>
          <div className="mt-2 font-mono text-5xl font-black tabular-nums text-monad">
            {scoreShown} <span className="text-2xl text-gray-400">/ {target}</span>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
          <h3 className="font-semibold">Progress</h3>
          <div className="mt-2 flex justify-between font-mono text-sm tabular-nums">
            <span>baseline {baseline}</span>
            <span className="text-xl font-bold text-white">
              {final ? "final" : "live"} {scoreShown}
            </span>
            <span>target {target}</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-monad"
              style={{ width: `${Math.min(100, (scoreShown / Math.max(target, 1)) * 100)}%` }}
            />
          </div>
          {(phase === "betting" || phase === "locked") && (
            <p className="mt-2 text-sm text-gray-300">
              Needs <b>+{need}</b> in <b>{countdown(expiry, nowSec)}</b>
              <span className="text-gray-500"> ({localTime(expiry)})</span>
            </p>
          )}
          <h3 className="mt-4 font-semibold">Timeline</h3>
          <ol className="mt-2 space-y-1">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    i < s.doneUpTo ? "bg-yes text-black" : i === s.doneUpTo ? "bg-monad text-white" : "bg-white/10 text-gray-400"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={i === s.doneUpTo ? "font-semibold text-white" : "text-gray-400"}>
                  {s.label}
                </span>
                <span className="font-mono text-xs text-gray-500">{s.when}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="font-semibold">Trade</h3>
          {phase === "betting" && address ? (
            <>
              <div className="mt-2 flex gap-1">
                {["0.1", "0.5", "1"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setStake(q)}
                    className={`rounded px-2 py-1 font-mono text-xs tabular-nums ${stake === q ? "bg-monad text-white" : "bg-white/10 text-gray-300"}`}
                  >
                    {q}
                  </button>
                ))}
                <input
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  inputMode="decimal"
                  aria-label="Stake in MON"
                  className="w-24 rounded bg-white/10 px-2 py-1 font-mono text-xs tabular-nums"
                />
              </div>
              <div className="mt-1 font-mono text-xs tabular-nums text-gray-400">
                {stakeAmt > 0n ? (
                  <>
                    If YES wins you receive {fmtMon(ifYes)} MON
                    {yesMult ? ` (${yesMult.toFixed(2)}x${yesProb ? `, ${(yesProb * 100).toFixed(0)}% implied` : ""})` : ""} · If
                    NO wins you receive {fmtMon(ifNo)} MON
                    {noMult ? ` (${noMult.toFixed(2)}x)` : ""}
                  </>
                ) : (
                  "Enter a stake to see live payout previews."
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => bet(true)}
                  disabled={!!holdsNo || stakeAmt <= 0n}
                  title={holdsNo ? "You hold NO — the contract rejects opposing positions" : undefined}
                  className="flex-1 rounded-lg bg-yes px-3 py-2 font-semibold text-black hover:brightness-110 disabled:opacity-40"
                >
                  Bet YES
                </button>
                <button
                  onClick={() => bet(false)}
                  disabled={!!holdsYes || stakeAmt <= 0n}
                  title={holdsYes ? "You hold YES — the contract rejects opposing positions" : undefined}
                  className="flex-1 rounded-lg bg-no px-3 py-2 font-semibold text-white hover:brightness-110 disabled:opacity-40"
                >
                  Bet NO
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-400">
              {!address
                ? "Connect your wallet to trade."
                : phase === "betting"
                  ? "Loading…"
                  : `Betting is closed (${PHASE_LABEL[phase]}).`}
            </p>
          )}

          <h3 className="mt-4 font-semibold">My position</h3>
          {!address ? (
            <p className="mt-1 text-sm text-gray-400">Connect to see your position.</p>
          ) : !position || position.amount === 0n ? (
            <p className="mt-1 text-sm text-gray-400">No position in this market.</p>
          ) : (
            <div className="mt-1 text-sm">
              <p className="font-mono tabular-nums">
                {fmtMon(position.amount)} MON on {position.isYes ? "YES" : "NO"}
              </p>
              {canClaim && !position.claimed && (
                <p className="text-yes">Estimate: {fmtMon(expected)} MON</p>
              )}
              {(phase === "resolvedYes" || phase === "resolvedNo" || phase === "refunded") && (
                <button
                  onClick={() =>
                    send("claim", [id])
                  }
                  disabled={!canClaim}
                  title={!canClaim ? "No claimable amount for your position" : undefined}
                  className="mt-2 w-full rounded-lg bg-monad px-3 py-2 font-semibold text-white hover:brightness-110 disabled:opacity-40"
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
                </button>
              )}
            </div>
          )}

          {phase === "refundable" && address && (
            <button
              onClick={() => send("refundUnresolvedMarket", [id])}
              className="mt-3 w-full rounded-lg bg-orange-500 px-3 py-2 font-semibold text-black hover:brightness-110"
            >
              Trigger refunds
            </button>
          )}
          {isResolver && canResolve === true && (
            <ResolveFallback onResolve={resolveLive} />
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="font-semibold">Pools</h3>
          <PoolBar yes={m.yesPool} no={m.noPool} />
          <div className="mt-1 font-mono text-xs tabular-nums text-gray-300">
            YES {fmtMon(m.yesPool)} ({m.yesPositions.toString()}) · NO {fmtMon(m.noPool)} (
            {m.noPositions.toString()}) · total {fmtMon(m.totalPool)}
          </div>
        </div>
        {(phase === "resolvedYes" || phase === "resolvedNo" || phase === "refunded") && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold">Resolution</h3>
            <p className="mt-1 font-mono text-sm tabular-nums">
              final score {m.finalScore.toString()} → {PHASE_LABEL[phase]}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-gray-400">
              evidence {m.evidenceHash}
            </p>
            <a
              href={`https://news.ycombinator.com/item?id=${storyId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-monad underline"
            >
              HN item #{storyId}
            </a>
            <p className="mt-1 text-xs text-gray-500">
              Reported by a trusted resolver; the contract cannot verify the HN API itself.
            </p>
          </div>
        )}
      </div>

      <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Contract details</summary>
        <dl className="mt-2 grid gap-1 font-mono text-xs tabular-nums text-gray-300">
          <div>id: {id.toString()}</div>
          <div>creator: {m.creator}</div>
          <div>sourceId: {m.sourceId.toString()}</div>
          <div>metadataHash: {m.metadataHash}</div>
          <div>
            contract: {CONTRACT_ADDRESS}{" "}
            <a
              href={`https://testnet.monadexplorer.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-monad underline"
            >
              explorer
            </a>
          </div>
        </dl>
      </details>
    </div>
  );
}

function ResolveFallback({ onResolve }: { onResolve: () => void }) {
  return (
    <button
      onClick={onResolve}
      className="mt-2 w-full rounded-lg border border-monad px-3 py-2 text-sm text-monad hover:bg-monad/10"
    >
      Resolve with live HN score (resolver only)
    </button>
  );
}

function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">
      {PHASE_LABEL[phase]}
    </span>
  );
}

function PoolBar({ yes, no }: { yes: bigint; no: bigint }) {
  const total = yes + no;
  const pct = total === 0n ? 50 : Number((yes * 100n) / total);
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
      <div className="h-full bg-yes" style={{ width: `${pct}%` }} />
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
  const settled = phase === "resolvedYes" || phase === "resolvedNo" || phase === "refunded";
  const idx = settled ? 4 : order.indexOf(phase as Phase);
  const rows = [
    { label: "Created", when: `${localTime(Number(m.createdAt))}` },
    { label: "Betting open", when: `locks ${localTime(expiry - lockWindow)}` },
    { label: "Betting locked", when: `expires ${localTime(expiry)}` },
    { label: "Resolving", when: `refunds open ${localTime(expiry + gracePeriod)}` },
    { label: settled ? `Settled (${PHASE_LABEL[phase]})` : "Settled", when: settled ? "done" : "pending" },
  ];
  return rows.map((r) => ({ ...r, doneUpTo: idx }));
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-8 w-2/3 rounded bg-white/10" />
      <div className="h-40 rounded-xl bg-white/5" />
      <div className="h-40 rounded-xl bg-white/5" />
    </div>
  );
}

function ErrCard({ msg, retry }: { msg: string; retry?: () => void }) {
  return (
    <div className="rounded-xl border border-no/40 bg-no/10 p-6 text-center">
      <p className="text-no">{msg}</p>
      {retry && (
        <button onClick={retry} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
          Retry
        </button>
      )}
      <div className="mt-2">
        <Link href="/markets" className="text-sm text-monad underline">
          ← All markets
        </Link>
      </div>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
      <p className="font-semibold text-yellow-300">Contract address not set</p>
      <p className="mt-1 font-mono text-sm text-gray-300">
        Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local and restart the dev server.
      </p>
    </div>
  );
}
