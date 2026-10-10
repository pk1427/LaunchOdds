// Parimutuel preview math — matches the contract exactly:
//   payout = stake + floor(losingPool * stake / winningPool)
// All bigint. For real post-settlement claimable amounts always use
// previewClaim(marketId, user), never this estimate.

export function previewPayout(
  stake: bigint,
  winningPool: bigint,
  losingPool: bigint,
): bigint {
  if (stake <= 0n || winningPool <= 0n) return 0n;
  if (losingPool === 0n) return stake;
  return stake + (losingPool * stake) / winningPool;
}

// Payout multiple per 1 MON staked, e.g. 2.5x. Null when side has no pool.
export function payoutMultiple(
  sidePool: bigint,
  otherPool: bigint,
): number | null {
  if (sidePool <= 0n) return null;
  const total = sidePool + otherPool;
  return Number((total * 10000n) / sidePool) / 10000;
}

// Implied probability from pool share, 0..1. Null when no stakes yet.
export function impliedProb(
  sidePool: bigint,
  otherPool: bigint,
): number | null {
  const total = sidePool + otherPool;
  if (total <= 0n) return null;
  return Number((sidePool * 10000n) / total) / 10000;
}
