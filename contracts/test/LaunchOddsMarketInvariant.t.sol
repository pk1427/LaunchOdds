// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {LaunchOddsMarket} from "../src/LaunchOddsMarket.sol";

/// @notice Stateful handler driving the market through random interleavings.
/// Ghost state mirrors on-chain records so invariants can compare the two.
contract MarketHandler is Test {
    LaunchOddsMarket public market;
    address public resolver;
    address[] public actors;
    address public attacker;
    uint256[] public ids;

    struct Terms {
        uint256 sourceId;
        uint256 baseline;
        uint256 target;
        uint64 expiry;
        address creator;
        bytes32 meta;
        bool exists;
    }

    mapping(uint256 => Terms) public terms;
    mapping(uint256 => uint256) public yesSum;
    mapping(uint256 => uint256) public noSum;
    mapping(uint256 => uint256) public paid;
    mapping(uint256 => uint8) public settled; // 0 open, 1 yes, 2 no, 3 refunded

    bool public sawResolveFailure;
    bool public sawAttackerResolve;
    bool public sawEarlyRefund;
    bool public sawDoubleClaim;

    constructor(LaunchOddsMarket _m, address _resolver) {
        market = _m;
        resolver = _resolver;
        attacker = makeAddr("invariant-attacker");
        for (uint256 i = 0; i < 5; ++i) {
            address a = makeAddr(string(abi.encodePacked("invariant-actor-", i)));
            vm.deal(a, 1000 ether);
            actors.push(a);
        }
    }

    function _pick(uint256 s) internal view returns (uint256 id) {
        require(ids.length > 0, "no markets");
        id = ids[s % ids.length];
    }

    function createMarket(uint256 s) external {
        if (ids.length >= 12) return;
        uint256 sourceId = bound(s, 1, type(uint128).max);
        uint256 baseline = (s >> 32) % 1e6;
        uint256 target = baseline + 1 + ((s >> 64) % 100);
        uint256 duration = bound((s >> 96), market.MIN_DURATION(), market.MAX_DURATION());
        uint64 expiry = uint64(block.timestamp + duration);
        uint256 id = market.createMarket(sourceId, baseline, target, expiry, keccak256(abi.encode(s)));
        ids.push(id);
        terms[id] = Terms(sourceId, baseline, target, expiry, address(this), keccak256(abi.encode(s)), true);
    }

    function bet(uint256 s) external {
        if (ids.length == 0) {
            this.createMarket(s);
            return;
        }
        uint256 id = _pick(s);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        if (m.status != LaunchOddsMarket.Status.Open) return;
        if (block.timestamp >= uint256(m.expiry) - market.BETTING_LOCK_WINDOW()) return;
        address actor = actors[(s >> 128) % actors.length];
        bool isYes = (s >> 200) & 1 == 1;
        uint256 amount = bound(s >> 8, 1, 0.1 ether);
        if (actor.balance < amount) return;
        LaunchOddsMarket.Position memory beforeP = market.getPosition(id, actor);
        if (beforeP.amount > 0 && beforeP.isYes != isYes) return; // would revert; skip
        vm.prank(actor);
        try market.takePosition{value: amount}(id, isYes) {
            if (isYes) yesSum[id] += amount;
            else noSum[id] += amount;
        } catch {}
    }

    function warpToExpiry(uint256 s) external {
        if (ids.length == 0) return;
        uint256 id = _pick(s);
        uint256 e = market.getMarket(id).expiry;
        if (e > block.timestamp) vm.warp(e);
    }

    function resolve(uint256 s, uint256 score) external {
        if (ids.length == 0) return;
        uint256 id = _pick(s);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        if (m.status != LaunchOddsMarket.Status.Open) return;
        if (block.timestamp < m.expiry) vm.warp(m.expiry);
        score = bound(score, 0, m.targetScore + 5);
        bool shouldSucceed = market.resolver() == resolver;
        vm.prank(resolver);
        try market.resolveMarket(id, score, keccak256(abi.encode(id, score))) {
            LaunchOddsMarket.Market memory afterM = market.getMarket(id);
            if (afterM.status == LaunchOddsMarket.Status.ResolvedYes) settled[id] = 1;
            else if (afterM.status == LaunchOddsMarket.Status.ResolvedNo) settled[id] = 2;
            else settled[id] = 3;
        } catch {
            if (shouldSucceed) sawResolveFailure = true;
        }
    }

    function resolveAsAttacker(uint256 s) external {
        if (ids.length == 0) return;
        uint256 id = _pick(s);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        if (m.status != LaunchOddsMarket.Status.Open) return;
        if (block.timestamp < m.expiry) return;
        vm.prank(attacker);
        try market.resolveMarket(id, m.targetScore, keccak256("evil")) {
            sawAttackerResolve = true;
        } catch {}
    }

    function claim(uint256 s) external {
        if (ids.length == 0) return;
        uint256 id = _pick(s);
        if (market.getMarket(id).status == LaunchOddsMarket.Status.Open) return;
        address actor = actors[s % actors.length];
        vm.prank(actor);
        try market.claim(id) returns (uint256 payout) {
            paid[id] += payout;
            // A second claim must always revert.
            vm.prank(actor);
            try market.claim(id) {
                sawDoubleClaim = true;
            } catch {}
        } catch {}
    }

    function refundTimeout(uint256 s) external {
        if (ids.length == 0) return;
        uint256 id = _pick(s);
        LaunchOddsMarket.Market memory m = market.getMarket(id);
        if (m.status != LaunchOddsMarket.Status.Open) return;
        uint256 readyAt = uint256(m.expiry) + market.resolutionGracePeriod();
        if (block.timestamp < readyAt) {
            // Must revert before the grace period.
            address actor = actors[s % actors.length];
            vm.prank(actor);
            try market.refundUnresolvedMarket(id) {
                sawEarlyRefund = true;
            } catch {}
            return;
        }
        market.refundUnresolvedMarket(id);
        settled[id] = 3;
    }
}

/// @notice Protocol invariants (spec section 7). feasiblity notes:
/// - Invariants 2 (single-claim), 4 (outcome), 5 (auth) are enforced via
///   handler violation flags because "never" properties need active probing.
/// - Invariant 9 (zero liability after all claims) is covered by unit/fuzz
///   tests; random interleavings rarely drain every position, so it is
///   asserted here in its checkable form via per-market paid <= pool plus
///   remainingLiability consistency (invariant: global == sum).
contract LaunchOddsInvariantTest is Test {
    LaunchOddsMarket market;
    MarketHandler handler;
    address resolver = makeAddr("resolver");
    address owner = makeAddr("owner");

    function setUp() public {
        market = new LaunchOddsMarket(owner, resolver, 1 days);
        handler = new MarketHandler(market, resolver);
        targetContract(address(handler));
    }

    /// @notice 1. Contract balance always covers outstanding liabilities.
    function invariant_BalanceCoversEscrow() public view {
        assertGe(address(market).balance, market.totalEscrowed());
    }

    /// @notice 10. Global liabilities equal the sum of market liabilities.
    function invariant_GlobalEqualsSumOfMarkets() public view {
        uint256 sum;
        uint256 n = market.marketCount();
        for (uint256 id = 1; id <= n; ++id) {
            sum += market.getRemainingLiability(id);
        }
        assertEq(market.totalEscrowed(), sum);
    }

    /// @notice 3. Market terms never change after creation.
    function invariant_TermsImmutable() public view {
        uint256 n = market.marketCount();
        for (uint256 id = 1; id <= n; ++id) {
            LaunchOddsMarket.Market memory m = market.getMarket(id);
            (uint256 sId, uint256 base, uint256 tgt, uint64 exp, address creator, bytes32 meta,) = handler.terms(id);
            assertEq(m.sourceId, sId);
            assertEq(m.baselineScore, base);
            assertEq(m.targetScore, tgt);
            assertEq(m.expiry, exp);
            assertEq(m.creator, creator);
            assertEq(m.metadataHash, meta);
        }
    }

    /// @notice 4. A resolved outcome never changes.
    function invariant_OutcomeNeverChanges() public view {
        uint256 n = market.marketCount();
        for (uint256 id = 1; id <= n; ++id) {
            uint8 g = handler.settled(id);
            if (g == 0) continue;
            LaunchOddsMarket.Status s = market.getMarket(id).status;
            if (g == 1) assertTrue(s == LaunchOddsMarket.Status.ResolvedYes);
            else if (g == 2) assertTrue(s == LaunchOddsMarket.Status.ResolvedNo);
            else assertTrue(s == LaunchOddsMarket.Status.Refunded);
        }
    }

    /// @notice 6. Pools equal the sum of recorded stakes.
    function invariant_PoolsMatchStakes() public view {
        uint256 n = market.marketCount();
        for (uint256 id = 1; id <= n; ++id) {
            (uint256 yes, uint256 no) = market.getPools(id);
            assertEq(yes, handler.yesSum(id));
            assertEq(no, handler.noSum(id));
            assertEq(market.getTotalPool(id), yes + no);
        }
    }

    /// @notice 7+8. Per-market payouts never exceed the pool; refunds exactness
    /// follows from paid <= pool plus unit-tested exact-stake refunds.
    function invariant_PayoutsBoundedByPool() public view {
        uint256 n = market.marketCount();
        for (uint256 id = 1; id <= n; ++id) {
            assertLe(handler.paid(id), market.getTotalPool(id));
        }
    }

    /// @notice 2+5 (+refund timing): no double claim, no attacker resolution,
    /// no early timeout refund, no failed honest resolution ever observed.
    function invariant_NoViolationFlags() public view {
        assertFalse(handler.sawDoubleClaim());
        assertFalse(handler.sawAttackerResolve());
        assertFalse(handler.sawEarlyRefund());
        assertFalse(handler.sawResolveFailure());
    }

    /// @notice Claimed positions never exceed unique positions.
    function invariant_ClaimedCountBounded() public view {
        uint256 n = market.marketCount();
        for (uint256 id = 1; id <= n; ++id) {
            LaunchOddsMarket.Market memory m = market.getMarket(id);
            assertLe(m.claimedCount, m.yesPositions + m.noPositions);
        }
    }
}
