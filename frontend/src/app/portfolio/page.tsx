"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useMarketTx, useNow } from "@/lib/hooks";
import { Status } from "@/lib/market";
import { fmtMon } from "@/lib/format";

interface Row {
  id: bigint;
  side: string;
  stake: bigint;
  canClaim: boolean;
  expected: bigint;
  claimed: boolean;
  status: number;
  group: "active" | "claimable" | "claimed" | "lost";
}

export default function PortfolioPage() {
  const { address } = useAccount();
  const { markets, isLoading, isError, refetch } = useAllMarkets(50);
  const nowSec = useNow(5000);
  const tx = useMarketTx();

  // Batched reads: getPosition + previewClaim per market (multicall).
  const contracts = useMemo(() => {
    if (!isAddressSet(CONTRACT_ADDRESS) || !address) return [];
    return markets.flatMap((m) => [
      {
        address: CONTRACT_ADDRESS as Address,
        abi: launchOddsAbi,
        functionName: "getPosition",
        args: [m.id, address as Address],
        chainId: APP_CHAIN_ID,
      },
      {
        address: CONTRACT_ADDRESS as Address,
        abi: launchOddsAbi,
        functionName: "previewClaim",
        args: [m.id, address as Address],
        chainId: APP_CHAIN_ID,
      },
    ]);
  }, [markets, address]);
  const batch = useReadContracts({
    contracts: contracts as never[],
    query: { enabled: contracts.length > 0, refetchInterval: 5000 },
  });

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const res = batch.data ?? [];
    markets.forEach((m, i) => {
      const pos = res[i * 2]?.result as unknown as
        | { amount: bigint; isYes: boolean; claimed: boolean }
        | undefined;
      const prev = res[i * 2 + 1]?.result as unknown as [boolean, bigint] | undefined;
      if (res[i * 2]?.status !== "success" || !pos || pos.amount === 0n) return;
      const canClaim = prev?.[0] ?? false;
      const expected = prev?.[1] ?? 0n;
      const settled =
        m.status === Status.ResolvedYes ||
        m.status === Status.ResolvedNo ||
        m.status === Status.Refunded;
      const group: Row["group"] = !settled
        ? "active"
        : canClaim && !pos.claimed
          ? "claimable"
          : pos.claimed
            ? "claimed"
            : "lost";
      void nowSec;
      out.push({
        id: m.id,
        side: pos.isYes ? "YES" : "NO",
        stake: pos.amount,
        canClaim: canClaim && !pos.claimed,
        expected,
        claimed: pos.claimed,
        status: m.status,
        group,
      });
    });
    return out;
  }, [batch.data, markets, nowSec]);

  const claimableTotal = rows
    .filter((r) => r.group === "claimable")
    .reduce((a, r) => a + r.expected, 0n);

  const claim = (id: bigint) => {
    if (!CONTRACT_ADDRESS) return;
    tx.writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: launchOddsAbi,
        functionName: "claim",
        args: [id],
        chainId: APP_CHAIN_ID,
      },
      {
        pendingTitle: "Claiming…",
        onSuccess: () => setTimeout(() => void batch.refetch(), 1500),
      },
    );
  };

  if (!isAddressSet(CONTRACT_ADDRESS)) {
    return (
      <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
        <p className="font-semibold text-yellow-300">Contract address not set</p>
      </div>
    );
  }
  if (!address) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-gray-300">
        Connect your wallet to see your portfolio.
      </div>
    );
  }

  const groups: { key: Row["group"]; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "claimable", label: "Claimable" },
    { key: "claimed", label: "Claimed" },
    { key: "lost", label: "Lost" },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold">Portfolio</h2>
      {claimableTotal > 0n && (
        <div className="mt-2 rounded-xl border border-yes/40 bg-yes/10 p-4 font-mono tabular-nums">
          You can claim <b>{fmtMon(claimableTotal)} MON</b>
        </div>
      )}
      {isLoading || batch.isLoading ? (
        <div className="mt-3 grid animate-pulse gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5" />
          ))}
        </div>
      ) : isError || batch.isError ? (
        <div className="mt-3 rounded-xl border border-no/40 bg-no/10 p-4 text-sm">
          <p className="text-no">RPC error while loading positions.</p>
          <button
            onClick={() => {
              void refetch();
              void batch.refetch();
            }}
            className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-6 text-center text-gray-400">
          No positions in the newest 50 markets yet.
        </div>
      ) : (
        groups.map(
          (g) =>
            rows.some((r) => r.group === g.key) && (
              <div key={g.key} className="mt-4">
                <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-gray-400">
                  {g.label}
                </h3>
                <div className="grid gap-2">
                  {rows
                    .filter((r) => r.group === g.key)
                    .map((r) => (
                      <div
                        key={r.id.toString()}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="text-sm">
                          <Link
                            href={`/markets/${r.id.toString()}`}
                            className="font-bold hover:text-monad"
                          >
                            Market #{r.id.toString()}
                          </Link>
                          <span className="ml-2 font-mono tabular-nums text-gray-300">
                            {fmtMon(r.stake)} on {r.side}
                          </span>
                          {r.group === "claimable" && (
                            <span className="ml-2 font-mono tabular-nums text-yes">
                              → {fmtMon(r.expected)}
                            </span>
                          )}
                        </div>
                        {r.group === "claimable" && (
                          <button
                            onClick={() => claim(r.id)}
                            className="rounded-lg bg-monad px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                          >
                            Claim {fmtMon(r.expected)}
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ),
        )
      )}
      <p className="mt-3 text-xs text-gray-500">
        Showing positions across the newest 50 markets. Open a market for its live phase and countdown.
      </p>
    </div>
  );
}
