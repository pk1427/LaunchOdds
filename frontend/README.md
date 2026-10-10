# Storyscore frontend + resolver

Next.js 15 app (App Router, TypeScript, Tailwind v3, wagmi v2, viem v2) for the
frozen, deployed `LaunchOddsMarket` contract on Monad testnet (chain ID 10143).

## Setup

```sh
cd frontend
npm install
cp .env.example .env.local   # then fill in real values (never commit)
```

`.env.local` needs `NEXT_PUBLIC_CONTRACT_ADDRESS` (deployed:
`0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187`) and optionally
`NEXT_PUBLIC_MONAD_RPC` (default `https://testnet-rpc.monad.xyz`).
Server resolver needs `RESOLVER_PRIVATE_KEY` — server env only, never
`NEXT_PUBLIC_`, never committed. The key must belong to the on-chain resolver
`0x659f1ddf3Afa31029B990D2202Df8B2094eE012E`.

## Run

```sh
npm run dev        # app at http://localhost:3000
npm run resolver   # server resolver loop (polls every POLL_INTERVAL_MS, default 10s)
```

Run both together for the full demo: the app auto-triggers `/api/resolve` while
markets await resolution, and the loop covers downtime. One-off pass:

```sh
npm run resolver:once
```

Dry run without resolving: `DRY_RUN=true npm run resolver:once` reports what *would*
be resolved without sending transactions (a key-shaped `RESOLVER_PRIVATE_KEY` is
still required so the resolver-mismatch guard can run; with no key set it fails
fast with a clear "RESOLVER_PRIVATE_KEY is not set" error).

Pick a climbing demo story first:

```sh
npm run watch-score -- <storyId> [storyId...]
```

## Demo steps

1. Fund wallets with testnet MON (faucet: https://faucet.monad.xyz).
2. Create the demo market 10+ minutes before presenting (Discover → Create market).
3. Bet YES/NO from two wallets. Betting locks 60s before expiry.
4. After expiry the resolver (auto-loop or dashboard fallback button) submits the
   live HN score; winners claim from their market cards.

## Trusted-resolver disclosure

Outcomes are reported by a single centralized resolver. The contract enforces
*authorization* and the YES/NO rule, but cannot verify the Hacker News API
itself. If the resolver is silent past `expiry + grace period` (600s demo),
anyone can permissionlessly trigger refunds. This limitation is stated in the
app hero and footer.
