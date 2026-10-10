"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { launchOddsAbi } from "@/lib/abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "@/lib/config";
import { useAllMarkets, useMarketTx } from "@/lib/hooks";
import { Status } from "@/lib/market";
import { fmtMon } from "@/lib/format";
import { RequireWallet } from "@/components/RequireWallet";
import { Button, EmptyState, Skeleton, StatCard, Tabs } from "@/components/ui";

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
  return (
    <RequireWallet reason="Your positions live on-chain — connect to load them.">
      <PortfolioBody />
    </RequireWallet>
  );
}

function PortfolioBody() {
  const { address } = useAccount();
  const { markets, isLoading, isError, refetch } = useAllMarkets(50);
  const [tab, setTab] = useState<"active" | "claimable" | "claimed" | "lost">("active");
  const tx = useMarketTx();

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
  }, [batch.data, markets]);

  const claimableTotal = rows
    .filter((r) => r.group === "claimable")
    .reduce((a, r) => a + r.expected, 0n);
  const stakedTotal = rows.reduce((a, r) => a + r.stake, 0n);
  const openCount = rows.filter((r) => r.group === "active").length;
  const visible = rows.filter((r) => r.group === tab);

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
      <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-6 text-center">
        <p className="font-semibold text-yellow-300">Contract address not set</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight">Portfolio</h2>
      {claimableTotal > 0n && (
        <div className="mt-3 rounded-2xl border border-yes/40 bg-yes/10 p-4 font-mono tabular-nums">
          You can claim <b>{fmtMon(claimableTotal)} MON</b>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total staked" value={`${fmtMon(stakedTotal)} MON`} />
        <StatCard label="Claimable" value={`${fmtMon(claimableTotal)} MON`} />
        <StatCard label="Open positions" value={openCount.toString()} />
      </div>

      <div className="mt-4">
        <Tabs
          ariaLabel="Position groups"
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: "Active" },
            { value: "claimable", label: "Claimable" },
            { value: "claimed", label: "Claimed" },
            { value: "lost", label: "Lost" },
          ]}
        />
      </div>

      {isLoading || batch.isLoading ? (
        <div className="mt-3 grid gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError || batch.isError ? (
        <div className="mt-3 rounded-2xl border border-no/40 bg-no/10 p-4 text-sm">
          <p className="text-no">RPC error while loading positions.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              void refetch();
              void batch.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={rows.length === 0 ? "No positions yet" : `Nothing ${tab}`}
            body={
              rows.length === 0
                ? "No positions in the newest 50 markets. Find a launch and take a side."
                : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {visible.map((r) => (
            <div
              key={r.id.toString()}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3"
            >
              <div className="text-sm">
                <Link
                  href={`/markets/${r.id.toString()}`}
                  className="font-bold hover:text-[#b7a8ff]"
                >
                  Market #{r.id.toString()}
                </Link>
                <span className="ml-2 font-mono tabular-nums text-slate-300">
                  {fmtMon(r.stake)} on {r.side}
                </span>
                {r.group === "claimable" && (
                  <span className="ml-2 font-mono tabular-nums text-yes">
                    → {fmtMon(r.expected)}
                  </span>
                )}
              </div>
              {r.group === "claimable" && (
                <Button variant="primary" size="sm" onClick={() => claim(r.id)}>
                  Claim {fmtMon(r.expected)}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Showing positions across the newest 50 markets.
      </p>
    </div>
  );
}
