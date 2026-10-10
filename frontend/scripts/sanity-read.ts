// Read-only sanity check: reads marketCount + chain id through the app's
// RPC/ABI config. No keys, no transactions.
// Usage: npx tsx scripts/sanity-read.ts
import { createPublicClient, http, type Address } from "viem";
import { launchOddsAbi } from "../src/lib/abi";
import { monadTestnet, rpcUrl } from "../src/lib/chain";

const FALLBACK_CONTRACT = "0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187";

async function main(): Promise<void> {
  const address = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    FALLBACK_CONTRACT) as Address;
  const client = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl(), { retryCount: 5, timeout: 20_000 }),
  });
  const [count, chainId] = await Promise.all([
    client.readContract({ address, abi: launchOddsAbi, functionName: "marketCount" }),
    client.getChainId(),
  ]);
  console.log(
    JSON.stringify({
      rpc: rpcUrl(),
      chainId,
      contract: address,
      marketCount: (count as bigint).toString(),
    }),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
