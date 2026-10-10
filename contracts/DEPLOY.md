# LaunchOddsMarket — Monad Testnet Deploy Runbook

Contract is **frozen**. This runbook only deploys and smoke-tests it. Nothing here
modifies `src/`, `test/`, or `abi/`, and no raw private key ever appears on a
command line — all signing goes through Foundry keystores.

## Deployed instance (live, Monad testnet)

- Network: Monad testnet, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`
- LaunchOddsMarket: `0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187`
- Deploy tx: `0x6d62ca295d46affc5a7c695b26c565438a01512bb97294b978633ece3e71b705`
- Block: `69767065`
- `owner()` = `resolver()` = `0x659f1ddf3Afa31029B990D2202Df8B2094eE012E`
- `resolutionGracePeriod()` = `600`
- Read-only on-chain verification (all `cast call`, chain ID `10143`): PASS —
  non-empty bytecode, owner/resolver match, grace 600, lock 60, min 120,
  max 2592000, marketCount 0, totalEscrowed 0; resolver balance ≈ 3.83 MON.
- Source verification (Sourcify via MonadVision, no API key): **partial match** —
  command below ran successfully, status `partial` (metadata-hash difference only).
  Explorer: `https://testnet.monadvision.com/address/0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187`

Exact lines to paste into the frontend's `.env.local` (create locally, never commit):

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187
```

`RESOLVER_PRIVATE_KEY` (backend/demo operator only, never committed) must belong
to the on-chain resolver wallet `0x659f1ddf3Afa31029B990D2202Df8B2094eE012E`.
Never write a key value anywhere.

## 0. Network details (do not guess — verified in Monad docs)

Source: <https://docs.monad.xyz/developer-essentials/testnet.md>

| Item | Value |
|---|---|
| Chain ID | `10143` |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadvision.com` |
| Faucet | `https://faucet.monad.xyz` |
| Currency | `MON` |

Verify command source: <https://docs.monad.xyz/guides/verify-smart-contract/foundry.md>
(Testnet tab, MonadVision/Sourcify).

## 1. Prerequisites

- Foundry v1.8+ (`forge --version`), run from the `contracts/` directory.
- Testnet MON in the deployer wallet (use the faucet above).

## 2. Import keys into the Foundry keystore

```sh
cast wallet import deployer --interactive
cast wallet import resolver --interactive
# Optional extra bettor accounts for the smoke test:
cast wallet import bettorA --interactive
cast wallet import bettorB --interactive
```

Confirm addresses (never print keys):

```sh
cast wallet address --account deployer
cast wallet address --account resolver
```

## 3. Deploy

The deploy script `script/DeployLaunchOddsMarket.s.sol` reads its constructor
arguments from these exact environment variables:

| Env var | Constructor arg | Demo value |
|---|---|---|
| `INITIAL_OWNER` | `initialOwner` | deployer address from step 2 |
| `INITIAL_RESOLVER` | `initialResolver` | resolver address from step 2 |
| `RESOLUTION_GRACE_PERIOD` | `resolutionGracePeriod_` | `600` (seconds, demo value) |

```sh
INITIAL_OWNER=0xDeployerAddress... \
INITIAL_RESOLVER=0xResolverAddress... \
RESOLUTION_GRACE_PERIOD=600 \
forge script script/DeployLaunchOddsMarket.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --account deployer \
  --broadcast
```

## 4. Read the deployed address and verify

- The script logs `LaunchOddsMarket deployed at: 0x...` — copy it.
- Cross-check in the broadcast artifact (chain `10143`):

```sh
cat broadcast/DeployLaunchOddsMarket.s.sol/10143/run-latest.json
```

The deployed address is the `contractAddress` of the contract-creation
transaction; its receipt `status` must be `0x1`.

Verify on MonadVision (Sourcify), per the docs page above (tested 2026-10-10,
result: partial match — no API key needed):

```sh
forge verify-contract 0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187 \
  src/LaunchOddsMarket.sol:LaunchOddsMarket \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256)" \
    0x659f1ddf3Afa31029B990D2202Df8B2094eE012E \
    0x659f1ddf3Afa31029B990D2202Df8B2094eE012E 600)
```

Then open `https://testnet.monadvision.com/address/<DEPLOYED_ADDRESS>`.

## 5. Smoke test (no transactions from you yet — read-only + scripted)

```sh
CONTRACT=0xDeployedAddress... \
RPC_URL=https://testnet-rpc.monad.xyz \
ACCOUNT_A=bettorA ACCOUNT_B=bettorB RESOLVER_ACCOUNT=resolver \
./script/smoke-test.sh
```

The script creates a market (expiry = chain time + 180s), places 0.01 MON YES/NO
bets from the two bettor accounts, prints state, then prints the exact
`resolveMarket` / `claim` commands to run after expiry. It is executable but you
run it explicitly — nothing auto-broadcasts.

## 6. Final checklist

- [ ] Deployed address copied to `NEXT_PUBLIC_CONTRACT_ADDRESS` in
      `frontend/.env.local` (create that file locally; never commit it).
- [ ] `cast call <CONTRACT> "resolver()"` matches `cast wallet address --account resolver`,
      i.e. the resolver wallet matches the `RESOLVER_PRIVATE_KEY` wallet the
      backend/demo operator holds.
- [ ] `resolutionGracePeriod` reads `600`, `BETTING_LOCK_WINDOW` reads `60`.

## Known demo risks

- **Pick a climbing HN story and test it first.** Resolution is a trusted,
  centralized resolver reporting a score — rehearse the full
  create → bet → expire → resolve → claim loop on testnet before presenting.
- **Create the demo market 10+ minutes before presenting.** Testnet RPC/blocks
  can lag; give yourself buffer for bets, expiry, and the resolve transaction.
- **Betting locks 60s before expiry; `MIN_DURATION` is 120s.** Bids placed at or
  after `expiry - 60` revert with `BettingClosed`. Keep the demo expiry comfortably
  beyond the minimum (the smoke script uses `now + 180s`).
- **The resolver is trusted and centralized — disclose it in the demo.** The
  contract enforces *who* may resolve and the YES/NO rule, but it cannot verify
  the external API score is truthful. Say this out loud during the demo.
