"use client";

import { useEffect, useRef, useState } from "react";
import { reconnect, injected } from "@wagmi/core";
import type { Config } from "@wagmi/core";
import { useConfig } from "wagmi";

export function Reconnect() {
  const config = useConfig();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void reconnect(config as Config);
  }, [config]);
  return null;
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum;
}

export function injectedConnector() {
  return injected();
}
