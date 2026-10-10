import type { Abi } from "viem";
import abiJson from "../../abi/LaunchOddsMarket.json";

// NOTE: `as const` cannot apply to a JSON import (TS1355), so the ABI is typed
// as viem's `Abi`. Reads/writes still specify chainId: 10143 explicitly.
export const launchOddsAbi: Abi = abiJson as unknown as Abi;
