// tsx script: poll loop that resolves due markets.
// Usage: tsx --env-file=.env.local scripts/resolver-loop.ts [--once]
// Env: RESOLVER_PRIVATE_KEY (required unless DRY_RUN), NEXT_PUBLIC_CONTRACT_ADDRESS,
//      NEXT_PUBLIC_MONAD_RPC, POLL_INTERVAL_MS (default 10000), DRY_RUN (default false).
import { resolveDueMarkets } from "../src/lib/server/resolver";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const interval = Number(process.env.POLL_INTERVAL_MS ?? "10000");
  for (;;) {
    try {
      const out = await resolveDueMarkets();
      const summary = out.results
        .map((r) => `${r.marketId}:${r.action}${r.txHash ? `:${r.txHash}` : ""}`)
        .join(" ");
      console.log(`[${new Date().toISOString()}] pass done. markets=${out.results.length} ${summary}`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] pass failed:`, e instanceof Error ? e.message : e);
      if (once) process.exit(1);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
