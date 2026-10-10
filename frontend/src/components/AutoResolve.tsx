"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CONTRACT_ADDRESS, autoResolveEnabled, isAddressSet } from "@/lib/config";
import { useChainParams, useMarketsNewestFirst, useNow } from "@/lib/hooks";
import { phaseOf } from "@/lib/market";

// Shared-layout auto-trigger: while any market awaits resolution, ping the
// server resolver every 10s. Errors are ignored; queries are invalidated.
export function AutoResolve() {
  const qc = useQueryClient();
  const { markets } = useMarketsNewestFirst(20);
  const params = useChainParams();
  const nowSec = useNow(5000);

  const hasAwaiting = markets.some(
    (m) => phaseOf(m, nowSec, params.lockWindow, params.gracePeriod) === "awaiting",
  );

  useEffect(() => {
    if (!hasAwaiting || !autoResolveEnabled || !isAddressSet(CONTRACT_ADDRESS)) return;
    const t = setInterval(() => {
      fetch("/api/resolve", { method: "POST" })
        .catch(() => undefined)
        .finally(() => {
          void qc.invalidateQueries();
        });
    }, 10_000);
    return () => clearInterval(t);
  }, [hasAwaiting, qc]);

  return null;
}
