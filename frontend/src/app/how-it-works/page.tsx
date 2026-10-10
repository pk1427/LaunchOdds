export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold">How it works</h2>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-bold">Parimutuel markets, worked example</h3>
        <p className="mt-1 text-sm text-gray-300">
          There is no market maker. The losing side&apos;s pool is split proportionally
          among winners:
        </p>
        <p className="mt-1 font-mono text-sm tabular-nums">
          payout = stake + floor(losingPool × stake / winningPool)
        </p>
        <p className="mt-1 text-sm text-gray-300">
          Example: you stake 0.2 MON on NO against a 0.1 MON YES pool, and NO wins. You
          receive 0.2 + 0.1 × 0.2 / 0.2 = <b>0.3 MON</b>. Rounding dust goes to the last
          winner to claim, so nothing stays locked.
        </p>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-bold">Refund rules</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-300">
          <li>
            <b>Empty winning side:</b> if the winning side has no positions, the market is
            refunded — everyone reclaims their exact stake.
          </li>
          <li>
            <b>Resolver timeout:</b> if the market is still open past expiry plus the
            grace period (600s), anyone can permissionlessly trigger refunds.
          </li>
          <li>Refunds return exact stakes. No fees.</li>
        </ul>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-bold">Trust model</h3>
        <p className="mt-1 text-sm text-gray-300">
          A single trusted resolver reports final HN scores. The contract enforces who
          may resolve and the YES/NO rule, but it cannot verify the Hacker News API
          itself. Judge the resolver, not just the code.
        </p>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-bold">Monad testnet facts</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 font-mono text-sm tabular-nums text-gray-300">
          <li>Chain ID 10143 · currency MON</li>
          <li>RPC https://testnet-rpc.monad.xyz</li>
          <li>Betting locks 60s before expiry · market durations 2m–30d</li>
          <li>Explorer https://testnet.monadexplorer.com</li>
        </ul>
      </section>
    </div>
  );
}
