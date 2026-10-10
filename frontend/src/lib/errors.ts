import { BaseError, ContractFunctionRevertedError } from "viem";

const FRIENDLY: Record<string, string> = {
  InvalidSourceId: "Invalid story ID.",
  InvalidTargetScore: "Target must be above the baseline score.",
  ZeroMetadataHash: "Missing metadata hash.",
  ExpiryTooSoon: "Deadline is too soon (min 2 minutes).",
  ExpiryTooDistant: "Deadline is too far (max 30 days).",
  InvalidMarketId: "Unknown market.",
  MarketNotOpen: "Market is no longer open.",
  MarketNotExpired: "Market has not expired yet.",
  BettingClosed: "Betting is locked (60s before expiry).",
  ZeroStake: "Stake must be greater than zero.",
  OpposingPosition: "You already hold the opposite side in this market.",
  ZeroEvidenceHash: "Missing resolution evidence.",
  AlreadyResolved: "Market is already settled.",
  UnauthorizedResolver: "Only the resolver can resolve.",
  NothingToClaim: "No position to claim.",
  AlreadyClaimed: "Already claimed.",
  NotWinner: "Losing side cannot claim.",
  MarketNotSettled: "Market is not settled yet.",
  GracePeriodNotElapsed: "Refund grace period has not elapsed.",
  MarketAlreadySettled: "Market is already settled.",
  TransferFailed: "Payout transfer failed.",
  DirectTransferNotAllowed: "Direct transfers are rejected.",
  InvalidGracePeriod: "Invalid grace period.",
};

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | undefined;
    const name =
      reverted?.data?.errorName ??
      (reverted?.shortMessage?.match(/^([^(:]+)/)?.[1]?.trim() || "");
    if (name && FRIENDLY[name]) return FRIENDLY[name];
    const short = err.shortMessage || err.message;
    return short.length > 300 ? short.slice(0, 300) + "…" : short;
  }
  if (err instanceof Error) return err.message.slice(0, 300);
  return "Transaction failed.";
}
