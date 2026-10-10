// Server-only resolver. Runs under tsx and inside Next.js API routes.
// Uses RELATIVE imports only (no @/* alias) so tsx resolves them plainly.
// Never import this file (or RESOLVER_PRIVATE_KEY) from client components.

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { launchOddsAbi } from "../abi";
import { monadTestnet, rpcUrl } from "../chain";
import { fetchItem, isUsableStory } from "../hn";
import type { ResolutionEvidence } from "../metadata";

export interface ResolveResult {
  marketId: string;
  action: "resolved" | "skipped" | "dry-run" | "failed";
  outcomeIsYes?: boolean;
  score?: number;
  txHash?: string;
  reason?: string;
}

// In-memory guard so overlapping passes never double-submit the same market.
const inFlight = new Set<string>();

function clients() {
  const transport = http(rpcUrl(), { retryCount: 5, timeout: 20_000 });
  const publicClient = createPublicClient({ chain: monadTestnet, transport });
  return { publicClient, transport };
}

function contractAddress(): Address {
  const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not set to a valid address.");
  }
  return addr as Address;
}

async function fetchScoreWithRetries(
  storyId: number,
  tries = 3,
): Promise<number> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const item = await fetchItem(storyId);
      if (!isUsableStory(item)) {
        throw new Error(`story ${storyId} is not a usable story`);
      }
      if (typeof item.score !== "number") throw new Error("score is not numeric");
      return item.score;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("HN fetch failed");
}

export async function resolveDueMarkets(opts?: {
  dryRun?: boolean;
}): Promise<{ results: ResolveResult[] }> {
  const dryRun = opts?.dryRun ?? process.env.DRY_RUN === "true";
  const key = process.env.RESOLVER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "RESOLVER_PRIVATE_KEY is not set (expected a 0x-prefixed 32-byte hex key in server env).",
    );
  }
  const { publicClient } = clients();
  const account = privateKeyToAccount(key as Hex);
  const address = contractAddress();

  const onchainResolver = (await publicClient.readContract({
    address,
    abi: launchOddsAbi,
    functionName: "resolver",
  })) as Address;
  if (onchainResolver.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `Derived address ${account.address} does not match on-chain resolver ${onchainResolver}. Refusing to resolve.`,
    );
  }

  const count = (await publicClient.readContract({
    address,
    abi: launchOddsAbi,
    functionName: "marketCount",
  })) as bigint;
  const n = Number(count);
  const results: ResolveResult[] = [];
  if (n === 0) return { results };

  const start = Math.max(1, n - 49);
  const markets = (await publicClient.readContract({
    address,
    abi: launchOddsAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(n - start + 1)],
  })) as Array<{ id: bigint; status: number; sourceId: bigint; targetScore: bigint }>;

  const walletClient = dryRun
    ? null
    : createWalletClient({
        chain: monadTestnet,
        transport: http(rpcUrl(), { retryCount: 5, timeout: 20_000 }),
        account,
      });

  for (const m of markets) {
    const id = m.id.toString();
    if (m.status !== 0) continue; // not Open
    if (inFlight.has(id)) {
      results.push({ marketId: id, action: "skipped", reason: "in-flight" });
      continue;
    }
    const canResolve = (await publicClient.readContract({
      address,
      abi: launchOddsAbi,
      functionName: "canResolve",
      args: [m.id],
    })) as boolean;
    if (!canResolve) continue;

    const storyId = Number(m.sourceId);
    let score: number;
    try {
      score = await fetchScoreWithRetries(storyId);
    } catch (e) {
      results.push({
        marketId: id,
        action: "skipped",
        reason: `HN score unavailable: ${e instanceof Error ? e.message : "unknown"}`,
      });
      continue;
    }
    const outcomeIsYes = BigInt(score) >= m.targetScore;
    if (dryRun || !walletClient) {
      results.push({ marketId: id, action: "dry-run", outcomeIsYes, score });
      continue;
    }

    inFlight.add(id);
    try {
      // Re-read status right before sending to avoid racing a settle.
      const fresh = (await publicClient.readContract({
        address,
        abi: launchOddsAbi,
        functionName: "getMarket",
        args: [m.id],
      })) as { status: number };
      if (fresh.status !== 0) {
        results.push({ marketId: id, action: "skipped", reason: "settled while preparing" });
        continue;
      }
      const evidence: ResolutionEvidence = {
        source: "hackernews",
        storyId,
        score,
        fetchedAt: Math.floor(Date.now() / 1000),
        apiUrl: `https://hacker-news.firebaseio.com/v0/item/${storyId}.json`,
      };
      const evidenceHash = keccak256(toHex(JSON.stringify(evidence)));
      const { request } = await publicClient.simulateContract({
        address,
        abi: launchOddsAbi,
        functionName: "resolveMarket",
        args: [m.id, BigInt(score), evidenceHash],
        account,
        chain: monadTestnet,
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        results.push({ marketId: id, action: "failed", reason: `tx ${txHash} reverted` });
      } else {
        results.push({ marketId: id, action: "resolved", outcomeIsYes, score, txHash });
      }
    } catch (e) {
      results.push({
        marketId: id,
        action: "failed",
        reason: e instanceof Error ? e.message.slice(0, 300) : "unknown",
      });
    } finally {
      inFlight.delete(id);
    }
  }
  return { results };
}
