import type { Address } from "viem";
import { MONAD_CHAIN_ID } from "./chain";

export const CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined) ||
  undefined;

export function isAddressSet(addr: unknown): addr is Address {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export const APP_CHAIN_ID = MONAD_CHAIN_ID;

export const autoResolveEnabled =
  (process.env.NEXT_PUBLIC_AUTO_RESOLVE ?? "true") !== "false";
