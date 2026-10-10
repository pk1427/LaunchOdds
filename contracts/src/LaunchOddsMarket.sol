// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title LaunchOddsMarket
/// @author LaunchOdds (Monad Blitz Pune V3)
/// @notice Binary parimutuel prediction market staking native MON.
///
/// @dev MVP market type: YES wins when the resolver-submitted `finalScore` is
/// greater than or equal to `targetScore`, otherwise NO wins. The losing-side
/// pool is distributed proportionally among winners:
///
/// payout = stake + floor(losingPool * stake / winningPool)
///
/// Rounding dust is assigned to the last unclaimed winning position, so no MON
/// stays permanently locked. Refunded markets return exact original stakes.
///
/// Trust assumption: the contract verifies *authorization* (only the configured
/// resolver can report an outcome) and enforces the outcome *rule*, but it does
/// NOT independently verify that the submitted score truthfully reflects the
/// external data source (e.g. the Hacker News API). Consumers must trust the
/// resolver and can audit `evidenceHash` pointers off-chain.
contract LaunchOddsMarket is Ownable2Step, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Lifecycle state of a market.
    enum Status {
        Open,
        ResolvedYes,
        ResolvedNo,
        Refunded
    }

    /// @notice Why a market entered the {Status.Refunded} state.
    enum RefundReason {
        None,
        /// @dev The predicted winning side (or the whole market) had no
        /// positions, so winners could not be paid from an empty pool.
        EmptyWinningSide,
        /// @dev The resolver never resolved; anyone triggered the refund after
        /// `expiry + resolutionGracePeriod`.
        OracleTimeout
    }

    /// @notice Full on-chain record of a prediction market.
    /// @dev Timestamps use uint64 (sufficient until year ~2554+ and cheaper to
    /// pack); monetary values and scores use uint256 for full precision.
    struct Market {
        uint256 id;
        address creator;
        uint256 sourceId;
        uint256 baselineScore;
        uint256 targetScore;
        uint64 createdAt;
        uint64 expiry;
        uint256 finalScore;
        bytes32 metadataHash;
        bytes32 evidenceHash;
        uint256 yesPool;
        uint256 noPool;
        uint256 totalPool;
        uint256 remainingLiability;
        uint256 yesPositions;
        uint256 noPositions;
        uint256 claimedCount;
        Status status;
        RefundReason refundReason;
    }

    /// @notice A user's aggregate stake on one side of a market.
    struct Position {
        uint256 amount;
        bool isYes;
        bool claimed;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice No positions accepted at or after `expiry - BETTING_LOCK_WINDOW`.
    uint256 public constant BETTING_LOCK_WINDOW = 60 seconds;

    /// @notice Minimum market duration. Must strictly exceed BETTING_LOCK_WINDOW
    /// so the betting window is never empty at creation.
    uint256 public constant MIN_DURATION = 120 seconds;

    /// @notice Maximum market duration (30 days).
    uint256 public constant MAX_DURATION = 30 days;

    // ---------------------------------------------------------------------
    // Immutable / state
    // ---------------------------------------------------------------------

    /// @notice Grace period after expiry before anyone may force a refund of an
    /// unresolved market. Set once at deployment.
    uint256 public immutable resolutionGracePeriod;

    /// @notice Address authorized to submit final scores. May be zero
    /// (disabled); timeout refunds remain available while disabled.
    address public resolver;

    /// @notice Next market ID to assign. Market IDs start at 1 and increase
    /// monotonically; `marketCount() == nextMarketId - 1`.
    uint256 private nextMarketId = 1;

    /// @notice marketId => Market record.
    mapping(uint256 marketId => Market) private markets;

    /// @notice marketId => user => Position record.
    mapping(uint256 marketId => mapping(address user => Position)) private positions;

    /// @notice Global outstanding liabilities: increased by every accepted stake
    /// and decreased only by actual successful payouts/refunds. The contract
    /// balance must always be >= this value (modulo forced transfers).
    uint256 public totalEscrowed;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        uint256 indexed sourceId,
        uint256 baselineScore,
        uint256 targetScore,
        uint64 expiry,
        bytes32 metadataHash
    );
    event PositionTaken(
        uint256 indexed marketId,
        address indexed user,
        bool isYes,
        uint256 amount,
        uint256 userPositionTotal,
        uint256 yesPool,
        uint256 noPool
    );
    event MarketResolved(uint256 indexed marketId, bool outcomeIsYes, uint256 finalScore, bytes32 evidenceHash);
    event MarketRefunded(uint256 indexed marketId, RefundReason reason);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout, bool isRefund);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidSourceId();
    error InvalidTargetScore();
    error ZeroMetadataHash();
    error ExpiryTooSoon();
    error ExpiryTooDistant();
    error InvalidMarketId(uint256 marketId);
    error MarketNotOpen(uint256 marketId);
    error MarketNotExpired(uint256 marketId);
    error BettingClosed(uint256 marketId);
    error ZeroStake();
    error OpposingPosition();
    error ZeroEvidenceHash();
    error AlreadyResolved(uint256 marketId);
    error UnauthorizedResolver(address caller);
    error NothingToClaim(uint256 marketId);
    error AlreadyClaimed(uint256 marketId);
    error NotWinner(uint256 marketId);
    error MarketNotSettled(uint256 marketId);
    error GracePeriodNotElapsed(uint256 marketId);
    error MarketAlreadySettled(uint256 marketId);
    error TransferFailed(address to, uint256 amount);
    error DirectTransferNotAllowed();
    error InvalidGracePeriod();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param initialOwner Owner for {Ownable} (two-step transfers via Ownable2Step).
    /// @param initialResolver First authorized resolver; may be zero (disabled).
    /// @param resolutionGracePeriod_ Seconds after expiry before permissionless refund.
    constructor(address initialOwner, address initialResolver, uint256 resolutionGracePeriod_) Ownable(initialOwner) {
        if (resolutionGracePeriod_ == 0) revert InvalidGracePeriod();
        resolutionGracePeriod = resolutionGracePeriod_;
        resolver = initialResolver;
        emit ResolverUpdated(address(0), initialResolver);
    }

    /// @notice Reject accidental plain transfers so escrow accounting stays exact.
    receive() external payable {
        revert DirectTransferNotAllowed();
    }

    // ---------------------------------------------------------------------
    // Market creation
    // ---------------------------------------------------------------------

    /// @notice Create a new binary prediction market.
    /// @param sourceId External source identifier (e.g. Hacker News story ID). Must be nonzero.
    /// @param baselineScore Reference score observed at creation.
    /// @param targetScore YES threshold; must be strictly greater than `baselineScore`.
    /// @param expiry Unix timestamp; must lie within [now + MIN_DURATION, now + MAX_DURATION].
    /// @param metadataHash Nonzero hash committing to the off-chain question/description.
    /// @return marketId The newly assigned monotonically increasing market ID.
    function createMarket(
        uint256 sourceId,
        uint256 baselineScore,
        uint256 targetScore,
        uint64 expiry,
        bytes32 metadataHash
    ) external returns (uint256 marketId) {
        if (sourceId == 0) revert InvalidSourceId();
        if (targetScore <= baselineScore) revert InvalidTargetScore();
        if (metadataHash == bytes32(0)) revert ZeroMetadataHash();
        if (expiry < block.timestamp + MIN_DURATION) revert ExpiryTooSoon();
        if (expiry > block.timestamp + MAX_DURATION) revert ExpiryTooDistant();

        marketId = nextMarketId++;

        markets[marketId] = Market({
            id: marketId,
            creator: msg.sender,
            sourceId: sourceId,
            baselineScore: baselineScore,
            targetScore: targetScore,
            createdAt: uint64(block.timestamp),
            expiry: expiry,
            finalScore: 0,
            metadataHash: metadataHash,
            evidenceHash: bytes32(0),
            yesPool: 0,
            noPool: 0,
            totalPool: 0,
            remainingLiability: 0,
            yesPositions: 0,
            noPositions: 0,
            claimedCount: 0,
            status: Status.Open,
            refundReason: RefundReason.None
        });

        emit MarketCreated(marketId, msg.sender, sourceId, baselineScore, targetScore, expiry, metadataHash);
    }

    // ---------------------------------------------------------------------
    // Position taking
    // ---------------------------------------------------------------------

    /// @notice Stake native MON on an outcome. `msg.value` is the stake.
    /// @dev No external calls are made while recording a position.
    /// @param marketId Existing open market.
    /// @param isYes True to back YES, false to back NO.
    function takePosition(uint256 marketId, bool isYes) external payable {
        Market storage m = _getMarket(marketId);
        if (m.status != Status.Open) revert MarketNotOpen(marketId);
        if (block.timestamp >= uint256(m.expiry) - BETTING_LOCK_WINDOW) revert BettingClosed(marketId);
        if (msg.value == 0) revert ZeroStake();

        Position storage p = positions[marketId][msg.sender];
        if (p.amount > 0) {
            if (p.isYes != isYes) revert OpposingPosition();
            p.amount += msg.value;
        } else {
            p.amount = msg.value;
            p.isYes = isYes;
            if (isYes) {
                m.yesPositions += 1;
            } else {
                m.noPositions += 1;
            }
        }

        if (isYes) {
            m.yesPool += msg.value;
        } else {
            m.noPool += msg.value;
        }
        m.totalPool += msg.value;
        m.remainingLiability += msg.value;
        totalEscrowed += msg.value;

        emit PositionTaken(marketId, msg.sender, isYes, msg.value, p.amount, m.yesPool, m.noPool);
    }

    // ---------------------------------------------------------------------
    // Resolution
    // ---------------------------------------------------------------------

    modifier onlyResolver() {
        if (msg.sender != resolver) revert UnauthorizedResolver(msg.sender);
        _;
    }

    /// @notice Resolve an expired open market. YES iff `finalScore >= targetScore`.
    /// @dev If the winning side has no positions, the market is refunded so all
    /// participants recover their stakes instead of winners claiming from an
    /// empty pool. This also covers the no-positions-at-all case.
    /// @param marketId Existing open market with `block.timestamp >= expiry`.
    /// @param finalScore Authoritative final score from the external source.
    /// @param resolutionDataHash Nonzero hash identifying the resolution evidence.
    function resolveMarket(uint256 marketId, uint256 finalScore, bytes32 resolutionDataHash) external onlyResolver {
        Market storage m = _getMarket(marketId);
        if (m.status != Status.Open) revert AlreadyResolved(marketId);
        if (block.timestamp < m.expiry) revert MarketNotExpired(marketId);
        if (resolutionDataHash == bytes32(0)) revert ZeroEvidenceHash();

        m.finalScore = finalScore;
        m.evidenceHash = resolutionDataHash;

        bool outcomeIsYes = finalScore >= m.targetScore;
        uint256 winningPool = outcomeIsYes ? m.yesPool : m.noPool;

        if (winningPool == 0) {
            m.status = Status.Refunded;
            m.refundReason = RefundReason.EmptyWinningSide;
            emit MarketRefunded(marketId, RefundReason.EmptyWinningSide);
        } else if (outcomeIsYes) {
            m.status = Status.ResolvedYes;
            emit MarketResolved(marketId, true, finalScore, resolutionDataHash);
        } else {
            m.status = Status.ResolvedNo;
            emit MarketResolved(marketId, false, finalScore, resolutionDataHash);
        }
    }

    // ---------------------------------------------------------------------
    // Claims (pull-based payouts and refunds)
    // ---------------------------------------------------------------------

    /// @notice Claim a winning payout or a refund. Payouts use pull semantics.
    /// @dev Accounting is updated before the external transfer and the function
    /// is `nonReentrant`. The last unclaimed winning position receives the exact
    /// remaining liability, absorbing rounding dust.
    /// @param marketId A resolved or refunded market in which the caller holds a position.
    /// @return payout Amount of native MON transferred to the caller.
    function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage m = _getMarket(marketId);
        if (m.status == Status.Open) revert MarketNotSettled(marketId);

        Position storage p = positions[marketId][msg.sender];
        if (p.amount == 0) revert NothingToClaim(marketId);
        if (p.claimed) revert AlreadyClaimed(marketId);

        bool isRefund;
        if (m.status == Status.Refunded) {
            payout = p.amount;
            isRefund = true;
        } else {
            bool won = (m.status == Status.ResolvedYes) == p.isYes;
            if (!won) revert NotWinner(marketId);
            (uint256 winningPool, uint256 losingPool, uint256 winningCount) = _sideInfo(m);
            if (losingPool == 0) {
                payout = p.amount;
            } else if (m.claimedCount + 1 == winningCount) {
                // Last winning claimant absorbs any rounding remainder.
                payout = m.remainingLiability;
            } else {
                uint256 share = Math.mulDiv(losingPool, p.amount, winningPool);
                payout = p.amount + share;
            }
        }

        p.claimed = true;
        m.claimedCount += 1;
        m.remainingLiability -= payout;
        totalEscrowed -= payout;

        (bool ok,) = msg.sender.call{value: payout}("");
        if (!ok) revert TransferFailed(msg.sender, payout);

        emit Claimed(marketId, msg.sender, payout, isRefund);
    }

    // ---------------------------------------------------------------------
    // Oracle failure recovery
    // ---------------------------------------------------------------------

    /// @notice Permissionlessly refund an open market the resolver abandoned.
    /// @dev Anyone may call once `block.timestamp >= expiry + resolutionGracePeriod`.
    /// The outcome is never guessed and no side is favored: every position
    /// reclaims its exact original stake.
    /// @param marketId Open market past the resolution grace period.
    function refundUnresolvedMarket(uint256 marketId) external {
        Market storage m = _getMarket(marketId);
        if (m.status != Status.Open) revert MarketAlreadySettled(marketId);
        if (block.timestamp < uint256(m.expiry) + resolutionGracePeriod) {
            revert GracePeriodNotElapsed(marketId);
        }

        m.status = Status.Refunded;
        m.refundReason = RefundReason.OracleTimeout;
        emit MarketRefunded(marketId, RefundReason.OracleTimeout);
    }

    // ---------------------------------------------------------------------
    // Resolver administration
    // ---------------------------------------------------------------------

    /// @notice Update the resolver. Only the owner. Zero disables resolution
    /// (timeout refunds still protect users). Never rewrites past outcomes.
    /// @param newResolver New resolver address (zero allowed to disable).
    function setResolver(address newResolver) external onlyOwner {
        address old = resolver;
        resolver = newResolver;
        emit ResolverUpdated(old, newResolver);
    }

    // ---------------------------------------------------------------------
    // Read-only functions
    // ---------------------------------------------------------------------

    /// @notice Number of markets created so far.
    function marketCount() external view returns (uint256) {
        return nextMarketId - 1;
    }

    /// @notice Full market record. Reverts for unknown IDs.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _getMarketView(marketId);
    }

    /// @notice Paginated market records starting at 1-based `start`, up to `count` entries.
    /// @dev Returns fewer than `count` entries near the end, and an empty array
    /// when `start` exceeds the current count.
    function getMarkets(uint256 start, uint256 count) external view returns (Market[] memory out) {
        if (start == 0) revert InvalidMarketId(0);
        uint256 total = nextMarketId - 1;
        if (start > total || count == 0) {
            return new Market[](0);
        }
        uint256 end = start + count;
        if (end > total + 1) end = total + 1;
        out = new Market[](end - start);
        for (uint256 i = start; i < end; ++i) {
            out[i - start] = markets[i];
        }
    }

    /// @notice YES and NO pool totals for a market.
    function getPools(uint256 marketId) external view returns (uint256 yesPool, uint256 noPool) {
        Market storage m = _getMarketView(marketId);
        return (m.yesPool, m.noPool);
    }

    /// @notice Total pool (YES + NO) for a market.
    function getTotalPool(uint256 marketId) external view returns (uint256) {
        return _getMarketView(marketId).totalPool;
    }

    /// @notice A user's position in a market (zero amount when none).
    function getPosition(uint256 marketId, address user) external view returns (Position memory) {
        _getMarketView(marketId);
        return positions[marketId][user];
    }

    /// @notice Whether `resolveMarket` can currently succeed (open, expired,
    /// resolver enabled). The resolver check is included so frontends can
    /// distinguish "awaiting resolver" from "resolver disabled".
    function canResolve(uint256 marketId) external view returns (bool) {
        if (marketId == 0 || marketId >= nextMarketId) return false;
        Market storage m = markets[marketId];
        return m.status == Status.Open && block.timestamp >= m.expiry && resolver != address(0);
    }

    /// @notice Outstanding claimable/refundable amount remaining for a market.
    function getRemainingLiability(uint256 marketId) external view returns (uint256) {
        return _getMarketView(marketId).remainingLiability;
    }

    /// @notice Claim availability preview for a user: (canClaim, expectedPayout).
    /// @dev `expectedPayout` for the last unclaimed winner equals the remaining
    /// liability; otherwise it is the formula payout. Refunds return the stake.
    function previewClaim(uint256 marketId, address user)
        external
        view
        returns (bool canClaim, uint256 expectedPayout)
    {
        if (marketId == 0 || marketId >= nextMarketId) {
            return (false, 0);
        }
        Market storage m = markets[marketId];
        if (m.status == Status.Open) return (false, 0);
        Position storage p = positions[marketId][user];
        if (p.amount == 0 || p.claimed) return (false, 0);
        if (m.status == Status.Refunded) return (true, p.amount);
        bool won = (m.status == Status.ResolvedYes) == p.isYes;
        if (!won) return (false, 0);
        (uint256 winningPool, uint256 losingPool, uint256 winningCount) = _sideInfoView(m);
        if (losingPool == 0) return (true, p.amount);
        if (m.claimedCount + 1 >= winningCount) return (true, m.remainingLiability);
        return (true, p.amount + Math.mulDiv(losingPool, p.amount, winningPool));
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _getMarket(uint256 marketId) private view returns (Market storage m) {
        if (marketId == 0 || marketId >= nextMarketId) revert InvalidMarketId(marketId);
        return markets[marketId];
    }

    function _getMarketView(uint256 marketId) private view returns (Market storage m) {
        if (marketId == 0 || marketId >= nextMarketId) revert InvalidMarketId(marketId);
        return markets[marketId];
    }

    /// @dev Returns (winningPool, losingPool, winningPositionCount) for a resolved market.
    function _sideInfo(Market storage m)
        private
        view
        returns (uint256 winningPool, uint256 losingPool, uint256 winningCount)
    {
        if (m.status == Status.ResolvedYes) {
            return (m.yesPool, m.noPool, m.yesPositions);
        }
        return (m.noPool, m.yesPool, m.noPositions);
    }

    function _sideInfoView(Market storage m)
        private
        view
        returns (uint256 winningPool, uint256 losingPool, uint256 winningCount)
    {
        return _sideInfo(m);
    }
}
