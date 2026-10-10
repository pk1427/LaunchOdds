"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseEther, type Address } from "viem";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/config";
import {
  useCanResolve,
  useMarketTx,
  usePosition,
  usePreviewClaim,
  useStory,
} from "@/lib/hooks";
import {
  PHASE_LABEL,
  countdown,
  phaseOf,
  type MarketStruct,
} from "@/lib/market";
import { buildEvidence } from "@/lib/metadata";
import { fetchItem, isUsableStory } from "@/lib/hn";
import { fmtMon } from "@/lib/format";

const PHASE_STYLE: Record<string, string> = {
  betting: "bg-yes/20 text-yes",
  locked: "bg-yellow-500/20 text-yellow-300",
  awaiting: "bg-monad/20 text-monad",
  refundable: "bg-orange-500/20 text-orange-300",
  resolvedYes: "bg-yes/20 text-yes",
  resolvedNo: "bg-no/20 text-no",
  refunded: "bg-white/10 text-gray-300",
};

export function MarketCard({
  market,
  lockWindow,
  gracePeriod,
  resolver,
  nowSec,
}: {
  market: MarketStruct;
  lockWindow: number;
  gracePeriod: number;
  resolver: Address | undefined;
  nowSec: number;
}) {
  const id = market.id;
  const { address } = useAccount();
  const qc = useQueryClient();
  const tx = useMarketTx();
  const [stake, setStake] = useState("0.1");
  const storyId = Number(market.sourceId);
  const { data: story } = useStory(storyId);
  const { data: posData } = usePosition(id);
  const { data: preview } = usePreviewClaim(id);
  const { data: canResolve } = useCanResolve(id);

  const position = posData as unknown as
    | { amount: bigint; isYes: boolean; claimed: boolean }
    | undefined;
  const canClaim = (preview as unknown as [boolean, bigint] | undefined)?.[0] ?? false;
  const expected = (preview as unknown as [boolean, bigint] | undefined)?.[1] ?? 0n;

  const phase = phaseOf(market, nowSec, lockWindow, gracePeriod);
  const yes = market.yesPool;
  const no = market.noPool;
  const total = yes + no;
  const yesPct = total === 0n ? 50 : Number((yes * 100n) / total);

  const afterSuccess = () => {
    void qc.invalidateQueries();
    tx.reset();
  };

  const bet = (isYes: boolean) => {
    if (!CONTRACT_ADDRESS) return;
    let value: bigint;
    try {
      value = parseEther(stake || "0");
    } catch {
      return;
    }
    tx.writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: launchOddsAbi,
        functionName: "takePosition",
        args: [id, isYes],
        value,
        chainId: APP_CHAIN_ID,
      },
      { onSuccess: () => setTimeout(afterSuccess, 1500) },
    );
  };

  const claim = () => {
    if (!CONTRACT_ADDRESS) return;
    tx.writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: launchOddsAbi,
        functionName: "claim",
        args: [id],
        chainId: APP_CHAIN_ID,
      },
      { onSuccess: () => setTimeout(afterSuccess, 1500) },
    );
  };

  const triggerRefund = () => {
    if (!CONTRACT_ADDRESS) return;
    tx.writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: launchOddsAbi,
        functionName: "refundUnresolvedMarket",
        args: [id],
        chainId: APP_CHAIN_ID,
      },
      { onSuccess: () => setTimeout(afterSuccess, 1500) },
    );
  };

  const resolveLive = async () => {
    if (!CONTRACT_ADDRESS) return;
    try {
      const item = await fetchItem(storyId);
      if (!isUsableStory(item) || typeof item.score !== "number") return;
      const { hash } = buildEvidence(storyId, item.score);
      tx.writeContract(
        {
          address: CONTRACT_ADDRESS,
          abi: launchOddsAbi,
          functionName: "resolveMarket",
          args: [id, BigInt(item.score), hash],
          chainId: APP_CHAIN_ID,
        },
        { onSuccess: () => setTimeout(afterSuccess, 1500) },
      );
    } catch {
      /* fetch errors surface via tx state on send; nothing to do pre-send */
    }
  };

  const holdsYes = position && position.amount > 0n && position.isYes;
  const holdsNo = position && position.amount > 0n && !position.isYes;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-gray-400">#{id.toString()}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PHASE_STYLE[phase]}`}>
          {PHASE_LABEL[phase]}
        </span>
      </div>
      <a
        href={`https://news.ycombinator.com/item?id=${storyId}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block font-semibold text-white hover:text-monad"
      >
        {story?.title ?? `HN story ${storyId}`}
      </a>
      <div className="mt-0.5 text-sm text-gray-400">
        Will it {buildQ(market)}?{" "}
        <span className="font-mono text-xs">
          Created by {market.creator.slice(0, 6)}…{market.creator.slice(-4)}
        </span>{" "}
        <Link href={`/markets/${id.toString()}`} className="text-xs text-monad underline">
          Details
        </Link>
      </div>
      <div className="mt-2 flex gap-4 font-mono text-sm">
        <span>
          base <b>{market.baselineScore.toString()}</b>
        </span>
        <span>
          {phase === "resolvedYes" || phase === "resolvedNo" ? "final" : "live"}{" "}
          <b>{story?.score ?? (phase.startsWith("resolved") ? market.finalScore.toString() : "…")}</b>
        </span>
        <span>
          target <b>{market.targetScore.toString()}</b>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-yes" style={{ width: `${yesPct}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-xs tabular-nums">
        <span className="text-yes">
          YES {fmtMon(yes)} ({market.yesPositions.toString()})
        </span>
        <span className="text-no">
          NO {fmtMon(no)} ({market.noPositions.toString()})
        </span>
      </div>
      <div className="mt-1 font-mono text-xs tabular-nums text-gray-400">
        {phase === "betting" || phase === "locked"
          ? `closes in ${countdown(Number(market.expiry), nowSec)}`
          : `expired · liability ${fmtMon(market.remainingLiability)} MON`}
      </div>

      {address && position && position.amount > 0n && (
        <div className="mt-2 text-xs text-gray-300">
          Your position: {fmtMon(position.amount)} MON on{" "}
          {position.isYes ? "YES" : "NO"}
          {position.claimed ? " (claimed)" : ""}
          {canClaim && !position.claimed && (
            <span className="text-yes"> · winnable ≈ {fmtMon(expected)}</span>
          )}
        </div>
      )}

      {address && phase === "betting" && (
        <div className="mt-3">
          <div className="flex gap-1">
            {["0.1", "0.5", "1"].map((q) => (
              <button
                key={q}
                onClick={() => setStake(q)}
                className={`rounded px-2 py-1 font-mono text-xs ${stake === q ? "bg-monad text-white" : "bg-white/10 text-gray-300"}`}
              >
                {q}
              </button>
            ))}
            <input
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              inputMode="decimal"
              className="w-24 rounded bg-white/10 px-2 py-1 font-mono text-xs"
              aria-label="Stake in MON"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => bet(true)}
              disabled={!!holdsNo}
              title={holdsNo ? "Contract rejects opposing positions" : undefined}
              className="flex-1 rounded-lg bg-yes px-3 py-2 font-semibold text-black hover:brightness-110 disabled:opacity-40"
            >
              Bet YES
            </button>
            <button
              onClick={() => bet(false)}
              disabled={!!holdsYes}
              title={holdsYes ? "Contract rejects opposing positions" : undefined}
              className="flex-1 rounded-lg bg-no px-3 py-2 font-semibold text-white hover:brightness-110 disabled:opacity-40"
            >
              Bet NO
            </button>
          </div>
        </div>
      )}

      {address && (phase === "resolvedYes" || phase === "resolvedNo" || phase === "refunded") && (
        <button
          onClick={claim}
          disabled={!canClaim}
          title={!canClaim ? "No claimable amount for your position" : undefined}
          className="mt-3 w-full rounded-lg bg-monad px-3 py-2 font-semibold text-white hover:brightness-110 disabled:opacity-40"
        >
          {canClaim
            ? phase === "refunded"
              ? `Claim refund ${fmtMon(expected)} MON`
              : `Claim ${fmtMon(expected)} MON`
            : position?.claimed
              ? phase === "refunded"
                ? "Refund claimed"
                : "Already claimed"
              : "Nothing to claim"}
        </button>
      )}

      {address && phase === "refundable" && (
        <button
          onClick={triggerRefund}
          className="mt-3 w-full rounded-lg bg-orange-500 px-3 py-2 font-semibold text-black hover:brightness-110"
        >
          Trigger refunds
        </button>
      )}

      {address &&
        resolver &&
        address.toLowerCase() === resolver.toLowerCase() &&
        canResolve === true && (
          <button
            onClick={resolveLive}
            className="mt-2 w-full rounded-lg border border-monad px-3 py-2 text-sm text-monad hover:bg-monad/10"
          >
            Resolve with live HN score (resolver only)
          </button>
        )}
    </div>
  );
}

function buildQ(m: MarketStruct): string {
  return `reach ${m.targetScore.toString()} points by deadline`;
}
