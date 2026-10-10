import { GlassCard } from "@/components/ui";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "payout", label: "Parimutuel payout" },
  { id: "refunds", label: "Refund rules" },
  { id: "trust", label: "Trust model" },
  { id: "network", label: "Contract and network" },
  { id: "faq", label: "FAQ" },
];

export default function HowItWorksPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <aside className="hidden lg:block">
        <nav
          aria-label="How it works sections"
          className="sticky top-24 flex flex-col gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-slate-400 hover:bg-white/5 hover:text-white"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="max-w-3xl lg:col-span-3">
        <h2 className="text-2xl font-black tracking-tight">How it works</h2>

        <GlassCard className="mt-3">
          <h3 id="overview" className="scroll-mt-28 font-bold">
            Overview
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            LaunchOdds markets ask one question: will a Hacker News story&apos;s score
            reach a target by a deadline? Stake MON on YES or NO. When the deadline
            passes, a resolver reports the final score and winners pull their payouts
            from the losing side&apos;s pool.
          </p>
        </GlassCard>

        <GlassCard className="mt-3">
          <h3 id="payout" className="scroll-mt-28 font-bold">
            Parimutuel payout, worked example
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            There is no market maker. The losing side&apos;s pool is split proportionally
            among winners:
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums">
            payout = stake + floor(losingPool × stake / winningPool)
          </p>
          <p className="mt-1 text-sm text-slate-300">
            You stake 0.2 MON on NO against a 0.1 MON YES pool, and NO wins. You
            receive 0.2 + 0.1 × 0.2 / 0.2 = <b>0.3 MON</b>. Rounding dust goes to the
            last winner to claim, so nothing stays locked.
          </p>
        </GlassCard>

        <GlassCard className="mt-3">
          <h3 id="refunds" className="scroll-mt-28 font-bold">
            Refund rules
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>
              <b>Nobody on the winning side:</b> if the winning side has no positions,
              the market is refunded — everyone reclaims their exact stake.
            </li>
            <li>
              <b>Resolver timeout after the grace period:</b> if the market is still open
              past expiry plus the grace period (600s), anyone can permissionlessly
              trigger refunds.
            </li>
            <li>Refunds return exact stakes. No fees.</li>
          </ul>
        </GlassCard>

        <GlassCard className="mt-3">
          <h3 id="trust" className="scroll-mt-28 font-bold">
            Trust model
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            A single trusted resolver reports final HN scores. The contract enforces who
            may resolve and the YES/NO rule, but it cannot verify the Hacker News API
            itself. Judge the resolver, not just the code. This app is a testnet demo
            and is unaudited.
          </p>
        </GlassCard>

        <GlassCard className="mt-3">
          <h3 id="network" className="scroll-mt-28 font-bold">
            Contract and network details
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-mono text-sm tabular-nums text-slate-300">
            <li>Contract 0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187</li>
            <li>Chain ID 10143 · currency MON</li>
            <li>RPC https://testnet-rpc.monad.xyz</li>
            <li>Betting locks 60s before expiry · market durations 2m–30d</li>
            <li>Explorer https://testnet.monadexplorer.com</li>
          </ul>
        </GlassCard>

        <GlassCard className="mt-3">
          <h3 id="faq" className="scroll-mt-28 font-bold">
            FAQ
          </h3>
          <div className="mt-1 space-y-2 text-sm text-slate-300">
            <p>
              <b>Can I switch sides?</b> No — one side per wallet per market; the
              contract rejects opposing positions.
            </p>
            <p>
              <b>What if I miss expiry?</b> Winners can claim any time after resolution;
              there is no claim deadline.
            </p>
            <p>
              <b>Who pays gas?</b> You pay for your own transactions (bets, claims,
              refunds, resolution) in testnet MON.
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
