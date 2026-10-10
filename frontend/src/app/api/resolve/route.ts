import { NextResponse } from "next/server";
import { resolveDueMarkets } from "@/lib/server/resolver";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const out = await resolveDueMarkets();
    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "resolve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
