# LaunchOddsMarket

Binary parimutuel prediction market staking native MON, built for Monad Blitz Pune V3.

## Architecture

- `src/LaunchOddsMarket.sol` — the protocol. Ownable2Step (admin) + ReentrancyGuard
  (payouts) + `Math.mulDiv` (proportional payouts) from OpenZeppelin 5.7.0.
- Markets are structs in a mapping with monotonically increasing IDs (1-based);
  positions are `(marketId => user => Position)`. One side per user per market.
- `test/LaunchOddsMarket.t.sol` — 61 unit tests (spec 6 A–G).
- `test/LaunchOddsMarketFuzz.t.sol` — 7 fuzz tests (spec 6 H).
- `test/LaunchOddsMarketInvariant.t.sol` — handler + 8 invariants (spec 7).
- `script/DeployLaunchOddsMarket.s.sol` — deployment script (env-configured, not run).
- `abi/LaunchOddsMarket.json` — exported ABI.

## Functions

| Function | Notes |
|---|---|
| `createMarket(sourceId, baselineScore, targetScore, expiry, metadataHash)` | Returns `marketId`. Requires nonzero source/meta, `target > baseline`, expiry within `[now+120s, now+30d]`. Emits `MarketCreated`. |
| `takePosition(marketId, isYes)` payable | Only while open and `block.timestamp < expiry - 60s` lock. Same-side top-ups aggregate; opposing side reverts. Emits `PositionTaken`. |
| `resolveMarket(marketId, finalScore, resolutionDataHash)` | Resolver only, after expiry. YES iff `finalScore >= target`. Empty winning side → `Refunded`. |
| `claim(marketId)` | Pull payout/refund, `nonReentrant`, low-level `call`, reverts on failure. |
| `refundUnresolvedMarket(marketId)` | Permissionless after `expiry + resolutionGracePeriod` (immutable). No side chosen. |
| `setResolver(address)` | Owner only; zero disables resolution (timeout refunds still work). |
| Views | `marketCount`, `getMarket`, `getMarkets(start, count)`, `getPools`, `getTotalPool`, `getPosition`, `canResolve`, `getRemainingLiability`, `previewClaim`, `totalEscrowed`, `resolver`. |

## Payout mechanics

`payout = stake + floor(losingPool * stake / winningPool)`. The last unclaimed
winner receives the exact `remainingLiability`, absorbing rounding dust — no MON
locks permanently. No losing pool → stakes returned (no division by zero).
Refunds return exact stakes. `totalEscrowed` rises on every bet and falls only on
successful transfers; `balance >= totalEscrowed` always holds.

## Resolver trust assumptions

The contract checks *authorization* and enforces the outcome *rule*, but cannot
verify the external source (e.g. Hacker News API) is truthful. If the resolver is
dead or disabled, anyone can force a no-outcome refund after the grace period.

## Test commands

```sh
forge build
forge fmt --check
forge test                                              # everything (~2 min, invariants dominate)
forge test --match-contract LaunchOddsMarketTest        # units only (fast)
forge test --match-contract LaunchOddsMarketFuzzTest    # fuzz only
forge test --match-contract LaunchOddsInvariantTest -vvv # invariants only
```

Slither is not installed in this environment, so no static-analysis run is claimed.
`forge coverage` skipped per task scope.
