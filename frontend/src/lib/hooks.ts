"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { launchOddsAbi } from "./abi";
import { APP_CHAIN_ID, CONTRACT_ADDRESS, isAddressSet } from "./config";
import type { MarketStruct } from "./market";
import { fetchItem, isUsableStory } from "./hn";
import { friendlyError } from "./errors";
import { useToasts } from "@/components/Toasts";

function base(address: Address | undefined) {
  return {
    address,
    abi: launchOddsAbi,
    chainId: APP_CHAIN_ID,
    query: { enabled: isAddressSet(address), refetchInterval: 5000 },
  } as const;
}

export function useMarketCount() {
  return useReadContract({
    ...base(CONTRACT_ADDRESS),
    functionName: "marketCount",
  });
}

export function useMarketsNewestFirst(pageSize = 20) {
  const { data: count } = useMarketCount();
  const n = count === undefined ? 0 : Number(count);
  const start = Math.max(1, n - pageSize + 1);
  const take = n === 0 ? 0 : n - start + 1;
  const query = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: launchOddsAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(take)],
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isAddressSet(CONTRACT_ADDRESS) && n > 0,
      refetchInterval: 5000,
    },
  });
  const markets = useMemo(() => {
    const list = (query.data ?? []) as unknown as MarketStruct[];
    return [...list].reverse();
  }, [query.data]);
  return { ...query, markets, count: n };
}

export function useChainParams() {
  const lock = useReadContract({
    ...base(CONTRACT_ADDRESS),
    functionName: "BETTING_LOCK_WINDOW",
  });
  const grace = useReadContract({
    ...base(CONTRACT_ADDRESS),
    functionName: "resolutionGracePeriod",
  });
  const resolver = useReadContract({
    ...base(CONTRACT_ADDRESS),
    functionName: "resolver",
  });
  return {
    lockWindow: lock.data === undefined ? 60 : Number(lock.data),
    gracePeriod: grace.data === undefined ? 600 : Number(grace.data),
    resolver: resolver.data as Address | undefined,
    isLoading: lock.isLoading || grace.isLoading || resolver.isLoading,
    isError: lock.isError || grace.isError || resolver.isError,
    refetch: () => {
      void lock.refetch();
      void grace.refetch();
      void resolver.refetch();
    },
  };
}

export function usePosition(marketId: bigint) {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: launchOddsAbi,
    functionName: "getPosition",
    args: [marketId, address as Address],
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isAddressSet(CONTRACT_ADDRESS) && !!address,
      refetchInterval: 5000,
    },
  });
}

export function usePreviewClaim(marketId: bigint) {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACT_ADDRESS,
    abi: launchOddsAbi,
    functionName: "previewClaim",
    args: [marketId, address as Address],
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isAddressSet(CONTRACT_ADDRESS) && !!address,
      refetchInterval: 5000,
    },
  });
}

export function useCanResolve(marketId: bigint) {
  return useReadContract({
    ...base(CONTRACT_ADDRESS),
    functionName: "canResolve",
    args: [marketId],
  });
}

export function useStory(storyId: number | null) {
  return useQuery({
    queryKey: ["hn-story", storyId],
    queryFn: async () => {
      if (storyId === null) return null;
      const item = await fetchItem(storyId);
      return isUsableStory(item) ? item : null;
    },
    enabled: storyId !== null,
    refetchInterval: 20_000,
    retry: 2,
  });
}

export type TxPhase = "idle" | "confirm" | "confirming" | "success" | "error";

export interface TxSendOptions {
  pendingTitle?: string;
  successTitle?: string;
  onSuccess?: () => void;
}

// Toast-driven tx lifecycle. Keeps the old return shape so existing callers
// (`writeContract(params, { onSuccess })`) keep working; status surfaces via
// toasts, with the explorer link on success.
export function useMarketTx() {
  const { push, update } = useToasts();
  const doneRef = useRef<(() => void) | undefined>(undefined);
  const toastRef = useRef<number | null>(null);
  const { writeContract: rawWrite, data: hash, isPending, error, reset } =
    useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: APP_CHAIN_ID });

  const explorerFor = (h: string) => `https://testnet.monadexplorer.com/tx/${h}`;

  useEffect(() => {
    if (receipt.isSuccess && hash && toastRef.current !== null) {
      update(toastRef.current, {
        kind: "success",
        title: "Transaction confirmed",
        link: { href: explorerFor(hash), label: "View on explorer" },
      });
      toastRef.current = null;
      doneRef.current?.();
      doneRef.current = undefined;
    }
  }, [receipt.isSuccess, hash, update]);

  useEffect(() => {
    if (receipt.isError && hash && toastRef.current !== null) {
      update(toastRef.current, {
        kind: "error",
        title: "Transaction reverted on-chain",
        link: { href: explorerFor(hash), label: "View on explorer" },
      });
      toastRef.current = null;
    }
  }, [receipt.isError, hash, update]);

  const writeContract = (
    params: Record<string, unknown>,
    opts?: TxSendOptions,
  ) => {
    doneRef.current = opts?.onSuccess;
    const id = push({
      kind: "pending",
      title: opts?.pendingTitle ?? "Awaiting wallet confirmation…",
    });
    toastRef.current = id;
    rawWrite(params as never, {
      onError: (e) => {
        update(id, { kind: "error", title: "Transaction failed", body: friendlyError(e) });
        if (toastRef.current === id) toastRef.current = null;
      },
      onSuccess: (h) => {
        update(id, {
          kind: "confirming",
          title: "Confirming on Monad testnet…",
          link: { href: explorerFor(h), label: "View on explorer" },
        });
      },
    });
  };

  const phase: TxPhase = error
    ? "error"
    : receipt.isSuccess
      ? "success"
      : receipt.isLoading
        ? "confirming"
        : isPending
          ? "confirm"
          : "idle";
  return {
    writeContract,
    hash,
    phase,
    errorText: error ? friendlyError(error) : null,
    explorer: hash ? explorerFor(hash) : null,
    reset,
  };
}

export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Full scan for stats/portfolio, newest-first, capped for RPC sanity.
export function useAllMarkets(limit = 200) {
  const { data: count } = useMarketCount();
  const n = count === undefined ? 0 : Number(count);
  const take = Math.min(n, limit);
  const start = Math.max(1, n - take + 1);
  const query = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: launchOddsAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(take)],
    chainId: APP_CHAIN_ID,
    query: {
      enabled: isAddressSet(CONTRACT_ADDRESS) && n > 0,
      refetchInterval: 5000,
    },
  });
  const markets = useMemo(() => {
    const list = (query.data ?? []) as unknown as MarketStruct[];
    return [...list].reverse();
  }, [query.data]);
  return { ...query, markets, count: n };
}
