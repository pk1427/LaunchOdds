// On-chain enum values, read from contracts/src/LaunchOddsMarket.sol.
// Status { Open, ResolvedYes, ResolvedNo, Refunded }
// RefundReason { None, EmptyWinningSide, OracleTimeout }

export enum Status {
  Open = 0,
  ResolvedYes = 1,
  ResolvedNo = 2,
  Refunded = 3,
}

export enum RefundReason {
  None = 0,
  EmptyWinningSide = 1,
  OracleTimeout = 2,
}

export interface MarketStruct {
  id: bigint;
  creator: `0x${string}`;
  sourceId: bigint;
  baselineScore: bigint;
  targetScore: bigint;
  createdAt: number;
  expiry: number;
  finalScore: bigint;
  metadataHash: `0x${string}`;
  evidenceHash: `0x${string}`;
  yesPool: bigint;
  noPool: bigint;
  totalPool: bigint;
  remainingLiability: bigint;
  yesPositions: bigint;
  noPositions: bigint;
  claimedCount: bigint;
  status: number;
  refundReason: number;
}

export type Phase =
  | "betting"
  | "locked"
  | "awaiting"
  | "refundable"
  | "resolvedYes"
  | "resolvedNo"
  | "refunded";

export const PHASE_LABEL: Record<Phase, string> = {
  betting: "Betting open",
  locked: "Bets locked",
  awaiting: "Awaiting resolution",
  refundable: "Refundable",
  resolvedYes: "Resolved YES",
  resolvedNo: "Resolved NO",
  refunded: "Refunded",
};

export function phaseOf(
  m: MarketStruct,
  nowSec: number,
  lockWindow: number,
  gracePeriod: number,
): Phase {
  if (m.status === Status.ResolvedYes) return "resolvedYes";
  if (m.status === Status.ResolvedNo) return "resolvedNo";
  if (m.status === Status.Refunded) return "refunded";
  const expiry = Number(m.expiry);
  if (nowSec < expiry - lockWindow) return "betting";
  if (nowSec < expiry) return "locked";
  if (nowSec < expiry + gracePeriod) return "awaiting";
  return "refundable";
}

export function countdown(expiry: number, nowSec: number): string {
  const s = Math.max(expiry - nowSec, 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
