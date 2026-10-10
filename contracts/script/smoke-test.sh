#!/usr/bin/env bash
#
# LaunchOddsMarket testnet smoke test (read + scripted writes, no raw keys).
# Runs against an ALREADY-DEPLOYED contract. Does NOT deploy anything.
#
# Required env (CONTRACT defaults to the live testnet deployment):
#   CONTRACT          deployed LaunchOddsMarket address
#   RPC_URL           Monad testnet RPC, e.g. https://testnet-rpc.monad.xyz
#   ACCOUNT_A         Foundry keystore account name for the YES bettor
#   ACCOUNT_B         Foundry keystore account name for the NO bettor
#   RESOLVER_ACCOUNT  Foundry keystore account name of the resolver (used only
#                     to print the post-expiry resolve command; this script does
#                     not resolve or claim on its own)
# Optional env (sane demo defaults):
#   SOURCE_ID         default 12345678
#   BASELINE          default 42
#   TARGET            default 45
#   METADATA_HASH     default 0x1111...1111 (nonzero placeholder; replace for real markets)
#   STAKE             default 0.01ether
#   DURATION          market length in seconds, default 180 (MIN_DURATION is 120)
#
set -euo pipefail

CONTRACT="${CONTRACT:-0xD528703a9A6eF6Cbb04d6B1B7d79D5C4ce126187}"
: "${RPC_URL:?set RPC_URL, e.g. https://testnet-rpc.monad.xyz}"
: "${ACCOUNT_A:?set ACCOUNT_A to a keystore account name}"
: "${ACCOUNT_B:?set ACCOUNT_B to a keystore account name}"
: "${RESOLVER_ACCOUNT:?set RESOLVER_ACCOUNT to the resolver keystore account name}"

SOURCE_ID="${SOURCE_ID:-12345678}"
BASELINE="${BASELINE:-42}"
TARGET="${TARGET:-45}"
METADATA_HASH="${METADATA_HASH:-0x1111111111111111111111111111111111111111111111111111111111111111}"
STAKE="${STAKE:-0.01ether}"
DURATION="${DURATION:-180}"

echo "=== [a] Reading protocol config ==="
echo "marketCount:            $(cast call "$CONTRACT" "marketCount()" --rpc-url "$RPC_URL")"
echo "resolver:               $(cast call "$CONTRACT" "resolver()" --rpc-url "$RPC_URL")"
echo "BETTING_LOCK_WINDOW:    $(cast call "$CONTRACT" "BETTING_LOCK_WINDOW()" --rpc-url "$RPC_URL")"
echo "resolutionGracePeriod:  $(cast call "$CONTRACT" "resolutionGracePeriod()" --rpc-url "$RPC_URL")"

echo "=== [b] Creating market (expiry = chain time + ${DURATION}s) ==="
NOW="$(cast block latest --field timestamp --rpc-url "$RPC_URL")"
EXPIRY=$((NOW + DURATION))
echo "chain now: $NOW  expiry: $EXPIRY"
cast send "$CONTRACT" "createMarket(uint256,uint256,uint256,uint64,bytes32)" \
  "$SOURCE_ID" "$BASELINE" "$TARGET" "$EXPIRY" "$METADATA_HASH" \
  --rpc-url "$RPC_URL" --account "$ACCOUNT_A"
MARKET_ID="$(cast call "$CONTRACT" "marketCount()" --rpc-url "$RPC_URL")"
echo "MARKET_ID=$MARKET_ID"

echo "=== [c] Taking positions: YES ($ACCOUNT_A) / NO ($ACCOUNT_B), stake $STAKE ==="
cast send "$CONTRACT" "takePosition(uint256,bool)" "$MARKET_ID" true \
  --value "$STAKE" --rpc-url "$RPC_URL" --account "$ACCOUNT_A"
cast send "$CONTRACT" "takePosition(uint256,bool)" "$MARKET_ID" false \
  --value "$STAKE" --rpc-url "$RPC_URL" --account "$ACCOUNT_B"

echo "=== [d] Market state ==="
cast call "$CONTRACT" "getMarket(uint256)" "$MARKET_ID" --rpc-url "$RPC_URL"
echo "pools (yes, no):"
cast call "$CONTRACT" "getPools(uint256)" "$MARKET_ID" --rpc-url "$RPC_URL"

echo "=== [e] Time until expiry ==="
LATEST="$(cast block latest --field timestamp --rpc-url "$RPC_URL")"
REMAINING=$((EXPIRY - LATEST))
echo "seconds until expiry: $REMAINING (betting locks 60s before expiry)"
echo "After expiry, run as the resolver to settle (example: YES with final score $TARGET):"
echo "  cast send $CONTRACT \"resolveMarket(uint256,uint256,bytes32)\" $MARKET_ID $TARGET <EVIDENCE_HASH> --rpc-url $RPC_URL --account $RESOLVER_ACCOUNT"

echo "=== [f] Claim preview + commands (run AFTER resolveMarket confirms) ==="
ADDR_A="$(cast wallet address --account "$ACCOUNT_A")"
ADDR_B="$(cast wallet address --account "$ACCOUNT_B")"
echo "previewClaim A ($ADDR_A):"
cast call "$CONTRACT" "previewClaim(uint256,address)" "$MARKET_ID" "$ADDR_A" --rpc-url "$RPC_URL"
echo "previewClaim B ($ADDR_B):"
cast call "$CONTRACT" "previewClaim(uint256,address)" "$MARKET_ID" "$ADDR_B" --rpc-url "$RPC_URL"
echo "Winner claims with:"
echo "  cast send $CONTRACT \"claim(uint256)\" $MARKET_ID --rpc-url $RPC_URL --account <WINNER_ACCOUNT>"
echo "Smoke setup done for market $MARKET_ID."
