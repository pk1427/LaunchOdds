import { createPublicClient, http, type Address } from "viem";
import { NextResponse } from "next/server";
import { launchOddsAbi } from "@/lib/abi";
import { monadTestnet, rpcUrl } from "@/lib/chain";
import { APP_CHAIN_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

// Public resolver status. Never returns or logs the private key.
export async function GET() {
  try {
    const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined;
    if (!address) return NextResponse.json({ resolver: null, configured: false });
    const client = createPublicClient({
      chain: monadTestnet,
      transport: http(rpcUrl(), { retryCount: 5, timeout: 20_000 }),
    });
    const resolver = (await client.readContract({
      address,
      abi: launchOddsAbi,
      functionName: "resolver",
      // NOTE: no chainId here — this client is already scoped to Monad testnet.
    })) as Address;
    const configured = !!process.env.RESOLVER_PRIVATE_KEY;
    return NextResponse.json({ resolver, configured });
  } catch {
    return NextResponse.json({ resolver: null, configured: false });
  }
}
